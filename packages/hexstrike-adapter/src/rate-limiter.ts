export interface RateLimitPolicy {
  maxConcurrent: number;
  maxRequestsPerSecond: number;
  maxTotalRequests: number;
}

export interface RateLimitCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Enforces Section 21's conservative dynamic-validation limits
 * (concurrency, requests/second, and a hard cap on total requests for a
 * validation run). This is deliberately simple in-memory bookkeeping, not
 * a distributed rate limiter — it's meant to bound a single validation
 * run's own request volume, not coordinate across worker processes.
 */
export class ValidationRateLimiter {
  private inFlight = 0;
  private totalIssued = 0;
  private readonly recentRequestTimestamps: number[] = [];

  constructor(private readonly policy: RateLimitPolicy) {}

  canProceed(now: number = Date.now()): RateLimitCheck {
    if (this.totalIssued >= this.policy.maxTotalRequests) {
      return {
        allowed: false,
        reason: `maximum of ${this.policy.maxTotalRequests} requests for this validation run reached`,
      };
    }
    if (this.inFlight >= this.policy.maxConcurrent) {
      return { allowed: false, reason: `maximum concurrency of ${this.policy.maxConcurrent} reached` };
    }

    const oneSecondAgo = now - 1000;
    const recentCount = this.recentRequestTimestamps.filter((t) => t > oneSecondAgo).length;
    if (recentCount >= this.policy.maxRequestsPerSecond) {
      return { allowed: false, reason: `rate limit of ${this.policy.maxRequestsPerSecond} requests/second reached` };
    }

    return { allowed: true };
  }

  recordStart(now: number = Date.now()): void {
    this.inFlight += 1;
    this.totalIssued += 1;
    this.recentRequestTimestamps.push(now);
  }

  recordEnd(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  get currentInFlight(): number {
    return this.inFlight;
  }

  get totalRequestsIssued(): number {
    return this.totalIssued;
  }
}
