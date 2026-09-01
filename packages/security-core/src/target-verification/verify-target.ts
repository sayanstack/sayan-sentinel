import type { DnsResolver } from "../scope-guard/resolve-and-check";
import type { TxtResolver } from "./dns-txt";
import { verifyDnsTxtChallenge } from "./dns-txt";
import type { FetchLike } from "./http-well-known";
import { verifyHttpWellKnownChallenge } from "./http-well-known";
import type { VerificationResult, VerificationTarget } from "./types";

export interface VerifyTargetOptions {
  localLabMode?: boolean;
  resolveTxt?: TxtResolver;
  fetchImpl?: FetchLike;
  /** Injectable DNS resolver used for the pre-flight SSRF-safety check ahead of an http_well_known request. */
  dnsResolver?: DnsResolver;
}

/**
 * Dispatches to the verification method a target was created with. Neither
 * branch ever trusts anything the caller of this function asserts about
 * the target — both independently query the real world (DNS or an HTTP
 * request Sentinel makes itself) for the challenge value.
 */
export async function verifyTarget(
  target: VerificationTarget,
  options: VerifyTargetOptions = {},
): Promise<VerificationResult> {
  if (target.method === "dns_txt") {
    return verifyDnsTxtChallenge(target.host, target.challenge, { resolveTxt: options.resolveTxt });
  }
  return verifyHttpWellKnownChallenge(target.scheme, target.host, target.port, target.challenge, {
    localLabMode: options.localLabMode,
    fetchImpl: options.fetchImpl,
    dnsResolver: options.dnsResolver,
  });
}
