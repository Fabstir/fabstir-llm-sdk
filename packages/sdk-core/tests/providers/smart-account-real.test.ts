import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import 'fake-indexeddb/auto';
import { SmartAccountProvider } from '../../src/providers/SmartAccountProvider';
import { ChainId } from '../../src/types/chain.types';
import { TransactionRequest } from '../../src/interfaces/IWalletProvider';

describe('SmartAccountProvider - Real Bundler Integration', () => {
  let provider: SmartAccountProvider;
  let mockBundlerClient: any;
  let mockBaseAccountSDK: any;

  beforeEach(() => {
    // Mock Base Account SDK with realistic responses
    mockBaseAccountSDK = {
      connect: vi.fn().mockResolvedValue({
        address: '0x1234567890123456789012345678901234567890',
        eoaAddress: '0x8D642988E3e7b6DB15b6058461d5563835b04bF6'
      }),
      disconnect: vi.fn(),
      getAddress: vi.fn().mockReturnValue('0x1234567890123456789012345678901234567890'),
      address: '0x1234567890123456789012345678901234567890',
      eoaAddress: '0x8D642988E3e7b6DB15b6058461d5563835b04bF6',
      isConnected: vi.fn().mockReturnValue(true)
    };

    // Mock bundler client with real-like responses
    mockBundlerClient = {
      sendUserOperation: vi.fn(),
      estimateUserOperationGas: vi.fn().mockResolvedValue({
        preVerificationGas: '100000',
        verificationGasLimit: '200000',
        callGasLimit: '300000'
      }),
      getUserOperationReceipt: vi.fn(),
      getSupportedEntryPoints: vi.fn()
    };

    // Mock fetch to prevent real network calls
    global.fetch = vi.fn().mockImplementation((url: string, options: any) => {
      const body = JSON.parse(options.body);

      if (body.method === 'eth_estimateUserOperationGas') {
        return Promise.resolve({
          json: () => Promise.resolve({
            result: {
              preVerificationGas: '100000',
              verificationGasLimit: '200000',
              callGasLimit: '300000'
            }
          })
        });
      }

      if (body.method === 'eth_sendUserOperation') {
        // Use the mock's implementation if set
        if (mockBundlerClient.sendUserOperation.mock.results.length > 0) {
          const result = mockBundlerClient.sendUserOperation.mock.results[0];
          if (result.type === 'return') {
            return Promise.resolve({
              json: () => Promise.resolve({ result: result.value })
            });
          } else if (result.type === 'throw') {
            return Promise.resolve({
              json: () => Promise.resolve({
                error: { message: result.value.message }
              })
            });
          }
        }
        return Promise.resolve({
          json: () => Promise.resolve({
            result: '0x' + 'a'.repeat(64)
          })
        });
      }

      if (body.method === 'eth_getUserOperationReceipt') {
        return Promise.resolve({
          json: () => Promise.resolve({
            result: { status: 'success' }
          })
        });
      }

      return Promise.reject(new Error('Unknown method'));
    });

    provider = new SmartAccountProvider({
      bundlerUrl: 'https://bundler.base.org',
      paymasterUrl: 'https://paymaster.base.org'
    });

    // Inject mocks
    (provider as any).baseAccountSDK = mockBaseAccountSDK;
    (provider as any).smartAccountAddress = '0x1234567890123456789012345678901234567890';
    (provider as any).connected = false; // Will be set to true on connect
  });

  describe('Transaction Handling', () => {
    it('should return real transaction hash from bundler', async () => {
      const realTxHash = '0x' + 'a'.repeat(64); // Real-looking hash
      mockBundlerClient.sendUserOperation.mockResolvedValue(realTxHash);

      await provider.connect(ChainId.BASE_SEPOLIA);

      const tx: TransactionRequest = {
        to: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        value: '0',
        data: '0xa9059cbb' // transfer function selector
      };

      const result = await provider.sendTransaction(tx);

      expect(result.hash).toBe(realTxHash);
      expect(result.hash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(result.hash).not.toBe('0x' + 'deed'.repeat(16)); // Not mock hash
    });

    it('should NOT return mock transaction hash', async () => {
      // Ensure mock hash is never returned
      const tx: TransactionRequest = {
        to: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        value: '1000000000000000', // 0.001 ETH
        data: '0x'
      };

      // Mock fetch to throw bundler error
      global.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        const body = JSON.parse(options.body);

        if (body.method === 'eth_estimateUserOperationGas') {
          return Promise.resolve({
            json: () => Promise.resolve({
              result: {
                preVerificationGas: '100000',
                verificationGasLimit: '200000',
                callGasLimit: '300000'
              }
            })
          });
        }

        if (body.method === 'eth_sendUserOperation') {
          return Promise.resolve({
            json: () => Promise.resolve({
              error: { message: 'Bundler unavailable' }
            })
          });
        }

        return Promise.reject(new Error('Unknown method'));
      });

      await provider.connect(ChainId.BASE_SEPOLIA);

      await expect(provider.sendTransaction(tx)).rejects.toThrow('Bundler unavailable');
    });

    it('should format UserOperation correctly', async () => {
      let capturedUserOp: any;

      // Mock fetch to capture UserOperation
      global.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        const body = JSON.parse(options.body);

        if (body.method === 'eth_estimateUserOperationGas') {
          return Promise.resolve({
            json: () => Promise.resolve({
              result: {
                preVerificationGas: '100000',
                verificationGasLimit: '200000',
                callGasLimit: '300000'
              }
            })
          });
        }

        if (body.method === 'eth_sendUserOperation') {
          capturedUserOp = body.params[0];
          return Promise.resolve({
            json: () => Promise.resolve({
              result: '0x' + 'b'.repeat(64)
            })
          });
        }

        return Promise.reject(new Error('Unknown method'));
      });

      await provider.connect(ChainId.BASE_SEPOLIA);

      const tx: TransactionRequest = {
        to: '0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944', // JobMarketplace
        value: '0',
        data: '0x12345678',
        gasLimit: '300000'
      };

      await provider.sendTransaction(tx);

      expect(capturedUserOp).toBeDefined();
      expect(capturedUserOp.sender).toBe('0x1234567890123456789012345678901234567890');
      expect(capturedUserOp.callData).toBeDefined();
      expect(capturedUserOp.callGasLimit).toBe('300000');
      expect(capturedUserOp.verificationGasLimit).toBe('200000');
      expect(capturedUserOp.preVerificationGas).toBe('100000');
    });

    it('should estimate gas correctly', async () => {
      mockBundlerClient.estimateUserOperationGas.mockResolvedValue({
        preVerificationGas: '100000',
        verificationGasLimit: '200000',
        callGasLimit: '300000'
      });

      await provider.connect(ChainId.BASE_SEPOLIA);

      const gasEstimate = await (provider as any).estimateGas({
        to: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        data: '0xa9059cbb'
      });

      expect(gasEstimate).toEqual({
        preVerificationGas: '100000',
        verificationGasLimit: '200000',
        callGasLimit: '300000'
      });
    });

    it('should retrieve transaction receipt', async () => {
      const txHash = '0x' + 'c'.repeat(64);
      const mockReceipt = {
        status: 'success',
        transactionHash: txHash,
        blockNumber: 123456,
        gasUsed: '150000'
      };

      // Mock fetch to return full receipt
      global.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        const body = JSON.parse(options.body);

        if (body.method === 'eth_getUserOperationReceipt') {
          return Promise.resolve({
            json: () => Promise.resolve({
              result: mockReceipt
            })
          });
        }

        return Promise.reject(new Error('Unknown method'));
      });

      await provider.connect(ChainId.BASE_SEPOLIA);

      const receipt = await (provider as any).getTransactionReceipt(txHash);

      expect(receipt).toEqual(mockReceipt);
      expect(receipt.transactionHash).toBe(txHash);
    });
  });

  describe('Error Handling', () => {
    it('should handle bundler connection errors', async () => {
      // Mock fetch to simulate connection error
      global.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        const body = JSON.parse(options.body);

        if (body.method === 'eth_estimateUserOperationGas') {
          return Promise.resolve({
            json: () => Promise.resolve({
              result: {
                preVerificationGas: '100000',
                verificationGasLimit: '200000',
                callGasLimit: '300000'
              }
            })
          });
        }

        if (body.method === 'eth_sendUserOperation') {
          return Promise.resolve({
            json: () => Promise.resolve({
              error: { message: 'Connection refused' }
            })
          });
        }

        return Promise.reject(new Error('Unknown method'));
      });

      await provider.connect(ChainId.BASE_SEPOLIA);

      await expect(
        provider.sendTransaction({
          to: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          value: '0',
          data: '0x'
        })
      ).rejects.toThrow('Connection refused');
    });

    it('should handle invalid UserOperation errors', async () => {
      // Mock fetch to simulate validation error
      global.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        const body = JSON.parse(options.body);

        if (body.method === 'eth_estimateUserOperationGas') {
          return Promise.resolve({
            json: () => Promise.resolve({
              result: {
                preVerificationGas: '100000',
                verificationGasLimit: '200000',
                callGasLimit: '300000'
              }
            })
          });
        }

        if (body.method === 'eth_sendUserOperation') {
          return Promise.resolve({
            json: () => Promise.resolve({
              error: { message: 'UserOperation validation failed: insufficient funds' }
            })
          });
        }

        return Promise.reject(new Error('Unknown method'));
      });

      await provider.connect(ChainId.BASE_SEPOLIA);

      await expect(
        provider.sendTransaction({
          to: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          value: '1000000000000000000',
          data: '0x'
        })
      ).rejects.toThrow('insufficient funds');
    });

    it('should validate transaction parameters', async () => {
      await provider.connect(ChainId.BASE_SEPOLIA);

      // Missing 'to' address
      await expect(
        provider.sendTransaction({ value: '0', data: '0x' } as any)
      ).rejects.toThrow();

      // Invalid address format
      await expect(
        provider.sendTransaction({ to: 'invalid', value: '0', data: '0x' })
      ).rejects.toThrow();
    });
  });

  describe('Bundler Response Validation', () => {
    it('should validate transaction hash format', async () => {
      // Mock fetch to return invalid hash
      global.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        const body = JSON.parse(options.body);

        if (body.method === 'eth_estimateUserOperationGas') {
          return Promise.resolve({
            json: () => Promise.resolve({
              result: {
                preVerificationGas: '100000',
                verificationGasLimit: '200000',
                callGasLimit: '300000'
              }
            })
          });
        }

        if (body.method === 'eth_sendUserOperation') {
          return Promise.resolve({
            json: () => Promise.resolve({
              result: 'invalid-hash' // Invalid format
            })
          });
        }

        return Promise.reject(new Error('Unknown method'));
      });

      await provider.connect(ChainId.BASE_SEPOLIA);

      await expect(
        provider.sendTransaction({
          to: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          value: '0',
          data: '0x'
        })
      ).rejects.toThrow('Invalid transaction hash');
    });

    it('should handle paymaster sponsorship', async () => {
      const sponsoredHash = '0x' + 'd'.repeat(64);
      let capturedUserOp: any;

      // Mock fetch to check paymaster data
      global.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        const body = JSON.parse(options.body);

        if (body.method === 'eth_estimateUserOperationGas') {
          return Promise.resolve({
            json: () => Promise.resolve({
              result: {
                preVerificationGas: '100000',
                verificationGasLimit: '200000',
                callGasLimit: '300000'
              }
            })
          });
        }

        if (body.method === 'eth_sendUserOperation') {
          capturedUserOp = body.params[0];
          return Promise.resolve({
            json: () => Promise.resolve({
              result: sponsoredHash
            })
          });
        }

        return Promise.reject(new Error('Unknown method'));
      });

      await provider.connect(ChainId.BASE_SEPOLIA);

      const result = await provider.sendTransaction({
        to: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        value: '0',
        data: '0xa9059cbb'
      });

      expect(capturedUserOp.paymasterAndData).toBeDefined();
      expect(result.hash).toBe(sponsoredHash);
    });

    it('should retry on transient failures', async () => {
      let attempts = 0;

      // Mock fetch to simulate network timeouts
      global.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        const body = JSON.parse(options.body);

        if (body.method === 'eth_estimateUserOperationGas') {
          return Promise.resolve({
            json: () => Promise.resolve({
              result: {
                preVerificationGas: '100000',
                verificationGasLimit: '200000',
                callGasLimit: '300000'
              }
            })
          });
        }

        if (body.method === 'eth_sendUserOperation') {
          attempts++;
          if (attempts < 3) {
            return Promise.resolve({
              json: () => Promise.resolve({
                error: { message: 'Network timeout' }
              })
            });
          }
          return Promise.resolve({
            json: () => Promise.resolve({
              result: '0x' + 'e'.repeat(64)
            })
          });
        }

        return Promise.reject(new Error('Unknown method'));
      });

      await provider.connect(ChainId.BASE_SEPOLIA);

      const result = await provider.sendTransaction({
        to: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        value: '0',
        data: '0x'
      });

      expect(attempts).toBe(3);
      expect(result.hash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });
});