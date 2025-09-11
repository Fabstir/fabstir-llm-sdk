/**
 * Browser-compatible contract manager for Fabstir SDK
 * Uses ethers.js v6 with browser providers
 */

import { ethers, Contract, ContractInterface, Signer } from 'ethers';
import JobMarketplaceABI from './abis/JobMarketplaceFABWithS5-CLIENT-ABI.json';
import NodeRegistryABI from './abis/NodeRegistryFAB-CLIENT-ABI.json';
import HostEarningsABI from './abis/HostEarnings-CLIENT-ABI.json';
import PaymentEscrowABI from './abis/PaymentEscrowWithEarnings-CLIENT-ABI.json';
import ProofSystemABI from './abis/ProofSystem-CLIENT-ABI.json';
import ERC20ABI from './abis/ERC20-ABI.json';
import BaseAccountFactoryABI from './abis/BaseAccountFactory-ABI.json';
import BaseSmartAccountABI from './abis/BaseSmartAccount-ABI.json';

export interface ContractAddresses {
  jobMarketplace: string;
  nodeRegistry: string;
  hostEarnings?: string;
  paymentEscrow?: string;
  proofSystem?: string;
  fabToken: string;
  usdcToken: string;
  baseAccountFactory?: string;
}

export class ContractManager {
  private provider: ethers.BrowserProvider | ethers.JsonRpcProvider;
  private signer?: Signer;
  private contracts: Map<string, Contract> = new Map();
  private addresses: ContractAddresses;

  constructor(
    provider: ethers.BrowserProvider | ethers.JsonRpcProvider,
    addresses: ContractAddresses
  ) {
    this.provider = provider;
    this.addresses = addresses;
  }

  /**
   * Set the signer for contract interactions
   */
  async setSigner(signer: Signer) {
    this.signer = signer;
    // Reinitialize contracts with signer
    this.contracts.clear();
  }

  /**
   * Get or create a contract instance
   */
  private getContract(name: string, address: string, abi: ContractInterface): Contract {
    const key = `${name}-${address}`;
    
    if (!this.contracts.has(key)) {
      const contract = new Contract(
        address,
        abi,
        this.signer || this.provider
      );
      this.contracts.set(key, contract);
    }
    
    return this.contracts.get(key)!;
  }

  /**
   * Get JobMarketplace contract
   */
  getJobMarketplace(): Contract {
    return this.getContract(
      'JobMarketplace',
      this.addresses.jobMarketplace,
      JobMarketplaceABI
    );
  }

  /**
   * Get NodeRegistry contract
   */
  getNodeRegistry(): Contract {
    return this.getContract(
      'NodeRegistry',
      this.addresses.nodeRegistry,
      NodeRegistryABI
    );
  }

  /**
   * Get FAB token contract
   */
  getFabToken(): Contract {
    return this.getContract(
      'FABToken',
      this.addresses.fabToken,
      ERC20ABI
    );
  }

  /**
   * Get USDC token contract
   */
  getUsdcToken(): Contract {
    return this.getContract(
      'USDCToken',
      this.addresses.usdcToken,
      ERC20ABI
    );
  }

  /**
   * Get HostEarnings contract
   */
  getHostEarnings(): Contract {
    if (!this.addresses.hostEarnings) {
      throw new Error('HostEarnings address not configured');
    }
    return this.getContract(
      'HostEarnings',
      this.addresses.hostEarnings,
      HostEarningsABI
    );
  }

  /**
   * Get ProofSystem contract
   */
  getProofSystem(): Contract {
    if (!this.addresses.proofSystem) {
      throw new Error('ProofSystem address not configured');
    }
    return this.getContract(
      'ProofSystem',
      this.addresses.proofSystem,
      ProofSystemABI
    );
  }

  /**
   * Get BaseAccountFactory contract
   */
  getBaseAccountFactory(): Contract {
    if (!this.addresses.baseAccountFactory) {
      throw new Error('BaseAccountFactory address not configured');
    }
    return this.getContract(
      'BaseAccountFactory',
      this.addresses.baseAccountFactory,
      BaseAccountFactoryABI
    );
  }

