import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DynamicValidationHttpClient } from "./dynamic-validation-http-client";

describe("DynamicValidationHttpClient", () => {
  let server: http.Server;
  let baseUrl: string;
  let lastRequest: { method?: string; url?: string; body?: string } = {};
  let nextResponse: { status: number; body: string } = { status: 200, body: '{"success":true}' };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        lastRequest = { method: req.method, url: req.url, body };
        res.writeHead(nextResponse.status, { "Content-Type": "application/json" });
        res.end(nextResponse.body);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterEach(() => {
    nextResponse = { status: 200, body: '{"success":true}' };
  });

  it("calls GET /health for health()", async () => {
    const client = new DynamicValidationHttpClient({ baseUrl });
    const result = await client.health();
    expect(lastRequest.method).toBe("GET");
    expect(lastRequest.url).toBe("/health");
    expect(result.success).toBe(true);
  });

  it("calls GET /api/telemetry for telemetry()", async () => {
    const client = new DynamicValidationHttpClient({ baseUrl });
    await client.telemetry();
    expect(lastRequest.url).toBe("/api/telemetry");
  });

  it("calls POST /api/tools/<name> with the args as the JSON body for runTool()", async () => {
    const client = new DynamicValidationHttpClient({ baseUrl });
    await client.runTool("nuclei", { target: "https://example.com", severity: "high" });
    expect(lastRequest.method).toBe("POST");
    expect(lastRequest.url).toBe("/api/tools/nuclei");
    expect(JSON.parse(lastRequest.body ?? "{}")).toEqual({
      target: "https://example.com",
      severity: "high",
    });
  });

  it("calls GET /api/processes/status/<pid> for processStatus()", async () => {
    const client = new DynamicValidationHttpClient({ baseUrl });
    await client.processStatus(1234);
    expect(lastRequest.url).toBe("/api/processes/status/1234");
  });

  it("calls POST /api/processes/terminate/<pid> for terminateProcess()", async () => {
    const client = new DynamicValidationHttpClient({ baseUrl });
    await client.terminateProcess(1234);
    expect(lastRequest.method).toBe("POST");
    expect(lastRequest.url).toBe("/api/processes/terminate/1234");
  });

  it("reports a connection failure as { success: false, error } rather than throwing", async () => {
    const client = new DynamicValidationHttpClient({ baseUrl: "http://127.0.0.1:1" });
    const result = await client.health();
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("reports a non-JSON response as a clean failure rather than throwing", async () => {
    nextResponse = { status: 200, body: "<html>not json</html>" };
    const client = new DynamicValidationHttpClient({ baseUrl });
    const result = await client.health();
    expect(result.success).toBe(false);
    expect(result.error).toContain("Non-JSON");
  });

  it("passes through a genuine tool-level failure from the server", async () => {
    nextResponse = { status: 200, body: '{"success":false,"error":"tool not found"}' };
    const client = new DynamicValidationHttpClient({ baseUrl });
    const result = await client.runTool("nonexistent-tool", {});
    expect(result.success).toBe(false);
    expect(result.error).toBe("tool not found");
  });
});
