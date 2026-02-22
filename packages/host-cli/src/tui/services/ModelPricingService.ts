// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Model Pricing Service
 * Handles querying and updating per-model pricing via NodeRegistry contract
 */

import { ethers } from 'ethers';

// Price precision: 1000 = $1 per million tokens
const PRICE_PRECISION = 1000;

// Minimal ABI for per-model pricing operations
const NODE_REGISTRY_ABI = [
  'function setModelPricing(bytes32 modelId, uint256 nativePrice, uint256 stablePrice) external',
  'function clearModelPricing(bytes32 modelId) external',
  'function getHostModelPrices(address host) external view returns (bytes32[], uint256[], uint256[])',
];

export interface ModelPricingInfo {
  modelId: string;
  nativePrice: bigint;
  stablePrice: bigint;
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

/**
 * Fetches per-model pricing for a host
 */
export async function fetchHostModelPrices(
  hostAddress: string,
  rpcUrl: string
): Promise<ModelPricingInfo[]> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(getNodeRegistryAddress(), NODE_REGISTRY_ABI, provider);

  const [modelIds, nativePrices, stablePrices] = await contract.getHostModelPrices(hostAddress);

  const results: ModelPricingInfo[] = [];
  for (let i = 0; i < modelIds.length; i++) {
    results.push({
      modelId: modelIds[i],
      nativePrice: nativePrices[i],
      stablePrice: stablePrices[i],
    });
  }
  return results;
}

/**
 * Updates USDC pricing for a specific model
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

    onStatus?.(`Setting model USDC price to $${priceUsd.toFixed(2)}/million tokens...`);

    const tx = await contract.setModelPricing(modelId, 0n, stablePrice);
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
 * Updates ETH pricing for a specific model
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

    const tx = await contract.setModelPricing(modelId, priceInWei, 0n);
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
 * Clears custom pricing for a model (reverts to host default)
 */
export async function clearModelPricingOnChain(
  privateKey: string,
  rpcUrl: string,
  modelId: string,
  onStatus?: (status: string) => void
): Promise<UpdateModelPricingResult> {
  try {
    const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(normalizedKey, provider);
    const contract = new ethers.Contract(getNodeRegistryAddress(), NODE_REGISTRY_ABI, wallet);

    onStatus?.('Clearing model pricing override...');

    const tx = await contract.clearModelPricing(modelId);
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
