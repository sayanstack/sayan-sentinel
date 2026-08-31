import { describe, expect, it } from "vitest";
import { ValidationRateLimiter } from "./rate-limiter";

describe("ValidationRateLimiter", () => {
  it("allows requests under every limit", () => {
    const limiter = new ValidationRateLimiter({ maxConcurrent: 5, maxRequestsPerSecond: 5, maxTotalRequests: 100 });
    expect(limiter.canProceed().allowed).toBe(true);
  });

  it("blocks once the total-request cap is reached", () => {
    const limiter = new ValidationRateLimiter({ maxConcurrent: 10, maxRequestsPerSecond: 10, maxTotalRequests: 2 });
    limiter.recordStart();
    limiter.recordEnd();
    limiter.recordStart();
    limiter.recordEnd();
    const check = limiter.canProceed();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("maximum of 2 requests");
  });

  it("blocks once max concurrency is reached, and unblocks after recordEnd", () => {
    const limiter = new ValidationRateLimiter({ maxConcurrent: 1, maxRequestsPerSecond: 10, maxTotalRequests: 10 });
    limiter.recordStart();
    expect(limiter.canProceed().allowed).toBe(false);
    limiter.recordEnd();
    expect(limiter.canProceed().allowed).toBe(true);
  });

  it("blocks once the per-second rate limit is reached within the same second", () => {
    const limiter = new ValidationRateLimiter({ maxConcurrent: 10, maxRequestsPerSecond: 2, maxTotalRequests: 10 });
    const t0 = 1_000_000;
    limiter.recordStart(t0);
    limiter.recordEnd();
    limiter.recordStart(t0 + 100);
    limiter.recordEnd();
    expect(limiter.canProceed(t0 + 200).allowed).toBe(false);
  });

  it("allows requests again once the rate-limit window has passed", () => {
    const limiter = new ValidationRateLimiter({ maxConcurrent: 10, maxRequestsPerSecond: 1, maxTotalRequests: 10 });
    const t0 = 1_000_000;
    limiter.recordStart(t0);
    limiter.recordEnd();
    expect(limiter.canProceed(t0 + 1500).allowed).toBe(true);
  });

  it("does not count a request toward totalRequestsIssued until recordStart is called", () => {
    const limiter = new ValidationRateLimiter({ maxConcurrent: 5, maxRequestsPerSecond: 5, maxTotalRequests: 5 });
    expect(limiter.totalRequestsIssued).toBe(0);
    limiter.recordStart();
    expect(limiter.totalRequestsIssued).toBe(1);
  });
});
