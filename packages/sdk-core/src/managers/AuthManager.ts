// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Browser-compatible Authentication Manager
 * Uses Web Crypto API and browser wallets
 */

import { ethers } from 'ethers';
import { connectMetaMask, connectCoinbaseWallet, isMetaMaskInstalled } from '../utils/BrowserProvider';

export interface AuthResult {
  signer: ethers.Signer;
  userAddress: string;
  eoaAddress?: string;
  s5Seed: string;
  network?: { chainId: number; name: string };
  isSmartWallet?: boolean;
}

export interface AuthOptions {
  privateKey?: string;
  rpcUrl?: string;
  useSmartWallet?: boolean;
  sponsorDeployment?: boolean;
  paymasterUrl?: string;
}

export class AuthManager {
  static readonly SEED_MESSAGE = 'Generate S5 seed for Fabstir LLM';
  static readonly BASE_SEPOLIA_CHAIN_ID = 84532;
  
  private signer?: ethers.Signer;
  private provider?: ethers.BrowserProvider | ethers.JsonRpcProvider;
  private s5Seed?: string;
  private userAddress?: string;
  private eoaAddress?: string;
  private isSmartWallet: boolean = false;

  constructor(
    signer?: ethers.Signer,
    provider?: ethers.BrowserProvider | ethers.JsonRpcProvider,
    userAddress?: string,
    s5Seed?: string
  ) {
    if (signer) this.signer = signer;
    if (provider) this.provider = provider;
    if (userAddress) {
      this.userAddress = userAddress;
      this.eoaAddress = userAddress;
    }
    if (s5Seed) this.s5Seed = s5Seed;
  }

