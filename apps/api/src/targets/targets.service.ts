import { Injectable } from "@nestjs/common";
import { canAccessOrganization } from "@sayan-sentinel/auth";
import { prisma, type TargetAuthorization } from "@sayan-sentinel/database";
import {
  generateVerificationChallenge,
  verifyTarget as runTargetVerification,
  type VerificationMethod as PrimitiveVerificationMethod,
  type VerificationResult,
  type VerificationTarget,
} from "@sayan-sentinel/security-core";
import { writeAuditEvent } from "../audit/write-audit-event";
import { MembershipLookupService } from "../repositories/membership-lookup.service";
import {
  autoConfigureCloudflareTxtRecord,
  type CloudflareAutoConfigureResult,
} from "./auto-configure-cloudflare";
import { detectProvider, type ProviderDetection } from "./detect-provider";
import type { CreateTargetDto } from "./dto/create-target.dto";
import { normalizeHost } from "./normalize-host";
import { runQuickScan, type QuickScanResult } from "./run-quick-scan";

const DEFAULT_EXPIRES_IN_DAYS = 30;
const DEFAULT_MAX_TIER = 0;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const QUICK_START_SCHEME = "https";
const QUICK_START_PORT = 443;

export interface QuickStartResult {
  target: TargetAuthorization;
  detection: ProviderDetection;
}

function toPrimitiveVerificationMethod(method: string): PrimitiveVerificationMethod {
  return method === "DNS_TXT" ? "dns_txt" : "http_well_known";
}

export interface TargetWithVerificationOutcome extends TargetAuthorization {
  verificationOutcome?: VerificationResult;
}

/**
 * The service layer bridging real, persisted `TargetAuthorization` rows to
 * the deterministic verification primitives in `@sayan-sentinel/
 * security-core`'s `target-verification` module (DNS TXT / HTTP
 * well-known challenges) and, once verified, to Scope Guard itself (via
 * `toScopeGuardRecord`) — this is what makes those two previously
 * DB-independent pieces usable end to end rather than only unit-tested
 * against synthetic data.
 */
@Injectable()
export class TargetsService {
  constructor(private readonly membershipLookup: MembershipLookupService) {}

  async createTarget(
    userId: string,
    organizationId: string,
    input: CreateTargetDto,
  ): Promise<TargetAuthorization | null> {
    const memberships = await this.membershipLookup.getMembershipsForUser(userId);
    if (!canAccessOrganization(userId, organizationId, memberships)) {
      return null;
    }

    const challenge = generateVerificationChallenge();
    const expiresAt = new Date(
      Date.now() + (input.expiresInDays ?? DEFAULT_EXPIRES_IN_DAYS) * MS_PER_DAY,
    );

    const target = await prisma.targetAuthorization.create({
      data: {
        organizationId,
        repositoryId: input.repositoryId,
        scheme: input.scheme,
        host: input.host.toLowerCase(),
        port: input.port,
        allowedPathPrefixes: input.allowedPathPrefixes ?? [],
        verificationMethod: input.verificationMethod,
        verificationChallenge: challenge,
        authorizedByUserId: userId,
        expiresAt,
        maxTier: input.maxTier ?? DEFAULT_MAX_TIER,
      },
    });

    await writeAuditEvent({
      organizationId,
      actorUserId: userId,
      action: "TARGET_CREATED",
      resourceType: "TargetAuthorization",
      resourceId: target.id,
      result: "success",
      metadata: { scheme: target.scheme, host: target.host, port: target.port },
    });

    return target;
  }

  /**
   * The one-field onboarding path: given just a domain, resolves the
   * caller's organization automatically (their first membership — good
   * enough today since every real user has exactly one org via
   * `AuthService.ensureOrganizationMembership`; a user who later belongs to
   * several would need an explicit picker here, which doesn't exist yet),
   * runs best-effort DNS provider detection so the caller can show tailored
   * "here's where to add this DNS record" copy, and creates the target
   * with sensible defaults (https, 443, DNS TXT) so the caller never has
   * to expose a scheme/port/method picker. Returns `null` for a host that
   * doesn't parse as a domain, or when the user has no organization to
   * create the target under.
   */
  async quickStartTarget(userId: string, hostInput: string): Promise<QuickStartResult | null> {
    const host = normalizeHost(hostInput);
    if (!host) return null;

    const memberships = await this.membershipLookup.getMembershipsForUser(userId);
    const organizationId = memberships[0]?.organizationId;
    if (!organizationId) return null;

    const detection = await detectProvider(host);

    const target = await this.createTarget(userId, organizationId, {
      scheme: QUICK_START_SCHEME,
      host,
      port: QUICK_START_PORT,
      verificationMethod: "DNS_TXT",
    });
    if (!target) return null;

    return { target, detection };
  }

  /**
   * Runs the unpersisted "quick look" dynamic scan (see `runQuickScan`'s
   * own doc comment for why this doesn't go through the persisted
   * `Scan`/`Finding` pipeline) against a target the caller can see and
   * that has actually been verified. `getTargetForUser` already
   * tenant-checks (a cross-tenant caller gets `not_found`, same as a
   * nonexistent target, never leaking existence); `not_ready` covers an
   * existing, visible target that just isn't scannable yet (unverified,
   * revoked, or expired) — kept distinct from `not_found` so the
   * controller can return the right status code for each.
   */
  async runScanForUser(
    userId: string,
    targetId: string,
  ): Promise<
    { ok: true; result: QuickScanResult } | { ok: false; reason: "not_found" | "not_ready" }
  > {
    const target = await this.getTargetForUser(userId, targetId);
    if (!target) return { ok: false, reason: "not_found" };
    if (!target.verifiedAt || target.revokedAt || target.expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: "not_ready" };
    }

