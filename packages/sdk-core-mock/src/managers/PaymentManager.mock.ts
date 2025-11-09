/**
 * PaymentManagerMock
 *
 * Mock implementation of IPaymentManager for UI development
 * Simulates payment operations without blockchain interactions
 */

import type { IPaymentManager } from '../types';
import { MockStorage } from '../storage/MockStorage';

export class PaymentManagerMock implements IPaymentManager {
  private storage: MockStorage;
  private userAddress: string;
  private balances: Map<string, bigint>; // token address -> balance

  constructor(userAddress: string) {
    this.userAddress = userAddress;
    this.storage = new MockStorage(`payments-${userAddress}`);
    this.balances = new Map();

    // Initialize with mock balances
    this.initializeMockBalances();
  }

  private initializeMockBalances(): void {
    // Mock USDC balance (6 decimals)
    this.balances.set('USDC', BigInt('1000000000')); // 1000 USDC

    // Mock ETH balance (18 decimals)
    this.balances.set('ETH', BigInt('5000000000000000000')); // 5 ETH

    // Mock FAB balance (18 decimals)
    this.balances.set('FAB', BigInt('10000000000000000000000')); // 10,000 FAB
  }

  async createJob(request: any): Promise<any> {
    await this.delay(800);

    const jobId = BigInt(Date.now());
    console.log('[Mock] Created job:', jobId.toString());

    return {
      jobId,
      txHash: '0x' + Math.random().toString(16).substring(2),
      success: true
    };
  }

  async createSessionJob(
    model: string,
    provider: string,
    depositAmount: string,
    pricePerToken: number,
    proofInterval: number,
    duration: number
  ): Promise<{
    sessionId: bigint;
    jobId: bigint;
    txHash: string;
  }> {
    await this.delay(1000);

    const sessionId = BigInt(Date.now());
    const jobId = BigInt(Date.now() + 1);

    console.log('[Mock] Created session job:', {
      sessionId: sessionId.toString(),
      jobId: jobId.toString(),
      model,
      depositAmount,
      pricePerToken
    });

    return {
      sessionId,
      jobId,
      txHash: '0x' + Math.random().toString(16).substring(2)
    };
  }

  async approveToken(
    tokenAddress: string,
    spenderAddress: string,
    amount: bigint
  ): Promise<any> {
    await this.delay(600);

    console.log('[Mock] Approved token spending:', {
      token: tokenAddress,
      spender: spenderAddress,
      amount: amount.toString()
    });

    return {
      success: true,
      txHash: '0x' + Math.random().toString(16).substring(2)
    };
  }

  async checkAllowance(
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string
  ): Promise<bigint> {
    await this.delay(200);

    // Mock unlimited allowance for approved tokens
    return BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');
  }

  async getTokenBalance(
    tokenAddress: string,
    address: string
  ): Promise<bigint> {
    await this.delay(200);

    // Determine token type from address
    const balance = this.balances.get('USDC') || BigInt(0);
    console.log(`[Mock] Token balance for ${address}:`, balance.toString());
    return balance;
  }

  async getEthBalance(address: string): Promise<bigint> {
    await this.delay(200);

    const balance = this.balances.get('ETH') || BigInt(0);
    console.log(`[Mock] ETH balance for ${address}:`, balance.toString());
    return balance;
  }

  async sendEth(
    to: string,
    amount: bigint
  ): Promise<any> {
    await this.delay(800);

    console.log('[Mock] Sent ETH:', {
      to,
      amount: amount.toString()
    });

    // Deduct from balance
    const currentBalance = this.balances.get('ETH') || BigInt(0);
    this.balances.set('ETH', currentBalance - amount);

    return {
      success: true,
      txHash: '0x' + Math.random().toString(16).substring(2)
    };
  }

