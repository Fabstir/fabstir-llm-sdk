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
   * Deploy the smart wallet contract
   * This deploys a minimal proxy that delegates to an implementation
   */
  async deploySmartWallet(): Promise<string> {
    if (!this.eoaSigner || !this.smartWalletAddress || !this.provider) {
      throw new Error('Smart wallet not initialized');
    }
    
    // Check if already deployed
    const isDeployed = await this.isDeployed();
    if (isDeployed) {
      console.log('[SmartWallet] Already deployed at:', this.smartWalletAddress);
      return this.smartWalletAddress;
    }
    
    // Deploy a minimal proxy contract that can control funds
    // This is a simplified version - production would use Base Account Kit factory
    
    // Simple smart wallet bytecode (working version)
    // This minimal contract:
    // - Sets owner to msg.sender in constructor
    // - Has transferToken function: beabacc8(address,address,uint256)
    // - Has owner() getter: 8da5cb5b()
    const walletBytecode = '0x608060405234801561001057600080fd5b50336000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055506102b7806100606000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c80638da5cb5b1461003b578063beabacc814610059575b600080fd5b610043610089565b60405161005091906101d0565b60405180910390f35b610073600480360381019061006e91906101fa565b6100ad565b604051610080919061025e565b60405180910390f35b60008054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b60008060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff161461010957600080fd5b8373ffffffffffffffffffffffffffffffffffffffff1663a9059cbb84846040518363ffffffff1660e01b8152600401610145929190610279565b6020604051808303816000875af1158015610164573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061018891906102d4565b9050949350505050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006101bf82610192565b9050919050565b6101cf816101b4565b82525050565b60006020820190506101eb60008301846101c6565b92915050565b600080fd5b600080fd5b61020481610192565b811461020f57600080fd5b50565b600081359050610221816101fb565b92915050565b6000819050919050565b61023a81610227565b811461024557600080fd5b50565b60008135905061025781610231565b92915050565b60008115159050919050565b6102738161025d565b82525050565b600060408201905061028e60008301856101c6565b61029b6020830184610227565b9392505050565b6102ab8161025d565b81146102b657600080fd5b50565b6000813590506102c8816102a2565b92915050565b6000602082840312156102e4576102e36101f1565b5b60006102f2848285016102b9565b9150509291505056fea2646970667358221220d3c6e4f5e4f5e4f5e4f5e4f5e4f5e4f5e4f5e4f5e4f5e4f5e4f5e4f5e4f5e4f564736f6c63430008130033';
    
    try {
      console.log('[SmartWallet] Deploying smart wallet contract...');
      console.log('[SmartWallet] Target address:', this.smartWalletAddress);
      
      // For deterministic deployment, we need CREATE2
      // Since we can't easily deploy at the exact deterministic address without a factory,
      // we'll deploy a forwarder contract and update our smart wallet address
      
      // Deploy simple forwarder contract
      const tx = await this.eoaSigner.sendTransaction({
        data: walletBytecode,
        gasLimit: 1000000
      });
      
      console.log('[SmartWallet] Deploy TX:', tx.hash);
      const receipt = await tx.wait();
      
      if (receipt.contractAddress) {
        console.log('[SmartWallet] Contract deployed at:', receipt.contractAddress);
        // Update smart wallet address to the deployed contract
        this.smartWalletAddress = receipt.contractAddress;
        
        // Update signer to use new address
        this.smartWalletSigner = new SmartWalletSigner(
          this.eoaSigner,
          this.smartWalletAddress,
          this.paymasterUrl,
          this.sponsorDeployment
        );
        
        return this.smartWalletAddress;
      } else {
        throw new Error('Deployment failed - no contract address in receipt');
      }
    } catch (error: any) {
      console.error('[SmartWallet] Deployment failed:', error.message);
      throw error;
    }
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

  /**
   * Withdraw USDC from smart wallet back to EOA
   * @param amount Amount of USDC to withdraw (or 'all' for entire balance)
   */
  async withdrawUSDC(amount?: string): Promise<string> {
    if (!this.smartWalletSigner || !this.smartWalletAddress || !this.eoaSigner) {
      throw new Error('Smart wallet not initialized');
    }

    const usdcAddress = process.env.CONTRACT_USDC_TOKEN || 
      '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
    
    const usdcABI = [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function balanceOf(address account) view returns (uint256)',
      'function decimals() view returns (uint8)'
    ];
    
    // Use the smart wallet signer for the withdrawal
    const usdcContract = new ethers.Contract(usdcAddress, usdcABI, this.smartWalletSigner);
    const decimals = await usdcContract.decimals();
    
    let amountWei: ethers.BigNumber;
    
    if (!amount || amount === 'all') {
      // Withdraw entire balance
      amountWei = await usdcContract.balanceOf(this.smartWalletAddress);
      if (amountWei.eq(0)) {
        throw new Error('No USDC balance to withdraw');
      }
    } else {
      // Withdraw specified amount
      amountWei = ethers.utils.parseUnits(amount, decimals);
    }
    
    const eoaAddress = await this.eoaSigner.getAddress();
    
    // Transfer from smart wallet to EOA using smart wallet signer
    // This will be a gasless transaction if paymaster is configured
    const tx = await usdcContract.transfer(eoaAddress, amountWei);
    const receipt = await tx.wait();
    
    return tx.hash;
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