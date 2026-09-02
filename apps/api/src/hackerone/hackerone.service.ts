import { Inject, Injectable } from "@nestjs/common";
import { canAccessOrganization, decryptSecret, encryptSecret } from "@sayan-sentinel/auth";
import type { SentinelConfig } from "@sayan-sentinel/config";
import { prisma } from "@sayan-sentinel/database";
import { writeAuditEvent } from "../audit/write-audit-event";
import { SENTINEL_CONFIG } from "../config/sentinel-config.constants";
import { MembershipLookupService } from "../repositories/membership-lookup.service";
import {
  HackerOneApiError,
  HackerOneClient,
  type HackerOneProgramSummary,
} from "./hackerone-client";
import { parseScopeAsset } from "./parse-scope-asset";

const DEFAULT_EXPIRES_IN_DAYS = 90;
const DEFAULT_MAX_TIER = 0;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface HackerOneConnectionStatus {
  connected: boolean;
  apiTokenIdentifier: string | null;
  lastSyncedAt: Date | null;
  lastSyncError: string | null;
  syncedPrograms: Array<{ programHandle: string; programName: string; lastSyncedAt: Date }>;
}

export interface SkippedScopeAsset {
  assetType: string;
  assetIdentifier: string;
  reason: "unsupported_asset_type" | "not_eligible_for_submission" | "previously_revoked_by_user";
}

export interface SyncScopeResult {
  programHandle: string;
  totalScopeEntries: number;
  created: number;
  updated: number;
  skipped: SkippedScopeAsset[];
}

type NotMember = { ok: false; reason: "not_member" };
type NotConnected = { ok: false; reason: "not_connected" };
type InvalidCredentials = { ok: false; reason: "invalid_credentials" };
type HackerOneApiFailure = { ok: false; reason: "hackerone_api_error"; detail: string };

/**
 * Connects an organization's HackerOne account (via a personal API token —
 * HackerOne has no third-party OAuth login, see the doc comment on
 * `HackerOneClient`) and syncs a chosen program's own declared scope
 * directly into `TargetAuthorization` rows, skipping the DNS/HTTP
 * ownership challenge entirely: being an accepted participant on the
 * program with that scope in front of you *is* the authorization here,
 * not proof you own the domain.
 */
@Injectable()
export class HackerOneService {
  constructor(
    private readonly membershipLookup: MembershipLookupService,
    @Inject(SENTINEL_CONFIG) private readonly config: SentinelConfig,
  ) {}

  get isConfigured(): boolean {
    return this.config.features.hackerOneEnabled;
  }

  private async hasAccess(userId: string, organizationId: string): Promise<boolean> {
    const memberships = await this.membershipLookup.getMembershipsForUser(userId);
    return canAccessOrganization(userId, organizationId, memberships);
  }

  private requireEncryptionKey(): string {
    const key = this.config.env.CREDENTIALS_ENCRYPTION_KEY;
    if (!key) throw new Error("CREDENTIALS_ENCRYPTION_KEY is not configured");
    return key;
  }

  async connect(
    userId: string,
    organizationId: string,
    apiTokenIdentifier: string,
    apiTokenValue: string,
  ): Promise<{ ok: true; programs: HackerOneProgramSummary[] } | NotMember | InvalidCredentials> {
    if (!(await this.hasAccess(userId, organizationId))) return { ok: false, reason: "not_member" };

    const client = new HackerOneClient(apiTokenIdentifier, apiTokenValue);
    let programs: HackerOneProgramSummary[];
    try {
      programs = await client.listPrograms();
    } catch (error) {
      if (error instanceof HackerOneApiError) return { ok: false, reason: "invalid_credentials" };
      throw error;
    }

    const encryptedApiToken = encryptSecret(apiTokenValue, this.requireEncryptionKey());
    await prisma.hackerOneConnection.upsert({
      where: { organizationId },
      create: { organizationId, apiTokenIdentifier, encryptedApiToken, connectedByUserId: userId },
      update: { apiTokenIdentifier, encryptedApiToken, connectedByUserId: userId },
    });

    await writeAuditEvent({
      organizationId,
      actorUserId: userId,
      action: "HACKERONE_CONNECTED",
      resourceType: "HackerOneConnection",
      result: "success",
    });

    return { ok: true, programs };
  }

  async getStatus(
    userId: string,
    organizationId: string,
  ): Promise<HackerOneConnectionStatus | NotMember> {
    if (!(await this.hasAccess(userId, organizationId))) return { ok: false, reason: "not_member" };

    const connection = await prisma.hackerOneConnection.findUnique({
      where: { organizationId },
      include: { syncedPrograms: true },
    });

    return {
      connected: !!connection,
      apiTokenIdentifier: connection?.apiTokenIdentifier ?? null,
      lastSyncedAt: connection?.lastSyncedAt ?? null,
      lastSyncError: connection?.lastSyncError ?? null,
      syncedPrograms:
        connection?.syncedPrograms.map((p) => ({
          programHandle: p.programHandle,
          programName: p.programName,
          lastSyncedAt: p.lastSyncedAt,
        })) ?? [],
    };
  }

