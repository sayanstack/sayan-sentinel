export interface BudgetGuardOptions {
  /** <= 0 means "no per-scan limit enforced." */
  perScanBudgetUsd: number;
  /** <= 0 means "no monthly limit enforced." */
  monthlyBudgetUsd: number;
}

export interface SpendCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Enforces AI_PER_SCAN_BUDGET_USD / AI_MONTHLY_BUDGET_USD (Section 41).
 * Call `checkAndReserve` BEFORE making an AI call with the call's
 * estimated cost; if it returns `allowed: false`, skip the call entirely
 * — the caller should fall back to deterministic-only analysis rather
 * than making the call anyway.
 */
export class BudgetGuard {
  private readonly scanSpend = new Map<string, number>();
  private monthlySpendUsd = 0;

  constructor(private readonly options: BudgetGuardOptions) {}

  checkAndReserve(scanId: string, estimatedCostUsd: number): SpendCheckResult {
    const currentScanSpend = this.scanSpend.get(scanId) ?? 0;

    if (
      this.options.perScanBudgetUsd > 0 &&
      currentScanSpend + estimatedCostUsd > this.options.perScanBudgetUsd
    ) {
      return {
        allowed: false,
        reason: `per-scan AI budget of $${this.options.perScanBudgetUsd.toFixed(2)} would be exceeded`,
      };
    }
    if (
      this.options.monthlyBudgetUsd > 0 &&
      this.monthlySpendUsd + estimatedCostUsd > this.options.monthlyBudgetUsd
    ) {
      return {
        allowed: false,
        reason: `monthly AI budget of $${this.options.monthlyBudgetUsd.toFixed(2)} would be exceeded`,
      };
    }

    this.scanSpend.set(scanId, currentScanSpend + estimatedCostUsd);
    this.monthlySpendUsd += estimatedCostUsd;
    return { allowed: true };
  }

  getScanSpend(scanId: string): number {
    return this.scanSpend.get(scanId) ?? 0;
  }

  getMonthlySpend(): number {
    return this.monthlySpendUsd;
  }
}
