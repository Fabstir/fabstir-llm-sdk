import { ethers } from 'ethers';
import AuthManager from './AuthManager';

export default class PaymentManager {
  static readonly MIN_ETH_PAYMENT = '0.005';
  static readonly TOKENS_PER_PROOF = 1000;
  static readonly DEFAULT_PRICE_PER_TOKEN = 5000;
  static readonly DEFAULT_DURATION = 3600;
  static readonly DEFAULT_PROOF_INTERVAL = 300;
  private static readonly USDC_DECIMALS = 6;

  constructor(
    private jobMarketplace: ethers.Contract,
    private authManager: AuthManager
  ) {}

  async createETHSessionJob(
    hostAddress: string,
    amount: string,
    pricePerToken: number,
    duration: number,
    proofInterval: number
  ): Promise<{ jobId: string; txHash: string }> {
    try {
      const signer = this.authManager.getSigner();
      const depositAmount = ethers.utils.parseEther(amount);
      const pricePerTokenWei = ethers.utils.parseUnits(pricePerToken.toString(), 'gwei');
      const contractWithSigner = this.jobMarketplace.connect(signer);
      const jobIdBN = await contractWithSigner.callStatic['createSessionJob'](
        hostAddress, depositAmount, pricePerTokenWei, duration, proofInterval,
        { value: depositAmount, gasLimit: 500000 }
      );
      const tx = await contractWithSigner['createSessionJob'](
        hostAddress, depositAmount, pricePerTokenWei, duration, proofInterval,
        { value: depositAmount, gasLimit: 500000 }
      );
      const receipt = await tx.wait();
      if (receipt.status !== 1) throw new Error('Transaction failed');
      return { jobId: jobIdBN.toString(), txHash: tx.hash };
    } catch (error: any) {
      throw new Error(`Failed to create ETH session job: ${error.message}`);
    }
  }

  async approveUSDC(tokenAddress: string, amount: string): Promise<string> {
    try {
      const signer = this.authManager.getSigner();
      const usdcContract = new ethers.Contract(
        tokenAddress,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        signer
      );
      const tx = await usdcContract.approve(
        this.jobMarketplace.address,
        ethers.utils.parseUnits(amount, PaymentManager.USDC_DECIMALS),
        { gasLimit: 100000 }
      );
      const receipt = await tx.wait();
      if (receipt.status !== 1) throw new Error('Approval failed');
      return tx.hash;
    } catch (error: any) {
      throw new Error(`Failed to approve USDC: ${error.message}`);
    }
  }

  async createUSDCSessionJob(
    hostAddress: string,
    tokenAddress: string,
    amount: string,
    pricePerToken: number,
    duration: number,
    proofInterval: number
  ): Promise<{ jobId: string; txHash: string }> {
    try {
      const signer = this.authManager.getSigner();
      const contractWithSigner = this.jobMarketplace.connect(signer);
      const depositAmount = ethers.utils.parseUnits(amount, PaymentManager.USDC_DECIMALS);
      // Convert pricePerToken to BigNumber (it's in nanoUSDC, smallest unit)
      const pricePerTokenBN = ethers.BigNumber.from(pricePerToken);
      const jobIdBN = await contractWithSigner.callStatic.createSessionJobWithToken(
        hostAddress, tokenAddress, depositAmount, pricePerTokenBN, duration, proofInterval
      );
      const tx = await contractWithSigner.createSessionJobWithToken(
        hostAddress, tokenAddress, depositAmount, pricePerTokenBN, duration, proofInterval,
        { gasLimit: 500000 }
      );
      const receipt = await tx.wait();
      if (receipt.status !== 1) throw new Error('Transaction failed');
      return { jobId: jobIdBN.toString(), txHash: tx.hash };
    } catch (error: any) {
      throw new Error(`Failed to create USDC session job: ${error.message}`);
    }
  }

  async getUSDCBalance(address?: string): Promise<ethers.BigNumber> {
    try {
      const signer = this.authManager.getSigner();
      const userAddress = address || (await signer.getAddress());
      const usdcAddress = process.env.CONTRACT_USDC_TOKEN || '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
      
      const usdcContract = new ethers.Contract(
        usdcAddress,
        ['function balanceOf(address) view returns (uint256)'],
        signer.provider
      );
      
      return await usdcContract.balanceOf(userAddress);
    } catch (error: any) {
      throw new Error(`Failed to get USDC balance: ${error.message}`);
    }
  }

  async getETHBalance(address?: string): Promise<ethers.BigNumber> {
    try {
      const signer = this.authManager.getSigner();
      const userAddress = address || (await signer.getAddress());
      return await signer.provider!.getBalance(userAddress);
    } catch (error: any) {
      throw new Error(`Failed to get ETH balance: ${error.message}`);
    }
  }

