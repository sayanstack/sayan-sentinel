import { Controller, Get, Headers, UnauthorizedException } from "@nestjs/common";
import { DEFAULT_POLICY_RULES, type PolicyRule } from "@sayan-sentinel/policy-engine";

/**
 * Read-only: the actual policy rules `runFullStackScanPipeline`'s scoring
 * step enforces on every scan today (see `DEFAULT_POLICY_RULES` in
 * `@sayan-sentinel/policy-engine`). No per-organization customization
 * exists yet — this is the one global set every org's scans run against,
 * not a preview of something configurable; the UI doesn't imply
 * otherwise (no edit controls).
 */
@Controller("policies")
export class PoliciesController {
  @Get()
  list(@Headers("x-demo-user-id") userId: string | undefined): PolicyRule[] {
    if (!userId) throw new UnauthorizedException("x-demo-user-id header is required");
    return DEFAULT_POLICY_RULES;
  }
}
