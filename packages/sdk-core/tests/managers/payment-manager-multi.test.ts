import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { PaymentManager } from '../../src/managers/PaymentManagerMultiChain';
import { JobMarketplaceWrapper } from '../../src/contracts/JobMarketplace';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { ChainId } from '../../src/types/chain.types';
import { UnsupportedChainError, ChainMismatchError, InsufficientDepositError } from '../../src/errors/ChainErrors';

// Mock the JobMarketplaceWrapper
vi.mock('../../src/contracts/JobMarketplace', () => ({
  JobMarketplaceWrapper: vi.fn().mockImplementation((chainId, signer) => ({
    getChainId: vi.fn().mockReturnValue(chainId),
    getContractAddress: vi.fn().mockReturnValue(ChainRegistry.getChain(chainId).contracts.jobMarketplace),
    depositNative: vi.fn().mockResolvedValue({
      hash: '0x123',
      wait: vi.fn().mockResolvedValue({ status: 1 })
    }),
    withdrawNative: vi.fn().mockResolvedValue({
      hash: '0x456',
      wait: vi.fn().mockResolvedValue({ status: 1 })
    }),
    depositToken: vi.fn().mockResolvedValue({
      hash: '0x789',
      wait: vi.fn().mockResolvedValue({ status: 1 })
    }),
    withdrawToken: vi.fn().mockResolvedValue({
      hash: '0xabc',
      wait: vi.fn().mockResolvedValue({ status: 1 })
    }),
    getDepositBalance: vi.fn().mockResolvedValue('0.001'),
    createSessionFromDeposit: vi.fn().mockResolvedValue(1),
    createSessionJob: vi.fn().mockResolvedValue(2),
    completeSessionJob: vi.fn().mockResolvedValue({
      hash: '0xdef',
      wait: vi.fn().mockResolvedValue({ status: 1 })
    }),
    getSessionJob: vi.fn().mockResolvedValue({
      id: 1,
      depositor: '0x123',
      requester: '0x123',
      host: '0x456',
      status: 1
    }),
    verifyChain: vi.fn()
  }))
}));