  /**
   * Estimate gas for a transaction (browser-compatible)
   */
  async estimateGas(
    contract: Contract,
    method: string,
    params: any[]
  ): Promise<bigint> {
    try {
      // Use BigInt for gas estimation
      const gasEstimate = await contract[method].estimateGas(...params);
      return gasEstimate;
    } catch (error) {
      console.error('Gas estimation failed:', error);
      // Return default gas limit as BigInt
      return 500000n;
    }
  }

  /**
   * Format value for transactions (ETH to Wei)
   */
  parseEther(value: string): bigint {
    return ethers.parseEther(value);
  }

  /**
   * Format value from Wei to ETH
   */
  formatEther(value: bigint): string {
    return ethers.formatEther(value);
  }

  /**
   * Parse units for token amounts
   */
  parseUnits(value: string, decimals: number = 18): bigint {
    return ethers.parseUnits(value, decimals);
  }

  /**
   * Format units from token amounts
   */
  formatUnits(value: bigint, decimals: number = 18): string {
    return ethers.formatUnits(value, decimals);
  }

  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  /**
   * Get network information
   */
  async getNetwork(): Promise<ethers.Network> {
    return await this.provider.getNetwork();
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForTransaction(
    txHash: string,
    confirmations: number = 1
  ): Promise<ethers.TransactionReceipt | null> {
    return await this.provider.waitForTransaction(txHash, confirmations);
  }

  /**
   * Get the provider
   */
  getProvider() {
    return this.provider;
  }

  /**
   * Get contract address by name
   */
  async getContractAddress(name: string): Promise<string> {
    switch (name) {
      case 'jobMarketplace':
        return this.addresses.jobMarketplace;
      case 'nodeRegistry':
        return this.addresses.nodeRegistry;
      case 'hostEarnings':
        if (!this.addresses.hostEarnings) {
          throw new Error('Host earnings contract address not configured');
        }
        return this.addresses.hostEarnings;
      case 'paymentEscrow':
        if (!this.addresses.paymentEscrow) {
          throw new Error('Payment escrow contract address not configured');
        }
        return this.addresses.paymentEscrow;
      case 'proofSystem':
        if (!this.addresses.proofSystem) {
          throw new Error('Proof system contract address not configured');
        }
        return this.addresses.proofSystem;
      case 'fabToken':
        return this.addresses.fabToken;
      case 'usdcToken':
        return this.addresses.usdcToken;
      case 'baseAccountFactory':
        if (!this.addresses.baseAccountFactory) {
          throw new Error('Base account factory address not configured');
        }
        return this.addresses.baseAccountFactory;
      default:
        throw new Error(`Unknown contract: ${name}`);
    }
  }

  /**
   * Get contract ABI by name
   */
  async getContractABI(name: string): Promise<ContractInterface> {
    switch (name) {
      case 'jobMarketplace':
        return JobMarketplaceABI as ContractInterface;
      case 'nodeRegistry':
        return NodeRegistryABI as ContractInterface;
      case 'hostEarnings':
        return HostEarningsABI as ContractInterface;
      case 'paymentEscrow':
        return PaymentEscrowABI as ContractInterface;
      case 'proofSystem':
        return ProofSystemABI as ContractInterface;
      case 'fabToken':
      case 'usdcToken':
        return ERC20ABI as ContractInterface;
      case 'baseAccountFactory':
        return BaseAccountFactoryABI as ContractInterface;
      default:
        throw new Error(`Unknown contract ABI: ${name}`);
    }
  }

  /**
   * Get ERC20 token contract
   */
  getERC20Contract(tokenAddress: string): Contract {
    if (!this.signer) {
      throw new Error('Signer not set');
    }
    return new Contract(tokenAddress, ERC20ABI, this.signer);
  }
}