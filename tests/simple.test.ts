import { describe, it, expect } from 'vitest';

describe('Simple Test', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });

  it('math works', () => {
    expect(1 + 1).toBe(2);
  });
});
