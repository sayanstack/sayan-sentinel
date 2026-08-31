export { SafeHttpClient } from "./http/SafeHttpClient";
export type {
  SafeHttpClientOptions,
  SafeHttpOutcome,
  SafeHttpResponse,
  SafeHttpFailureReason,
  SafeHttpAuditEvent,
  FetchLike,
  FetchResponseLike,
} from "./http/types";
export { analyzeCors } from "./analysis/cors";
export { analyzeCookies } from "./analysis/cookies";
export { analyzeDebugExposure } from "./analysis/debug-exposure";
export { analyzeTransportSecurity } from "./analysis/transport-security";
export type { WebFinding, WebFindingEvidence } from "./analysis/types";
export { scanUrl } from "./engine/WebSecurityEngine";
export type { WebSecurityScanResult } from "./engine/WebSecurityEngine";
