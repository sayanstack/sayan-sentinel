import { autoConfigureCloudflareTxtRecord } from "./auto-configure-cloudflare";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("autoConfigureCloudflareTxtRecord", () => {
  it("finds the zone by the host itself and creates the TXT record", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true, result: [{ id: "zone-1" }] }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true }));

    const result = await autoConfigureCloudflareTxtRecord(
      { host: "app.example.com", verificationChallenge: "abc123", apiToken: "token" },
      fetchImpl,
    );

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("zones?name=app.example.com"),
      expect.objectContaining({ headers: { Authorization: "Bearer token" } }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/zones/zone-1/dns_records",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          type: "TXT",
          name: "_sentinel-verification.app.example.com",
          content: '"sentinel-verification=abc123"',
          ttl: 300,
          comment: "Added automatically by Sentinel for target ownership verification",
        }),
      }),
    );
  });

  it("falls back to the apex domain when no zone matches the full host", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true, result: [] }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, result: [{ id: "zone-apex" }] }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true }));

    const result = await autoConfigureCloudflareTxtRecord(
      { host: "app.example.com", verificationChallenge: "abc123", apiToken: "token" },
      fetchImpl,
    );

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("zones?name=example.com"),
      expect.anything(),
    );
  });

  it("reports a clear error for an invalid or under-scoped token", async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(jsonResponse(403, { success: false }));

    const result = await autoConfigureCloudflareTxtRecord(
      { host: "example.com", verificationChallenge: "abc123", apiToken: "bad-token" },
      fetchImpl,
    );

    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/rejected this API token/);
  });

  it("reports a clear error when no zone matches this domain at all", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true, result: [] }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, result: [] }));

    const result = await autoConfigureCloudflareTxtRecord(
      { host: "example.com", verificationChallenge: "abc123", apiToken: "token" },
      fetchImpl,
    );

    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/No Cloudflare zone found/);
  });

  it("surfaces the Cloudflare API's own error message when record creation fails", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true, result: [{ id: "zone-1" }] }))
      .mockResolvedValueOnce(
        jsonResponse(400, { success: false, errors: [{ message: "Record already exists." }] }),
      );

    const result = await autoConfigureCloudflareTxtRecord(
      { host: "example.com", verificationChallenge: "abc123", apiToken: "token" },
      fetchImpl,
    );

    expect(result.ok).toBe(false);
    expect(result.detail).toBe("Record already exists.");
  });
});
