// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Model Pricing Service
 * Phase 18: Per-model per-token pricing via NodeRegistry contract
 */

import { ethers } from 'ethers';

// Price precision: 1000 = $1 per million tokens
const PRICE_PRECISION = 1000;

// Phase 18: ABI for per-model per-token pricing operations
const NODE_REGISTRY_ABI = [
  'function setModelTokenPricing(bytes32 modelId, address token, uint256 price) external',
  'function clearModelTokenPricing(bytes32 modelId, address token) external',
  'function getHostModelPrices(address operator, address token) external view returns (bytes32[], uint256[])',
];

export interface ModelPricingInfo {
  modelId: string;
  price: bigint;
}

export interface UpdateModelPricingResult {
  success: boolean;
  txHash?: string;
  error?: string;
  newPrice?: string;
}

function getNodeRegistryAddress(): string {
  const address = process.env.CONTRACT_NODE_REGISTRY;
  if (!address) {
    throw new Error('CONTRACT_NODE_REGISTRY environment variable is not set');
  }
  return address;
}

function getUsdcAddress(): string {
  const address = process.env.CONTRACT_USDC_TOKEN;
  if (!address) {
    throw new Error('CONTRACT_USDC_TOKEN environment variable is not set');
  }
  return address;
}

/**
 * Phase 18: Fetches per-model pricing for a host for a specific token
 */
export async function fetchHostModelPrices(
  hostAddress: string,
  rpcUrl: string,
  tokenAddress: string
): Promise<ModelPricingInfo[]> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(getNodeRegistryAddress(), NODE_REGISTRY_ABI, provider);

  // Phase 18: 2 arrays (modelIds, prices) instead of 3
  const [modelIds, prices] = await contract.getHostModelPrices(hostAddress, tokenAddress);

  const results: ModelPricingInfo[] = [];
  for (let i = 0; i < modelIds.length; i++) {
    const price = BigInt(prices[i] || 0n);
    // Filter out price=0 (not configured)
    if (price === 0n) continue;
    results.push({
      modelId: modelIds[i],
      price,
    });
  }
  return results;
}

/**
 * Phase 18: Updates USDC pricing for a specific model
 */
export async function updateModelStablePricing(
  privateKey: string,
  rpcUrl: string,
  modelId: string,
  priceUsd: number,
  onStatus?: (status: string) => void
): Promise<UpdateModelPricingResult> {
  try {
    if (priceUsd < 0.001 || priceUsd > 100000) {
      return { success: false, error: 'Price must be between $0.001 and $100,000 per million tokens' };
    }

    const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(normalizedKey, provider);
    const contract = new ethers.Contract(getNodeRegistryAddress(), NODE_REGISTRY_ABI, wallet);

    const stablePrice = BigInt(Math.round(priceUsd * PRICE_PRECISION));
    const usdcAddress = getUsdcAddress();

    onStatus?.(`Setting model USDC price to $${priceUsd.toFixed(2)}/million tokens...`);

    const tx = await contract.setModelTokenPricing(modelId, usdcAddress, stablePrice);
    onStatus?.(`Transaction sent: ${tx.hash.slice(0, 10)}...`);
    onStatus?.('Waiting for confirmation...');

    const receipt = await tx.wait(3);

    if (receipt.status === 1) {
      return { success: true, txHash: tx.hash, newPrice: priceUsd.toFixed(2) };
    }
    return { success: false, error: 'Transaction reverted', txHash: tx.hash };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    if (errorMsg.includes('insufficient funds')) return { success: false, error: 'Insufficient ETH for gas' };
    if (errorMsg.includes('nonce')) return { success: false, error: 'Nonce error - try again' };
    return { success: false, error: errorMsg.slice(0, 100) };
  }
}

/**
 * Phase 18: Updates ETH pricing for a specific model
 */
export async function updateModelNativePricing(
  privateKey: string,
  rpcUrl: string,
  modelId: string,
  priceGwei: number,
  onStatus?: (status: string) => void
): Promise<UpdateModelPricingResult> {
  try {
    const MIN_NATIVE_RAW = 227273n;
    const priceInWei = BigInt(Math.round(priceGwei * 1e9));

    if (priceInWei < MIN_NATIVE_RAW) {
      return { success: false, error: `Price must be at least ${Number(MIN_NATIVE_RAW) / 1e9} Gwei/million tokens` };
    }

    const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(normalizedKey, provider);
    const contract = new ethers.Contract(getNodeRegistryAddress(), NODE_REGISTRY_ABI, wallet);

    onStatus?.(`Setting model ETH price to ${priceGwei} Gwei/million tokens...`);

    const tx = await contract.setModelTokenPricing(modelId, ethers.ZeroAddress, priceInWei);
    onStatus?.(`Transaction sent: ${tx.hash.slice(0, 10)}...`);
    onStatus?.('Waiting for confirmation...');

    const receipt = await tx.wait(3);

    if (receipt.status === 1) {
      return { success: true, txHash: tx.hash, newPrice: priceGwei.toString() };
    }
    return { success: false, error: 'Transaction reverted', txHash: tx.hash };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    if (errorMsg.includes('insufficient funds')) return { success: false, error: 'Insufficient ETH for gas' };
    if (errorMsg.includes('nonce')) return { success: false, error: 'Nonce error - try again' };
    return { success: false, error: errorMsg.slice(0, 100) };
  }
}

/**
 * Phase 18: Clears pricing for a model + token pair
 * Must be called per-token (native and USDC separately)
 */
export async function clearModelPricingOnChain(
  privateKey: string,
  rpcUrl: string,
  modelId: string,
  tokenAddress: string,
  onStatus?: (status: string) => void
): Promise<UpdateModelPricingResult> {
  try {
    const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(normalizedKey, provider);
    const contract = new ethers.Contract(getNodeRegistryAddress(), NODE_REGISTRY_ABI, wallet);

    onStatus?.('Clearing model pricing...');

    const tx = await contract.clearModelTokenPricing(modelId, tokenAddress);
    onStatus?.(`Transaction sent: ${tx.hash.slice(0, 10)}...`);
    onStatus?.('Waiting for confirmation...');

    const receipt = await tx.wait(3);

    if (receipt.status === 1) {
      return { success: true, txHash: tx.hash };
    }
    return { success: false, error: 'Transaction reverted', txHash: tx.hash };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    if (errorMsg.includes('insufficient funds')) return { success: false, error: 'Insufficient ETH for gas' };
    if (errorMsg.includes('nonce')) return { success: false, error: 'Nonce error - try again' };
    return { success: false, error: errorMsg.slice(0, 100) };
  }
}
