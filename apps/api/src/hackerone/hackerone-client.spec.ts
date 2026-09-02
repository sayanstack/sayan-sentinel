import { HackerOneApiError, HackerOneClient } from "./hackerone-client";

describe("HackerOneClient", () => {
  const client = new HackerOneClient("token-id", "token-value");

  beforeEach(() => {
    (global.fetch as jest.Mock) = jest.fn();
  });

  it("sends HTTP Basic auth built from the identifier and value", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await client.listPrograms();

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const expected = `Basic ${Buffer.from("token-id:token-value").toString("base64")}`;
    expect(options.headers.Authorization).toBe(expected);
  });

  it("maps program list attributes from the JSON:API response", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "1",
            type: "program",
            attributes: {
              handle: "acme",
              name: "Acme Corp",
              submission_state: "open",
              offers_bounties: true,
            },
          },
        ],
      }),
    });

    const programs = await client.listPrograms();

    expect(programs).toEqual([
      { handle: "acme", name: "Acme Corp", submissionState: "open", offersBounties: true },
    ]);
  });

  it("throws HackerOneApiError with the status code on a non-ok response", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });

    await expect(client.listPrograms()).rejects.toThrow(HackerOneApiError);
    await expect(client.listPrograms()).rejects.toMatchObject({ status: 401 });
  });

  it("paginates structured scopes until a short page is returned", async () => {
    const fullPage = {
      data: Array.from({ length: 100 }, (_, i) => ({
        id: `scope-${i}`,
        type: "structured-scope",
        attributes: {
          asset_type: "URL",
          asset_identifier: `host${i}.example.com`,
          eligible_for_submission: true,
          eligible_for_bounty: true,
          instruction: null,
          max_severity: null,
        },
      })),
    };
    const shortPage = {
      data: [
        {
          id: "scope-last",
          type: "structured-scope",
          attributes: {
            asset_type: "URL",
            asset_identifier: "last.example.com",
            eligible_for_submission: true,
            eligible_for_bounty: false,
            instruction: "read the policy",
            max_severity: "high",
          },
        },
      ],
    };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => fullPage })
      .mockResolvedValueOnce({ ok: true, json: async () => shortPage });

    const scopes = await client.getStructuredScopes("acme");

    expect(scopes).toHaveLength(101);
    expect(scopes[100]).toEqual({
      id: "scope-last",
      assetType: "URL",
      assetIdentifier: "last.example.com",
      eligibleForSubmission: true,
      eligibleForBounty: false,
      instruction: "read the policy",
      maxSeverity: "high",
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
