import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import PaymentManager from '../../src/managers/PaymentManager';
import AuthManager from '../../src/managers/AuthManager';

describe('PaymentManager', () => {
  let paymentManager: PaymentManager;
  let mockJobMarketplace: any;
  let mockAuthManager: AuthManager;
  let mockSigner: any;
  let mockUsdcContract: any;

  beforeEach(() => {
    // Mock signer
    mockSigner = {
      address: '0xUserAddress123',
      getAddress: vi.fn().mockResolvedValue('0xUserAddress123')
    };

    // Mock AuthManager
    mockAuthManager = {
      getSigner: vi.fn(() => mockSigner),
      getUserAddress: vi.fn(() => '0xUserAddress123'),
      getS5Seed: vi.fn(() => 'mock seed phrase'),
      isAuthenticated: vi.fn(() => true)
    } as any;

    // Mock job marketplace contract with connect method
    const mockConnectedContract = {
      address: '0xJobMarketplace456',
      callStatic: {
        createSessionJob: vi.fn(),
        createSessionJobWithToken: vi.fn()
      },
      createSessionJob: vi.fn(),
      createSessionJobWithToken: vi.fn(),
      completeSessionJob: vi.fn(),
      interface: {
        parseLog: vi.fn()
      }
    };

    mockJobMarketplace = {
      ...mockConnectedContract,
      connect: vi.fn(() => mockConnectedContract)
    };

    // Mock USDC contract
    mockUsdcContract = {
      approve: vi.fn(),
      allowance: vi.fn()
    };

    paymentManager = new PaymentManager(mockJobMarketplace, mockAuthManager);
  });

  describe('ETH Payments', () => {
    it('should create ETH session job with correct parameters', async () => {
      const hostAddress = '0xHost789';
      const amount = '0.005';
      const pricePerToken = 5000;
      const duration = 3600;
      const proofInterval = 300;

      // Mock static call returns job ID (on connected contract)
      const connectedContract = mockJobMarketplace.connect();
      connectedContract.callStatic.createSessionJob.mockResolvedValue(
        ethers.BigNumber.from('42')
      );

      // Mock transaction
      const mockTx = {
        hash: '0xTransaction123',
        wait: vi.fn().mockResolvedValue({
          status: 1,
          logs: [{
            topics: ['0xEvent', '0x000000000000000000000000000000000000000000000000000000000000002a']
          }]
        })
      };
      connectedContract.createSessionJob.mockResolvedValue(mockTx);

      const result = await paymentManager.createETHSessionJob(
        hostAddress,
        amount,
        pricePerToken,
        duration,
        proofInterval
      );

      expect(result.jobId).toBe('42');
      expect(result.txHash).toBe('0xTransaction123');
      
      // Verify contract was called with correct params
      expect(mockJobMarketplace.createSessionJob).toHaveBeenCalledWith(
        hostAddress,
        ethers.utils.parseEther(amount),
        pricePerToken,
        duration,
        proofInterval,
        { value: ethers.utils.parseEther(amount), gasLimit: 500000 }
      );
    });

    it('should handle ETH payment errors gracefully', async () => {
      const hostAddress = '0xHost789';
      mockJobMarketplace.callStatic.createSessionJob.mockRejectedValue(
        new Error('Insufficient funds')
      );

      await expect(
        paymentManager.createETHSessionJob(hostAddress, '0.001', 5000, 3600, 300)
      ).rejects.toThrow('Failed to create ETH session job: Insufficient funds');
    });
  });

  describe('USDC Payments', () => {
    it('should approve USDC spending', async () => {
      const tokenAddress = '0xUSDC123';
      const amount = '5';
      
      // Create mock provider and contract factory
      const mockProvider = {};
      const mockContract = {
        approve: vi.fn().mockResolvedValue({
          hash: '0xApprovalTx456',
          wait: vi.fn().mockResolvedValue({ status: 1 })
        })
      };
      
      // Mock ethers.Contract
      vi.spyOn(ethers, 'Contract').mockImplementation(() => mockContract as any);

      const txHash = await paymentManager.approveUSDC(tokenAddress, amount);

      expect(txHash).toBe('0xApprovalTx456');
      expect(mockContract.approve).toHaveBeenCalledWith(
        mockJobMarketplace.address,
        ethers.utils.parseUnits(amount, 6),
        { gasLimit: 100000 }
      );
    });

    it('should create USDC session job with approval', async () => {
      const hostAddress = '0xHost789';
      const tokenAddress = '0xUSDC123';
      const amount = '5';
      const pricePerToken = 5000;
      const duration = 3600;
      const proofInterval = 300;

      // Mock static call
      mockJobMarketplace.callStatic.createSessionJobWithToken.mockResolvedValue(
        ethers.BigNumber.from('43')
      );

      // Mock transaction
      const mockTx = {
        hash: '0xUSDCTx789',
        wait: vi.fn().mockResolvedValue({
          status: 1,
          logs: [{
            topics: ['0xEvent', '0x000000000000000000000000000000000000000000000000000000000000002b']
          }]
        })
      };
      mockJobMarketplace.createSessionJobWithToken.mockResolvedValue(mockTx);

      const result = await paymentManager.createUSDCSessionJob(
        hostAddress,
        tokenAddress,
        amount,
        pricePerToken,
        duration,
        proofInterval
      );

      expect(result.jobId).toBe('43');
      expect(result.txHash).toBe('0xUSDCTx789');
      
      // Verify contract was called with correct params
      expect(mockJobMarketplace.createSessionJobWithToken).toHaveBeenCalledWith(
        hostAddress,
        tokenAddress,
        ethers.utils.parseUnits(amount, 6),
        pricePerToken,
        duration,
        proofInterval,
        { gasLimit: 500000 }
      );
    });
  });

  describe('Job Completion', () => {
    it('should complete session job successfully', async () => {
      const jobId = '42';
      const connectedContract = mockJobMarketplace.connect();
      const mockTx = {
        hash: '0xCompleteTx999',
        wait: vi.fn().mockResolvedValue({ status: 1 })
      };
      connectedContract.completeSessionJob.mockResolvedValue(mockTx);

      const txHash = await paymentManager.completeSessionJob(jobId);

      expect(txHash).toBe('0xCompleteTx999');
      expect(mockJobMarketplace.completeSessionJob).toHaveBeenCalledWith(
        jobId,
        { gasLimit: 200000 }
      );
    });

    it('should handle completion errors', async () => {
      mockJobMarketplace.completeSessionJob.mockRejectedValue(
        new Error('Only user can complete')
      );

      await expect(
        paymentManager.completeSessionJob('42')
      ).rejects.toThrow('Failed to complete session job: Only user can complete');
    });
  });

  describe('Job ID Extraction', () => {
    it('should extract job ID from transaction receipt', async () => {
      const receipt = {
        logs: [{
          topics: [
            '0xSessionJobCreated',
            '0x000000000000000000000000000000000000000000000000000000000000002a'
          ]
        }]
      };

      const jobId = (paymentManager as any).extractJobIdFromReceipt(receipt);
      expect(jobId).toBe('42');
    });

    it('should handle BigNumber job IDs', async () => {
      const receipt = {
        logs: [{
          topics: [
            '0xSessionJobCreated',
            '0x0000000000000000000000000000000000000000000000000000000000002710'
          ]
        }]
      };

      const jobId = (paymentManager as any).extractJobIdFromReceipt(receipt);
      expect(jobId).toBe('10000');
    });

    it('should throw error if no job ID found', async () => {
      const receipt = { logs: [] };

      expect(() => {
        (paymentManager as any).extractJobIdFromReceipt(receipt);
      }).toThrow('No job ID found in transaction logs');
    });
  });

  describe('Constants', () => {
    it('should have correct default constants', () => {
      expect(PaymentManager.MIN_ETH_PAYMENT).toBe('0.005');
      expect(PaymentManager.DEFAULT_PRICE_PER_TOKEN).toBe(5000);
      expect(PaymentManager.DEFAULT_DURATION).toBe(3600);
      expect(PaymentManager.DEFAULT_PROOF_INTERVAL).toBe(300);
      expect(PaymentManager.TOKENS_PER_PROOF).toBe(1000);
    });
  });
});