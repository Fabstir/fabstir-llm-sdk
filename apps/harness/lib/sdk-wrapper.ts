import { encodeFunctionData } from 'viem';
import { connectWallet } from './base-account';
import { getOrCreateSubAccount } from './sub-account';
import { getProvider } from './provider';
import type { BatchCall, SDKConfig, TransactionResult } from './types';

/** Browser-compatible SDK wrapper */
export class FabstirHarnessSDK {
  private subAccount: string | null = null;
  private provider: any;

  constructor(private config: SDKConfig) {
    this.provider = getProvider();
  }

  async initialize(): Promise<void> {
    const accounts = await connectWallet();
    const sub = await getOrCreateSubAccount(accounts[0]);
    this.subAccount = sub.address;
  }

  async sendBatchCalls(from: string, calls: BatchCall[]): Promise<TransactionResult> {
    return await this.provider.request({
      method: 'wallet_sendCalls',
      params: [{
        version: '2.0.0',
        chainId: `0x${this.config.chainId.toString(16)}`,
        from,
        calls,
        capabilities: { atomic: { required: true } }
      }]
    });
  }

  async getCallsStatus(id: string): Promise<any> {
    return await this.provider.request({
      method: 'wallet_getCallsStatus',
      params: [{ id }]
    });
  }

  getSubAccount(): string | null {
    return this.subAccount;
  }
}

let sdkInstance: FabstirHarnessSDK | null = null;

export function getInstance(config?: SDKConfig): FabstirHarnessSDK {
  if (!sdkInstance && config) {
    sdkInstance = new FabstirHarnessSDK(config);
  }
  if (!sdkInstance) {
    throw new Error('SDK not initialized. Call getInstance with config first.');
  }
  return sdkInstance;
}

export async function initializeSDK(): Promise<FabstirHarnessSDK> {
  const sdk = getInstance({
    chainId: 84532, // Base Sepolia
    appName: 'Fabstir Harness'
  });
  await sdk.initialize();
  return sdk;
}

export function buildUSDCApproval(spender: string, amount: bigint): BatchCall {
  const data = encodeFunctionData({
    abi: [{ name: 'approve', type: 'function',
      inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
      outputs: [{ name: '', type: 'bool' }] }],
    functionName: 'approve', args: [spender, amount]
  });
  return { to: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', data: data as `0x${string}` };
}

export function buildJobCreation(jobData: any): BatchCall {
  return { to: '0x0000000000000000000000000000000000000000', data: '0x' as `0x${string}` };
}

export default { getInstance, initializeSDK, buildUSDCApproval, buildJobCreation };