  async listPrograms(
    userId: string,
    organizationId: string,
  ): Promise<
    | { ok: true; programs: HackerOneProgramSummary[] }
    | NotMember
    | NotConnected
    | InvalidCredentials
  > {
    if (!(await this.hasAccess(userId, organizationId))) return { ok: false, reason: "not_member" };

    const connection = await prisma.hackerOneConnection.findUnique({ where: { organizationId } });
    if (!connection) return { ok: false, reason: "not_connected" };

    const client = this.clientForConnection(connection);
    try {
      return { ok: true, programs: await client.listPrograms() };
    } catch (error) {
      if (error instanceof HackerOneApiError) return { ok: false, reason: "invalid_credentials" };
      throw error;
    }
  }

  async syncProgramScope(
    userId: string,
    organizationId: string,
    programHandle: string,
  ): Promise<
    { ok: true; result: SyncScopeResult } | NotMember | NotConnected | HackerOneApiFailure
  > {
    if (!(await this.hasAccess(userId, organizationId))) return { ok: false, reason: "not_member" };

    const connection = await prisma.hackerOneConnection.findUnique({ where: { organizationId } });
    if (!connection) return { ok: false, reason: "not_connected" };

    const client = this.clientForConnection(connection);

    let scopes;
    let programs;
    try {
      [scopes, programs] = await Promise.all([
        client.getStructuredScopes(programHandle),
        client.listPrograms(),
      ]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown HackerOne API error";
      await prisma.hackerOneConnection.update({
        where: { organizationId },
        data: { lastSyncError: detail },
      });
      return { ok: false, reason: "hackerone_api_error", detail };
    }

    const programName = programs.find((p) => p.handle === programHandle)?.name ?? programHandle;
    const skipped: SkippedScopeAsset[] = [];
    let created = 0;
    let updated = 0;

    for (const scope of scopes) {
      const parsed = parseScopeAsset(scope.assetType, scope.assetIdentifier);
      if (!parsed) {
        skipped.push({
          assetType: scope.assetType,
          assetIdentifier: scope.assetIdentifier,
          reason: "unsupported_asset_type",
        });
        continue;
      }
      if (!scope.eligibleForSubmission) {
        skipped.push({
          assetType: scope.assetType,
          assetIdentifier: scope.assetIdentifier,
          reason: "not_eligible_for_submission",
        });
        continue;
      }

      const existing = await prisma.targetAuthorization.findUnique({
        where: { hackerOneScopeId: scope.id },
      });

      if (existing?.revokedAt) {
        skipped.push({
          assetType: scope.assetType,
          assetIdentifier: scope.assetIdentifier,
          reason: "previously_revoked_by_user",
        });
        continue;
      }

      const expiresAt = new Date(Date.now() + DEFAULT_EXPIRES_IN_DAYS * MS_PER_DAY);
      if (existing) {
        await prisma.targetAuthorization.update({
          where: { id: existing.id },
          data: { expiresAt, verifiedAt: existing.verifiedAt ?? new Date() },
        });
        updated += 1;
      } else {
        await prisma.targetAuthorization.create({
          data: {
            organizationId,
            scheme: parsed.scheme,
            host: parsed.host,
            port: parsed.port,
            allowedPathPrefixes: [],
            verificationMethod: "HACKERONE_SCOPE",
            verifiedAt: new Date(),
            authorizedByUserId: userId,
            expiresAt,
            maxTier: DEFAULT_MAX_TIER,
            hackerOneScopeId: scope.id,
          },
        });
        created += 1;
      }
    }

    await prisma.hackerOneSyncedProgram.upsert({
      where: { connectionId_programHandle: { connectionId: connection.id, programHandle } },
      create: { connectionId: connection.id, programHandle, programName },
      update: { programName, lastSyncedAt: new Date() },
    });
    await prisma.hackerOneConnection.update({
      where: { organizationId },
      data: { lastSyncedAt: new Date(), lastSyncError: null },
    });

    await writeAuditEvent({
      organizationId,
      actorUserId: userId,
      action: "HACKERONE_SCOPE_SYNCED",
      resourceType: "HackerOneConnection",
      result: "success",
      metadata: { programHandle, created, updated, skipped: skipped.length },
    });

    return {
      ok: true,
      result: { programHandle, totalScopeEntries: scopes.length, created, updated, skipped },
    };
  }

  async disconnect(userId: string, organizationId: string): Promise<{ ok: true } | NotMember> {
    if (!(await this.hasAccess(userId, organizationId))) return { ok: false, reason: "not_member" };

    await prisma.hackerOneConnection.deleteMany({ where: { organizationId } });

    await writeAuditEvent({
      organizationId,
      actorUserId: userId,
      action: "HACKERONE_DISCONNECTED",
      resourceType: "HackerOneConnection",
      result: "success",
    });

    return { ok: true };
  }

  private clientForConnection(connection: {
    apiTokenIdentifier: string;
    encryptedApiToken: string;
  }): HackerOneClient {
    const apiTokenValue = decryptSecret(connection.encryptedApiToken, this.requireEncryptionKey());
    return new HackerOneClient(connection.apiTokenIdentifier, apiTokenValue);
  }
}
