/** Tracks token usage across the build session. */

export const DEFAULT_TOKEN_BUDGET = 500_000;
export const BUDGET_WARNING_THRESHOLD = 0.8;

export class TokenTracker {
  inputTokens = 0;
  outputTokens = 0;
  costUsd = 0;
  readonly maxBudget: number;
  private budgetWarningFired = false;
  private perAgent: Map<string, { input: number; output: number }> = new Map();

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

  get total(): number {
    return this.inputTokens + this.outputTokens;
  }

  get budgetExceeded(): boolean {
    return this.total >= this.maxBudget;
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
      cost_usd: this.costUsd,
      max_budget: this.maxBudget,
      budget_remaining: this.budgetRemaining,
      per_agent: Object.fromEntries(this.perAgent),
    };
  }
}
