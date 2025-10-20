// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * SubAccountSigner - Custom ethers signer that enables popup-free transactions
 *
 * This signer intercepts all sendTransaction calls and converts them to
 * wallet_sendCalls with the sub-account, eliminating transaction approval popups
 * after initial spend permission is granted.
 *
 * Key features:
 * - Uses EIP-5792 wallet_sendCalls for atomic batched transactions
 * - Polls wallet_getCallsStatus for transaction confirmation
 * - Integrates with S5 seed caching to avoid signature popups
 * - Returns proper ethers TransactionResponse objects
 */

import { ethers } from 'ethers';
import { hasCachedSeed } from '../utils/s5-seed-derivation';

export interface SubAccountSignerOptions {
  provider: any;           // Base Account Kit provider
  subAccount: string;      // Sub-account address (from address)
  primaryAccount: string;  // Primary smart wallet (for signatures)
  chainId: number;        // Chain ID for wallet_sendCalls
}

/**
 * Create a custom signer that uses wallet_sendCalls for popup-free transactions
 *
 * @param options - Signer configuration
 * @returns Ethers-compatible signer object
 */
export function createSubAccountSigner(options: SubAccountSignerOptions) {
  const { provider, subAccount, primaryAccount, chainId } = options;
  const CHAIN_HEX = `0x${chainId.toString(16)}`;

  const ethersProvider = new ethers.BrowserProvider(provider);

  // Create a wrapper that properly exposes both signer and provider methods
  const signer = {
    // Expose the provider properly for contract calls
    provider: ethersProvider,

    // Also provide getProvider method for compatibility
    getProvider(): ethers.BrowserProvider {
      return ethersProvider;
    },

    async getAddress(): Promise<string> {
      console.log(`[SubAccountSigner] getAddress() called, returning: ${subAccount}`);
      return subAccount;
    },

    async signTransaction(tx: ethers.TransactionRequest): Promise<string> {
      throw new Error('signTransaction not supported - use sendTransaction');
    },

    async signMessage(message: string | Uint8Array): Promise<string> {
      // Check if this is for S5 seed generation
      const messageStr =
        typeof message === 'string' ? message : ethers.toUtf8String(message);
      if (messageStr.includes('Generate S5 seed')) {
        // If we have a cached seed, return a deterministic mock signature
        const subAccountLower = subAccount.toLowerCase();
        if (hasCachedSeed(subAccountLower)) {
          console.log('[SubAccountSigner] Returning mock signature - seed is already cached');
          return '0x' + '0'.repeat(130); // Valid signature format
        }
      }

      // For other messages or if no cache, use the primary account
      const signature = await provider.request({
        method: 'personal_sign',
        params: [
          typeof message === 'string' ? message : ethers.hexlify(message),
          primaryAccount,
        ],
      });
      return signature;
    },

    async sendTransaction(
      tx: ethers.TransactionRequest
    ): Promise<ethers.TransactionResponse> {
      // Use wallet_sendCalls with sub-account as from address
      const calls = [
        {
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: tx.value ? `0x${BigInt(tx.value).toString(16)}` : undefined,
        },
      ];

      console.log('[SubAccountSigner] Sending transaction via wallet_sendCalls:', {
        from: subAccount,
        to: tx.to,
        data: (tx.data as string)?.slice(0, 10) + '...',
      });

      const response = await provider.request({
        method: 'wallet_sendCalls',
        params: [
          {
            version: '2.0.0',
            chainId: CHAIN_HEX,
            from: subAccount as `0x${string}`,
            calls: calls,
            capabilities: {
              atomic: { required: true },
            },
          },
        ],
      });

      const bundleId = typeof response === 'string' ? response : (response as any).id;
      console.log('[SubAccountSigner] Bundle ID:', bundleId);

      // Wait for the bundle to be confirmed and get the real transaction hash
      let realTxHash: string | undefined;
      for (let i = 0; i < 30; i++) {
        try {
          const res = (await provider.request({
            method: 'wallet_getCallsStatus',
            params: [bundleId],
          })) as { status: number | string; receipts?: any[] };

          const ok =
            (typeof res.status === 'number' && res.status >= 200 && res.status < 300) ||
            (typeof res.status === 'string' &&
              (res.status === 'CONFIRMED' || res.status.startsWith('2')));

          if (ok && res.receipts?.[0]?.transactionHash) {
            realTxHash = res.receipts[0].transactionHash;
            console.log('[SubAccountSigner] Transaction confirmed with hash:', realTxHash);
            break;
          }
        } catch (err) {
          // Continue polling
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      if (!realTxHash) {
        throw new Error('Transaction failed to confirm');
      }

      // Return a proper transaction response with the real hash
      const txResponse = await ethersProvider.getTransaction(realTxHash);

      if (!txResponse) {
        // If we can't get the transaction, create a minimal response
        return {
          hash: realTxHash,
          from: subAccount,
          to: tx.to,
          data: tx.data,
          value: tx.value || 0n,
          nonce: 0,
          gasLimit: 0n,
          gasPrice: 0n,
          chainId: chainId,
          wait: async () => {
            const receipt = await ethersProvider.getTransactionReceipt(realTxHash);
            return receipt || ({ status: 1, hash: realTxHash } as any);
          },
        } as any;
      }

      return txResponse;
    },
  };

  return signer;
}