    return { ok: true, result: await runQuickScan(target) };
  }

  /**
   * Creates the DNS TXT verification record directly in the caller's own
   * Cloudflare account instead of making them copy/paste it by hand — see
   * `autoConfigureCloudflareTxtRecord`'s doc comment for why this is
   * Cloudflare-specific and why the token is never persisted. `not_found`
   * mirrors every other tenant-checked lookup; `not_pending` covers a
   * target that's already verified, revoked, or was never pending a
   * challenge in the first place — there's nothing left to configure.
   */
  async autoConfigureCloudflareForUser(
    userId: string,
    targetId: string,
    apiToken: string,
  ): Promise<
    | { ok: true; result: CloudflareAutoConfigureResult }
    | { ok: false; reason: "not_found" | "not_pending" }
  > {
    const target = await this.getTargetForUser(userId, targetId);
    if (!target) return { ok: false, reason: "not_found" };
    if (target.verifiedAt || target.revokedAt || !target.verificationChallenge) {
      return { ok: false, reason: "not_pending" };
    }

    const result = await autoConfigureCloudflareTxtRecord({
      host: target.host,
      verificationChallenge: target.verificationChallenge,
      apiToken,
    });
    return { ok: true, result };
  }

  /** Tenant-checked single lookup — returns `null` for both "doesn't exist" and "exists but you can't see it," never distinguishing the two (Section 35 IDOR pattern). */
  async getTargetForUser(userId: string, targetId: string): Promise<TargetAuthorization | null> {
    const target = await prisma.targetAuthorization.findUnique({ where: { id: targetId } });
    if (!target) return null;

    const memberships = await this.membershipLookup.getMembershipsForUser(userId);
    if (!canAccessOrganization(userId, target.organizationId, memberships)) return null;

    return target;
  }

  async listTargetsForUser(userId: string): Promise<TargetAuthorization[]> {
    const memberships = await this.membershipLookup.getMembershipsForUser(userId);
    const organizationIds = memberships.map((m) => m.organizationId);
    if (organizationIds.length === 0) return [];

    return prisma.targetAuthorization.findMany({
      where: { organizationId: { in: organizationIds } },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Re-checks the target every time — an authorization that's already
   * revoked or expired is never re-verified even if the challenge would
   * still technically resolve, matching the requirement that every dynamic
   * scan (and, here, every verification attempt) re-checks state rather
   * than trusting a stale record.
   */
  async verifyTarget(
    userId: string,
    targetId: string,
  ): Promise<TargetWithVerificationOutcome | null> {
    const target = await this.getTargetForUser(userId, targetId);
    if (!target) return null;

    if (target.revokedAt) {
      return {
        ...target,
        verificationOutcome: {
          verified: false,
          method: toPrimitiveVerificationMethod(target.verificationMethod),
          detail: "Target authorization has been revoked",
        },
      };
    }
    if (target.expiresAt.getTime() <= Date.now()) {
      return {
        ...target,
        verificationOutcome: {
          verified: false,
          method: toPrimitiveVerificationMethod(target.verificationMethod),
          detail: "Target authorization has expired",
        },
      };
    }
    if (!target.verificationChallenge) {
      return {
        ...target,
        verificationOutcome: {
          verified: false,
          method: toPrimitiveVerificationMethod(target.verificationMethod),
          detail: "No verification challenge on record",
        },
      };
    }

    await writeAuditEvent({
      organizationId: target.organizationId,
      actorUserId: userId,
      action: "TARGET_VERIFICATION_STARTED",
      resourceType: "TargetAuthorization",
      resourceId: target.id,
      result: "pending",
    });

    const verificationTarget: VerificationTarget = {
      scheme: target.scheme as "http" | "https",
      host: target.host,
      port: target.port,
      method: toPrimitiveVerificationMethod(target.verificationMethod),
      challenge: target.verificationChallenge,
    };

    const outcome = await runTargetVerification(verificationTarget);

    const updated = outcome.verified
      ? await prisma.targetAuthorization.update({
          where: { id: target.id },
          data: { verifiedAt: new Date() },
        })
      : target;

    await writeAuditEvent({
      organizationId: target.organizationId,
      actorUserId: userId,
      action: outcome.verified ? "TARGET_VERIFIED" : "TARGET_VERIFICATION_FAILED",
      resourceType: "TargetAuthorization",
      resourceId: target.id,
      result: outcome.verified ? "success" : "failure",
      metadata: { detail: outcome.detail },
    });

    return { ...updated, verificationOutcome: outcome };
  }

  async revokeTarget(userId: string, targetId: string): Promise<TargetAuthorization | null> {
    const target = await this.getTargetForUser(userId, targetId);
    if (!target) return null;

    const updated = await prisma.targetAuthorization.update({
      where: { id: target.id },
      data: { revokedAt: new Date() },
    });

    await writeAuditEvent({
      organizationId: target.organizationId,
      actorUserId: userId,
      action: "TARGET_REVOKED",
      resourceType: "TargetAuthorization",
      resourceId: target.id,
      result: "success",
    });

    return updated;
  }
}
