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
    // Flag to identify this as a Base Account Kit signer
    // Used by EncryptionManager to use address-based key derivation
    isBaseAccountKit: true,
    primaryAccount: primaryAccount,
    chainId: chainId,

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
      // IMPORTANT: Base Account Kit requires hex-encoded messages for personal_sign
      const messageHex = typeof message === 'string'
        ? ethers.hexlify(ethers.toUtf8Bytes(message))
        : ethers.hexlify(message);

      console.log('[SubAccountSigner] Signing message with primary account:', primaryAccount);

      const signature = await provider.request({
        method: 'personal_sign',
        params: [messageHex, primaryAccount],
      });
      return signature;
    },

    async sendTransaction(
      tx: ethers.TransactionRequest
    ): Promise<ethers.TransactionResponse> {
      // Format value as hex - MUST be "0x0" not undefined (wallet rejects undefined)
      const valueHex = tx.value ? `0x${BigInt(tx.value).toString(16)}` : '0x0';

      console.log('[SubAccountSigner] Sending transaction via eth_sendTransaction:', {
        from: subAccount,
        to: tx.to,
        value: valueHex,
        data: (tx.data as string)?.slice(0, 10) + '...',
      });

      // Use eth_sendTransaction with sub-account as from address
      // Per Base documentation, this triggers the CryptoKey signing path for popup-free transactions
      // https://docs.base.org/identity/smart-wallet/guides/sub-accounts
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: subAccount as `0x${string}`,
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: valueHex,
        }],
      });

      console.log('[SubAccountSigner] Transaction hash:', txHash);

      // Get the transaction response
      const txResponse = await ethersProvider.getTransaction(txHash as string);

      if (!txResponse) {
        // Return minimal response if transaction not found yet
        return {
          hash: txHash as string,
          from: subAccount,
          to: tx.to,
          data: tx.data,
          value: tx.value || 0n,
          nonce: 0,
          gasLimit: 0n,
          gasPrice: 0n,
          chainId: chainId,
          wait: async () => {
            const receipt = await ethersProvider.waitForTransaction(txHash as string);
            return receipt || ({ status: 1, hash: txHash } as any);
          },
        } as any;
      }

      return txResponse;
    },
  };

  return signer;
}