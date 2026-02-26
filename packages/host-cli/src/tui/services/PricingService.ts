// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Pricing Service
 * Phase 18: Handles querying and updating per-model per-token pricing via NodeRegistry contract
 */

import { ethers } from 'ethers';

// Use environment variables for contract addresses (CLAUDE.md: never hardcode)
function getNodeRegistryAddress(): string {
  const addr = process.env.CONTRACT_NODE_REGISTRY;
  if (!addr) throw new Error('CONTRACT_NODE_REGISTRY not set in environment');
  return addr;
}

function getUsdcAddress(): string {
  const addr = process.env.CONTRACT_USDC_TOKEN;
  if (!addr) throw new Error('CONTRACT_USDC_TOKEN not set in environment');
  return addr;
}

// Price precision: 1000 = $1 per million tokens
const PRICE_PRECISION = 1000;

// Phase 18: ABI for per-model per-token pricing operations
const NODE_REGISTRY_ABI = [
  'function getModelPricing(address operator, bytes32 modelId, address token) view returns (uint256)',
  'function setModelTokenPricing(bytes32 modelId, address token, uint256 price) external',
  'function getHostModelPrices(address operator, address token) view returns (bytes32[], uint256[])',
  'function nodes(address) view returns (address operator, uint256 stakedAmount, bool active, string metadata, string apiUrl, uint256 minPricePerTokenNative, uint256 minPricePerTokenStable)',
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
 * Fetches current pricing for a host (from node struct — registration prices)
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
    const contract = new ethers.Contract(getNodeRegistryAddress(), NODE_REGISTRY_ABI, provider);

    // Get pricing from node info (registration prices, not model-specific)
    const nodeInfo = await contract.nodes(hostAddress);
    const nativePriceRaw = nodeInfo.minPricePerTokenNative;
    const stablePriceRaw = nodeInfo.minPricePerTokenStable;

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
 * Phase 18: Updates the stable (USDC) pricing for a specific model
 * @param privateKey The host's private key for signing
 * @param rpcUrl RPC URL for the blockchain
 * @param modelId The model ID (bytes32 hash)
 * @param newPriceUsd New price in USD per million tokens (e.g., 5.00)
 * @param onStatus Callback for status updates
 * @returns UpdatePricingResult
 */
export async function updateStablePricing(
  privateKey: string,
  rpcUrl: string,
  modelId: string,
  newPriceUsd: number,
  onStatus?: (status: string) => void
): Promise<UpdatePricingResult> {
  try {
    if (newPriceUsd < 0.001 || newPriceUsd > 100000) {
      return {
        success: false,
        error: 'Price must be between $0.001 and $100,000 per million tokens',
      };
    }

    const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(normalizedKey, provider);
    const contract = new ethers.Contract(getNodeRegistryAddress(), NODE_REGISTRY_ABI, wallet);

    const priceInContract = Math.round(newPriceUsd * PRICE_PRECISION);
    const usdcAddress = getUsdcAddress();

    onStatus?.(`Setting model ${modelId.slice(0, 10)}... USDC price to $${newPriceUsd.toFixed(2)}/million tokens...`);

    const tx = await contract.setModelTokenPricing(modelId, usdcAddress, priceInContract);
    onStatus?.(`Transaction sent: ${tx.hash.slice(0, 10)}...`);
    onStatus?.('Waiting for confirmation...');

    const receipt = await tx.wait(3);

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
 * Phase 18: Updates the native (ETH) pricing for a specific model
 * @param privateKey The host's private key for signing
 * @param rpcUrl RPC URL for the blockchain
 * @param modelId The model ID (bytes32 hash)
 * @param newPriceGwei New price in Gwei per million tokens
 * @param onStatus Callback for status updates
 * @returns UpdatePricingResult
 */
export async function updateNativePricing(
  privateKey: string,
  rpcUrl: string,
  modelId: string,
  newPriceGwei: number,
  onStatus?: (status: string) => void
): Promise<UpdatePricingResult> {
  try {
    const MIN_NATIVE_RAW = 227273n;
    const priceInWei = BigInt(Math.round(newPriceGwei * 1e9));

    if (priceInWei < MIN_NATIVE_RAW) {
      return {
        success: false,
        error: `Price must be at least ${Number(MIN_NATIVE_RAW) / 1e9} Gwei/million tokens`,
      };
    }

    const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(normalizedKey, provider);
    const contract = new ethers.Contract(getNodeRegistryAddress(), NODE_REGISTRY_ABI, wallet);

    onStatus?.(`Setting model ${modelId.slice(0, 10)}... ETH price to ${newPriceGwei} Gwei/million tokens...`);

    const tx = await contract.setModelTokenPricing(modelId, ethers.ZeroAddress, priceInWei);
    onStatus?.(`Transaction sent: ${tx.hash.slice(0, 10)}...`);
    onStatus?.('Waiting for confirmation...');

    const receipt = await tx.wait(3);

    if (receipt.status === 1) {
      return {
        success: true,
        txHash: tx.hash,
        newPrice: newPriceGwei.toString(),
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
    if (errorMsg.includes('insufficient funds')) {
      return { success: false, error: 'Insufficient ETH for gas' };
    }
    if (errorMsg.includes('nonce')) {
      return { success: false, error: 'Nonce error - try again' };
    }
    if (errorMsg.includes('below minimum')) {
      return { success: false, error: 'Price below contract minimum (try higher value)' };
    }
    return { success: false, error: errorMsg.slice(0, 100) };
  }
}

/**
 * Formats stable price for display
 */
export function formatPrice(priceRaw: bigint): string {
  const priceNum = Number(priceRaw) / PRICE_PRECISION;
  return `$${priceNum.toFixed(2)}/million`;
}

/**
 * Formats native price for display
 */
export function formatNativePrice(priceRaw: bigint): string {
  const priceInGwei = Number(priceRaw) / 1e9;
  if (priceInGwei >= 1000000) {
    const priceInEth = Number(priceRaw) / 1e18;
    return `${priceInEth.toFixed(4)} ETH/M`;
  }
  return `${priceInGwei.toFixed(2)} Gwei/M`;
}
