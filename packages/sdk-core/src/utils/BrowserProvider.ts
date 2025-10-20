// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Browser provider utilities for Web3 wallet connections
 */

import { ethers } from 'ethers';

export interface WalletInfo {
  address: string;
  chainId: number;
  provider: ethers.BrowserProvider;
  signer: ethers.Signer;
}

/**
 * Check if MetaMask is installed
 */
export function isMetaMaskInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as any).ethereum !== 'undefined';
}

/**
 * Connect to MetaMask wallet
 */
export async function connectMetaMask(): Promise<WalletInfo> {
  if (!isMetaMaskInstalled()) {
    throw new Error('MetaMask is not installed');
  }

  const ethereum = (window as any).ethereum;
  
  // Request account access
  const accounts = await ethereum.request({ 
    method: 'eth_requestAccounts' 
  });
  
  if (accounts.length === 0) {
    throw new Error('No accounts found');
  }

  // Create browser provider
  const provider = new ethers.BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const network = await provider.getNetwork();

  return {
    address,
    chainId: Number(network.chainId),
    provider,
    signer
  };
}

/**
 * Connect to Coinbase Wallet
 */
export async function connectCoinbaseWallet(): Promise<WalletInfo> {
  if (typeof window === 'undefined') {
    throw new Error('Coinbase Wallet requires browser environment');
  }

  const ethereum = (window as any).ethereum;
  
  if (!ethereum || !ethereum.isCoinbaseWallet) {
    throw new Error('Coinbase Wallet is not installed');
  }

  const accounts = await ethereum.request({ 
    method: 'eth_requestAccounts' 
  });
  
  if (accounts.length === 0) {
    throw new Error('No accounts found');
  }

  const provider = new ethers.BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const network = await provider.getNetwork();

  return {
    address,
    chainId: Number(network.chainId),
    provider,
    signer
  };
}

/**
 * Create a read-only provider for a given RPC URL
 */
export function createReadOnlyProvider(rpcUrl: string): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Switch to a specific chain
 */
export async function switchChain(chainId: number): Promise<void> {
  if (!isMetaMaskInstalled()) {
    throw new Error('Wallet not connected');
  }

  const ethereum = (window as any).ethereum;
  const chainIdHex = `0x${chainId.toString(16)}`;

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }]
    });
  } catch (error: any) {
    // Chain not added to wallet
    if (error.code === 4902) {
      throw new Error(
        `Chain ${chainId} is not added to wallet. Please add it manually.`
      );
    }
    throw error;
  }
}

/**
 * Get current connected accounts
 */
export async function getConnectedAccounts(): Promise<string[]> {
  if (!isMetaMaskInstalled()) {
    return [];
  }

  const ethereum = (window as any).ethereum;
  const accounts = await ethereum.request({ 
    method: 'eth_accounts' 
  });
  
  return accounts;
}

/**
 * Listen for account changes
 */
export function onAccountsChanged(callback: (accounts: string[]) => void): () => void {
  if (!isMetaMaskInstalled()) {
    return () => {};
  }

  const ethereum = (window as any).ethereum;
  ethereum.on('accountsChanged', callback);
  
  // Return cleanup function
  return () => {
    ethereum.removeListener('accountsChanged', callback);
  };
}

/**
 * Listen for chain changes
 */
export function onChainChanged(callback: (chainId: string) => void): () => void {
  if (!isMetaMaskInstalled()) {
    return () => {};
  }

  const ethereum = (window as any).ethereum;
  ethereum.on('chainChanged', callback);
  
  // Return cleanup function
  return () => {
    ethereum.removeListener('chainChanged', callback);
  };
}

/**
 * Sign a message with the connected wallet
 */
export async function signMessage(
  signer: ethers.Signer,
  message: string
): Promise<string> {
  return await signer.signMessage(message);
}

/**
 * Verify a signed message
 */
export function verifyMessage(
  message: string,
  signature: string
): string {
  return ethers.verifyMessage(message, signature);
}