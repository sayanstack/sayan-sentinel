import { authzMissingOwnershipConstraint } from "./authorization/authz-001";
import { authzClientSuppliedPrivilegeDecision } from "./authorization/authz-004";
import { dataSensitiveFieldExposure } from "./data-exposure/data-001-sensitive-field-exposure";
import { fsPathTraversal } from "./filesystem/fs-001-path-traversal";
import { injSqlInjection } from "./injection/inj-001-sql-injection";
import { injCommandInjection } from "./injection/inj-002-command-injection";
import { injXss } from "./injection/inj-003-xss";
import { ssrfOutboundRequest } from "./ssrf/ssrf-001";
import type { SentinelRule } from "../engine/types";

/**
 * The shipped rule set, in the order the Rule Explorer and `sentinel scan`
 * table output list them. AUTHZ-001 is listed first deliberately — it's the
 * flagship rule the rest of the architecture (call graph, CFG, taint engine)
 * exists to support.
 */
export const defaultRules: SentinelRule[] = [
  authzMissingOwnershipConstraint,
  authzClientSuppliedPrivilegeDecision,
  injSqlInjection,
  injCommandInjection,
  injXss,
  fsPathTraversal,
  ssrfOutboundRequest,
  dataSensitiveFieldExposure,
];
