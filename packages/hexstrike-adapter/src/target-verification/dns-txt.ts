import * as dns from "node:dns/promises";
import { dnsTxtRecordName, dnsTxtRecordValue, type VerificationResult } from "./types";

export type TxtResolver = (hostname: string) => Promise<string[][]>;

async function defaultTxtResolver(hostname: string): Promise<string[][]> {
  return dns.resolveTxt(hostname);
}

/**
 * Verifies domain ownership via a DNS TXT challenge, the same pattern ACME
 * (Let's Encrypt) DNS-01 validation uses: the owner publishes
 * `_sentinel-verification.<host>` TXT `sentinel-verification=<challenge>`,
 * and Sentinel looks it up itself rather than trusting anything the caller
 * asserts. Node's `dns.resolveTxt` returns each record as string *chunks*
 * (a TXT record can be split into multiple <255-byte strings) — they're
 * joined back into one value before comparison, matching how a resolver
 * presents a multi-chunk record to a consumer.
 */
export async function verifyDnsTxtChallenge(
  host: string,
  challenge: string,
  options: { resolveTxt?: TxtResolver } = {},
): Promise<VerificationResult> {
  const resolveTxt = options.resolveTxt ?? defaultTxtResolver;
  const recordName = dnsTxtRecordName(host);
  const expected = dnsTxtRecordValue(challenge);

  let records: string[][];
  try {
    records = await resolveTxt(recordName);
  } catch (error) {
    return {
      verified: false,
      method: "dns_txt",
      detail: `Could not resolve TXT records for ${recordName}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const found = records.some((chunks) => chunks.join("") === expected);
  return {
    verified: found,
    method: "dns_txt",
    detail: found
      ? `Found matching TXT record at ${recordName}`
      : `No TXT record at ${recordName} matched the expected challenge value`,
  };
}
