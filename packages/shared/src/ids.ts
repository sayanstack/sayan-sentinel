/**
 * Branded ID types so, e.g., a RepositoryId can't be passed where a ScanId is
 * expected — the two are structurally identical strings otherwise.
 */
declare const brand: unique symbol;
export type Branded<T, B extends string> = T & { readonly [brand]: B };

export type UserId = Branded<string, "UserId">;
export type OrganizationId = Branded<string, "OrganizationId">;
export type MembershipId = Branded<string, "MembershipId">;
export type InstallationId = Branded<string, "InstallationId">;
export type RepositoryId = Branded<string, "RepositoryId">;
export type ScanId = Branded<string, "ScanId">;
export type ScanJobId = Branded<string, "ScanJobId">;
export type FindingId = Branded<string, "FindingId">;
export type FindingEvidenceId = Branded<string, "FindingEvidenceId">;
export type TargetAuthorizationId = Branded<string, "TargetAuthorizationId">;
export type DynamicValidationId = Branded<string, "DynamicValidationId">;
export type PolicyId = Branded<string, "PolicyId">;
export type PatchId = Branded<string, "PatchId">;
export type PullRequestId = Branded<string, "PullRequestId">;
export type AuditEventId = Branded<string, "AuditEventId">;
export type AIUsageId = Branded<string, "AIUsageId">;

export function asId<T extends string>(value: string): Branded<string, T> {
  return value as Branded<string, T>;
}
