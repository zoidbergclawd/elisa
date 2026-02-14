/** Tracks token usage across the build session. */

export const DEFAULT_TOKEN_BUDGET = 500_000;
export const BUDGET_WARNING_THRESHOLD = 0.8;

export const DEFAULT_RESERVED_PER_TASK = 50_000;

export class TokenTracker {
  inputTokens = 0;
  outputTokens = 0;
  costUsd = 0;
  readonly maxBudget: number;
  private budgetWarningFired = false;
  private perAgent: Map<string, { input: number; output: number }> = new Map();
  /** Tokens reserved for in-flight tasks that haven't reported actuals yet. */
  reservedTokens = 0;

  constructor(maxBudget = DEFAULT_TOKEN_BUDGET) {
    this.maxBudget = maxBudget;
  }

  add(inputTokens: number, outputTokens: number): void {
    this.inputTokens += inputTokens;
    this.outputTokens += outputTokens;
  }

  addForAgent(
    agentName: string,
    inputTokens: number,
    outputTokens: number,
    costUsd = 0,
  ): void {
    this.inputTokens += inputTokens;
    this.outputTokens += outputTokens;
    this.costUsd += costUsd;

    const prev = this.perAgent.get(agentName) ?? { input: 0, output: 0 };
    this.perAgent.set(agentName, {
      input: prev.input + inputTokens,
      output: prev.output + outputTokens,
    });
  }

  /** Reserve an estimated token amount for an in-flight task. */
  reserve(estimate = DEFAULT_RESERVED_PER_TASK): void {
    this.reservedTokens += estimate;
  }

  /** Release a previous reservation (call when task completes and actuals are recorded). */
  releaseReservation(estimate = DEFAULT_RESERVED_PER_TASK): void {
    this.reservedTokens = Math.max(0, this.reservedTokens - estimate);
  }

  get total(): number {
    return this.inputTokens + this.outputTokens;
  }

  /** Effective total including reserved (in-flight) tokens. */
  get effectiveTotal(): number {
    return this.total + this.reservedTokens;
  }

  get budgetExceeded(): boolean {
    return this.total >= this.maxBudget;
  }

  /** Returns true when effective total (including reservations) meets or exceeds budget. */
  get effectiveBudgetExceeded(): boolean {
    return this.effectiveTotal >= this.maxBudget;
  }

  /** Returns true the first time usage crosses the warning threshold. */
  checkWarning(): boolean {
    if (this.budgetWarningFired) return false;
    if (this.total >= this.maxBudget * BUDGET_WARNING_THRESHOLD) {
      this.budgetWarningFired = true;
      return true;
    }
    return false;
  }

  get budgetRemaining(): number {
    return Math.max(0, this.maxBudget - this.total);
  }

  snapshot(): Record<string, any> {
    return {
      input_tokens: this.inputTokens,
      output_tokens: this.outputTokens,
      total: this.total,
      reserved_tokens: this.reservedTokens,
      effective_total: this.effectiveTotal,
      cost_usd: this.costUsd,
      max_budget: this.maxBudget,
      budget_remaining: this.budgetRemaining,
      per_agent: Object.fromEntries(this.perAgent),
    };
  }
}
