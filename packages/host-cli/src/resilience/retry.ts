import { ethers } from 'ethers';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface TransactionRetryConfig {
  provider: ethers.Provider;
  wallet: ethers.Wallet;
  maxRetries?: number;
  gasLimitMultiplier?: number;
  gasPriceMultiplier?: number;
}

export interface TransactionRequest {
  to?: string;
  data?: string;
  value?: bigint;
  gasLimit?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
}

export interface GasPrice {
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

export interface FailedTransaction {
  to?: string;
  data?: string;
  value?: bigint;
  error: string;
  timestamp: number;
}

export interface QueueResult {
  successful: any[];
  failed: any[];
}

export class TransactionRetry {
  private config: Required<TransactionRetryConfig>;
  private transactionQueue: TransactionRequest[] = [];
  private failedTransactionsPath: string;

  constructor(config: TransactionRetryConfig) {
    this.config = {
      maxRetries: 3,
      gasLimitMultiplier: 1.2,
      gasPriceMultiplier: 1.1,
      ...config
    };

    this.failedTransactionsPath = path.join(
      os.homedir(),
      '.fabstir',
      'failed-transactions.json'
    );
  }

  async sendTransaction(tx: TransactionRequest): Promise<ethers.TransactionResponse> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const preparedTx = await this.prepareTx(tx);
        return await this.config.wallet.sendTransaction(preparedTx);
      } catch (error: any) {
        lastError = error;

        if (this.isNonceError(error)) {
          // Retry with updated nonce
          tx.nonce = await this.config.wallet.getNonce('pending');
          continue;
        }

        if (attempt === this.config.maxRetries) {
          throw error;
        }
      }
    }

    throw lastError || new Error('Transaction failed');
  }

  async sendTransactionWithGasRetry(tx: TransactionRequest): Promise<ethers.TransactionResponse> {
    try {
      return await this.sendTransaction(tx);
    } catch (error: any) {
      if (this.isGasError(error)) {
        // Retry with increased gas limit
        const estimatedGas = await this.config.provider.estimateGas({
          ...tx,
          from: this.config.wallet.address
        });

        tx.gasLimit = BigInt(
          Math.floor(Number(estimatedGas) * this.config.gasLimitMultiplier)
        );

        return await this.sendTransaction(tx);
      }
      throw error;
    }
  }

  async sendTransactionWithBalanceCheck(tx: TransactionRequest): Promise<ethers.TransactionResponse> {
    const balance = await this.config.wallet.getBalance();
    const gasPrice = await this.getGasPrice();
    const totalCost = await this.estimateTotalCost(tx, gasPrice);

    if (balance < totalCost) {
      throw new Error(`Insufficient balance: have ${balance}, need ${totalCost}`);
    }

    return await this.sendTransactionWithGasRetry(tx);
  }

  async getGasPrice(): Promise<GasPrice> {
    const block = await this.config.provider.getBlock('latest');

    if (block?.baseFeePerGas) {
      // EIP-1559 pricing
      const baseFee = block.baseFeePerGas;
      const priorityFee = BigInt(2000000000); // 2 gwei

      return {
        maxFeePerGas: baseFee * BigInt(2) + priorityFee,
        maxPriorityFeePerGas: priorityFee
      };
    } else {
      // Legacy pricing
      const gasPrice = await this.config.provider.getFeeData();
      return {
        gasPrice: gasPrice.gasPrice || BigInt(1000000000)
      };
    }
  }

  async getGasPriceWithMultiplier(multiplier: number): Promise<GasPrice> {
    const basePrice = await this.getGasPrice();

    if (basePrice.maxFeePerGas) {
      return {
        maxFeePerGas: BigInt(Math.floor(Number(basePrice.maxFeePerGas) * multiplier)),
        maxPriorityFeePerGas: BigInt(
          Math.floor(Number(basePrice.maxPriorityFeePerGas!) * multiplier)
        )
      };
    } else {
      return {
        gasPrice: BigInt(Math.floor(Number(basePrice.gasPrice!) * multiplier))
      };
    }
  }

  async waitForConfirmation(
    txHash: string,
    options: { confirmations?: number; timeout?: number } = {}
  ): Promise<ethers.TransactionReceipt> {
    const { confirmations = 1, timeout = 60000 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const receipt = await this.config.provider.getTransactionReceipt(txHash);

      if (receipt) {
        if (receipt.status === 0) {
          throw new Error('Transaction failed');
        }

        const currentBlock = await this.config.provider.getBlockNumber();
        if (currentBlock - receipt.blockNumber >= confirmations - 1) {
          return receipt;
        }
      }

      await this.sleep(3000);
    }

    throw new Error('Transaction confirmation timeout');
  }

  queueTransaction(tx: TransactionRequest): void {
    this.transactionQueue.push(tx);
  }

  getQueue(): TransactionRequest[] {
    return this.transactionQueue;
  }

  async processQueue(): Promise<QueueResult> {
    const successful: any[] = [];
    const failed: any[] = [];

    while (this.transactionQueue.length > 0) {
      const tx = this.transactionQueue.shift()!;

      try {
        const result = await this.sendTransaction(tx);
        successful.push(result);
      } catch (error: any) {
        failed.push({ tx, error: error.message });
      }
    }

    return { successful, failed };
  }

  async storeFailedTransaction(tx: FailedTransaction): Promise<void> {
    const dir = path.dirname(this.failedTransactionsPath);
    await fs.mkdir(dir, { recursive: true });

    let existing: FailedTransaction[] = [];
    try {
      const data = await fs.readFile(this.failedTransactionsPath, 'utf8');
      existing = JSON.parse(data);
    } catch {
      // File doesn't exist yet
    }

    existing.push(tx);
    await fs.writeFile(
      this.failedTransactionsPath,
      JSON.stringify(existing, null, 2)
    );
  }

  async getFailedTransactions(): Promise<FailedTransaction[]> {
    try {
      const data = await fs.readFile(this.failedTransactionsPath, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async retryFailedTransactions(): Promise<QueueResult> {
    const failed = await this.getFailedTransactions();
    const successful: any[] = [];
    const stillFailed: any[] = [];

    for (const tx of failed) {
      try {
        const result = await this.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: tx.value
        });
        successful.push(result);
      } catch (error: any) {
        stillFailed.push({ ...tx, error: error.message });
      }
    }

    // Update failed transactions file
    await fs.writeFile(
      this.failedTransactionsPath,
      JSON.stringify(stillFailed, null, 2)
    );

    return { successful, failed: stillFailed };
  }

  async cleanupExpiredTransactions(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    const failed = await this.getFailedTransactions();
    const now = Date.now();

    const active = failed.filter(tx => now - tx.timestamp < maxAge);

    await fs.writeFile(
      this.failedTransactionsPath,
      JSON.stringify(active, null, 2)
    );
  }

  async estimateTotalCost(tx: TransactionRequest, gasPrice: GasPrice): Promise<bigint> {
    const gasLimit = tx.gasLimit || BigInt(21000);
    const value = tx.value || BigInt(0);

    let gasCost: bigint;
    if (gasPrice.maxFeePerGas) {
      gasCost = gasLimit * gasPrice.maxFeePerGas;
    } else {
      gasCost = gasLimit * (gasPrice.gasPrice || BigInt(0));
    }

    return value + gasCost;
  }

  private async prepareTx(tx: TransactionRequest): Promise<any> {
    const prepared: any = { ...tx };

    if (!prepared.nonce && this.config.wallet.getNonce) {
      prepared.nonce = await this.config.wallet.getNonce('pending');
    }

    if (!prepared.gasLimit) {
      try {
        prepared.gasLimit = await this.config.provider.estimateGas({
          ...prepared,
          from: this.config.wallet.address
        });
      } catch {
        prepared.gasLimit = BigInt(100000);
      }
    }

    const gasPrice = await this.getGasPrice();
    Object.assign(prepared, gasPrice);

    return prepared;
  }

  private isNonceError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    return message.includes('nonce too low') || message.includes('nonce');
  }

  private isGasError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    return (
      message.includes('gas required exceeds') ||
      message.includes('gas limit') ||
      message.includes('out of gas')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}