import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HostManager } from '../../src/managers/HostManager';
import { ContractManager } from '../../src/contracts/ContractManager';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: '.env.test' });

describe('HostManager.recordEarnings', () => {
  let hostManager: HostManager;
  let mockProvider: ethers.JsonRpcProvider;
  let mockWallet: ethers.Wallet;
  let mockContractManager: ContractManager;
  let mockHostEarnings: any;

  beforeEach(async () => {
    // Create mock provider and wallet
    mockProvider = new ethers.JsonRpcProvider('http://localhost:8545');
    mockWallet = new ethers.Wallet('0x' + '1'.repeat(64), mockProvider);

    // Create mock contract manager
    mockContractManager = {
      getContractABI: vi.fn().mockResolvedValue([]),
      getContractAddress: vi.fn().mockImplementation((name: string) => {
        const addresses: Record<string, string> = {
          hostEarnings: process.env.CONTRACT_HOST_EARNINGS!,
          nodeRegistry: process.env.CONTRACT_NODE_REGISTRY!,
          usdcToken: process.env.CONTRACT_USDC_TOKEN!
        };
        return Promise.resolve(addresses[name]);
      }),
      setSigner: vi.fn()
    } as any;

    // Create host manager instance with the new constructor
    hostManager = new HostManager(mockContractManager);

    // Initialize with signer to mark it as initialized
    await hostManager.initialize(mockWallet);

    // Mock the HostEarnings contract
    mockHostEarnings = {
      creditEarnings: vi.fn(),
      connect: vi.fn(() => mockHostEarnings),
      interface: {
        parseLog: vi.fn()
      }
    };

    // Mock ethers.Contract constructor
    vi.spyOn(ethers, 'Contract').mockReturnValue(mockHostEarnings as any);
  });

  describe('recordEarnings', () => {
    it('should call HostEarnings contract with correct parameters', async () => {
      const sessionId = 'session-123';
      const hostAddress = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
      const amount = ethers.parseEther('100');

      // Mock successful transaction
      const mockTx = {
        hash: '0xabc123...',
        wait: vi.fn().mockResolvedValue({
          hash: '0xabc123...',
          status: 1
        })
      };

      mockHostEarnings.creditEarnings.mockResolvedValue(mockTx);

      // Call recordEarnings
      const txHash = await hostManager.recordEarnings(sessionId, hostAddress, amount);

      // Verify contract was called with correct parameters
      expect(mockHostEarnings.creditEarnings).toHaveBeenCalledWith(
        hostAddress,
        amount,
        process.env.CONTRACT_USDC_TOKEN
      );
      expect(txHash).toBe('0xabc123...');
    });

    it('should throw error if transaction fails', async () => {
      const sessionId = 'session-456';
      const hostAddress = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
      const amount = ethers.parseEther('50');

      // Mock failed transaction
      mockHostEarnings.creditEarnings.mockRejectedValue(
        new Error('Insufficient funds')
      );

      // Verify error is thrown
      await expect(
        hostManager.recordEarnings(sessionId, hostAddress, amount)
      ).rejects.toThrow('Insufficient funds');
    });

    it('should handle zero amount', async () => {
      const sessionId = 'session-789';
      const hostAddress = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
      const amount = 0n; // Use 0n directly for bigint

      // Should throw error for zero amount
      await expect(
        hostManager.recordEarnings(sessionId, hostAddress, amount)
      ).rejects.toThrow('Amount must be greater than zero');
    });

    it('should validate host address format', async () => {
      const sessionId = 'session-101';
      const invalidAddress = 'invalid-address';
      const amount = ethers.parseEther('10');

      // Should throw error for invalid address
      await expect(
        hostManager.recordEarnings(sessionId, invalidAddress, amount)
      ).rejects.toThrow('Invalid host address');
    });

    it('should validate session ID format', async () => {
      const invalidSessionId = '';
      const hostAddress = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
      const amount = ethers.parseEther('10');

      // Should throw error for empty session ID
      await expect(
        hostManager.recordEarnings(invalidSessionId, hostAddress, amount)
      ).rejects.toThrow('Invalid session ID');
    });
  });

  describe('recordEarnings with real contract', () => {
    it.skip('should record earnings on Base Sepolia testnet', async () => {
      // Skip - integration test requires real testnet
      if (!process.env.RUN_INTEGRATION_TESTS) {
        return;
      }

      // Use real provider and wallet for integration test
      const provider = new ethers.JsonRpcProvider(process.env.RPC_URL_BASE_SEPOLIA);
      const wallet = new ethers.Wallet(process.env.TEST_HOST_1_PRIVATE_KEY!, provider);

      // Create real host manager
      const realHostManager = new HostManager(
        wallet,
        {
          hostEarnings: process.env.CONTRACT_HOST_EARNINGS!,
          nodeRegistry: process.env.CONTRACT_NODE_REGISTRY!
        },
        {} as any
      );

      const sessionId = `test-session-${Date.now()}`;
      const hostAddress = wallet.address;
      const amount = ethers.parseEther('0.001'); // Small test amount

      // Record earnings on real contract
      const txHash = await realHostManager.recordEarnings(
        sessionId,
        hostAddress,
        amount
      );

      // Verify transaction hash format
      expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(txHash).not.toBe('0xmock123...');
    }, 30000); // 30 second timeout for blockchain
  });
});