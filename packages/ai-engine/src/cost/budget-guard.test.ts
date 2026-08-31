import { describe, expect, it } from "vitest";
import { BudgetGuard } from "./budget-guard";

describe("BudgetGuard", () => {
  it("allows spend when both budgets are unlimited (<= 0)", () => {
    const guard = new BudgetGuard({ perScanBudgetUsd: 0, monthlyBudgetUsd: 0 });
    expect(guard.checkAndReserve("scan-1", 1000).allowed).toBe(true);
  });

  it("rejects a call that would exceed the per-scan budget", () => {
    const guard = new BudgetGuard({ perScanBudgetUsd: 1, monthlyBudgetUsd: 0 });
    expect(guard.checkAndReserve("scan-1", 0.6).allowed).toBe(true);
    const second = guard.checkAndReserve("scan-1", 0.6);
    expect(second.allowed).toBe(false);
    expect(second.reason).toContain("per-scan");
  });

  it("tracks per-scan budgets independently across different scans", () => {
    const guard = new BudgetGuard({ perScanBudgetUsd: 1, monthlyBudgetUsd: 0 });
    guard.checkAndReserve("scan-1", 0.9);
    const otherScan = guard.checkAndReserve("scan-2", 0.9);
    expect(otherScan.allowed).toBe(true);
  });

  it("rejects a call that would exceed the monthly budget even under the per-scan budget", () => {
    const guard = new BudgetGuard({ perScanBudgetUsd: 100, monthlyBudgetUsd: 1 });
    guard.checkAndReserve("scan-1", 0.7);
    const result = guard.checkAndReserve("scan-2", 0.7);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("monthly");
  });

  it("only reserves spend for allowed calls, not rejected ones", () => {
    const guard = new BudgetGuard({ perScanBudgetUsd: 1, monthlyBudgetUsd: 0 });
    guard.checkAndReserve("scan-1", 0.9);
    guard.checkAndReserve("scan-1", 0.9); // rejected, should not add to spend
    expect(guard.getScanSpend("scan-1")).toBeCloseTo(0.9);
  });
});
