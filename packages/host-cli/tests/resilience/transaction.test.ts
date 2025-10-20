// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TransactionRetry } from '../../src/resilience/retry';
import { ethers } from 'ethers';

vi.mock('@fabstir/sdk-core');
vi.mock('fs/promises');

describe('Transaction Retry Logic', () => {
  let transactionRetry: TransactionRetry;
  let mockProvider: any;
  let mockWallet: any;
  let mockContract: any;
  let mockFs: any;

  beforeEach(async () => {
    mockFs = await import('fs/promises');
    vi.mocked(mockFs.readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(mockFs.writeFile).mockResolvedValue(undefined);
    vi.mocked(mockFs.mkdir).mockResolvedValue(undefined);
    mockProvider = {
      getGasPrice: vi.fn().mockResolvedValue(BigInt(1000000000)),
      getTransactionReceipt: vi.fn(),
      getBlock: vi.fn().mockResolvedValue({ baseFeePerGas: BigInt(1000000000) }),
      waitForTransaction: vi.fn(),
      estimateGas: vi.fn().mockResolvedValue(BigInt(21000)),
      getBlockNumber: vi.fn().mockResolvedValue(12345),
      getFeeData: vi.fn().mockResolvedValue({
        gasPrice: BigInt(1000000000),
        maxFeePerGas: BigInt(2000000000),
        maxPriorityFeePerGas: BigInt(1000000000)
      })
    };

    mockWallet = {
      address: '0x1234567890123456789012345678901234567890',
      sendTransaction: vi.fn(),
      getBalance: vi.fn().mockResolvedValue(BigInt(10) ** BigInt(18)),
      getNonce: vi.fn().mockResolvedValue(0),
      getTransactionCount: vi.fn().mockResolvedValue(0)
    };

    mockContract = {
      interface: {
        encodeFunctionData: vi.fn().mockReturnValue('0xabcdef'),
        decodeFunctionResult: vi.fn()
      },
      address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    };

    transactionRetry = new TransactionRetry({
      provider: mockProvider,
      wallet: mockWallet,
      maxRetries: 3,
      gasLimitMultiplier: 1.2,
      gasPriceMultiplier: 1.1
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('transaction submission', () => {
    it('should submit transaction successfully', async () => {
      const mockTx = {
        hash: '0x123abc',
        wait: vi.fn().mockResolvedValue({ status: 1 })
      };

      mockWallet.sendTransaction.mockResolvedValue(mockTx);

      const result = await transactionRetry.sendTransaction({
        to: mockContract.address,
        data: '0xabcdef',
        value: BigInt(0)
      });

      expect(result.hash).toBe('0x123abc');
      expect(mockWallet.sendTransaction).toHaveBeenCalledOnce();
    });

    it('should retry on nonce errors', async () => {
      const nonceError = new Error('nonce too low');
      const mockTx = {
        hash: '0x456def',
        wait: vi.fn().mockResolvedValue({ status: 1 })
      };

      mockWallet.sendTransaction
        .mockRejectedValueOnce(nonceError)
        .mockResolvedValueOnce(mockTx);

      const result = await transactionRetry.sendTransaction({
        to: mockContract.address,
        data: '0xabcdef'
      });

      expect(result.hash).toBe('0x456def');
      expect(mockWallet.sendTransaction).toHaveBeenCalledTimes(2);
    });

    it('should handle gas estimation failures', async () => {
      const gasError = new Error('gas required exceeds allowance');
      const mockTx = {
        hash: '0x789ghi',
        wait: vi.fn().mockResolvedValue({ status: 1 })
      };

      mockWallet.sendTransaction
        .mockRejectedValueOnce(gasError)
        .mockResolvedValueOnce(mockTx);

      const result = await transactionRetry.sendTransactionWithGasRetry({
        to: mockContract.address,
        data: '0xabcdef'
      });

      expect(result.hash).toBe('0x789ghi');
      // Should have increased gas limit
      expect(mockWallet.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          gasLimit: expect.any(BigInt)
        })
      );
    });
  });

  describe('gas price strategies', () => {
    it('should use EIP-1559 pricing when available', async () => {
      const result = await transactionRetry.getGasPrice();

      expect(result).toHaveProperty('maxFeePerGas');
      expect(result).toHaveProperty('maxPriorityFeePerGas');
      expect(mockProvider.getBlock).toHaveBeenCalled();
    });

    it('should fall back to legacy gas price', async () => {
      mockProvider.getBlock.mockResolvedValue({ baseFeePerGas: null });

      const result = await transactionRetry.getGasPrice();

      expect(result).toHaveProperty('gasPrice');
      expect(mockProvider.getFeeData).toHaveBeenCalled();
    });

    it('should apply gas price multiplier on retry', async () => {
      const initialGasPrice = await transactionRetry.getGasPrice();
      const retryGasPrice = await transactionRetry.getGasPriceWithMultiplier(1.5);

      if ('maxFeePerGas' in retryGasPrice) {
        expect(Number(retryGasPrice.maxFeePerGas)).toBeGreaterThan(
          Number(initialGasPrice.maxFeePerGas!)
        );
      } else {
        expect(Number(retryGasPrice.gasPrice)).toBeGreaterThan(
          Number(initialGasPrice.gasPrice!)
        );
      }
    });
  });

  describe('transaction monitoring', () => {
    it('should wait for confirmation', async () => {
      vi.useFakeTimers();

      const mockReceipt = {
        status: 1,
        blockNumber: 12345,
        transactionHash: '0xabc123'
      };

      mockProvider.getTransactionReceipt
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockReceipt);

      const promise = transactionRetry.waitForConfirmation(
        '0xabc123',
        { confirmations: 1, timeout: 30000 }
      );

      // Advance timers to process the polling
      await vi.advanceTimersByTimeAsync(3000);
      await vi.advanceTimersByTimeAsync(3000);
      await vi.advanceTimersByTimeAsync(3000);

      const result = await promise;

      expect(result).toEqual(mockReceipt);
      expect(mockProvider.getTransactionReceipt).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it('should timeout waiting for confirmation', async () => {
      mockProvider.getTransactionReceipt.mockResolvedValue(null);

      await expect(
        transactionRetry.waitForConfirmation('0xabc123', {
          confirmations: 1,
          timeout: 500
        })
      ).rejects.toThrow('Transaction confirmation timeout');
    });

    it('should detect failed transactions', async () => {
      const mockReceipt = {
        status: 0,
        blockNumber: 12345,
        transactionHash: '0xabc123'
      };

      mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt);

      await expect(
        transactionRetry.waitForConfirmation('0xabc123')
      ).rejects.toThrow('Transaction failed');
    });
  });

  describe('transaction queue', () => {
    it('should queue transactions', async () => {
      const tx1 = { to: '0x111', data: '0x1', value: BigInt(0) };
      const tx2 = { to: '0x222', data: '0x2', value: BigInt(0) };
      const tx3 = { to: '0x333', data: '0x3', value: BigInt(0) };

      transactionRetry.queueTransaction(tx1);
      transactionRetry.queueTransaction(tx2);
      transactionRetry.queueTransaction(tx3);

      const queue = transactionRetry.getQueue();
      expect(queue.length).toBe(3);
    });

    it('should process queue in order', async () => {
      const sentTransactions: string[] = [];

      mockWallet.sendTransaction.mockImplementation(async (tx: any) => {
        sentTransactions.push(tx.data);
        return {
          hash: `0x${tx.data}`,
          wait: vi.fn().mockResolvedValue({ status: 1 })
        };
      });

      transactionRetry.queueTransaction({ to: '0x111', data: '0x1' });
      transactionRetry.queueTransaction({ to: '0x222', data: '0x2' });

      await transactionRetry.processQueue();

      expect(sentTransactions).toEqual(['0x1', '0x2']);
    });

    it('should handle queue processing failures', async () => {
      // First transaction will fail 4 times (initial + 3 retries)
      mockWallet.sendTransaction
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({
          hash: '0x123',
          wait: vi.fn().mockResolvedValue({ status: 1 })
        });

      transactionRetry.queueTransaction({ to: '0x111', data: '0x1' });
      transactionRetry.queueTransaction({ to: '0x222', data: '0x2' });

      const results = await transactionRetry.processQueue();

      expect(results.failed.length).toBe(1);
      expect(results.successful.length).toBe(1);
    });
  });

  describe('failed transaction storage', () => {
    it('should store failed transactions', async () => {
      const failedTx = {
        to: '0x111',
        data: '0xfailed',
        error: 'Insufficient funds',
        timestamp: Date.now()
      };

      // Mock the stored data after write
      let storedData: any[] = [];
      vi.mocked(mockFs.writeFile).mockImplementation(async (path: string, data: string) => {
        storedData = JSON.parse(data);
      });
      vi.mocked(mockFs.readFile).mockImplementation(async () => {
        return JSON.stringify(storedData);
      });

      await transactionRetry.storeFailedTransaction(failedTx);

      const stored = await transactionRetry.getFailedTransactions();
      expect(stored.length).toBe(1);
      expect(stored[0].data).toBe('0xfailed');
    });

    it('should retry failed transactions', async () => {
      const failedTx = {
        to: '0x111',
        data: '0xretry',
        error: 'Network error',
        timestamp: Date.now() - 60000
      };

      // Mock the stored data
      let storedData = [failedTx];
      vi.mocked(mockFs.writeFile).mockImplementation(async (path: string, data: string) => {
        storedData = JSON.parse(data);
      });
      vi.mocked(mockFs.readFile).mockImplementation(async () => {
        return JSON.stringify(storedData);
      });

      mockWallet.sendTransaction.mockResolvedValue({
        hash: '0xsuccess',
        wait: vi.fn().mockResolvedValue({ status: 1 })
      });

      const results = await transactionRetry.retryFailedTransactions();

      expect(results.successful.length).toBe(1);
      expect(results.successful[0].hash).toBe('0xsuccess');

      // Check that failed transactions were cleared
      expect(storedData.length).toBe(0);
    });

    it('should expire old failed transactions', async () => {
      const oldTx = {
        to: '0x111',
        data: '0xold',
        error: 'Failed',
        timestamp: Date.now() - 86400000 * 8 // 8 days old
      };

      const recentTx = {
        to: '0x222',
        data: '0xrecent',
        error: 'Failed',
        timestamp: Date.now() - 3600000 // 1 hour old
      };

      // Mock the stored data with both transactions
      let storedData = [oldTx, recentTx];
      vi.mocked(mockFs.writeFile).mockImplementation(async (path: string, data: string) => {
        storedData = JSON.parse(data);
      });
      vi.mocked(mockFs.readFile).mockImplementation(async () => {
        return JSON.stringify(storedData);
      });

      await transactionRetry.cleanupExpiredTransactions();

      // Check that only recent transaction remains
      expect(storedData.length).toBe(1);
      expect(storedData[0].data).toBe('0xrecent');
    });
  });

  describe('balance monitoring', () => {
    it('should check balance before transaction', async () => {
      const txCost = BigInt(10) ** BigInt(17); // 0.1 ETH
      mockWallet.getBalance.mockResolvedValue(BigInt(10) ** BigInt(16)); // 0.01 ETH

      await expect(
        transactionRetry.sendTransactionWithBalanceCheck({
          to: '0x111',
          value: txCost
        })
      ).rejects.toThrow('Insufficient balance');
    });

    it('should estimate total transaction cost', async () => {
      const tx = {
        to: '0x111',
        value: BigInt(10) ** BigInt(17),
        gasLimit: BigInt(21000)
      };

      const gasPrice = await transactionRetry.getGasPrice();
      const totalCost = await transactionRetry.estimateTotalCost(tx, gasPrice);

      expect(totalCost).toBeGreaterThan(tx.value);
    });
  });
});