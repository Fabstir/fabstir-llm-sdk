import { ethers } from 'ethers';
import 'fake-indexeddb/auto'; // Required for S5.js in Node.js
import { S5 } from '@s5-dev/s5js';
import SmartWalletManager from './SmartWalletManager';

export interface AuthResult {
  signer: ethers.Signer;
  userAddress: string;
  eoaAddress?: string; // EOA address when using smart wallet
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

export default class AuthManager {
  static readonly SEED_MESSAGE = 'Generate S5 seed for Fabstir LLM';
  static readonly BASE_SEPOLIA_CHAIN_ID = 84532;
  
  private signer?: ethers.Signer;
  private eoaSigner?: ethers.Signer; // Keep EOA signer for S5
  private smartWalletSigner?: ethers.Signer;
  private provider?: ethers.providers.Provider;
  private s5Seed?: string;
  private userAddress?: string;
  private eoaAddress?: string;
  private smartWalletManager?: SmartWalletManager;
  private isSmartWallet: boolean = false;

  constructor() {}

  async authenticate(
    provider: 'base' | 'metamask' | 'private-key',
    options?: AuthOptions
  ): Promise<AuthResult> {
    switch (provider) {
      case 'private-key':
        return this.authenticateWithPrivateKey(options);
      case 'base':
        return this.authenticateWithBase(options);
      case 'metamask':
        return this.authenticateWithMetaMask();
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  getSigner(): ethers.Signer {
    if (!this.signer) throw new Error('Not authenticated');
    return this.signer;
  }

  getS5Seed(): string {
    if (!this.s5Seed) throw new Error('Not authenticated');
    return this.s5Seed;
  }

  getUserAddress(): string {
    if (!this.userAddress) throw new Error('Not authenticated');
    return this.userAddress;
  }

  isAuthenticated(): boolean {
    return !!this.signer;
  }

  private async authenticateWithPrivateKey(options?: AuthOptions): Promise<AuthResult> {
    if (!options?.privateKey) throw new Error('Private key required');
    if (!options?.rpcUrl) throw new Error('RPC URL required');

    this.provider = new ethers.providers.JsonRpcProvider(
      options.rpcUrl,
      { chainId: AuthManager.BASE_SEPOLIA_CHAIN_ID, name: 'base-sepolia' }
    );
    
    // Always create EOA signer first
    const eoaWallet = new ethers.Wallet(options.privateKey, this.provider);
    this.eoaSigner = eoaWallet;
    this.eoaAddress = await eoaWallet.getAddress();
    
    // ALWAYS generate S5 seed from EOA, even when using smart wallet
    this.s5Seed = await this.generateS5Seed(eoaWallet);
    
    if (options.useSmartWallet) {
      // Initialize smart wallet
      this.smartWalletManager = new SmartWalletManager(options.paymasterUrl);
      const walletInfo = await this.smartWalletManager.initialize(eoaWallet, {
        paymasterUrl: options.paymasterUrl,
        sponsorDeployment: options.sponsorDeployment
      });
      
      // Use smart wallet for transactions
      this.smartWalletSigner = this.smartWalletManager.getSmartWalletSigner();
      this.signer = this.smartWalletSigner;
      this.userAddress = walletInfo.smartWalletAddress;
      this.isSmartWallet = true;
      
      return {
        signer: this.signer,
        userAddress: this.userAddress,
        eoaAddress: this.eoaAddress,
        s5Seed: this.s5Seed,
        network: { chainId: AuthManager.BASE_SEPOLIA_CHAIN_ID, name: 'base-sepolia' },
        isSmartWallet: true
      };
    } else {
      // Normal EOA flow
      this.signer = eoaWallet;
      this.userAddress = this.eoaAddress;
      this.isSmartWallet = false;
      
      return {
        signer: this.signer,
        userAddress: this.userAddress,
        s5Seed: this.s5Seed,
        network: { chainId: AuthManager.BASE_SEPOLIA_CHAIN_ID, name: 'base-sepolia' },
        isSmartWallet: false
      };
    }
  }

  private async authenticateWithBase(options?: AuthOptions): Promise<AuthResult> {
    if (!options?.rpcUrl) throw new Error('RPC URL required');

    this.provider = new ethers.providers.JsonRpcProvider(
      options.rpcUrl,
      { chainId: AuthManager.BASE_SEPOLIA_CHAIN_ID, name: 'base-sepolia' }
    );

    // For base provider, this would connect to Base Account Kit
    // For testing, we use a provided private key or generate random
    const wallet = options?.privateKey 
      ? new ethers.Wallet(options.privateKey, this.provider)
      : ethers.Wallet.createRandom().connect(this.provider);
    
    this.eoaSigner = wallet;
    this.eoaAddress = await wallet.getAddress();
    
    // Always generate S5 seed from EOA
    this.s5Seed = await this.generateS5Seed(wallet);
    
    // Base provider defaults to smart wallet
    if (options?.useSmartWallet !== false) {
      this.smartWalletManager = new SmartWalletManager(options?.paymasterUrl);
      const walletInfo = await this.smartWalletManager.initialize(wallet, {
        paymasterUrl: options?.paymasterUrl,
        sponsorDeployment: options?.sponsorDeployment ?? true // Default true for Base
      });
      
      this.smartWalletSigner = this.smartWalletManager.getSmartWalletSigner();
      this.signer = this.smartWalletSigner;
      this.userAddress = walletInfo.smartWalletAddress;
      this.isSmartWallet = true;
      
      return {
        signer: this.signer,
        userAddress: this.userAddress,
        eoaAddress: this.eoaAddress,
        s5Seed: this.s5Seed,
        network: { chainId: AuthManager.BASE_SEPOLIA_CHAIN_ID, name: 'base-sepolia' },
        isSmartWallet: true
      };
    } else {
      this.signer = wallet;
      this.userAddress = this.eoaAddress;
      this.isSmartWallet = false;
      
      return {
        signer: this.signer,
        userAddress: this.userAddress,
        s5Seed: this.s5Seed,
        network: { chainId: AuthManager.BASE_SEPOLIA_CHAIN_ID, name: 'base-sepolia' },
        isSmartWallet: false
      };
    }
  }

  private async authenticateWithMetaMask(): Promise<AuthResult> {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('MetaMask not available');
    }

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    
    this.provider = provider;
    this.signer = provider.getSigner();
    this.userAddress = await this.signer.getAddress();
    this.s5Seed = await this.generateS5Seed(this.signer);

    const network = await provider.getNetwork();
    
    return {
      signer: this.signer,
      userAddress: this.userAddress,
      s5Seed: this.s5Seed,
      network: { chainId: network.chainId, name: network.name }
    };
  }

  /**
   * Get EOA signer for S5 operations
   * This ensures S5 always uses the original EOA, not smart wallet
   */
  getEOASigner(): ethers.Signer {
    return this.eoaSigner || this.signer!;
  }
  
  /**
   * Get EOA address (for S5 paths and seed generation)
   */
  getEOAAddress(): string {
    return this.eoaAddress || this.userAddress!;
  }
  
  /**
   * Get smart wallet manager if using smart wallet
   */
  getSmartWalletManager(): SmartWalletManager | undefined {
    return this.smartWalletManager;
  }
  
  /**
   * Check if using smart wallet
   */
  isUsingSmartWallet(): boolean {
    return this.isSmartWallet;
  }

  private async generateS5Seed(signer: ethers.Signer): Promise<string> {
    // For now, generate a proper S5 seed phrase
    // In production, this could be deterministic based on signature
    const s5Instance = await S5.create({ 
      initialPeers: ['wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p'] 
    });
    const seedPhrase = s5Instance.generateSeedPhrase();
    
    // Store signature for future deterministic generation if needed
    const signature = await signer.signMessage(AuthManager.SEED_MESSAGE);
    
    return seedPhrase;
  }
}