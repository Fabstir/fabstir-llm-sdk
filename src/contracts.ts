// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

// src/contracts.ts
import { ethers } from 'ethers';

export interface ContractAddresses {
  jobMarketplace: string;
  paymentEscrow: string;
  nodeRegistry: string;
}

export class ContractManager {
  private provider?: ethers.providers.Provider;
  private signer?: ethers.Signer;
  public jobMarketplaceAddress?: string;
  private chainId?: number;
  
  constructor(private config: any) {}
  
  async initialize(provider: ethers.providers.Provider, signer?: ethers.Signer): Promise<void> {
    this.provider = provider;
    this.signer = signer;
    
    // Get and store chain ID
    const network = await provider.getNetwork();
    this.chainId = network.chainId;
    
    // Set addresses based on network
    const addresses = this.getAddressesForNetwork();
    this.jobMarketplaceAddress = addresses.jobMarketplace;
  }
  
  private getAddressesForNetwork(): ContractAddresses {
    // Base Sepolia (chainId: 84532)
    if (this.chainId === 84532) {
      return {
        jobMarketplace: '0x1234567890123456789012345678901234567891',
        paymentEscrow: '0x1234567890123456789012345678901234567892',
        nodeRegistry: '0x1234567890123456789012345678901234567893'
      };
    }
    
    // Base Mainnet (chainId: 8453)
    if (this.chainId === 8453) {
      return {
        jobMarketplace: '0x2345678901234567890123456789012345678901',
        paymentEscrow: '0x2345678901234567890123456789012345678902',
        nodeRegistry: '0x2345678901234567890123456789012345678903'
      };
    }
    
    // Default/Local addresses
    return {
      jobMarketplace: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      paymentEscrow: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
      nodeRegistry: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
    };
  }
  
  private createMockInterface(): ethers.utils.Interface {
    // Create a minimal mock ABI for testing
    const mockAbi = [
      'function postJob(string memory modelId, string memory prompt, uint256 offerPrice, uint32 maxTokens) payable returns (uint256)',
      'function postJobWithToken(string memory modelId, string memory prompt, uint256 offerPrice, uint32 maxTokens, address token, uint256 amount) returns (uint256)',
      'function getJobStatus(uint256 jobId) view returns (uint8)',
      'function version() view returns (string)'
    ];
    return new ethers.utils.Interface(mockAbi);
  }
  
  async getJobMarketplace() {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    
    const addresses = this.getAddressesForNetwork();
    return {
      address: addresses.jobMarketplace,
      interface: this.createMockInterface()
    };
  }
  
  async getPaymentEscrow() {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    
    const addresses = this.getAddressesForNetwork();
    return {
      address: addresses.paymentEscrow,
      interface: this.createMockInterface()
    };
  }
  
  async getNodeRegistry() {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    
    const addresses = this.getAddressesForNetwork();
    return {
      address: addresses.nodeRegistry,
      interface: this.createMockInterface()
    };
  }
  
  async getContractVersion(): Promise<string> {
    // TODO: Return contract version
    return '1.0.0';
  }
}
