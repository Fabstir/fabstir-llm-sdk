import { ethers } from 'ethers';

export default class PaymentManager {
  static readonly MIN_ETH_PAYMENT = '0.005';
  static readonly TOKENS_PER_PROOF = 1000;
  static readonly DEFAULT_PRICE_PER_TOKEN = 5000;
  static readonly DEFAULT_DURATION = 3600;
  static readonly DEFAULT_PROOF_INTERVAL = 300;
  private static readonly USDC_DECIMALS = 6;

  constructor(
    private jobMarketplace: ethers.Contract,
    private signer: ethers.Signer
  ) {}

  async createETHSessionJob(
    hostAddress: string,
    amount: string,
    pricePerToken: number,
    duration: number,
    proofInterval: number
  ): Promise<{ jobId: string; txHash: string }> {
    try {
      const depositAmount = ethers.utils.parseEther(amount);
      const jobIdBN = await this.jobMarketplace.callStatic.createSessionJob(
        hostAddress, depositAmount, pricePerToken, duration, proofInterval,
        { value: depositAmount, gasLimit: 500000 }
      );
      const tx = await this.jobMarketplace.createSessionJob(
        hostAddress, depositAmount, pricePerToken, duration, proofInterval,
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
      const usdcContract = new ethers.Contract(
        tokenAddress,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        this.signer
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
      const depositAmount = ethers.utils.parseUnits(amount, PaymentManager.USDC_DECIMALS);
      const jobIdBN = await this.jobMarketplace.callStatic.createSessionJobWithToken(
        hostAddress, tokenAddress, depositAmount, pricePerToken, duration, proofInterval
      );
      const tx = await this.jobMarketplace.createSessionJobWithToken(
        hostAddress, tokenAddress, depositAmount, pricePerToken, duration, proofInterval,
        { gasLimit: 500000 }
      );
      const receipt = await tx.wait();
      if (receipt.status !== 1) throw new Error('Transaction failed');
      return { jobId: jobIdBN.toString(), txHash: tx.hash };
    } catch (error: any) {
      throw new Error(`Failed to create USDC session job: ${error.message}`);
    }
  }

  async completeSessionJob(jobId: string): Promise<string> {
    try {
      const tx = await this.jobMarketplace.completeSessionJob(jobId, { gasLimit: 200000 });
      const receipt = await tx.wait();
      if (receipt.status !== 1) throw new Error('Transaction failed');
      return tx.hash;
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
}