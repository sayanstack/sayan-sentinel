const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";

export interface CloudflareAutoConfigureResult {
  ok: boolean;
  detail: string;
}

interface CloudflareZonesResponse {
  success: boolean;
  result: Array<{ id: string }>;
}

interface CloudflareDnsRecordResponse {
  success: boolean;
  errors?: Array<{ message: string }>;
}

/** `app.example.com` -> `example.com`. Same documented multi-part-suffix limitation as `detect-provider.ts`'s `guessApex`. */
function apexOf(host: string): string {
  const labels = host.split(".");
  return labels.length > 2 ? labels.slice(-2).join(".") : host;
}

/**
 * Real, one-token DNS automation for the one provider this can be built
 * for without a full per-provider OAuth integration: the user pastes a
 * scoped Cloudflare API token (Zone:DNS:Edit), and this creates the exact
 * TXT record `runQuickScan`'s manual instructions already show — same
 * record, same value, just written directly instead of copy-pasted by
 * hand. The token is used for this one request and never persisted
 * (matches this app's "never store a secret you don't have to" pattern —
 * see the private-key handling in `@sayan-sentinel/github`).
 *
 * Every other DNS provider (GoDaddy, Namecheap, Route 53, ...) still
 * needs its own separate API/OAuth integration that doesn't exist yet —
 * this is deliberately Cloudflare-only, not a generic "any provider"
 * claim.
 */
export async function autoConfigureCloudflareTxtRecord(
  params: { host: string; verificationChallenge: string; apiToken: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CloudflareAutoConfigureResult> {
  const zone = await findZoneId(params.host, params.apiToken, fetchImpl);
  if (!zone.ok) return { ok: false, detail: zone.detail };

  const recordName = `_sentinel-verification.${params.host}`;
  let response: Response;
  try {
    response = await fetchImpl(`${CLOUDFLARE_API}/zones/${zone.zoneId}/dns_records`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "TXT",
        name: recordName,
        content: `"sentinel-verification=${params.verificationChallenge}"`,
        ttl: 300,
        comment: "Added automatically by Sentinel for target ownership verification",
      }),
    });
  } catch {
    return { ok: false, detail: "Could not reach the Cloudflare API." };
  }

  const body = (await response.json().catch(() => null)) as CloudflareDnsRecordResponse | null;
  if (!response.ok || !body?.success) {
    return {
      ok: false,
      detail: body?.errors?.[0]?.message ?? `Cloudflare rejected the request (${response.status}).`,
    };
  }

  return { ok: true, detail: `Added TXT record ${recordName} to your Cloudflare zone.` };
}

async function findZoneId(
  host: string,
  apiToken: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; zoneId: string } | { ok: false; detail: string }> {
  const candidates = Array.from(new Set([host, apexOf(host)]));

  for (const candidate of candidates) {
    let response: Response;
    try {
      response = await fetchImpl(`${CLOUDFLARE_API}/zones?name=${encodeURIComponent(candidate)}`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
    } catch {
      return { ok: false, detail: "Could not reach the Cloudflare API." };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        detail:
          "Cloudflare rejected this API token — check it has Zone:DNS:Edit permission for this domain.",
      };
    }
    if (!response.ok) continue;

    const body = (await response.json().catch(() => null)) as CloudflareZonesResponse | null;
    const zone = body?.success ? body.result[0] : undefined;
    if (zone) {
      return { ok: true, zoneId: zone.id };
    }
  }

  return {
    ok: false,
    detail: `No Cloudflare zone found for ${host} (or its apex) with this token.`,
  };
}
