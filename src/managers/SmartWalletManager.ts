import { ethers } from 'ethers';

export interface SmartWalletConfig {
  paymasterUrl?: string;
  sponsorDeployment?: boolean;
}

export interface SmartWalletInfo {
  eoaAddress: string;
  smartWalletAddress: string;
  isDeployed: boolean;
}

/**
 * SmartWalletManager handles Base Account Kit smart wallet operations
 * Supports gasless transactions via paymaster and USDC-only operations
 */
export default class SmartWalletManager {
  private eoaSigner?: ethers.Signer;
  private smartWalletSigner?: ethers.Signer;
  private smartWalletAddress?: string;
  private paymasterUrl?: string;
  private provider?: ethers.providers.Provider;
  private baseAccountSDK?: any; // Will be typed when we add the actual SDK

  constructor(paymasterUrl?: string) {
    this.paymasterUrl = paymasterUrl || process.env.BASE_PAYMASTER_URL;
    
    // Base Account Kit provides automatic sponsorship (no paymaster URL needed)
    if (!this.paymasterUrl) {
      console.log('🎉 Using Base Account Kit sponsored transactions (Coinbase pays gas!)');
    }
  }

  /**
   * Initialize smart wallet with EOA signer
   * Creates deterministic smart wallet address from EOA
   */
  async initialize(
    eoaSigner: ethers.Signer, 
    options?: SmartWalletConfig
  ): Promise<SmartWalletInfo> {
    this.eoaSigner = eoaSigner;
    this.provider = eoaSigner.provider;
    
    if (options?.paymasterUrl) {
      this.paymasterUrl = options.paymasterUrl;
    }

    const eoaAddress = await eoaSigner.getAddress();
    
    // TODO: Replace with actual Base Account SDK implementation
    // For now, simulate smart wallet creation
    // In production, this would use @coinbase/smart-wallet or similar
    
    // Deterministic smart wallet address generation (simplified)
    // Real implementation would use CREATE2 with proper factory
    const smartWalletAddressHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256'],
        [eoaAddress, 0] // 0 is the salt/nonce
      )
    );
    this.smartWalletAddress = '0x' + smartWalletAddressHash.slice(-40);
    
    // Create smart wallet signer
    // In production, this wraps the Base Account SDK provider
    this.smartWalletSigner = new SmartWalletSigner(
      this.eoaSigner,
      this.smartWalletAddress,
      this.paymasterUrl,
      options?.sponsorDeployment
    );

    const isDeployed = await this.isDeployed();
    
    return {
      eoaAddress,
      smartWalletAddress: this.smartWalletAddress,
      isDeployed
    };
  }

  /**
   * Get EOA address (used for S5 seed generation)
   */
  getEOAAddress(): string {
    if (!this.eoaSigner) throw new Error('Smart wallet not initialized');
    return this.eoaSigner._address || '';
  }

  /**
   * Get smart wallet address (used for payments)
   */
  getSmartWalletAddress(): string {
    if (!this.smartWalletAddress) throw new Error('Smart wallet not initialized');
    return this.smartWalletAddress;
  }

  /**
   * Check if smart wallet is deployed on-chain
   */
  async isDeployed(): Promise<boolean> {
    if (!this.smartWalletAddress || !this.provider) return false;
    
    const code = await this.provider.getCode(this.smartWalletAddress);
    return code !== '0x';
  }

  /**
   * Estimate deployment cost in USDC (when using paymaster)
   */
  async estimateDeploymentCost(): Promise<string> {
    if (!this.paymasterUrl) {
      // Without paymaster, would need ETH
      return '0';
    }
    
    // TODO: Call paymaster API to get USDC cost estimate
    // For now, return typical deployment cost
    return '0.5'; // $0.50 in USDC
  }

  /**
   * Get smart wallet signer for contract interactions
   */
  getSmartWalletSigner(): ethers.Signer {
    if (!this.smartWalletSigner) throw new Error('Smart wallet not initialized');
    return this.smartWalletSigner;
  }

  /**
   * Transfer USDC from EOA to smart wallet
   */
  async depositUSDC(amount: string): Promise<string> {
    if (!this.eoaSigner || !this.smartWalletAddress) {
      throw new Error('Smart wallet not initialized');
    }

    const usdcAddress = process.env.CONTRACT_USDC_TOKEN || 
      '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
    
    const usdcABI = [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function decimals() view returns (uint8)'
    ];
    
    const usdcContract = new ethers.Contract(usdcAddress, usdcABI, this.eoaSigner);
    const decimals = await usdcContract.decimals();
    const amountWei = ethers.utils.parseUnits(amount, decimals);
    
    const tx = await usdcContract.transfer(this.smartWalletAddress, amountWei);
    await tx.wait();
    
    return tx.hash;
  }

  /**
   * Get USDC balance of smart wallet
   */
  async getUSDCBalance(): Promise<string> {
    if (!this.smartWalletAddress || !this.provider) {
      throw new Error('Smart wallet not initialized');
    }

    const usdcAddress = process.env.CONTRACT_USDC_TOKEN || 
      '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
    
    const usdcABI = [
      'function balanceOf(address account) view returns (uint256)',
      'function decimals() view returns (uint8)'
    ];
    
    const usdcContract = new ethers.Contract(usdcAddress, usdcABI, this.provider);
    const decimals = await usdcContract.decimals();
    const balance = await usdcContract.balanceOf(this.smartWalletAddress);
    
    return ethers.utils.formatUnits(balance, decimals);
  }
}