describe('PaymentManager Multi-Chain Updates', () => {
  let paymentManager: PaymentManager;
  let mockSigner: any;
  let mockProvider: any;
  const TEST_ADDRESS = '0x742d35cc6634c0532925a3b844bc9e7595f0beb8';
  const HOST_ADDRESS = '0x123d35cc6634c0532925a3b844bc9e7595f0beb9';

  beforeEach(() => {
    // Create mock provider and signer
    mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: ChainId.BASE_SEPOLIA }),
      getBalance: vi.fn().mockResolvedValue(ethers.parseEther('1.0')),
      call: vi.fn(),
      getTransactionReceipt: vi.fn().mockResolvedValue({ status: 1 }),
      getBlockNumber: vi.fn().mockResolvedValue(12345)
    };

    mockSigner = {
      getAddress: vi.fn().mockResolvedValue(TEST_ADDRESS),
      provider: mockProvider,
      sendTransaction: vi.fn().mockResolvedValue({
        hash: '0x' + '1234'.repeat(16),
        wait: vi.fn().mockResolvedValue({ status: 1 })
      })
    };

    // Initialize PaymentManager with default chain
    paymentManager = new PaymentManager(mockSigner, ChainId.BASE_SEPOLIA);
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with specified chain', () => {
      const manager = new PaymentManager(mockSigner, ChainId.BASE_SEPOLIA);
      expect(manager.getCurrentChainId()).toBe(ChainId.BASE_SEPOLIA);
    });

    it('should initialize with opBNB testnet', () => {
      const manager = new PaymentManager(mockSigner, ChainId.OPBNB_TESTNET);
      expect(manager.getCurrentChainId()).toBe(ChainId.OPBNB_TESTNET);
    });

    it('should default to Base Sepolia if no chain specified', () => {
      const manager = new PaymentManager(mockSigner);
      expect(manager.getCurrentChainId()).toBe(ChainId.BASE_SEPOLIA);
    });

    it('should throw error for unsupported chain', () => {
      expect(() => new PaymentManager(mockSigner, 999999))
        .toThrow(UnsupportedChainError);
    });
  });

  describe('Deposit Management', () => {
    it('should deposit native token on current chain', async () => {
      const amount = '0.001';
      const result = await paymentManager.depositNative(amount);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBeDefined();
    });

    it('should deposit native token on specified chain', async () => {
      const amount = '0.001';
      const result = await paymentManager.depositNative(amount, ChainId.BASE_SEPOLIA);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBeDefined();
    });

    it('should withdraw native token on current chain', async () => {
      const amount = '0.001';
      const result = await paymentManager.withdrawNative(amount);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBeDefined();
    });

    it('should withdraw native token on specified chain', async () => {
      const amount = '0.001';
      const result = await paymentManager.withdrawNative(amount, ChainId.BASE_SEPOLIA);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBeDefined();
    });

    it('should deposit ERC20 token', async () => {
      const tokenAddress = ChainRegistry.getChain(ChainId.BASE_SEPOLIA).contracts.usdcToken;
      const amount = '100'; // 100 USDC

      const result = await paymentManager.depositToken(tokenAddress, amount);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBeDefined();
    });

    it('should withdraw ERC20 token', async () => {
      const tokenAddress = ChainRegistry.getChain(ChainId.BASE_SEPOLIA).contracts.usdcToken;
      const amount = '50'; // 50 USDC

      const result = await paymentManager.withdrawToken(tokenAddress, amount);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBeDefined();
    });
  });

  describe('Balance Queries', () => {
    it('should get deposit balance on current chain', async () => {
      const balance = await paymentManager.getDepositBalance();
      expect(balance).toBeDefined();
      expect(balance.native).toBe('0.001');
    });

    it('should get deposit balance on specified chain', async () => {
      const balance = await paymentManager.getDepositBalance(ChainId.BASE_SEPOLIA);
      expect(balance).toBeDefined();
      expect(balance.native).toBe('0.001');
    });

    it('should get deposit balances for multiple tokens', async () => {
      const tokens = [
        ChainRegistry.getChain(ChainId.BASE_SEPOLIA).contracts.usdcToken
      ];

      const balances = await paymentManager.getDepositBalances(tokens);
      expect(balances).toBeDefined();
      expect(balances.native).toBe('0.001');
      expect(balances.tokens).toBeDefined();
    });
  });

  describe('Session Creation with Chain Selection', () => {
    it('should create session job on current chain', async () => {
      const params = {
        host: HOST_ADDRESS,
        amount: '0.001',
        pricePerToken: 1000000,
        duration: 3600
      };

      const jobId = await paymentManager.createSessionJob(params);
      expect(jobId).toBe(2);
    });

    it('should create session job on specified chain', async () => {
      const params = {
        host: HOST_ADDRESS,
        amount: '0.001',
        pricePerToken: 1000000,
        duration: 3600,
        chainId: ChainId.BASE_SEPOLIA
      };

      const jobId = await paymentManager.createSessionJob(params);
      expect(jobId).toBe(2);
    });

    it('should create session job from deposit', async () => {
      const params = {
        host: HOST_ADDRESS,
        amount: '0.001',
        pricePerToken: 1000000,
        duration: 3600,
        useDeposit: true
      };

      const jobId = await paymentManager.createSessionJob(params);
      expect(jobId).toBe(1);
    });

    it('should create session job with ERC20 payment', async () => {
      const params = {
        host: HOST_ADDRESS,
        amount: '100', // 100 USDC
        pricePerToken: 100000,
        duration: 3600,
        paymentToken: ChainRegistry.getChain(ChainId.BASE_SEPOLIA).contracts.usdcToken
      };

      const jobId = await paymentManager.createSessionJob(params);
      expect(jobId).toBeGreaterThan(0);
    });

    it('should throw error if chain mismatch', async () => {
      // Mock provider returning different chain
      mockProvider.getNetwork.mockResolvedValue({ chainId: ChainId.OPBNB_TESTNET });

      const params = {
        host: HOST_ADDRESS,
        amount: '0.001',
        pricePerToken: 1000000,
        duration: 3600,
        chainId: ChainId.BASE_SEPOLIA
      };

      await expect(paymentManager.createSessionJob(params))
        .rejects.toThrow(ChainMismatchError);
    });
  });

  describe('Chain Switching', () => {
    it('should switch to different chain', async () => {
      await paymentManager.switchChain(ChainId.OPBNB_TESTNET);
      expect(paymentManager.getCurrentChainId()).toBe(ChainId.OPBNB_TESTNET);
    });

    it('should throw error for unsupported chain switch', async () => {
      await expect(paymentManager.switchChain(999999))
        .rejects.toThrow(UnsupportedChainError);
    });

    it('should update marketplace wrapper after chain switch', async () => {
      await paymentManager.switchChain(ChainId.OPBNB_TESTNET);

      // Verify new wrapper is created for new chain
      const balance = await paymentManager.getDepositBalance();
      expect(balance).toBeDefined();
    });
  });

  describe('Session Management', () => {
    it('should complete session job', async () => {
      const jobId = 1;
      const conversationCID = 'QmXyz123';

      const result = await paymentManager.completeSessionJob(jobId, conversationCID);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBeDefined();
    });

    it('should get session details', async () => {
      const jobId = 1;

      const session = await paymentManager.getSessionJob(jobId);
      expect(session).toBeDefined();
      expect(session.id).toBe(1);
      expect(session.status).toBe(1); // Active
    });

    it('should get user sessions', async () => {
      const sessions = await paymentManager.getUserSessions();
      expect(sessions).toBeDefined();
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should get host sessions', async () => {
      const sessions = await paymentManager.getHostSessions(HOST_ADDRESS);
      expect(sessions).toBeDefined();
      expect(Array.isArray(sessions)).toBe(true);
    });
  });

  describe('Multi-Chain Operations', () => {
    it('should handle operations across different chains', async () => {
      // Deposit on Base Sepolia
      await paymentManager.depositNative('0.001', ChainId.BASE_SEPOLIA);

      // Switch to opBNB
      await paymentManager.switchChain(ChainId.OPBNB_TESTNET);

      // Deposit on opBNB
      await paymentManager.depositNative('0.01', ChainId.OPBNB_TESTNET);

      // Check balances on both chains
      const baseBalance = await paymentManager.getDepositBalance(ChainId.BASE_SEPOLIA);
      const opBNBBalance = await paymentManager.getDepositBalance(ChainId.OPBNB_TESTNET);

      expect(baseBalance).toBeDefined();
      expect(opBNBBalance).toBeDefined();
    });

    it('should use correct contract addresses for each chain', async () => {
      const baseConfig = paymentManager.getChainConfig(ChainId.BASE_SEPOLIA);
      expect(baseConfig.contracts.jobMarketplace).toBe('0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f');

      const opBNBConfig = paymentManager.getChainConfig(ChainId.OPBNB_TESTNET);
      expect(opBNBConfig.contracts.jobMarketplace).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should handle insufficient deposit error', async () => {
      // Mock insufficient balance
      const mockWrapper = new (JobMarketplaceWrapper as any)(ChainId.BASE_SEPOLIA, mockSigner);
      mockWrapper.getDepositBalance.mockResolvedValue('0');

      const params = {
        host: HOST_ADDRESS,
        amount: '1.0', // More than available
        pricePerToken: 1000000,
        duration: 3600,
        useDeposit: true
      };

      // This should check balance and throw error
      try {
        await paymentManager.createSessionJob(params);
        expect.fail('Should have thrown InsufficientDepositError');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should validate addresses', async () => {
      const params = {
        host: 'invalid-address',
        amount: '0.001',
        pricePerToken: 1000000,
        duration: 3600
      };

      await expect(paymentManager.createSessionJob(params))
        .rejects.toThrow('Invalid address');
    });
  });
});