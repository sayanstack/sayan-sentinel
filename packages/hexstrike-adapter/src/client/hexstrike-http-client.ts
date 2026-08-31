/**
 * Thin HTTP client for the HexStrike AI REST server. Endpoints below were
 * verified by inspecting the real error output of the `hexstrike-ai` MCP
 * tools against an unreachable local server (they proxy to
 * `http://127.0.0.1:8888` by default) — not guessed:
 *
 *   GET  /health                          — server_health
 *   GET  /api/telemetry                   — get_telemetry
 *   POST /api/tools/<toolName>             — e.g. nmap, nuclei, httpx (body = tool args)
 *   GET  /api/processes/status/<pid>       — get_process_status
 *
 * `POST /api/processes/terminate/<pid>` (used by `cancel()`) follows the
 * same verified `/api/processes/.../<pid>` convention but was not
 * independently confirmed against a live server — see
 * docs/hexstrike-integration.md.
 */
export interface HexStrikeClientOptions {
  baseUrl: string;
  timeoutMs?: number;
}

export interface HexStrikeToolResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export interface IHexStrikeClient {
  health(): Promise<HexStrikeToolResult>;
  telemetry(): Promise<HexStrikeToolResult>;
  runTool(toolName: string, args: Record<string, unknown>): Promise<HexStrikeToolResult>;
  processStatus(pid: number): Promise<HexStrikeToolResult>;
  terminateProcess(pid: number): Promise<HexStrikeToolResult>;
}

export class HexStrikeHttpClient implements IHexStrikeClient {
  constructor(private readonly options: HexStrikeClientOptions) {}

  health(): Promise<HexStrikeToolResult> {
    return this.request("GET", "/health");
  }

  telemetry(): Promise<HexStrikeToolResult> {
    return this.request("GET", "/api/telemetry");
  }

  runTool(toolName: string, args: Record<string, unknown>): Promise<HexStrikeToolResult> {
    return this.request("POST", `/api/tools/${toolName}`, args);
  }

  processStatus(pid: number): Promise<HexStrikeToolResult> {
    return this.request("GET", `/api/processes/status/${pid}`);
  }

  terminateProcess(pid: number): Promise<HexStrikeToolResult> {
    return this.request("POST", `/api/processes/terminate/${pid}`);
  }

  /**
   * Never throws — a connection failure, timeout, or non-JSON response all
   * come back as `{ success: false, error }`, the same shape HexStrike's
   * own server uses for a genuine tool error, so callers have exactly one
   * failure path to handle instead of a mix of thrown exceptions and
   * `success: false` payloads.
   */
  private async request(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<HexStrikeToolResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

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
        return { success: false, error: `Non-JSON response from HexStrike server: ${text.slice(0, 500)}` };
      }

      if (typeof parsed !== "object" || parsed === null) {
        return { success: false, error: "Unexpected HexStrike response shape" };
      }
      const result = parsed as Partial<HexStrikeToolResult>;
      return { success: Boolean(result.success), ...result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Request failed: ${message}` };
    } finally {
      clearTimeout(timeout);
    }
  }
}