  async sendToken(
    tokenAddress: string,
    to: string,
    amount: bigint
  ): Promise<any> {
    await this.delay(800);

    console.log('[Mock] Sent tokens:', {
      token: tokenAddress,
      to,
      amount: amount.toString()
    });

    // Deduct from balance
    const currentBalance = this.balances.get('USDC') || BigInt(0);
    this.balances.set('USDC', currentBalance - amount);

    return {
      success: true,
      txHash: '0x' + Math.random().toString(16).substring(2)
    };
  }

  async estimateGas(
    to: string,
    data: string,
    value?: bigint
  ): Promise<bigint> {
    await this.delay(100);

    // Mock gas estimate (in wei)
    return BigInt('21000'); // Standard transfer
  }

  async submitCheckpoint(
    jobId: bigint,
    tokensGenerated: number,
    proof: string
  ): Promise<string> {
    await this.delay(600);

    console.log('[Mock] Submitted checkpoint:', {
      jobId: jobId.toString(),
      tokensGenerated,
      proof: proof.substring(0, 20) + '...'
    });

    return '0x' + Math.random().toString(16).substring(2);
  }

  async submitCheckpointAsHost(
    jobId: bigint,
    tokensGenerated: number,
    proof: string,
    hostSigner: any
  ): Promise<string> {
    await this.delay(600);

    console.log('[Mock] Submitted checkpoint as host:', {
      jobId: jobId.toString(),
      tokensGenerated
    });

    return '0x' + Math.random().toString(16).substring(2);
  }

  async completeSession(
    jobId: bigint,
    totalTokens: number,
    finalProof: string
  ): Promise<string> {
    await this.delay(800);

    console.log('[Mock] Completed session:', {
      jobId: jobId.toString(),
      totalTokens
    });

    return '0x' + Math.random().toString(16).substring(2);
  }

  // Additional Multi-Chain Methods (not in base interface but useful for mock)

  async depositNative(tokenAddress: string, amount: string, chainId: number): Promise<string> {
    await this.delay(800);

    console.log('[Mock] Deposited native tokens:', {
      amount,
      chainId,
      token: tokenAddress
    });

    // Update balance
    const currentBalance = this.balances.get('ETH') || BigInt(0);
    const depositAmount = BigInt(amount);
    this.balances.set('ETH', currentBalance + depositAmount);

    return '0x' + Math.random().toString(16).substring(2);
  }

  async depositUSDC(tokenAddress: string, amount: string, chainId: number): Promise<string> {
    await this.delay(800);

    console.log('[Mock] Deposited USDC:', {
      amount,
      chainId,
      token: tokenAddress
    });

    // Update balance
    const currentBalance = this.balances.get('USDC') || BigInt(0);
    const depositAmount = BigInt(amount);
    this.balances.set('USDC', currentBalance + depositAmount);

    return '0x' + Math.random().toString(16).substring(2);
  }

  async withdrawNative(tokenAddress: string, amount: string, chainId: number): Promise<string> {
    await this.delay(800);

    console.log('[Mock] Withdrew native tokens:', {
      amount,
      chainId,
      token: tokenAddress
    });

    // Update balance
    const currentBalance = this.balances.get('ETH') || BigInt(0);
    const withdrawAmount = BigInt(amount);
    this.balances.set('ETH', currentBalance - withdrawAmount);

    return '0x' + Math.random().toString(16).substring(2);
  }

  async withdrawUSDC(tokenAddress: string, amount: string, chainId: number): Promise<string> {
    await this.delay(800);

    console.log('[Mock] Withdrew USDC:', {
      amount,
      chainId,
      token: tokenAddress
    });

    // Update balance
    const currentBalance = this.balances.get('USDC') || BigInt(0);
    const withdrawAmount = BigInt(amount);
    this.balances.set('USDC', currentBalance - withdrawAmount);

    return '0x' + Math.random().toString(16).substring(2);
  }

  async getBalance(address: string, tokenAddress: string): Promise<bigint> {
    await this.delay(200);

    // Determine token type
    if (tokenAddress === '0x0000000000000000000000000000000000000000') {
      return this.getEthBalance(address);
    } else {
      return this.getTokenBalance(tokenAddress, address);
    }
  }

  // Helper Methods

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
