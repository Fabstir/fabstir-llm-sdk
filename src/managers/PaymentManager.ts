// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { ethers } from 'ethers';
import AuthManager from './AuthManager';
import { ERC20ABI } from '../contracts/abis';

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
      // pricePerToken is already in wei, don't convert from gwei
      const pricePerTokenWei = ethers.BigNumber.from(pricePerToken);
      const contractWithSigner = this.jobMarketplace.connect(signer);
      
      const tx = await contractWithSigner['createSessionJob'](
        hostAddress, depositAmount, pricePerTokenWei, duration, proofInterval,
        { value: depositAmount, gasLimit: 500000 }
      );
      const receipt = await tx.wait();
      if (receipt.status !== 1) throw new Error('Transaction failed');
      
      // Parse job ID from events
      let eventJobId = null;
      console.log(`Receipt logs count: ${receipt.logs.length}`);
      for (const log of receipt.logs) {
        try {
          const parsed = this.jobMarketplace.interface.parseLog({
            topics: log.topics,
            data: log.data
          });
          console.log(`Parsed event: ${parsed.name}`);
          if (parsed.name === 'SessionJobCreated' && parsed.args.jobId) {
            eventJobId = parsed.args.jobId.toString();
            console.log('Job ID from event:', eventJobId);
            break;
          }
        } catch (err) {
          console.log('Failed to parse log:', err);
        }
      }
      
      if (!eventJobId) {
        throw new Error('Could not parse job ID from ETH session transaction events - check ABI compatibility');
      }
      
      return { jobId: eventJobId, txHash: tx.hash };
    } catch (error: any) {
      throw new Error(`Failed to create ETH session job: ${error.message}`);
    }
  }

  async approveUSDC(tokenAddress: string, amount: string): Promise<string> {
    try {
      const signer = this.authManager.getSigner();
      const usdcContract = new ethers.Contract(
        tokenAddress,
        ERC20ABI,
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
      
      console.log('Creating USDC session with params:', {
        host: hostAddress,
        token: tokenAddress,
        deposit: ethers.utils.formatUnits(depositAmount, 6) + ' USDC',
        pricePerToken: pricePerToken,
        duration: duration,
        proofInterval: proofInterval
      });
      
      // No simulation - we'll get the real job ID from events only
      
      // First approve USDC
      const usdcContract = new ethers.Contract(
        tokenAddress,
        ERC20ABI,
        signer
      );
      const approveTx = await usdcContract.approve(
        this.jobMarketplace.address,
        depositAmount,
        { gasLimit: 100000 }
      );
      await approveTx.wait();
      
      // Then create session using createSessionJobWithToken for USDC
      const tx = await contractWithSigner.createSessionJobWithToken(
        hostAddress, tokenAddress, depositAmount, pricePerTokenBN, duration, proofInterval,
        { gasLimit: 500000 }
      );
      const receipt = await tx.wait();
      if (receipt.status !== 1) throw new Error('Transaction failed');
      
      // Parse job ID from events
      let eventJobId = null;
      console.log(`Receipt logs count: ${receipt.logs.length}`);
      console.log('Transaction hash:', tx.hash);
      console.log('Contract address:', this.jobMarketplace.address);
      
      for (let i = 0; i < receipt.logs.length; i++) {
        const log = receipt.logs[i];
        console.log(`Log ${i}:`, {
          address: log.address,
          topics: log.topics,
          data: log.data
        });
        
        try {
          const parsed = this.jobMarketplace.interface.parseLog({
            topics: log.topics,
            data: log.data
          });
          console.log(`Parsed event: ${parsed.name}`, parsed.args);
          if ((parsed.name === 'SessionJobCreated' || parsed.name === 'SessionJobCreatedWithToken') && parsed.args.jobId) {
            eventJobId = parsed.args.jobId.toString();
            console.log('Job ID from event:', eventJobId);
            break;
          }
        } catch (err: any) {
          console.log(`Failed to parse log ${i}:`, err.message);
        }
      }
      
      if (!eventJobId) {
        throw new Error('Could not parse job ID from transaction events - check ABI compatibility');
      }
      const finalJobId = eventJobId;
      
      return { jobId: finalJobId, txHash: tx.hash };
    } catch (error: any) {
      throw new Error(`Failed to create USDC session job: ${error.message}`);
    }
  }

  /**
   * Claim payment with proof for a completed session job
   * @param jobId The session job ID to claim payment for
   * @returns Transaction receipt
   */
  async claimWithProof(jobId: string | number): Promise<ethers.ContractReceipt> {
    try {
      const signer = this.authManager.getSigner();
      const contractWithSigner = this.jobMarketplace.connect(signer);
      
      // Use the claimWithProof function from the contract
      const tx = await contractWithSigner.claimWithProof(jobId, { gasLimit: 300000 });
      const receipt = await tx.wait();
      
      if (receipt.status !== 1) {
        throw new Error('Claim transaction failed');
      }
      
      return receipt;
    } catch (error: any) {
      throw new Error(`Failed to claim payment with proof: ${error.message}`);
    }
  }

  /**
   * Get session job status and details from the contract
   * @param jobId The session job ID to query
   * @returns Session details including status, deposit, tokens proven, etc.
   */
  async getSessionStatus(jobId: string | number): Promise<any> {
    try {
      const signer = this.authManager.getSigner();
      
      // Use the sessions function to get job details
      const sessionDetails = await this.jobMarketplace.sessions(jobId);
      
      // Map ABI field names to expected names
      return {
        deposit: sessionDetails.depositAmount,
        pricePerToken: sessionDetails.pricePerToken,
        maxDuration: sessionDetails.maxDuration,
        endTime: sessionDetails.sessionStartTime && sessionDetails.maxDuration ? 
          ethers.BigNumber.from(sessionDetails.sessionStartTime).add(sessionDetails.maxDuration) : undefined,
        host: sessionDetails.assignedHost,
        renter: sessionDetails.requester, // Note: ABI doesn't have 'renter', might be 'requester'
        proofInterval: sessionDetails.proofInterval,
        tokensProven: sessionDetails.provenTokens,
        completedAt: sessionDetails.completedAt,
        paymentToken: sessionDetails.paymentToken || ethers.constants.AddressZero,
        isCompleted: sessionDetails.status === 2 // Status 2 = Completed in enum
      };
    } catch (error: any) {
      throw new Error(`Failed to get session status: ${error.message}`);
    }
  }

  /**
   * Check multiple balances (USDC and ETH) for given addresses
   * @param addresses Object with addresses to check
   * @returns Object with balances for each address
   */
  async checkBalances(addresses: { [key: string]: string }): Promise<{ [key: string]: { usdc: string; eth: string } }> {
    try {
      const signer = this.authManager.getSigner();
      const provider = signer.provider;
      
      const usdcAddress = process.env.CONTRACT_USDC_TOKEN;
      if (!usdcAddress) {
        throw new Error('CONTRACT_USDC_TOKEN environment variable is not set');
      }
      
      const usdcContract = new ethers.Contract(
        usdcAddress,
        ERC20ABI,
        provider
      );
      
      const balances: { [key: string]: { usdc: string; eth: string } } = {};
      
      for (const [name, address] of Object.entries(addresses)) {
        const usdcBalance = await usdcContract.balanceOf(address);
        const ethBalance = await provider.getBalance(address);
        
        balances[name] = {
          usdc: ethers.utils.formatUnits(usdcBalance, PaymentManager.USDC_DECIMALS),
          eth: ethers.utils.formatEther(ethBalance)
        };
      }
      
      return balances;
    } catch (error: any) {
      throw new Error(`Failed to check balances: ${error.message}`);
    }
  }

  /**
   * Verify that a session was successfully created on-chain
   * @param jobId The session job ID to verify
   * @returns Boolean indicating if session exists
   */
  async verifySessionCreated(jobId: string | number): Promise<boolean> {
    try {
      const sessionDetails = await this.getSessionStatus(jobId);
      // Session exists if we got valid data back with a deposit
      return sessionDetails.deposit && ethers.BigNumber.from(sessionDetails.deposit).gt(0);
    } catch (error: any) {
      // If we can't read the session, it doesn't exist
      return false;
    }
  }

  async getUSDCBalance(address?: string): Promise<ethers.BigNumber> {
    try {
      const signer = this.authManager.getSigner();
      const userAddress = address || (await signer.getAddress());
      const usdcAddress = process.env.CONTRACT_USDC_TOKEN;
      if (!usdcAddress) {
        throw new Error('CONTRACT_USDC_TOKEN environment variable is not set');
      }
      
      const usdcContract = new ethers.Contract(
        usdcAddress,
        ERC20ABI,
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
    const usdcAddress = process.env.CONTRACT_USDC_TOKEN;
    if (!usdcAddress) {
      throw new Error('CONTRACT_USDC_TOKEN environment variable is not set');
    }
    return usdcAddress;
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