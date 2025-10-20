// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { createBaseAccountSDK, base } from '@base-org/account';
import { numberToHex, encodeFunctionData, type Hex } from 'viem';

// Minimal ERC20 ABI (included in module to avoid import drift)
const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function'
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function'
  }
] as const;

/**
 * Base Account Wallet implementation using EIP-5792 for gasless transactions
 * on Base Sepolia with default Coinbase sponsorship
 */
export class BaseAccountWallet {
  private sdk: ReturnType<typeof createBaseAccountSDK>;
  private provider: any;

  constructor() {
    // Initialize SDK with Base Sepolia
    this.sdk = createBaseAccountSDK({
      appName: 'Fabstir SDK',
      appChainIds: [base.constants.CHAIN_IDS.base_sepolia], // 84532
    });

    // Get provider for wallet operations
    this.provider = this.sdk.getProvider();
  }

  /**
   * Send sponsored calls using EIP-5792 v2
   * @param from - MUST be smart account address, not EOA
   * @param calls - Array of calls to execute atomically
   * @returns Promise with transaction ID and metadata
   */
  async sendSponsoredCalls(
    from: string,
    calls: Array<{
      to: `0x${string}`;
      data: `0x${string}`;
      value?: `0x${string}`;
    }>
  ): Promise<{ id: string; [key: string]: any }> {
    const chainId = numberToHex(base.constants.CHAIN_IDS.base_sepolia); // 0x14a34
    
    // Guard rail: Only allow Base Sepolia without paymaster
    if (chainId !== '0x14a34') {
      throw new Error('Only Base Sepolia supported without paymaster configuration');
    }
    
    // Check wallet capabilities (handle v1/v2 shapes)
    const caps = await this.provider.request({ 
      method: 'wallet_getCapabilities', 
      params: [['0x14A34']]  // Base Sepolia
    });
    
    const baseCaps = caps?.['0x14A34'] ?? {};
    const atomicSupported = 
      baseCaps?.atomic?.status === 'supported' ||  // v2 shape
      baseCaps?.atomicBatch?.supported === true;    // v1 fallback
    
    if (!atomicSupported) {
      console.warn('Wallet does not support atomic batching');
    }
    
    // Send sponsored user operation (EIP-5792 v2 format)
    const result = await this.provider.request({
      method: 'wallet_sendCalls',
      params: [{
        version: '2.0.0',  // REQUIRED for v2
        chainId,
        from,  // Smart account address
        calls,
        capabilities: {  // v2 structure (not atomicRequired)
          atomic: { required: true }
        }
      }]
    });
    
    // v2 returns object with id, not just string
    return result as { id: string; [key: string]: any };
  }

  /**
   * Check transaction status (v2 returns numeric codes)
   * @param id - Transaction ID from sendSponsoredCalls
   * @returns Status object with numeric code (200 = success)
   */
  async getCallsStatus(id: string): Promise<any> {
    const status = await this.provider.request({
      method: 'wallet_getCallsStatus',
      params: [id]
    });
    
    // v2 status codes: 200 = success, 100 = pending, etc.
    return status;
  }

  /**
   * Ensure we're using the smart account (not EOA)
   * @returns Smart account address (accounts[1])
   */
  async getSmartAccountAddress(): Promise<string> {
    const accounts = await this.provider.request({
      method: 'eth_requestAccounts',
      params: []
    });
    
    // Smart account is typically the second account (index 1)
    // EOA is at index 0
    if (accounts.length < 2) {
      throw new Error('Smart account not available. Connect Coinbase Smart Wallet.');
    }
    
    return accounts[1]; // Return smart account, not EOA
  }

  /**
   * Helper to encode ERC20 operations
   * @param tokenAddress - ERC20 token contract address
   * @param operation - 'approve' or 'transfer'
   * @param args - Arguments for the operation
   * @returns Encoded call data
   */
  encodeERC20Call(
    tokenAddress: string,
    operation: 'approve' | 'transfer',
    args: any[]
  ): { to: `0x${string}`, data: `0x${string}` } {
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: operation,
      args
    });
    
    return {
      to: tokenAddress as `0x${string}`,
      data: data as `0x${string}`
    };
  }

  /**
   * Wait for transaction completion with status polling
   * @param id - Transaction ID
   * @param maxWaitMs - Maximum time to wait (default 60s)
   * @returns Final status
   */
  async waitForTransaction(id: string, maxWaitMs: number = 60000): Promise<any> {
    const startTime = Date.now();
    let status;
    
    do {
      status = await this.getCallsStatus(id);
      
      // Success
      if (status.status === 200) {
        return status;
      }
      
      // Error
      if (status.status >= 400) {
        throw new Error(`Transaction failed with status: ${status.status}`);
      }
      
      // Check timeout
      if (Date.now() - startTime > maxWaitMs) {
        throw new Error('Transaction timeout');
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, 1000));
    } while (status.status < 200);
    
    return status;
  }

  /**
   * Get the provider instance
   * @returns Provider instance for direct requests
   */
  getProvider() {
    return this.provider;
  }
}

// Export helper functions as standalone for convenience
export const baseAccountWallet = new BaseAccountWallet();

export const sendSponsoredCalls = baseAccountWallet.sendSponsoredCalls.bind(baseAccountWallet);
export const getCallsStatus = baseAccountWallet.getCallsStatus.bind(baseAccountWallet);
export const getSmartAccountAddress = baseAccountWallet.getSmartAccountAddress.bind(baseAccountWallet);
export const encodeERC20Call = baseAccountWallet.encodeERC20Call.bind(baseAccountWallet);
export const waitForTransaction = baseAccountWallet.waitForTransaction.bind(baseAccountWallet);