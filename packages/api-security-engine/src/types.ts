export interface ApiParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
}

export interface ApiEndpoint {
  method: string;
  /** `{param}` form, the same convention `@sayan-sentinel/source-runtime-correlation` uses. */
  path: string;
  summary?: string;
  /**
   * Named security scheme requirements from the OpenAPI document (e.g.
   * `["bearerAuth"]`), or an explicit empty array when the operation sets
   * `security: []` (opts out of the document's global requirement) —
   * `undefined` means the document said nothing either way, which is
   * different from "explicitly no auth" and is treated that way by the
   * rules below.
   */
  security?: string[];
  parameters: ApiParameter[];
}

export interface ApiInventoryEntry {
  method: string;
  path: string;
  inOpenApi: boolean;
  observed: boolean;
  openApiEndpoint?: ApiEndpoint;
}
