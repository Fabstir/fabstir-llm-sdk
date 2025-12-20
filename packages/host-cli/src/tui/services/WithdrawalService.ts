// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Withdrawal Service
 * Handles withdrawing earnings from the HostEarnings contract
 */

import { ethers } from 'ethers';

// Contract addresses (Base Sepolia)
const HOST_EARNINGS_ADDRESS = '0xE4F33e9e132E60fc3477509f99b9E1340b91Aee0';
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// Minimal ABI for withdrawal
const HOST_EARNINGS_ABI = [
  'function withdraw(uint256 amount, address token) external',
  'function withdrawAll(address token) external',
  'function withdrawMultiple(address[] tokens) external',
  'function getBalance(address host, address token) view returns (uint256)',
];

export interface WithdrawalResult {
  success: boolean;
  txHash?: string;
  error?: string;
  ethAmount?: string;
  usdcAmount?: string;
}

/**
 * Withdraws all earnings (both ETH and USDC) from the HostEarnings contract
 * @param privateKey The host's private key for signing
 * @param rpcUrl RPC URL for the blockchain
 * @param onStatus Callback for status updates
 * @returns WithdrawalResult
 */
export async function withdrawAllEarnings(
  privateKey: string,
  rpcUrl: string,
  onStatus?: (status: string) => void
): Promise<WithdrawalResult> {
  try {
    // Normalize private key
    const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(normalizedKey, provider);
    const contract = new ethers.Contract(HOST_EARNINGS_ADDRESS, HOST_EARNINGS_ABI, wallet);

    // Check balances first
    onStatus?.('Checking balances...');
    const ethBalance = await contract.getBalance(wallet.address, ethers.ZeroAddress);
    const usdcBalance = await contract.getBalance(wallet.address, USDC_ADDRESS);

    const ethAmount = ethers.formatEther(ethBalance);
    const usdcAmount = ethers.formatUnits(usdcBalance, 6);

    if (ethBalance === 0n && usdcBalance === 0n) {
      return {
        success: false,
        error: 'No earnings to withdraw',
        ethAmount: '0',
        usdcAmount: '0',
      };
    }

    // Withdraw both tokens in one transaction
    onStatus?.('Sending withdrawal transaction...');
    const tokens = [];
    if (ethBalance > 0n) tokens.push(ethers.ZeroAddress);
    if (usdcBalance > 0n) tokens.push(USDC_ADDRESS);

    let tx;
    if (tokens.length === 1) {
      // Single token withdrawal
      tx = await contract.withdrawAll(tokens[0]);
    } else {
      // Multiple tokens
      tx = await contract.withdrawMultiple(tokens);
    }

    onStatus?.(`Transaction sent: ${tx.hash.slice(0, 10)}...`);
    onStatus?.('Waiting for confirmation...');

    // Wait for confirmation
    const receipt = await tx.wait(1);

    if (receipt.status === 1) {
      return {
        success: true,
        txHash: tx.hash,
        ethAmount: ethBalance > 0n ? ethAmount : undefined,
        usdcAmount: usdcBalance > 0n ? usdcAmount : undefined,
      };
    } else {
      return {
        success: false,
        error: 'Transaction reverted',
        txHash: tx.hash,
      };
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    // Simplify common errors
    if (errorMsg.includes('insufficient funds')) {
      return { success: false, error: 'Insufficient ETH for gas' };
    }
    if (errorMsg.includes('nonce')) {
      return { success: false, error: 'Nonce error - try again' };
    }
    return { success: false, error: errorMsg.slice(0, 100) };
  }
}
