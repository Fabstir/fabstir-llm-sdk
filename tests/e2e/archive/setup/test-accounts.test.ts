import { describe, it, expect } from 'vitest';
import { getTestUser, getTestHost, getTreasury, fundAccount } from './test-accounts';

describe('Test Accounts Setup', () => {
  it('should create test user with Base Account auth integration', async () => {
    const user = await getTestUser();
    expect(user.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(user.privateKey).toBeDefined();
    expect(user.signer).toBeDefined();
    expect(user.s5Seed).toMatch(/^(\w+\s+){11}\w+$/); // 12-word mnemonic
    expect(user.userId).toMatch(/^base:alice\d+$/);
    expect(user.role).toBe('user');
    expect(user.capabilities.gasSponsorship).toBe(true); // Base on testnet
    expect(user.capabilities.passkey).toBe(true);
    expect(user.capabilities.smartWallet).toBe(true);
  });

  it('should create test host with MetaMask auth integration', async () => {
    const host = await getTestHost();
    expect(host.s5Seed).toMatch(/^(\w+\s+){11}\w+$/);
    expect(host.userId).toMatch(/^metamask:0x[a-fA-F0-9]+$/);
    expect(host.role).toBe('host');
    expect(host.capabilities.gasSponsorship).toBe(false); // MetaMask never sponsors
    expect(host.capabilities.passkey).toBe(false);
  });

  it('should generate unique S5 seeds per account', async () => {
    const user1 = await getTestUser();
    const user2 = await getTestHost();
    expect(user1.s5Seed).not.toBe(user2.s5Seed); // Critical: each user has unique seed
  });

  it('should provide treasury account without auth', () => {
    const treasury = getTreasury();
    expect(treasury.role).toBe('treasury');
    expect(treasury.s5Seed).toBe(''); // Treasury doesn't need S5
  });

  it('should fund test accounts with mock USDC', async () => {
    const user = await getTestUser();
    await fundAccount(user, BigInt(1000000)); // 1 USDC (6 decimals)
    // Should not throw
  });
});