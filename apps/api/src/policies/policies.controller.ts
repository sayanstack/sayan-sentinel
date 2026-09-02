import { Controller, Get, UseGuards } from "@nestjs/common";
import { DEFAULT_POLICY_RULES, type PolicyRule } from "@sayan-sentinel/policy-engine";
import { SessionAuthGuard } from "../auth/session-auth.guard";

/**
 * Read-only: the actual policy rules `runFullStackScanPipeline`'s scoring
 * step enforces on every scan today (see `DEFAULT_POLICY_RULES` in
 * `@sayan-sentinel/policy-engine`). No per-organization customization
 * exists yet — this is the one global set every org's scans run against,
 * not a preview of something configurable; the UI doesn't imply
 * otherwise (no edit controls). Login-gated only (via the guard), not
 * user- or org-scoped, since the rule set itself isn't.
 */
@Controller("policies")
@UseGuards(SessionAuthGuard)
export class PoliciesController {
  @Get()
  list(): PolicyRule[] {
    return DEFAULT_POLICY_RULES;
  }
}
