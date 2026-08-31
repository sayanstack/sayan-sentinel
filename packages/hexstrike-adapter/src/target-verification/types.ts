export type VerificationMethod = "dns_txt" | "http_well_known";

export interface VerificationTarget {
  scheme: "http" | "https";
  host: string;
  port: number;
  method: VerificationMethod;
  /** The random token generated when verification was initiated — never accepted from the caller at check time. */
  challenge: string;
}

export interface VerificationResult {
  verified: boolean;
  method: VerificationMethod;
  detail: string;
}

/** The DNS TXT record name a domain owner must publish, per host being verified. */
export function dnsTxtRecordName(host: string): string {
  return `_sentinel-verification.${host}`;
}

/** The exact TXT record value Sentinel looks for among (possibly several) TXT records at that name. */
export function dnsTxtRecordValue(challenge: string): string {
  return `sentinel-verification=${challenge}`;
}

/** The HTTP path a domain owner must serve the challenge token from, verbatim, as the full response body. */
export const HTTP_WELL_KNOWN_PATH = "/.well-known/sentinel-verification";
