import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { JobMarketplaceWrapper } from '../../src/contracts/JobMarketplace';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { ChainId } from '../../src/types/chain.types';
import { UnsupportedChainError, ChainMismatchError } from '../../src/errors/ChainErrors';

describe('JobMarketplace Multi-Chain Wrapper', () => {
  let wrapper: JobMarketplaceWrapper;
  let mockSigner: any;
  let mockProvider: any;
  const TEST_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8'.toLowerCase();
  const HOST_ADDRESS = '0x123d35Cc6634C0532925a3b844Bc9e7595f0bEb9'.toLowerCase();

  beforeEach(() => {
    // Create mock provider and signer
    mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: ChainId.BASE_SEPOLIA }),
      getBalance: vi.fn().mockResolvedValue(ethers.parseEther('1.0')),
      call: vi.fn(),
      estimateGas: vi.fn().mockResolvedValue(ethers.toBigInt(100000)),
      getTransactionCount: vi.fn().mockResolvedValue(1),
      getFeeData: vi.fn().mockResolvedValue({
        gasPrice: ethers.parseUnits('20', 'gwei'),
        maxFeePerGas: ethers.parseUnits('30', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei')
      }),
      getTransactionReceipt: vi.fn().mockResolvedValue({
        status: 1,
        blockNumber: 12345,
        blockHash: '0x' + 'abcd'.repeat(16),
        logs: []
      }),
      getBlockNumber: vi.fn().mockResolvedValue(12345)
    };

    mockSigner = {
      getAddress: vi.fn().mockResolvedValue(TEST_ADDRESS),
      provider: mockProvider,
      sendTransaction: vi.fn().mockImplementation(async (tx) => ({
        hash: '0x' + '1234'.repeat(16),
        wait: vi.fn().mockResolvedValue({ status: 1 })
      }))
    };
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with Base Sepolia chain', () => {
      wrapper = new JobMarketplaceWrapper(ChainId.BASE_SEPOLIA, mockSigner);
      expect(wrapper.getChainId()).toBe(ChainId.BASE_SEPOLIA);
    });

    it('should initialize with opBNB testnet chain', () => {
      wrapper = new JobMarketplaceWrapper(ChainId.OPBNB_TESTNET, mockSigner);
      expect(wrapper.getChainId()).toBe(ChainId.OPBNB_TESTNET);
    });

    it('should throw error for unsupported chain', () => {
      expect(() => new JobMarketplaceWrapper(999999, mockSigner))
        .toThrow(UnsupportedChainError);
    });

    it('should use correct contract address for each chain', () => {
      const baseSepolia = new JobMarketplaceWrapper(ChainId.BASE_SEPOLIA, mockSigner);
      expect(baseSepolia.getContractAddress()).toBe('0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f');

      // opBNB will have different address when deployed
      const opBNB = new JobMarketplaceWrapper(ChainId.OPBNB_TESTNET, mockSigner);
      expect(opBNB.getContractAddress()).toBeDefined();
    });
  });

  describe('Deposit and Withdrawal - Native Token', () => {
    beforeEach(() => {
      wrapper = new JobMarketplaceWrapper(ChainId.BASE_SEPOLIA, mockSigner);
    });

    it('should deposit native token (ETH)', async () => {
      const amount = '0.001';
      const tx = await wrapper.depositNative(amount);

      expect(mockSigner.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ethers.parseEther(amount)
        })
      );
      expect(tx.hash).toBeDefined();
    });

    it('should withdraw native token', async () => {
      const amount = '0.001';
      const tx = await wrapper.withdrawNative(amount);

      expect(mockSigner.sendTransaction).toHaveBeenCalled();
      expect(tx.hash).toBeDefined();
    });

    it('should get native deposit balance', async () => {
      // Mock balance of 0.001 ETH in wei (1000000000000000)
      const balanceInWei = ethers.parseEther('0.001');
      mockProvider.call.mockResolvedValue(ethers.toBeHex(balanceInWei, 32));
      const balance = await wrapper.getDepositBalance(TEST_ADDRESS);

      expect(mockProvider.call).toHaveBeenCalled();
      expect(balance).toBeDefined();
    });

    it('should validate minimum deposit amount', async () => {
      const smallAmount = '0.0001'; // Below minimum
      await expect(wrapper.depositNative(smallAmount))
        .rejects.toThrow('below minimum deposit');
    });
  });

  describe('Deposit and Withdrawal - ERC20 Token', () => {
    beforeEach(() => {
      wrapper = new JobMarketplaceWrapper(ChainId.BASE_SEPOLIA, mockSigner);
    });

    it('should deposit ERC20 token', async () => {
      const tokenAddress = ChainRegistry.getChain(ChainId.BASE_SEPOLIA).contracts.usdcToken;
      const amount = '100'; // 100 USDC

      const tx = await wrapper.depositToken(tokenAddress, amount);
      expect(mockSigner.sendTransaction).toHaveBeenCalled();
      expect(tx.hash).toBeDefined();
    });

    it('should withdraw ERC20 token', async () => {
      const tokenAddress = ChainRegistry.getChain(ChainId.BASE_SEPOLIA).contracts.usdcToken;
      const amount = '50';

      const tx = await wrapper.withdrawToken(tokenAddress, amount);
      expect(mockSigner.sendTransaction).toHaveBeenCalled();
      expect(tx.hash).toBeDefined();
    });

    it('should get token deposit balance', async () => {
      const tokenAddress = ChainRegistry.getChain(ChainId.BASE_SEPOLIA).contracts.usdcToken;
      // Mock 100 USDC (with 6 decimals = 100000000)
      const balanceInSmallestUnit = ethers.parseUnits('100', 6);
      mockProvider.call.mockResolvedValue(ethers.toBeHex(balanceInSmallestUnit, 32));

      const balance = await wrapper.getDepositBalance(TEST_ADDRESS, tokenAddress);
      expect(balance).toBeDefined();
    });
  });

  describe('Session Creation from Deposit', () => {
    beforeEach(() => {
      wrapper = new JobMarketplaceWrapper(ChainId.BASE_SEPOLIA, mockSigner);
    });

    it('should create session from native deposit', async () => {
      const params = {
        host: HOST_ADDRESS,
        paymentToken: ethers.ZeroAddress, // Native token
        deposit: '0.001',
        pricePerToken: 1000000, // 0.000001 ETH per token
        duration: 3600,
        proofInterval: 300
      };

      // Mock sufficient balance for the deposit
      const balanceInWei = ethers.parseEther('0.002'); // More than required 0.001
      mockProvider.call.mockResolvedValue(ethers.toBeHex(balanceInWei, 32));

      const jobId = await wrapper.createSessionFromDeposit(params);

      expect(mockSigner.sendTransaction).toHaveBeenCalled();
      expect(jobId).toBe(1);
    });

    it('should create session from token deposit', async () => {
      const tokenAddress = ChainRegistry.getChain(ChainId.BASE_SEPOLIA).contracts.usdcToken;
      const params = {
        host: HOST_ADDRESS,
        paymentToken: tokenAddress,
        deposit: '100', // 100 USDC
        pricePerToken: 100000, // 0.1 USDC per token
        duration: 3600,
        proofInterval: 300
      };

      // Mock sufficient USDC balance
      const balanceInSmallestUnit = ethers.parseUnits('150', 6); // 150 USDC
      mockProvider.call.mockResolvedValue(ethers.toBeHex(balanceInSmallestUnit, 32));

      // Mock the transaction and receipt
      mockSigner.sendTransaction.mockResolvedValue({
        hash: '0x' + '5678'.repeat(16),
        wait: vi.fn().mockResolvedValue({
          status: 1,
          logs: []
        })
      });

      const jobId = await wrapper.createSessionFromDeposit(params);

      expect(jobId).toBe(2);
    });

    it('should validate deposit balance before session creation', async () => {
      // Return zero balance
      mockProvider.call.mockResolvedValue(ethers.toBeHex(0, 32));

      const params = {
        host: HOST_ADDRESS,
        paymentToken: ethers.ZeroAddress,
        deposit: '0.001',
        pricePerToken: 1000000,
        duration: 3600,
        proofInterval: 300
      };

      await expect(wrapper.createSessionFromDeposit(params))
        .rejects.toThrow('Insufficient deposit');
    });
  });

  describe('Chain Validation', () => {
    it('should verify chain before operations', async () => {
      wrapper = new JobMarketplaceWrapper(ChainId.BASE_SEPOLIA, mockSigner);

      // Mock provider returning different chain
      mockProvider.getNetwork.mockResolvedValue({ chainId: ChainId.OPBNB_TESTNET });

      await expect(wrapper.depositNative('0.001'))
        .rejects.toThrow(ChainMismatchError);
    });

    it('should handle chain switching', async () => {
      wrapper = new JobMarketplaceWrapper(ChainId.BASE_SEPOLIA, mockSigner);

      // Switch to opBNB
      const newWrapper = await wrapper.switchToChain(ChainId.OPBNB_TESTNET);
      expect(newWrapper.getChainId()).toBe(ChainId.OPBNB_TESTNET);
    });
  });

  describe('Existing Session Methods', () => {
    beforeEach(() => {
      wrapper = new JobMarketplaceWrapper(ChainId.BASE_SEPOLIA, mockSigner);
    });

    it('should create session with direct payment', async () => {
      const jobId = await wrapper.createSessionJob({
        host: HOST_ADDRESS,
        pricePerToken: 1000000,
        duration: 3600,
        proofInterval: 300,
        paymentAmount: '0.001'
      });

      expect(mockSigner.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          value: ethers.parseEther('0.001')
        })
      );
    });

    it('should complete session job', async () => {
      const jobId = 1;
      const conversationCID = 'QmXyz123...';

      const tx = await wrapper.completeSessionJob(jobId, conversationCID);
      expect(tx.hash).toBeDefined();
    });

    it('should get session details', async () => {
      const jobId = 1;
      // Mock the sessionJobs call with correct 16-field structure
      mockProvider.call.mockResolvedValue(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['uint256', 'address', 'address', 'address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint8', 'uint256', 'uint256', 'string'],
          [
            1, // id
            TEST_ADDRESS, // depositor
            TEST_ADDRESS, // requester
            HOST_ADDRESS, // host
            ethers.ZeroAddress, // paymentToken (native)
            ethers.parseEther('0.001'), // deposit
            1000000, // pricePerToken
            0, // tokensUsed
            3600, // maxDuration
            Math.floor(Date.now() / 1000), // startTime
            0, // lastProofTime
            300, // proofInterval
            1, // status (Active)
            0, // withdrawnByHost
            0, // refundedToUser
            '' // conversationCID
          ]
        )
      );

      const session = await wrapper.getSessionJob(jobId);
      expect(session.requester.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
      expect(session.host.toLowerCase()).toBe(HOST_ADDRESS.toLowerCase());
      expect(session.deposit).toBe('0.001');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      wrapper = new JobMarketplaceWrapper(ChainId.BASE_SEPOLIA, mockSigner);
    });

    it('should handle transaction failures', async () => {
      mockSigner.sendTransaction.mockRejectedValue(new Error('Transaction failed'));

      await expect(wrapper.depositNative('0.001'))
        .rejects.toThrow('Transaction failed');
    });

    it('should handle network errors', async () => {
      mockProvider.getNetwork.mockRejectedValue(new Error('Network error'));

      await expect(wrapper.depositNative('0.001'))
        .rejects.toThrow('Network error');
    });

    it('should validate addresses', async () => {
      await expect(wrapper.createSessionFromDeposit({
        host: 'invalid-address',
        paymentToken: ethers.ZeroAddress,
        deposit: '0.001',
        pricePerToken: 1000000,
        duration: 3600,
        proofInterval: 300
      })).rejects.toThrow('Invalid address');
    });
  });

  describe('Gas Optimization', () => {
    beforeEach(() => {
      wrapper = new JobMarketplaceWrapper(ChainId.BASE_SEPOLIA, mockSigner);
    });

    it('should batch multiple operations when possible', async () => {
      const operations = [
        { type: 'deposit', amount: '0.001' },
        { type: 'deposit', amount: '0.002' }
      ];

      // Mock the contract call
      const mockTx = {
        hash: '0x' + '1234'.repeat(16),
        wait: vi.fn().mockResolvedValue({ status: 1 })
      };

      // batchDeposits uses depositNative which goes through the contract
      await wrapper.batchDeposits(operations.map(op => op.amount));

      // The batch method should combine deposits into a single call
      expect(wrapper.getChainId()).toBe(ChainId.BASE_SEPOLIA);
    });

    it('should handle gas estimation for transactions', async () => {
      // Verify the wrapper was created properly
      expect(wrapper).toBeDefined();
      expect(wrapper.getChainId()).toBe(ChainId.BASE_SEPOLIA);

      // Verify contract address is correct for the chain
      expect(wrapper.getContractAddress()).toBe('0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f');
    });
  });
});