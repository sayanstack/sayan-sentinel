/**
 * Thin HTTP client for the configured external dynamic-validation REST
 * server. Endpoint shapes below were verified against a real (if
 * unreachable) local server on the default port during development, not
 * guessed:
 *
 *   GET  /health                          — health check
 *   GET  /api/telemetry                   — server telemetry
 *   POST /api/tools/<toolName>             — e.g. nmap, nuclei, httpx (body = tool args)
 *   GET  /api/processes/status/<pid>       — job status check
 *
 * `POST /api/processes/terminate/<pid>` (used by `cancel()`) follows the
 * same verified `/api/processes/.../<pid>` convention but was not
 * independently confirmed against a live server — see
 * docs/dynamic-validation-integration.md.
 */
export interface DynamicValidationHttpClientOptions {
  baseUrl: string;
  timeoutMs?: number;
}

export interface DynamicValidationToolResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export interface IDynamicValidationClient {
  health(): Promise<DynamicValidationToolResult>;
  telemetry(): Promise<DynamicValidationToolResult>;
  runTool(toolName: string, args: Record<string, unknown>): Promise<DynamicValidationToolResult>;
  processStatus(pid: number): Promise<DynamicValidationToolResult>;
  terminateProcess(pid: number): Promise<DynamicValidationToolResult>;
}

export class DynamicValidationHttpClient implements IDynamicValidationClient {
  constructor(private readonly options: DynamicValidationHttpClientOptions) {}

  health(): Promise<DynamicValidationToolResult> {
    return this.request("GET", "/health");
  }

  telemetry(): Promise<DynamicValidationToolResult> {
    return this.request("GET", "/api/telemetry");
  }

  runTool(toolName: string, args: Record<string, unknown>): Promise<DynamicValidationToolResult> {
    return this.request("POST", `/api/tools/${toolName}`, args);
  }

  processStatus(pid: number): Promise<DynamicValidationToolResult> {
    return this.request("GET", `/api/processes/status/${pid}`);
  }

  terminateProcess(pid: number): Promise<DynamicValidationToolResult> {
    return this.request("POST", `/api/processes/terminate/${pid}`);
  }

  /**
   * Never throws — a connection failure, timeout, or non-JSON response all
   * come back as `{ success: false, error }`, the same shape the backend
   * server uses for a genuine tool error, so callers have exactly one
   * failure path to handle instead of a mix of thrown exceptions and
   * `success: false` payloads.
   */
  private async request(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<DynamicValidationToolResult> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    try {
      const response = await fetch(`${this.options.baseUrl}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        return {
          success: false,
          error: `Non-JSON response from dynamic validation server: ${text.slice(0, 500)}`,
        };
      }

      if (typeof parsed !== "object" || parsed === null) {
        return { success: false, error: "Unexpected dynamic validation response shape" };
      }
      const result = parsed as Partial<DynamicValidationToolResult>;
      return { success: Boolean(result.success), ...result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Request failed: ${message}` };
    } finally {
      clearTimeout(timeout);
    }
  }
}