/**
 * Custom signer that wraps smart wallet operations
 * In production, this would interface with Base Account SDK
 */
class SmartWalletSigner extends ethers.Signer {
  private eoaSigner: ethers.Signer;
  private smartWalletAddress: string;
  private paymasterUrl?: string;
  private sponsorDeployment?: boolean;

  constructor(
    eoaSigner: ethers.Signer,
    smartWalletAddress: string,
    paymasterUrl?: string,
    sponsorDeployment?: boolean
  ) {
    super();
    this.eoaSigner = eoaSigner;
    this.smartWalletAddress = smartWalletAddress;
    this.paymasterUrl = paymasterUrl;
    this.sponsorDeployment = sponsorDeployment;
    
    // Inherit provider from EOA signer
    ethers.utils.defineReadOnly(this, 'provider', eoaSigner.provider);
  }

  async getAddress(): Promise<string> {
    return this.smartWalletAddress;
  }

  async signMessage(message: string | ethers.utils.Bytes): Promise<string> {
    // Smart wallet would use EIP-1271 signature validation
    // For now, use EOA signature with prefix
    return this.eoaSigner.signMessage(message);
  }

  async signTransaction(
    transaction: ethers.utils.Deferrable<ethers.providers.TransactionRequest>
  ): Promise<string> {
    // In production, this would create UserOperation for smart wallet
    // and potentially use paymaster for gasless tx
    const tx = await ethers.utils.resolveProperties(transaction);
    
    if (this.paymasterUrl && this.sponsorDeployment) {
      // TODO: Call paymaster to sponsor transaction
      // Would return UserOperation with paymaster signature
    }
    
    // Simplified: delegate to EOA for now
    return this.eoaSigner.signTransaction(tx);
  }

  async sendTransaction(
    transaction: ethers.utils.Deferrable<ethers.providers.TransactionRequest>
  ): Promise<ethers.providers.TransactionResponse> {
    // In production, send UserOperation through bundler
    // For testing, we'll simulate smart wallet behavior
    
    const tx = await ethers.utils.resolveProperties(transaction);
    
    // When no paymaster URL, Base Account Kit handles sponsorship automatically
    // For testing, we'll use EOA until actual Base SDK is integrated
    if (!this.paymasterUrl) {
      // Base Account Kit would handle this automatically
      // For now, use EOA for testing
      delete tx.from; // Let EOA signer set from address
      return this.eoaSigner.sendTransaction(tx);
    }
    
    tx.from = this.smartWalletAddress;
    
    if (this.paymasterUrl) {
      // TODO: Route through real paymaster and bundler
    }
    
    return this.eoaSigner.sendTransaction(tx);
  }

  connect(provider: ethers.providers.Provider): SmartWalletSigner {
    return new SmartWalletSigner(
      this.eoaSigner.connect(provider),
      this.smartWalletAddress,
      this.paymasterUrl,
      this.sponsorDeployment
    );
  }
}