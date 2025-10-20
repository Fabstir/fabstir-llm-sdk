// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
export const HOST_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7';
export const TREASURY_ADDRESS = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

export async function fetchUSDCBalance(address: string): Promise<bigint> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No provider found");
  }

  const ethereum = window.ethereum; // ✅ now guaranteed not undefined

  const data = '0x70a08231' + address.slice(2).padStart(64, '0');
  const result = await ethereum.request?.({
    method: 'eth_call',
    params: [{ to: USDC_ADDRESS, data }, 'latest'],
  });

  return BigInt(result as string);
}

export async function fetchAllBalances(smartAccount: string) {
  const [smartBalance, hostBalance, treasuryBalance] = await Promise.all([
    fetchUSDCBalance(smartAccount),
    fetchUSDCBalance(HOST_ADDRESS),
    fetchUSDCBalance(TREASURY_ADDRESS)
  ]);
  
  return {
    smartBalance,
    hostBalance,
    treasuryBalance
  };
}
