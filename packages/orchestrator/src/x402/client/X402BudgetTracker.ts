// x402 client-side budget enforcement for outbound payments

export class X402BudgetTracker {
  private readonly max: bigint;
  private spent: bigint = 0n;

  constructor(maxX402Spend: string) {
    this.max = BigInt(maxX402Spend);
  }

  /** Throws if spending amount would exceed the budget */
  checkBudget(amount: string): void {
    if (this.spent + BigInt(amount) > this.max) {
      throw new Error('x402 budget exceeded');
    }
  }

  /** Record a completed spend */
  recordSpend(amount: string): void {
    this.spent += BigInt(amount);
  }

  /** Total amount spent so far */
  getSpent(): bigint {
    return this.spent;
  }

  /** Remaining budget */
  getRemaining(): bigint {
    return this.max - this.spent;
  }
}
