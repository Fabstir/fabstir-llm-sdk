import { Page } from '@playwright/test';
import { encodeFunctionData, parseUnits } from 'viem';
import { getTestKit } from './testkit-setup';
const USDC_DECIMALS = 6, CHAIN_ID_HEX = '0x14a34';
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const JOB_MARKETPLACE_ADDRESS = '0xD937c594682Fe74E6e3d06239719805C04BE804A';
const HOST_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7';

export async function executeUSDCFlow(page: Page, smartAccountAddress: string) {
  const testKit = getTestKit();
  if (!testKit) throw new Error('TestKit not initialized');
  const depositAmount = parseUnits('2', USDC_DECIMALS), pricePerToken = parseUnits('0.002', USDC_DECIMALS);
  
  const approveCall = { to: USDC_ADDRESS, data: encodeFunctionData({
    abi: [{ inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
      name: 'approve', outputs: [{ name: '', type: 'bool' }], type: 'function' }],
    functionName: 'approve', args: [JOB_MARKETPLACE_ADDRESS, depositAmount] }) };
  const createSessionCall = { to: JOB_MARKETPLACE_ADDRESS, data: encodeFunctionData({
    abi: [{ inputs: [{ name: 'host', type: 'address' }, { name: 'token', type: 'address' },
      { name: 'deposit', type: 'uint256' }, { name: 'pricePerToken', type: 'uint256' },
      { name: 'duration', type: 'uint256' }, { name: 'proofInterval', type: 'uint256' }],
      name: 'createSessionJobWithToken', outputs: [{ name: '', type: 'uint256' }], type: 'function' }],
    functionName: 'createSessionJobWithToken',
    args: [HOST_ADDRESS, USDC_ADDRESS, depositAmount, pricePerToken, BigInt(86400), BigInt(100)] }) };
  
  const batchCall = await page.evaluate(async (params) => {
    const { smartAccount, calls, chainId } = params;
    const provider = (window as any).ethereum;
    const subAccount = await provider.request({
      method: 'wallet_getSubAccounts',
      params: [{ account: smartAccount, domain: window.location.origin }]
    }).then((r: any[]) => r[0]);
    return await provider.request({
      method: 'wallet_sendCalls',
      params: [{ version: '2.0.0', chainId, from: subAccount?.address || smartAccount,
        calls, capabilities: { atomic: { required: true } } }]
    });
  }, { smartAccount: smartAccountAddress, calls: [approveCall, createSessionCall], chainId: CHAIN_ID_HEX });
  const status = await waitForStatus(page, batchCall.id);
  return { transactionId: batchCall.id, smartAccount: smartAccountAddress,
    depositAmount, success: status === 'CONFIRMED' };
}

async function waitForStatus(page: Page, txId: string, timeout = 30000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await page.evaluate(async (id) => {
      const provider = (window as any).ethereum;
      return await provider.request({ method: 'wallet_getCallsStatus', params: [id] });
    }, txId);
    if (result.status === 'CONFIRMED' || result.status === 'FAILED') return result.status;
    await page.waitForTimeout(1000);
  }
  return 'TIMEOUT';
}