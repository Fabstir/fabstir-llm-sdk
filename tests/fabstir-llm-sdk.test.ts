import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FabstirLLMSDK } from '../src/fabstir-llm-sdk';

describe('FabstirLLMSDK Payment Method Selection', () => {
  let sdk: FabstirLLMSDK;
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('USDC Payment Flow', () => {
    it('should call submitJobWithUSDC for USDC payments', async () => {
      // Create a mock provider with getSigner
      const mockProvider = {
        getSigner: vi.fn()
      } as any;
      sdk = new FabstirLLMSDK(mockProvider);
      
      // Spy on the private method
      const submitJobWithUSDCSpy = vi.spyOn(sdk as any, 'submitJobWithUSDC').mockResolvedValue('2');
      
      const usdcJobParams = {
        modelId: 'tiny-vicuna',
        prompt: 'Test USDC payment',
        maxTokens: 1000,
        offerPrice: '1000000',
        paymentToken: 'USDC' as const,
        paymentAmount: '1000000'
      };

      const jobId = await sdk.submitJob(usdcJobParams);

      expect(submitJobWithUSDCSpy).toHaveBeenCalledWith(usdcJobParams);
      expect(jobId).toBe('2');
    });

    it('should call submitJobWithETH for ETH payments', async () => {
      // Create a mock provider with getSigner
      const mockProvider = {
        getSigner: vi.fn()
      } as any;
      sdk = new FabstirLLMSDK(mockProvider);
      
      // Spy on the private method
      const submitJobWithETHSpy = vi.spyOn(sdk as any, 'submitJobWithETH').mockResolvedValue('1');
      
      const ethJobParams = {
        modelId: 'tiny-vicuna',
        prompt: 'Test ETH payment',
        maxTokens: 500,
        offerPrice: '1000000000000000',
        paymentToken: 'ETH' as const
      };

      const jobId = await sdk.submitJob(ethJobParams);

      expect(submitJobWithETHSpy).toHaveBeenCalledWith(ethJobParams);
      expect(jobId).toBe('1');
    });

    it('should default to ETH when paymentToken is undefined', async () => {
      // Create a mock provider with getSigner
      const mockProvider = {
        getSigner: vi.fn()
      } as any;
      sdk = new FabstirLLMSDK(mockProvider);
      
      // Spy on the private method
      const submitJobWithETHSpy = vi.spyOn(sdk as any, 'submitJobWithETH').mockResolvedValue('1');
      
      const jobParams = {
        modelId: 'tiny-vicuna',
        prompt: 'Test legacy ETH payment',
        maxTokens: 100,
        offerPrice: '1000000000000000'
        // Note: no paymentToken specified
      };

      const jobId = await sdk.submitJob(jobParams);

      expect(submitJobWithETHSpy).toHaveBeenCalledWith(jobParams);
      expect(jobId).toBe('1');
    });

    it('should throw error for unsupported payment token', async () => {
      // Create a mock provider with getSigner
      const mockProvider = {
        getSigner: vi.fn()
      } as any;
      sdk = new FabstirLLMSDK(mockProvider);
      
      const jobParams = {
        modelId: 'tiny-vicuna',
        prompt: 'Test unsupported',
        maxTokens: 100,
        offerPrice: '1000',
        paymentToken: 'BTC' as any
      };

      await expect(sdk.submitJob(jobParams)).rejects.toThrow('Unsupported payment token: BTC');
    });

    it('should validate required parameters', async () => {
      // Create a mock provider with getSigner
      const mockProvider = {
        getSigner: vi.fn()
      } as any;
      sdk = new FabstirLLMSDK(mockProvider);
      
      const invalidParams = {
        modelId: '',
        prompt: 'Test',
        maxTokens: 100,
        offerPrice: '1000'
      };

      await expect(sdk.submitJob(invalidParams)).rejects.toThrow('Missing required job parameters');
    });
  });

  describe('Integration with mock contracts', () => {
    it('should handle complete USDC flow with approval', async () => {
      const mockProvider = {
        getSigner: vi.fn()
      } as any;
      
      const mockSigner = {
        getAddress: vi.fn().mockResolvedValue('0x742d35Cc6634C0532925a3b844Bc9e7595f0fEdb'),
        provider: mockProvider
      };
      
      mockProvider.getSigner.mockReturnValue(mockSigner);
      
      sdk = new FabstirLLMSDK(mockProvider);
      
      // Mock the private methods to test the flow logic
      const ensureInitializedSpy = vi.spyOn(sdk as any, 'ensureInitialized').mockResolvedValue(undefined);
      
      // Set up mock contracts
      (sdk as any).signer = mockSigner;
      (sdk as any).usdcContract = {
        balanceOf: vi.fn().mockResolvedValue(BigInt(10000000)),
        allowance: vi.fn().mockResolvedValue(BigInt(0)),
        approve: vi.fn().mockResolvedValue({
          wait: vi.fn().mockResolvedValue({ status: 1 })
        })
      };
      (sdk as any).jobMarketplace = {
        postJobWithToken: vi.fn().mockResolvedValue({
          wait: vi.fn().mockResolvedValue({
            status: 1,
            logs: [{ topics: ['0x', '0x0000000000000000000000000000000000000000000000000000000000000002'] }]
          })
        })
      };
      
      const usdcJobParams = {
        modelId: 'tiny-vicuna',
        prompt: 'Test USDC with approval',
        maxTokens: 1000,
        offerPrice: '1000000',
        paymentToken: 'USDC' as const,
        paymentAmount: '1000000'
      };

      const jobId = await sdk.submitJob(usdcJobParams);

      // Verify the flow
      expect(ensureInitializedSpy).toHaveBeenCalled();
      expect((sdk as any).usdcContract.balanceOf).toHaveBeenCalled();
      expect((sdk as any).usdcContract.allowance).toHaveBeenCalled();
      expect((sdk as any).usdcContract.approve).toHaveBeenCalled();
      expect((sdk as any).jobMarketplace.postJobWithToken).toHaveBeenCalled();
      expect(jobId).toBe('2');
    });

    it('should handle complete ETH flow', async () => {
      const mockProvider = {
        getSigner: vi.fn()
      } as any;
      
      const mockSigner = {
        getAddress: vi.fn().mockResolvedValue('0x742d35Cc6634C0532925a3b844Bc9e7595f0fEdb'),
        getBalance: vi.fn().mockResolvedValue(BigInt('1000000000000000000')),
        provider: mockProvider
      };
      
      mockProvider.getSigner.mockReturnValue(mockSigner);
      
      sdk = new FabstirLLMSDK(mockProvider);
      
      // Mock the private methods
      const ensureInitializedSpy = vi.spyOn(sdk as any, 'ensureInitialized').mockResolvedValue(undefined);
      
      // Set up mock contracts
      (sdk as any).signer = mockSigner;
      (sdk as any).jobMarketplace = {
        postJob: vi.fn().mockResolvedValue({
          wait: vi.fn().mockResolvedValue({
            status: 1,
            logs: [{ topics: ['0x', '0x0000000000000000000000000000000000000000000000000000000000000001'] }]
          })
        })
      };
      
      const ethJobParams = {
        modelId: 'tiny-vicuna',
        prompt: 'Test ETH payment',
        maxTokens: 500,
        offerPrice: '1000000000000000',
        paymentToken: 'ETH' as const
      };

      const jobId = await sdk.submitJob(ethJobParams);

      // Verify the flow
      expect(ensureInitializedSpy).toHaveBeenCalled();
      // ETH flow doesn't check balance, just sends with msg.value
      expect((sdk as any).jobMarketplace.postJob).toHaveBeenCalledWith(
        'tiny-vicuna',
        'Test ETH payment',
        '1000000000000000',
        500,
        { value: '1000000000000000' }
      );
      expect(jobId).toBe('1');
    });

    it('should skip approval if allowance is sufficient', async () => {
      const mockProvider = {
        getSigner: vi.fn()
      } as any;
      
      const mockSigner = {
        getAddress: vi.fn().mockResolvedValue('0x742d35Cc6634C0532925a3b844Bc9e7595f0fEdb'),
        provider: mockProvider
      };
      
      mockProvider.getSigner.mockReturnValue(mockSigner);
      
      sdk = new FabstirLLMSDK(mockProvider);
      
      // Mock the private methods
      vi.spyOn(sdk as any, 'ensureInitialized').mockResolvedValue(undefined);
      
      // Set up mock contracts with sufficient allowance
      (sdk as any).signer = mockSigner;
      (sdk as any).usdcContract = {
        balanceOf: vi.fn().mockResolvedValue(BigInt(10000000)),
        allowance: vi.fn().mockResolvedValue(BigInt(10000000)), // Sufficient allowance
        approve: vi.fn()
      };
      (sdk as any).jobMarketplace = {
        postJobWithToken: vi.fn().mockResolvedValue({
          wait: vi.fn().mockResolvedValue({
            status: 1,
            logs: [{ topics: ['0x', '0x0000000000000000000000000000000000000000000000000000000000000002'] }]
          })
        })
      };
      
      const usdcJobParams = {
        modelId: 'tiny-vicuna',
        prompt: 'Test USDC no approval needed',
        maxTokens: 1000,
        offerPrice: '1000000',
        paymentToken: 'USDC' as const,
        paymentAmount: '1000000'
      };

      const jobId = await sdk.submitJob(usdcJobParams);

      // Verify approval was NOT called
      expect((sdk as any).usdcContract.approve).not.toHaveBeenCalled();
      expect((sdk as any).jobMarketplace.postJobWithToken).toHaveBeenCalled();
      expect(jobId).toBe('2');
    });
  });
});