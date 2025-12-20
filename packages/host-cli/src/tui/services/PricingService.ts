// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Pricing Service
 * Handles querying and updating pricing via NodeRegistry contract
 */

import { ethers } from 'ethers';

// Contract addresses (Base Sepolia)
const NODE_REGISTRY_ADDRESS = '0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22';
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// Price precision: 1000 = $1 per million tokens
const PRICE_PRECISION = 1000;

// Minimal ABI for pricing operations
const NODE_REGISTRY_ABI = [
  'function getNodePricing(address operator, address token) view returns (uint256)',
  'function nodes(address) view returns (address operator, uint256 stakedAmount, bool active, string metadata, string apiUrl, uint256 minPricePerTokenNative, uint256 minPricePerTokenStable)',
  'function updatePricingStable(uint256 newMinPrice) external',
  'function updatePricingNative(uint256 newMinPrice) external',
  'function PRICE_PRECISION() view returns (uint256)',
];

export interface PricingData {
  nativePrice: string; // Price in wei per million tokens
  stablePrice: string; // Price in USDC units per million tokens (e.g., "5.00")
  nativePriceRaw: bigint;
  stablePriceRaw: bigint;
}

export interface UpdatePricingResult {
  success: boolean;
  txHash?: string;
  error?: string;
  newPrice?: string;
}

/**
 * Fetches current pricing for a host
 * @param hostAddress The host's address
 * @param rpcUrl RPC URL for the blockchain
 * @returns PricingData or null if fetch fails
 */
export async function fetchCurrentPricing(
  hostAddress: string,
  rpcUrl: string
): Promise<PricingData | null> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(NODE_REGISTRY_ADDRESS, NODE_REGISTRY_ABI, provider);

    // Get pricing from node info
    const nodeInfo = await contract.nodes(hostAddress);
    const nativePriceRaw = nodeInfo.minPricePerTokenNative;
    const stablePriceRaw = nodeInfo.minPricePerTokenStable;

    // Convert stable price to human-readable format
    // Price is stored as: $X per million tokens * PRICE_PRECISION
    // So $5/million = 5000 (5 * 1000)
    const stablePriceNum = Number(stablePriceRaw) / PRICE_PRECISION;

    return {
      nativePrice: ethers.formatEther(nativePriceRaw),
      stablePrice: stablePriceNum.toFixed(2),
      nativePriceRaw,
      stablePriceRaw,
    };
  } catch (err) {
    console.error('Failed to fetch pricing:', err);
    return null;
  }
}

/**
 * Updates the stable (USDC) pricing for the host
 * @param privateKey The host's private key for signing
 * @param rpcUrl RPC URL for the blockchain
 * @param newPriceUsd New price in USD per million tokens (e.g., 5.00)
 * @param onStatus Callback for status updates
 * @returns UpdatePricingResult
 */
export async function updateStablePricing(
  privateKey: string,
  rpcUrl: string,
  newPriceUsd: number,
  onStatus?: (status: string) => void
): Promise<UpdatePricingResult> {
  try {
    // Validate price range (0.001 to 100,000 per million tokens)
    if (newPriceUsd < 0.001 || newPriceUsd > 100000) {
      return {
        success: false,
        error: 'Price must be between $0.001 and $100,000 per million tokens',
      };
    }

    // Normalize private key
    const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(normalizedKey, provider);
    const contract = new ethers.Contract(NODE_REGISTRY_ADDRESS, NODE_REGISTRY_ABI, wallet);

    // Convert USD price to contract format: price * PRICE_PRECISION
    const priceInContract = Math.round(newPriceUsd * PRICE_PRECISION);

    onStatus?.(`Updating price to $${newPriceUsd.toFixed(2)}/million tokens...`);

    const tx = await contract.updatePricingStable(priceInContract);
    onStatus?.(`Transaction sent: ${tx.hash.slice(0, 10)}...`);
    onStatus?.('Waiting for confirmation...');

    const receipt = await tx.wait(1);

    if (receipt.status === 1) {
      return {
        success: true,
        txHash: tx.hash,
        newPrice: newPriceUsd.toFixed(2),
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

/**
 * Formats price for display
 * @param priceRaw Raw price from contract
 * @returns Formatted string like "$5.00/million"
 */
export function formatPrice(priceRaw: bigint): string {
  const priceNum = Number(priceRaw) / PRICE_PRECISION;
  return `$${priceNum.toFixed(2)}/million`;
}
