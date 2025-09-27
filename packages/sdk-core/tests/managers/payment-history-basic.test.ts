import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { PaymentManager } from '../../src/managers/PaymentManager';
import { ContractManager } from '../../src/contracts/ContractManager';
import { SessionJobManager } from '../../src/contracts/SessionJobManager';

describe('PaymentManager - Payment History Basic', () => {
  it('should have getPaymentHistory method', () => {
    const mockContractManager = {
      getJobMarketplace: () => ({
        filters: {
          SessionJobCreated: () => ({}),
          SessionCompleted: () => ({}),
          DepositReceived: () => ({}),
          WithdrawalProcessed: () => ({})
        },
        queryFilter: async () => [],
        runner: { provider: {} }
      })
    } as any;

    const paymentManager = new PaymentManager(mockContractManager);

    expect(paymentManager.getPaymentHistory).toBeDefined();
    expect(typeof paymentManager.getPaymentHistory).toBe('function');
  });

  it('should validate address parameter', async () => {
    const mockContractManager = {
      getJobMarketplace: () => ({}),
      setSigner: async () => {}
    } as any;

    const paymentManager = new PaymentManager(mockContractManager);
    // Initialize with mock signer
    const mockSigner = { getAddress: async () => '0x1234567890123456789012345678901234567890' } as any;
    await paymentManager.initialize(mockSigner);

    const invalidAddress = 'not-an-address';

    await expect(
      paymentManager.getPaymentHistory(invalidAddress)
    ).rejects.toThrow('Invalid address');
  });

  it('should return empty array for valid address with no history', async () => {
    const mockContractManager = {
      setSigner: async () => {},
      getJobMarketplace: () => ({
        filters: {
          SessionJobCreated: () => ({}),
          SessionCompleted: () => ({}),
          DepositReceived: () => ({}),
          WithdrawalProcessed: () => ({})
        },
        queryFilter: async () => [],
        runner: {
          provider: {
            getBlockNumber: async () => 1000,
            getBlock: async () => ({ timestamp: Date.now() })
          }
        }
      })
    } as any;

    const paymentManager = new PaymentManager(mockContractManager);
    const mockSigner = { getAddress: async () => '0x1234567890123456789012345678901234567890' } as any;
    await paymentManager.initialize(mockSigner);

    const randomAddress = ethers.Wallet.createRandom().address;
    const history = await paymentManager.getPaymentHistory(randomAddress, 10, {
      fromBlock: 900,
      toBlock: 1000
    });

    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBe(0);
  });

  it('should parse SessionJobCreated events correctly', async () => {
    const mockEvent = {
      args: {
        jobId: BigInt(123),
        requester: '0x1234567890123456789012345678901234567890',  // SessionJobCreated uses 'requester'
        host: '0xabcdef1234567890123456789012345678901234',
        deposit: BigInt('1000000000000000000')
        // Note: paymentToken is not part of the SessionJobCreated event
      },
      transactionHash: '0xdeadbeef',
      blockNumber: 999,
      getBlock: async () => ({ timestamp: 1234567890 })
    };

    let queryCount = 0;
    const mockContractManager = {
      setSigner: async () => {},
      getJobMarketplace: () => ({
        filters: {
          SessionJobCreated: () => ({ type: 'SessionJobCreated' }),
          SessionCompleted: () => ({ type: 'SessionCompleted' }),
          DepositReceived: () => ({ type: 'DepositReceived' }),
          WithdrawalProcessed: () => ({ type: 'WithdrawalProcessed' })
        },
        queryFilter: async function(filter: any, fromBlock: any, toBlock: any) {
          // Only return the event for the first SessionJobCreated query
          queryCount++;
          if (filter.type === 'SessionJobCreated' && queryCount === 1 && fromBlock === 990) {
            return [mockEvent];
          }
          return [];
        },
        runner: {
          provider: {
            getBlockNumber: async () => 1000,
            getBlock: async () => ({ timestamp: Date.now() })
          }
        }
      })
    } as any;

    const paymentManager = new PaymentManager(mockContractManager);
    const mockSigner = { getAddress: async () => '0x1234567890123456789012345678901234567890' } as any;
    await paymentManager.initialize(mockSigner);

    const history = await paymentManager.getPaymentHistory(
      '0x1234567890123456789012345678901234567890',
      10,
      {
        fromBlock: 990,
        toBlock: 1000
      }
    );

    expect(history.length).toBe(1);
    expect(history[0].type).toBe('SessionJobCreated');
    expect(history[0].jobId).toBe('123');
    expect(history[0].user).toBe('0x1234567890123456789012345678901234567890');
    expect(history[0].host).toBe('0xabcdef1234567890123456789012345678901234');
    expect(history[0].deposit).toBe('1000000000000000000');
    // paymentToken might be undefined as it's not in the event
    expect(history[0].transactionHash).toBe('0xdeadbeef');
    expect(history[0].blockNumber).toBe(999);
    expect(history[0].timestamp).toBe(1234567890);
  });
});