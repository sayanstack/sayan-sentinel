import {
  DynamicValidationHttpClient,
  type DynamicValidationHttpClientOptions,
  type DynamicValidationToolResult,
  type IDynamicValidationClient,
} from "./client/dynamic-validation-http-client";
import type { DnsResolver } from "./scope-guard/resolve-and-check";
import { evaluateScopeGuard } from "./scope-guard/scope-guard";
import type { SafetyTier, ScopeDecision, TargetAuthorizationRecord } from "./scope-guard/types";

export interface ProviderHealth {
  available: boolean;
  reason?: string;
}

export interface Capability {
  id: string;
  tier: SafetyTier;
  description: string;
}

export interface ValidationRequest {
  url: string;
  tier: SafetyTier;
  validationType: "http_probe" | "vulnerability_scan";
  authorizations: TargetAuthorizationRecord[];
  localLabMode: boolean;
  now?: Date;
  /** Injectable for tests/controlled resolution; defaults to real DNS lookup. */
  resolver?: DnsResolver;
}

export type ValidationOutcomeStatus =
  "confirmed" | "inconclusive" | "failed" | "rejected_by_scope_guard";

export interface ValidationResult {
  status: ValidationOutcomeStatus;
  reason: string;
  scopeDecision?: ScopeDecision;
  raw?: DynamicValidationToolResult;
}

/**
 * Only Tier 0 (passive) and a bounded Tier 1 (low-impact) capability are
 * offered, per Section 22 — Tier 2 requires explicit admin approval this
 * adapter doesn't implement yet, and destructive Tier 3 automation is
 * never implemented at all. Because `ValidationRequest.validationType` is
 * a closed string union of only these two ids, there is no code path that
 * can even construct a request for an unsupported capability from
 * type-checked call sites — the runtime check in `validate()` exists for
 * untyped input (e.g. a request deserialized from JSON).
 */
const SUPPORTED_CAPABILITIES: Capability[] = [
  {
    id: "http_probe",
    tier: 0,
    description: "Passive HTTP probing and technology detection (httpx)",
  },
  {
    id: "vulnerability_scan",
    tier: 1,
    description: "Template-based vulnerability scanning (Nuclei)",
  },
];

export interface DynamicValidationProvider {
  healthCheck(): Promise<ProviderHealth>;
  capabilities(): Promise<Capability[]>;
  validate(request: ValidationRequest): Promise<ValidationResult>;
  cancel(jobId: string): Promise<void>;
}

/**
 * Talks to an external, configurable dynamic-validation backend (any
 * server implementing the REST shape `DynamicValidationHttpClient`
 * expects) — the specific backend is a deployment-time choice, not a
 * hard-coded brand dependency.
 */
export class RemoteDynamicValidationProvider implements DynamicValidationProvider {
  private readonly activePids = new Map<string, number>();

  /** Accepts a client instance directly (test doubles inject a fake one); see `fromOptions` for the common case. */
  constructor(private readonly client: IDynamicValidationClient) {}

  static fromOptions(options: DynamicValidationHttpClientOptions): RemoteDynamicValidationProvider {
    return new RemoteDynamicValidationProvider(new DynamicValidationHttpClient(options));
  }

  async healthCheck(): Promise<ProviderHealth> {
    const result = await this.client.health();
    if (!result.success) {
      return { available: false, reason: result.error ?? "Dynamic validation health check failed" };
    }
    return { available: true };
  }

  capabilities(): Promise<Capability[]> {
    return Promise.resolve(SUPPORTED_CAPABILITIES);
  }

  /**
   * Scope Guard runs unconditionally, before any backend call and before
   * the capability/tier check even completes — this is the actual
   * enforcement point that makes "the dynamic validation backend cannot
   * bypass Scope Guard" true in code, not just a claim in a document.
   * Nothing about the request (including anything AI-derived upstream)
   * can skip this call.
   */
  async validate(request: ValidationRequest): Promise<ValidationResult> {
    const scopeDecision = await evaluateScopeGuard({
      url: request.url,
      tier: request.tier,
      authorizations: request.authorizations,
      localLabMode: request.localLabMode,
      now: request.now,
      resolver: request.resolver,
    });

    if (!scopeDecision.allowed) {
      return { status: "rejected_by_scope_guard", reason: scopeDecision.reason, scopeDecision };
    }

    const capability = SUPPORTED_CAPABILITIES.find((c) => c.id === request.validationType);
    if (!capability) {
      return {
        status: "failed",
        reason: `unsupported validation type: ${request.validationType}`,
        scopeDecision,
      };
    }
    if (request.tier > capability.tier) {
      return {
        status: "rejected_by_scope_guard",
        reason: `requested tier ${request.tier} exceeds capability "${capability.id}"'s supported tier ${capability.tier}`,
        scopeDecision,
      };
    }

    const raw = await this.runCapability(capability.id, request.url);
    if (!raw.success) {
      return {
        status: "failed",
        reason: raw.error ?? "Dynamic validation tool call failed",
        scopeDecision,
        raw,
      };
    }

    return {
      status: "inconclusive",
      reason:
        "Dynamic validation call completed successfully; interpreting the result into a confirmed/rejected verdict is the evidence engine's job, not this adapter's.",
      scopeDecision,
      raw,
    };
  }

  async cancel(jobId: string): Promise<void> {
    const pid = this.activePids.get(jobId);
    if (pid === undefined) return;
    await this.client.terminateProcess(pid);
    this.activePids.delete(jobId);
  }

  private runCapability(capabilityId: string, url: string): Promise<DynamicValidationToolResult> {
    switch (capabilityId) {
      case "http_probe":
        return this.client.runTool("httpx", {
          target: url,
          probe: true,
          tech_detect: true,
          status_code: true,
          title: true,
        });
      case "vulnerability_scan":
        return this.client.runTool("nuclei", { target: url, severity: "low,medium" });
      default:
        return Promise.resolve({
          success: false,
          error: `no execution mapping for capability ${capabilityId}`,
        });
    }
  }
}
