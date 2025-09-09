import { Page } from '@playwright/test';
import { formatUnits } from 'viem';
export async function assertBalanceChange(page: Page, address: string, tokenAddress: string,
  before: bigint, after: bigint, expected: bigint, decimals = 18): Promise<void> {
  const actual = after - before, diff = actual - expected;
  if (diff !== BigInt(0)) throw new Error(`Balance change mismatch for ${address}: Expected: ${formatUnits(expected, decimals)}, Actual: ${formatUnits(actual, decimals)}`);
}
export async function assertGaslessExecution(page: Page, eoaAddress: string, ethBalanceBefore: bigint, ethBalanceAfter: bigint): Promise<void> {
  if (ethBalanceAfter < ethBalanceBefore) {
    const spent = ethBalanceBefore - ethBalanceAfter;
    throw new Error(`ETH balance decreased for EOA ${eoaAddress}: ETH spent: ${formatUnits(spent, 18)}, Expected: 0 (gasless)`);
  }
  console.log(`✅ Gasless execution verified - EOA ETH balance unchanged`);
}

export async function assertTransactionSuccess(page: Page, txId: string, status: string): Promise<void> {
  if (status !== 'CONFIRMED') {
    const receipt = await page.evaluate(async (id) => (window as any).ethereum.request({ method: 'wallet_getCallsStatus', params: [id] }), txId);
    throw new Error(`Transaction ${txId} failed: Status: ${status}, Receipt: ${JSON.stringify(receipt)}`);
  }
  console.log(`✅ Transaction ${txId} confirmed successfully`);
}

export async function getTokenBalance(page: Page, tokenAddress: string, accountAddress: string): Promise<bigint> {
  return await page.evaluate(async (p) => {
    const data = '0x70a08231' + p.account.slice(2).padStart(64, '0');
    return BigInt(await (window as any).ethereum.request({ method: 'eth_call', params: [{ to: p.token, data }, 'latest'] }));
  }, { token: tokenAddress, account: accountAddress });
}
export async function getEthBalance(page: Page, address: string): Promise<bigint> {
  return await page.evaluate(async (a) => BigInt(await (window as any).ethereum.request({ method: 'eth_getBalance', params: [a, 'latest'] })), address);
}