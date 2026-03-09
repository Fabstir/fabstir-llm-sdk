import { describe, it, expect } from 'vitest';
import { X402BudgetTracker } from '../../src/x402/client/X402BudgetTracker';

describe('X402BudgetTracker', () => {
  it('checkBudget allows spend within limit', () => {
    const tracker = new X402BudgetTracker('1000');
    expect(() => tracker.checkBudget('500')).not.toThrow();
  });

  it('checkBudget throws when spend would exceed limit', () => {
    const tracker = new X402BudgetTracker('1000');
    tracker.recordSpend('600');
    expect(() => tracker.checkBudget('500')).toThrow('x402 budget exceeded');
  });

  it('recordSpend accumulates correctly', () => {
    const tracker = new X402BudgetTracker('1000');
    tracker.recordSpend('300');
    tracker.recordSpend('400');
    expect(tracker.getSpent()).toBe(700n);
  });

  it('getRemaining returns correct value', () => {
    const tracker = new X402BudgetTracker('1000');
    tracker.recordSpend('400');
    expect(tracker.getRemaining()).toBe(600n);
  });

  it('multiple small spends eventually exhaust budget', () => {
    const tracker = new X402BudgetTracker('100');
    for (let i = 0; i < 10; i++) {
      tracker.checkBudget('10');
      tracker.recordSpend('10');
    }
    expect(() => tracker.checkBudget('1')).toThrow('x402 budget exceeded');
  });

  it('zero maxSpend rejects all payments', () => {
    const tracker = new X402BudgetTracker('0');
    expect(() => tracker.checkBudget('1')).toThrow('x402 budget exceeded');
  });
});
