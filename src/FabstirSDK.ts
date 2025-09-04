// src/FabstirSDK.ts
import { ethers } from 'ethers';
import { SDKConfig, AuthResult, SDKError } from './types';
import PaymentManager from './managers/PaymentManager';

export class FabstirSDK {
  public config: SDKConfig;
  public provider?: ethers.providers.JsonRpcProvider;
  public signer?: ethers.Signer;
  private authResult?: AuthResult;
  private paymentManager?: PaymentManager;
  
  constructor(config: SDKConfig = {}) {
    this.config = {
      rpcUrl: config.rpcUrl || process.env.RPC_URL_BASE_SEPOLIA || 
        'https://base-sepolia.g.alchemy.com/v2/demo',
      s5PortalUrl: config.s5PortalUrl || process.env.S5_PORTAL_URL || 
        'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p',
      contractAddresses: config.contractAddresses ? {
        ...config.contractAddresses,
        fabToken: config.contractAddresses.fabToken || process.env.CONTRACT_FAB_TOKEN ||
          '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
        usdcToken: config.contractAddresses.usdcToken || process.env.CONTRACT_USDC_TOKEN ||
          '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
      } : {
        jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE || 
          '0xD937c594682Fe74E6e3d06239719805C04BE804A',
        nodeRegistry: process.env.CONTRACT_NODE_REGISTRY || 
          '0x87516C13Ea2f99de598665e14cab64E191A0f8c4',
        fabToken: process.env.CONTRACT_FAB_TOKEN ||
          '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
        usdcToken: process.env.CONTRACT_USDC_TOKEN ||
          '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
      }
    };
  }
  
  private generateSeedFromSignature(signature: string): string {
    const hash = ethers.utils?.keccak256 ? 
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes(signature)) :
      '0x' + signature.slice(2, 66); // Mock fallback
    const entropy = hash.slice(2);
    const words = [];
    for (let i = 0; i < 12; i++) {
      const chunk = entropy.slice(i * 5, i * 5 + 5);
      const index = parseInt(chunk, 16) % 2048;
      words.push(`word${index}`);
    }
    return words.join(' ');
  }
  
  async authenticate(privateKey: string): Promise<AuthResult> {
    if (!privateKey || privateKey.length === 0) {
      const error: SDKError = new Error('Private key is required') as SDKError;
      error.code = 'AUTH_INVALID_KEY';
      throw error;
    }
    
    try {
      this.provider = new ethers.providers.JsonRpcProvider(
        this.config.rpcUrl, { chainId: 84532, name: 'base-sepolia' }
      );
      this.signer = new ethers.Wallet(privateKey, this.provider);
      const address = await this.signer.getAddress();
      const signature = await this.signer.signMessage("Generate S5 seed for Fabstir LLM");
      const s5Seed = this.generateSeedFromSignature(signature);
      
      this.authResult = {
        user: { address },
        signer: this.signer,
        s5Seed
      };
      
      return this.authResult;
    } catch (err: any) {
      const error: SDKError = new Error(`Authentication failed: ${err.message}`) as SDKError;
      error.code = 'AUTH_FAILED';
      error.details = err;
      throw error;
    }
  }
  
  // Manager methods - return stubs for now
  getSessionManager(): any {
    return {}; // TODO: Implement SessionManager in later phase
  }
  
  getPaymentManager(): PaymentManager {
    if (!this.signer) {
      const error: SDKError = new Error('Must authenticate before accessing PaymentManager') as SDKError;
      error.code = 'MANAGER_NOT_AUTHENTICATED';
      throw error;
    }
    
    if (!this.paymentManager) {
      // Load JobMarketplace ABI
      const jobMarketplaceABI = [
        'function createSessionJob(address,uint256,uint256,uint256,uint256) payable returns (uint256)',
        'function createSessionJobWithToken(address,address,uint256,uint256,uint256,uint256) returns (uint256)',
        'function completeSessionJob(uint256) returns (bool)'
      ];
      
      const jobMarketplace = new ethers.Contract(
        this.config.contractAddresses?.jobMarketplace || '',
        jobMarketplaceABI,
        this.signer
      );
      
      this.paymentManager = new PaymentManager(jobMarketplace, this.signer);
    }
    
    return this.paymentManager;
  }
  
  getStorageManager(): any {
    return {}; // TODO: Implement StorageManager in later phase
  }
}