  async completeSessionJob(jobId: string): Promise<any> {
    try {
      const signer = this.authManager.getSigner();
      const contractWithSigner = this.jobMarketplace.connect(signer);
      const tx = await contractWithSigner.completeSessionJob(jobId, { gasLimit: 200000 });
      const receipt = await tx.wait();
      if (receipt.status !== 1) throw new Error('Transaction failed');
      
      // Return an object matching what the tests expect
      return {
        success: true,
        txHash: tx.hash,
        receipt: receipt
      };
    } catch (error: any) {
      throw new Error(`Failed to complete session job: ${error.message}`);
    }
  }

  private extractJobIdFromReceipt(receipt: any): string {
    if (!receipt.logs?.length) throw new Error('No job ID found in transaction logs');
    if (receipt.logs[0].topics?.length > 1) {
      return ethers.BigNumber.from(receipt.logs[0].topics[1]).toString();
    }
    throw new Error('No job ID found in transaction logs');
  }

  // Utility Methods for UI
  
  getSupportedPaymentMethods(): string[] {
    return ['ETH', 'USDC'];
  }

  calculateJobCost(tokenCount: number, pricePerToken: number): string {
    // pricePerToken is in wei for ETH or smallest unit for USDC
    const totalCost = ethers.BigNumber.from(tokenCount).mul(pricePerToken);
    return totalCost.toString();
  }

  getJobMarketplaceAddress(): string {
    return this.jobMarketplace.address;
  }

  getUSDCTokenAddress(): string {
    // This should be configured, using Base Sepolia USDC for now
    return process.env.CONTRACT_USDC_TOKEN || '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  }

  getMinimumDeposit(): string {
    // Minimum 0.001 ETH
    return ethers.utils.parseEther('0.001').toString();
  }

  getMaximumDeposit(): string {
    // Maximum 10 ETH
    return ethers.utils.parseEther('10').toString();
  }

  getUSDCMinimumDeposit(): string {
    // Minimum 1 USDC
    return ethers.utils.parseUnits('1', PaymentManager.USDC_DECIMALS).toString();
  }

  getUSDCMaximumDeposit(): string {
    // Maximum 10,000 USDC
    return ethers.utils.parseUnits('10000', PaymentManager.USDC_DECIMALS).toString();
  }

  // Format helpers for UI display
  formatETHAmount(weiAmount: string): string {
    return ethers.utils.formatEther(weiAmount);
  }

  formatUSDCAmount(amount: string): string {
    return ethers.utils.formatUnits(amount, PaymentManager.USDC_DECIMALS);
  }

  // Parse helpers for UI input
  parseETHAmount(etherAmount: string): string {
    return ethers.utils.parseEther(etherAmount).toString();
  }

  parseUSDCAmount(usdcAmount: string): string {
    return ethers.utils.parseUnits(usdcAmount, PaymentManager.USDC_DECIMALS).toString();
  }

  // Validation helpers
  validateETHDeposit(amount: string): { valid: boolean; error?: string } {
    try {
      const amountWei = ethers.BigNumber.from(amount);
      const min = ethers.BigNumber.from(this.getMinimumDeposit());
      const max = ethers.BigNumber.from(this.getMaximumDeposit());
      
      if (amountWei.lt(min)) {
        return { valid: false, error: `Minimum deposit is ${this.formatETHAmount(min.toString())} ETH` };
      }
      if (amountWei.gt(max)) {
        return { valid: false, error: `Maximum deposit is ${this.formatETHAmount(max.toString())} ETH` };
      }
      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Invalid amount' };
    }
  }

  validateUSDCDeposit(amount: string): { valid: boolean; error?: string } {
    try {
      const amountUnits = ethers.BigNumber.from(amount);
      const min = ethers.BigNumber.from(this.getUSDCMinimumDeposit());
      const max = ethers.BigNumber.from(this.getUSDCMaximumDeposit());
      
      if (amountUnits.lt(min)) {
        return { valid: false, error: `Minimum deposit is ${this.formatUSDCAmount(min.toString())} USDC` };
      }
      if (amountUnits.gt(max)) {
        return { valid: false, error: `Maximum deposit is ${this.formatUSDCAmount(max.toString())} USDC` };
      }
      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Invalid amount' };
    }
  }

  // Calculate estimated tokens for a given deposit
  estimateTokensForDeposit(depositAmount: string, pricePerToken: string): number {
    const deposit = ethers.BigNumber.from(depositAmount);
    const price = ethers.BigNumber.from(pricePerToken);
    
    if (price.isZero()) return 0;
    return deposit.div(price).toNumber();
  }

  // Get recommended price per token based on current market
  getRecommendedPricePerToken(): string {
    // This could query the contract for average prices
    // For now, return a reasonable default (0.00001 ETH per token)
    return ethers.utils.parseUnits('10', 'gwei').toString();
  }

  getRecommendedUSDCPricePerToken(): string {
    // 0.001 USDC per token
    return ethers.utils.parseUnits('0.001', PaymentManager.USDC_DECIMALS).toString();
  }
}