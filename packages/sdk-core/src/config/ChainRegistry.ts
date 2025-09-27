import { ChainConfig, ChainId, NativeToken } from '../types/chain.types';
import { getBaseSepolia, getOpBNBTestnet } from './environment';

/**
 * Central registry for all supported blockchain configurations
 */
export class ChainRegistry {
  private static chains: Map<number, ChainConfig> | undefined;

  /**
   * Initialize the chains map lazily to ensure environment variables are loaded
   */
  private static initializeChains(): Map<number, ChainConfig> {
    if (this.chains) {
      return this.chains;
    }

    const baseSepolia = getBaseSepolia();
    const opBNB = getOpBNBTestnet();

    this.chains = new Map([
      // Base Sepolia Configuration (from .env.test)
      [
        ChainId.BASE_SEPOLIA,
        {
          chainId: baseSepolia.chainId,
          name: 'Base Sepolia',
          nativeToken: 'ETH' as NativeToken,
          rpcUrl: baseSepolia.rpcUrl,
          contracts: baseSepolia.contracts,
          minDeposit: '0.0002',
          blockExplorer: 'https://sepolia.basescan.org',
        },
      ],
      // opBNB Testnet Configuration (placeholder until deployment)
      [
        ChainId.OPBNB_TESTNET,
        {
          chainId: opBNB.chainId,
          name: 'opBNB Testnet',
          nativeToken: 'BNB' as NativeToken,
          rpcUrl: opBNB.rpcUrl,
          contracts: opBNB.contracts,
          minDeposit: '0.001', // Placeholder value for BNB
          blockExplorer: 'https://testnet.opbnbscan.com',
        },
      ],
    ]);

    return this.chains;
  }

  /**
   * Get chain configuration by ChainId enum
   * @throws Error if chain is not supported
   */
  public static getChain(chainId: ChainId): ChainConfig {
    const chains = this.initializeChains();
    const config = chains.get(chainId);
    if (!config) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }
    return config;
  }

  /**
   * Get chain configuration by numeric chain ID
   * @returns ChainConfig or undefined if not found
   */
  public static getChainConfig(chainId: number): ChainConfig | undefined {
    const chains = this.initializeChains();
    return chains.get(chainId);
  }

  /**
   * Check if a chain is supported
   */
  public static isChainSupported(chainId: number): boolean {
    const chains = this.initializeChains();
    return chains.has(chainId);
  }

  /**
   * Get list of all supported chain IDs
   */
  public static getSupportedChains(): number[] {
    const chains = this.initializeChains();
    return Array.from(chains.keys());
  }

  /**
   * Get all chain configurations
   */
  public static getAllChainConfigs(): ChainConfig[] {
    const chains = this.initializeChains();
    return Array.from(chains.values());
  }

  /**
   * Add or update a chain configuration (useful for testing)
   */
  public static setChain(chainId: number, config: ChainConfig): void {
    const chains = this.initializeChains();
    chains.set(chainId, config);
  }

  /**
   * Remove a chain configuration (useful for testing)
   */
  public static removeChain(chainId: number): void {
    const chains = this.initializeChains();
    chains.delete(chainId);
  }

  /**
   * Get the default chain (Base Sepolia)
   */
  public static getDefaultChain(): ChainConfig {
    return this.getChain(ChainId.BASE_SEPOLIA);
  }

  /**
   * Get chain by native token type
   */
  public static getChainsByNativeToken(token: NativeToken): ChainConfig[] {
    const chains = this.initializeChains();
    return Array.from(chains.values()).filter(
      config => config.nativeToken === token
    );
  }

  /**
   * Validate if an address looks valid (basic check)
   */
  public static isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Get chain name by ID
   */
  public static getChainName(chainId: number): string | undefined {
    const chains = this.initializeChains();
    return chains.get(chainId)?.name;
  }

  /**
   * Get RPC URL for a chain
   */
  public static getRpcUrl(chainId: number): string | undefined {
    const chains = this.initializeChains();
    return chains.get(chainId)?.rpcUrl;
  }

  /**
   * Get block explorer URL for a chain
   */
  public static getBlockExplorerUrl(chainId: number): string | undefined {
    const chains = this.initializeChains();
    return chains.get(chainId)?.blockExplorer;
  }

  /**
   * Format block explorer link for a transaction
   */
  public static getTxExplorerUrl(chainId: number, txHash: string): string | undefined {
    const baseUrl = this.getBlockExplorerUrl(chainId);
    if (!baseUrl) return undefined;
    return `${baseUrl}/tx/${txHash}`;
  }

  /**
   * Format block explorer link for an address
   */
  public static getAddressExplorerUrl(chainId: number, address: string): string | undefined {
    const baseUrl = this.getBlockExplorerUrl(chainId);
    if (!baseUrl) return undefined;
    return `${baseUrl}/address/${address}`;
  }

  /**
   * Get native token symbol for a chain
   */
  public static getNativeToken(chainId: number): NativeToken | undefined {
    const chains = this.initializeChains();
    return chains.get(chainId)?.nativeToken;
  }

  /**
   * Get minimum deposit for a chain
   */
  public static getMinDeposit(chainId: number): string | undefined {
    const chains = this.initializeChains();
    return chains.get(chainId)?.minDeposit;
  }

  /**
   * Get contract addresses for a chain
   */
  public static getContracts(chainId: number): ChainConfig['contracts'] | undefined {
    const chains = this.initializeChains();
    return chains.get(chainId)?.contracts;
  }
}