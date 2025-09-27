import { ChainConfig, ChainId, NativeToken } from '../types/chain.types';

/**
 * Central registry for all supported blockchain configurations
 */
export class ChainRegistry {
  private static readonly chains: Map<number, ChainConfig> = new Map([
    // Base Sepolia Configuration
    [
      ChainId.BASE_SEPOLIA,
      {
        chainId: 84532,
        name: 'Base Sepolia',
        nativeToken: 'ETH' as NativeToken,
        rpcUrl: 'https://sepolia.base.org',
        contracts: {
          jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
        },
        minDeposit: '0.0002',
        blockExplorer: 'https://sepolia.basescan.org',
      },
    ],
    // opBNB Testnet Configuration
    [
      ChainId.OPBNB_TESTNET,
      {
        chainId: 5611,
        name: 'opBNB Testnet',
        nativeToken: 'BNB' as NativeToken,
        rpcUrl: 'https://opbnb-testnet-rpc.bnbchain.org',
        contracts: {
          // To be deployed - using empty addresses for now
          jobMarketplace: '',
          nodeRegistry: '',
          proofSystem: '',
          hostEarnings: '',
          modelRegistry: '',
          usdcToken: '',
          fabToken: '',
        },
        minDeposit: '0.001', // Placeholder value for BNB
        blockExplorer: 'https://testnet.opbnbscan.com',
      },
    ],
  ]);

  /**
   * Get chain configuration by ChainId enum
   * @throws Error if chain is not supported
   */
  public static getChain(chainId: ChainId): ChainConfig {
    const config = this.chains.get(chainId);
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
    return this.chains.get(chainId);
  }

  /**
   * Check if a chain is supported
   */
  public static isChainSupported(chainId: number): boolean {
    return this.chains.has(chainId);
  }

  /**
   * Get list of all supported chain IDs
   */
  public static getSupportedChains(): number[] {
    return Array.from(this.chains.keys());
  }

  /**
   * Get all chain configurations
   */
  public static getAllChainConfigs(): ChainConfig[] {
    return Array.from(this.chains.values());
  }

  /**
   * Add or update a chain configuration (useful for testing)
   */
  public static setChain(chainId: number, config: ChainConfig): void {
    this.chains.set(chainId, config);
  }

  /**
   * Remove a chain configuration (useful for testing)
   */
  public static removeChain(chainId: number): void {
    this.chains.delete(chainId);
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
    return Array.from(this.chains.values()).filter(
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
    return this.chains.get(chainId)?.name;
  }

  /**
   * Get RPC URL for a chain
   */
  public static getRpcUrl(chainId: number): string | undefined {
    return this.chains.get(chainId)?.rpcUrl;
  }

  /**
   * Get block explorer URL for a chain
   */
  public static getBlockExplorerUrl(chainId: number): string | undefined {
    return this.chains.get(chainId)?.blockExplorer;
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
    return this.chains.get(chainId)?.nativeToken;
  }

  /**
   * Get minimum deposit for a chain
   */
  public static getMinDeposit(chainId: number): string | undefined {
    return this.chains.get(chainId)?.minDeposit;
  }

  /**
   * Get contract addresses for a chain
   */
  public static getContracts(chainId: number): ChainConfig['contracts'] | undefined {
    return this.chains.get(chainId)?.contracts;
  }
}