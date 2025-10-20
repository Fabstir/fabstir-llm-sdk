// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import { 
  checkBalance, 
  waitForTransaction, 
  verifyS5Storage, 
  expectBalanceChange,
  mockSDKConfig 
} from './test-helpers';
import { getTestUser } from './test-accounts';

describe('Test Helpers', () => {
  it('should check mock USDC balance', async () => {
    const user = await getTestUser();
    const balance = await checkBalance(user);
    expect(balance).toBeGreaterThanOrEqual(0n);
  });

  it('should wait for mock transaction', async () => {
    await waitForTransaction('0x' + '0'.repeat(64)); // Mock tx hash
    // Should complete without error
  });

  it('should verify S5 storage with user seed', async () => {
    const user = await getTestUser();
    const result = await verifyS5Storage(user.s5Seed, 'test-key');
    expect(result).toBeDefined(); // Mock storage returns empty object
  });

  it('should track balance changes', async () => {
    const user = await getTestUser();
    await expectBalanceChange(user, -1000000n, async () => {
      // Mock operation that reduces balance by 1 USDC
    });
  });

  it('should create SDK config with auth seed', () => {
    const seed = 'test seed phrase here with twelve words total for testing purposes';
    const config = mockSDKConfig(seed);
    expect(config.s5SeedPhrase).toBe(seed);
    expect(config.contractAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(config.discoveryUrl).toBe('http://localhost:3001/discovery');
    expect(config.enableS5).toBe(true);
  });
});