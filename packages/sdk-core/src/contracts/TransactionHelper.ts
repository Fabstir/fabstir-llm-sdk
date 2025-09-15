/**
 * Transaction helper utilities using native BigInt
 * No BigNumber dependencies - pure browser-compatible
 */

import { ethers, Contract, TransactionResponse } from 'ethers';

export interface TransactionOptions {
  gasLimit?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  value?: bigint;
  nonce?: number;
}

export interface JobCreationParams {
  jobId: bigint;
  model: string;
  prompt: string;
  provider: string;
  maxTokens: bigint;
  seed?: bigint;
  paymentMethod: 'ETH' | 'USDC';
  amount: bigint;
}

export class TransactionHelper {
  /**
   * Create a job with ETH payment
   */
  static async createJobWithETH(
    contract: Contract,
    params: JobCreationParams
  ): Promise<TransactionResponse> {
    const tx = await contract.createJob(
      params.jobId,
      params.model,
      params.prompt,
      params.provider,
      params.maxTokens,
      params.seed || 0n,
      { value: params.amount }
    );
    return tx;
  }

  /**
   * Create a job with USDC payment
   */
  static async createJobWithUSDC(
    contract: Contract,
    usdcContract: Contract,
    params: JobCreationParams
  ): Promise<TransactionResponse> {
    // First approve USDC spending
    const approveTx = await usdcContract.approve(
      await contract.getAddress(),
      params.amount
    );
    await approveTx.wait(3); // Wait for 3 confirmations

    // Then create the job
    const tx = await contract.createJobWithToken(
      params.jobId,
      params.model,
      params.prompt,
      params.provider,
      params.maxTokens,
      params.seed || 0n,
      await usdcContract.getAddress(),
      params.amount
    );
    return tx;
  }

  /**
   * Parse event logs using BigInt
   */
  static parseJobCreatedEvent(receipt: ethers.TransactionReceipt): {
    jobId: bigint;
    user: string;
    model: string;
    maxTokens: bigint;
  } | null {
    const eventTopic = ethers.id('JobCreated(uint256,address,string,uint256)');
    
    for (const log of receipt.logs) {
      if (log.topics[0] === eventTopic) {
        // Decode using BigInt
        const jobId = BigInt(log.topics[1]!);
        const user = ethers.getAddress('0x' + log.topics[2]!.slice(26));
        
        // Decode non-indexed parameters
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          ['string', 'uint256'],
          log.data
        );
        
        return {
          jobId,
          user,
          model: decoded[0],
          maxTokens: BigInt(decoded[1])
        };
      }
    }
    
    return null;
  }

  /**
   * Calculate gas price with BigInt
   */
  static async calculateGasPrice(
    provider: ethers.Provider
  ): Promise<{
    gasPrice: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  }> {
    const feeData = await provider.getFeeData();
    
    return {
      gasPrice: feeData.gasPrice || 0n,
      maxFeePerGas: feeData.maxFeePerGas || 0n,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || 0n
    };
  }

  /**
   * Format BigInt for display
   */
  static formatBigInt(value: bigint, decimals: number = 18): string {
    const divisor = 10n ** BigInt(decimals);
    const wholePart = value / divisor;
    const fractionalPart = value % divisor;
    
    // Format with decimal places
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    const trimmed = fractionalStr.replace(/0+$/, ''); // Remove trailing zeros
    
    if (trimmed.length === 0) {
      return wholePart.toString();
    }
    
    return `${wholePart}.${trimmed}`;
  }

  /**
   * Parse string to BigInt with decimals
   */
  static parseToBigInt(value: string, decimals: number = 18): bigint {
    // Handle decimal values
    const parts = value.split('.');
    const wholePart = BigInt(parts[0] || '0');
    
    let fractionalPart = 0n;
    if (parts[1]) {
      const fractionalStr = parts[1].padEnd(decimals, '0').slice(0, decimals);
      fractionalPart = BigInt(fractionalStr);
    }
    
    const multiplier = 10n ** BigInt(decimals);
    return wholePart * multiplier + fractionalPart;
  }

  /**
   * Safe math operations with BigInt
   */
  static safeAdd(a: bigint, b: bigint): bigint {
    return a + b;
  }

  static safeSub(a: bigint, b: bigint): bigint {
    if (b > a) {
      throw new Error('Subtraction underflow');
    }
    return a - b;
  }

  static safeMul(a: bigint, b: bigint): bigint {
    return a * b;
  }

  static safeDiv(a: bigint, b: bigint): bigint {
    if (b === 0n) {
      throw new Error('Division by zero');
    }
    return a / b;
  }

  /**
   * Compare BigInt values
   */
  static isGreaterThan(a: bigint, b: bigint): boolean {
    return a > b;
  }

  static isLessThan(a: bigint, b: bigint): boolean {
    return a < b;
  }

  static isEqual(a: bigint, b: bigint): boolean {
    return a === b;
  }

  /**
   * Convert between units
   */
  static weiToEther(wei: bigint): string {
    return this.formatBigInt(wei, 18);
  }

  static etherToWei(ether: string): bigint {
    return this.parseToBigInt(ether, 18);
  }

  static weiToGwei(wei: bigint): string {
    return this.formatBigInt(wei, 9);
  }

  static gweiToWei(gwei: string): bigint {
    return this.parseToBigInt(gwei, 9);
  }
}