  /**
   * Authenticate with various providers
   */
  async authenticate(
    provider: 'metamask' | 'coinbase' | 'private-key',
    options?: AuthOptions
  ): Promise<AuthResult> {
    switch (provider) {
      case 'metamask':
        return this.authenticateWithMetaMask();
      case 'coinbase':
        return this.authenticateWithCoinbase();
      case 'private-key':
        return this.authenticateWithPrivateKey(options);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Connect to MetaMask
   */
  private async authenticateWithMetaMask(): Promise<AuthResult> {
    if (!isMetaMaskInstalled()) {
      throw new Error('MetaMask is not installed');
    }

    const { provider, signer, address, chainId } = await connectMetaMask();
    
    this.provider = provider;
    this.signer = signer;
    this.userAddress = address;
    this.eoaAddress = address;
    
    // Generate S5 seed using browser-compatible method
    this.s5Seed = await this.generateS5SeedBrowser(signer);
    
    return {
      signer: this.signer,
      userAddress: this.userAddress,
      s5Seed: this.s5Seed,
      network: { chainId, name: this.getNetworkName(chainId) },
      isSmartWallet: false
    };
  }

  /**
   * Connect to Coinbase Wallet
   */
  private async authenticateWithCoinbase(): Promise<AuthResult> {
    const { provider, signer, address, chainId } = await connectCoinbaseWallet();
    
    this.provider = provider;
    this.signer = signer;
    this.userAddress = address;
    this.eoaAddress = address;
    
    this.s5Seed = await this.generateS5SeedBrowser(signer);
    
    return {
      signer: this.signer,
      userAddress: this.userAddress,
      s5Seed: this.s5Seed,
      network: { chainId, name: this.getNetworkName(chainId) },
      isSmartWallet: false
    };
  }

/**
   * Authenticate with private key (for testing/development)
   * SECURITY WARNING: Never use private keys in production browser apps!
   */
  private async authenticateWithPrivateKey(options?: AuthOptions): Promise<AuthResult> {
    if (!options?.privateKey) {
      throw new Error('Private key required');
    }
    if (!options?.rpcUrl) {
      throw new Error('RPC URL required');
    }

    // Create JSON-RPC provider
    this.provider = new ethers.JsonRpcProvider(options.rpcUrl);
    
    // Create wallet from private key
    const wallet = new ethers.Wallet(options.privateKey, this.provider);
    
    this.signer = wallet;
    this.userAddress = await wallet.getAddress();
    this.eoaAddress = this.userAddress;
    
    // Generate S5 seed
    this.s5Seed = await this.generateS5SeedBrowser(wallet);
    
    const network = await this.provider.getNetwork();
    
    return {
      signer: this.signer,
      userAddress: this.userAddress,
      s5Seed: this.s5Seed,
      network: { 
        chainId: Number(network.chainId), 
        name: network.name 
      },
      isSmartWallet: false
    };
  }

  /**
   * Generate S5 seed using Web Crypto API (browser-compatible)
   */
  private async generateS5SeedBrowser(signer: ethers.Signer): Promise<string> {
    // Sign message to generate deterministic seed
    const signature = await signer.signMessage(AuthManager.SEED_MESSAGE);
    
    // Use Web Crypto API to derive seed
    const encoder = new TextEncoder();
    const data = encoder.encode(signature);
    
    // Hash the signature using SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Take first 32 bytes (64 hex chars) as seed
    return hashHex.slice(0, 64);
  }

  /**
   * Generate random seed using Web Crypto API
   */
  async generateRandomSeed(): Promise<string> {
    // Generate 32 random bytes
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    
    // Convert to hex string
    return Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Initialize S5 client with browser-compatible seed
   */
  async initializeS5(): Promise<any> {
    if (!this.s5Seed) {
      throw new Error('Not authenticated - S5 seed not available');
    }

    // Dynamically import S5 when needed
    const { S5 } = await import('@julesl23/s5js');

    // S5.js is already browser-compatible
    const s5 = new S5();

    // Initialize with seed (S5.js handles the rest)
    // Note: S5.js initialization might vary - check their docs
    await s5.init(this.s5Seed);

    return s5;
  }

  /**
   * Get network name from chain ID
   */
  private getNetworkName(chainId: number): string {
    const networks: { [key: number]: string } = {
      1: 'mainnet',
      5: 'goerli',
      11155111: 'sepolia',
      8453: 'base',
      84531: 'base-goerli',
      84532: 'base-sepolia',
      137: 'polygon',
      80001: 'mumbai',
      42161: 'arbitrum',
      421613: 'arbitrum-goerli',
      10: 'optimism',
      420: 'optimism-goerli'
    };
    
    return networks[chainId] || `chain-${chainId}`;
  }

  /**
   * Get current signer
   */
  getSigner(): ethers.Signer {
    if (!this.signer) {
      throw new Error('Not authenticated');
    }
    return this.signer;
  }

  /**
   * Get S5 seed
   */
  getS5Seed(): string {
    if (!this.s5Seed) {
      throw new Error('Not authenticated');
    }
    return this.s5Seed;
  }

  /**
   * Get user address
   */
  getUserAddress(): string {
    if (!this.userAddress) {
      throw new Error('Not authenticated');
    }
    return this.userAddress;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return !!this.signer;
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.signer = undefined;
    this.provider = undefined;
    this.s5Seed = undefined;
    this.userAddress = undefined;
    this.eoaAddress = undefined;
    this.isSmartWallet = false;
  }

  /**
   * Listen for account changes
   */
  onAccountsChanged(callback: (accounts: string[]) => void): () => void {
    if (typeof window === 'undefined' || !window.ethereum) {
      return () => {};
    }

    const handler = (accounts: string[]) => {
      if (accounts.length === 0) {
        this.disconnect();
      }
      callback(accounts);
    };

    window.ethereum.on('accountsChanged', handler);
    
    return () => {
      window.ethereum.removeListener('accountsChanged', handler);
    };
  }

  /**
   * Listen for chain changes
   */
  onChainChanged(callback: (chainId: string) => void): () => void {
    if (typeof window === 'undefined' || !window.ethereum) {
      return () => {};
    }

    window.ethereum.on('chainChanged', callback);
    
    return () => {
      window.ethereum.removeListener('chainChanged', callback);
    };
  }
}