// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Earnings Client
 * Fetches host earnings from the HostEarnings contract on-chain
 */

import { ethers } from 'ethers';
import { EarningsData } from '../types.js';

// Contract addresses (Base Sepolia)
const HOST_EARNINGS_ADDRESS = '0xE4F33e9e132E60fc3477509f99b9E1340b91Aee0';
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// Minimal ABI for read-only queries
const HOST_EARNINGS_ABI = [
  'function getBalance(address host, address token) view returns (uint256)',
  'function getBalances(address host, address[] tokens) view returns (uint256[])',
];

/**
 * Fetches host earnings from the HostEarnings contract
 * @param hostAddress The host's wallet address
 * @param rpcUrl RPC URL for the blockchain
 * @returns EarningsData or null on error
 */
export async function fetchEarnings(
  hostAddress: string,
  rpcUrl: string
): Promise<EarningsData | null> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(HOST_EARNINGS_ADDRESS, HOST_EARNINGS_ABI, provider);

    // Query both ETH and USDC balances in one call
    const balances = await contract.getBalances(hostAddress, [ethers.ZeroAddress, USDC_ADDRESS]);

    const ethBalance = balances[0];
    const usdcBalance = balances[1];

    return {
      eth: ethers.formatEther(ethBalance),
      usdc: ethers.formatUnits(usdcBalance, 6),
    };
  } catch {
    return null;
  }
}

/**
 * Derives the wallet address from a private key
 * @param privateKey The private key (with or without 0x prefix)
 * @returns The wallet address
 */
export function deriveAddressFromPrivateKey(privateKey: string): string {
  // Ensure private key has 0x prefix
  const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  const wallet = new ethers.Wallet(normalizedKey);
  return wallet.address;
}
