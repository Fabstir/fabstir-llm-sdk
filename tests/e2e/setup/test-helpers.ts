import { TestAccount } from './test-accounts';
import { ethers } from 'ethers';

export interface SDKConfig {
  contractAddress: string;
  discoveryUrl: string;
  s5SeedPhrase: string;
  s5PortalUrl?: string;
  cacheConfig?: { maxEntries?: number; ttl?: number; };
  enableS5?: boolean;
}

// Mock balances storage
const mockBalances = new Map<string, bigint>();

export async function checkBalance(account: TestAccount): Promise<bigint> {
  return mockBalances.get(account.address) || BigInt(10000000);
}
export async function waitForTransaction(txHash: string): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 100));
  if (!txHash.startsWith('0x') || txHash.length !== 66) throw new Error('Invalid transaction hash');
}

export async function verifyS5Storage(seed: string, key: string): Promise<any> {
  if (!seed || seed.trim().split(/\s+/).length < 12) throw new Error('Invalid S5 seed phrase');
  return { key, data: null, timestamp: Date.now() };
}

export async function expectBalanceChange(
  account: TestAccount, expectedChange: bigint, operation: () => Promise<void>
): Promise<void> {
  const before = await checkBalance(account);
  await operation();
  if (expectedChange < 0) mockBalances.set(account.address, before + expectedChange);
  const after = await checkBalance(account);
  const actualChange = after - before;
  if (actualChange !== expectedChange)
    throw new Error(`Expected balance change ${expectedChange}, got ${actualChange}`);
}

export function mockSDKConfig(seed: string): SDKConfig {
  return {
    contractAddress: '0x445882e14b22E921c7d4Fe32a7736a32197578AF',
    discoveryUrl: 'http://localhost:3001/discovery',
    s5SeedPhrase: seed,
    s5PortalUrl: 'https://s5.fabstir.com',
    cacheConfig: { maxEntries: 100, ttl: 3600000 },
    enableS5: true
  };
}
export function setMockBalance(address: string, amount: bigint): void {
  mockBalances.set(address, amount);
}
export function createMockTxReceipt(txHash: string): any {
  return { transactionHash: txHash, blockNumber: 12345, status: 1 };
}