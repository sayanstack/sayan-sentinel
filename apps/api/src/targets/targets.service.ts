import { Injectable } from "@nestjs/common";
import { canAccessOrganization } from "@sayan-sentinel/auth";
import { prisma, type TargetAuthorization } from "@sayan-sentinel/database";
import {
  generateVerificationChallenge,
  verifyTarget as runTargetVerification,
  type VerificationMethod as PrimitiveVerificationMethod,
  type VerificationResult,
  type VerificationTarget,
} from "@sayan-sentinel/hexstrike-adapter";
import { writeAuditEvent } from "../audit/write-audit-event";
import { MembershipLookupService } from "../repositories/membership-lookup.service";
import type { CreateTargetDto } from "./dto/create-target.dto";

const DEFAULT_EXPIRES_IN_DAYS = 30;
const DEFAULT_MAX_TIER = 0;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toPrimitiveVerificationMethod(method: string): PrimitiveVerificationMethod {
  return method === "DNS_TXT" ? "dns_txt" : "http_well_known";
}

export interface TargetWithVerificationOutcome extends TargetAuthorization {
  verificationOutcome?: VerificationResult;
}

/**
 * The service layer bridging real, persisted `TargetAuthorization` rows to
 * the deterministic verification primitives in `@sayan-sentinel/
 * hexstrike-adapter`'s `target-verification` module (DNS TXT / HTTP
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
