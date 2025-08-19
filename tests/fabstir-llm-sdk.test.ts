import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FabstirLLMSDK } from '../src/fabstir-llm-sdk';
import { ethers } from 'ethers';

// Mock transaction response
const mockTxResponse = {
  hash: '0xtxhash',
  wait: vi.fn().mockResolvedValue({
    status: 1,
    logs: [{ topics: ['0x123', '0x0000000000000000000000000000000000000000000000000000000000000001'] }],
    hash: '0xtxhash'
  }),
  confirmations: 0,
  from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0fEb7',
  nonce: 0,
  gasLimit: ethers.BigNumber.from('200000'),
  gasPrice: ethers.BigNumber.from('1000000000'),
  data: '0x',
  value: ethers.BigNumber.from('0'),
  chainId: 84532
};

const mockTxResponseWithToken = {
  hash: '0xtxhashtoken',
  wait: vi.fn().mockResolvedValue({
    status: 1,
    logs: [{ topics: ['0x123', '0x0000000000000000000000000000000000000000000000000000000000000002'] }],
    hash: '0xtxhashtoken'
  }),
  confirmations: 0,
  from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0fEb7',
  nonce: 0,
  gasLimit: ethers.BigNumber.from('200000'),
  gasPrice: ethers.BigNumber.from('1000000000'),
  data: '0x',
  value: ethers.BigNumber.from('0'),
  chainId: 84532
};

// Create proper mock provider
const mockProvider = {
  getNetwork: vi.fn().mockResolvedValue({ chainId: 84532, name: 'base-sepolia' }),
  getSigner: vi.fn(),
  getBlockNumber: vi.fn().mockResolvedValue(1000000),
  getGasPrice: vi.fn().mockResolvedValue(ethers.BigNumber.from('1000000000')),
  estimateGas: vi.fn().mockResolvedValue(ethers.BigNumber.from('200000')),
  getBalance: vi.fn().mockResolvedValue(ethers.BigNumber.from('1000000000000000000')),
  call: vi.fn(),
  getCode: vi.fn().mockResolvedValue('0x123456'),
  getTransactionCount: vi.fn().mockResolvedValue(0),
  resolveName: vi.fn().mockResolvedValue(null), // Add this missing method
  lookupAddress: vi.fn().mockResolvedValue(null),
  getTransaction: vi.fn(),
  getTransactionReceipt: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  emit: vi.fn(),
  listenerCount: vi.fn().mockReturnValue(0),
  listeners: vi.fn().mockReturnValue([]),
  off: vi.fn(),
  removeAllListeners: vi.fn(),
  _isProvider: true
};

// Create proper mock signer
const mockSigner = {
  getAddress: vi.fn().mockResolvedValue('0x742d35Cc6634C0532925a3b844Bc9e7595f0fEb7'),
  signMessage: vi.fn().mockResolvedValue('0xsignature'),
  sendTransaction: vi.fn().mockResolvedValue(mockTxResponse),
  provider: mockProvider,
  _isSigner: true
};

// Setup provider to return signer
mockProvider.getSigner.mockReturnValue(mockSigner);

// Mock contract instance
const mockContract = {
  address: '0x6C4283A2aAee2f94BcD2EB04e951EfEa1c35b0B6',
  interface: {},
  provider: mockProvider,
  signer: mockSigner,
  // Regular method calls
  balanceOf: vi.fn(),
  allowance: vi.fn(),
  approve: vi.fn(),
  postJob: vi.fn(),
  postJobWithToken: vi.fn(),
  // Bracket notation access (these are what actually get called)
  ['balanceOf']: vi.fn(),
  ['allowance']: vi.fn(),
  ['approve']: vi.fn(),
  ['postJob']: vi.fn(),
  ['postJobWithToken']: vi.fn(),
};

// Setup default mock returns
mockContract['balanceOf'].mockResolvedValue(ethers.BigNumber.from('10000000000'));
mockContract['allowance'].mockResolvedValue(ethers.BigNumber.from('0'));
mockContract['approve'].mockResolvedValue(mockTxResponse);
mockContract['postJob'].mockResolvedValue(mockTxResponse);
mockContract['postJobWithToken'].mockResolvedValue(mockTxResponseWithToken);

// Mock ethers.Contract constructor
vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers') as any;
  return {
    ...actual,
    Contract: vi.fn().mockImplementation((address, abi, signerOrProvider) => {
      // Return the mock contract
      return mockContract;
    }),
    utils: actual.utils,
    BigNumber: actual.BigNumber,
    providers: actual.providers
  };
});

describe('FabstirLLMSDK Payment Method Selection', () => {
  let sdk: FabstirLLMSDK;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset mock transaction responses
    mockTxResponse.wait = vi.fn().mockResolvedValue({
      status: 1,
      logs: [{ topics: ['0x123', '0x0000000000000000000000000000000000000000000000000000000000000001'] }],
      hash: '0xtxhash'
    });
    
    mockTxResponseWithToken.wait = vi.fn().mockResolvedValue({
      status: 1,
      logs: [{ topics: ['0x123', '0x0000000000000000000000000000000000000000000000000000000000000002'] }],
      hash: '0xtxhashtoken'
    });
    
    // Reset mock values for each test
    mockContract['balanceOf'].mockResolvedValue(ethers.BigNumber.from('10000000000'));
    mockContract['allowance'].mockResolvedValue(ethers.BigNumber.from('0'));
    mockContract['approve'].mockResolvedValue(mockTxResponse);
    mockContract['postJob'].mockResolvedValue(mockTxResponse);
    mockContract['postJobWithToken'].mockResolvedValue(mockTxResponseWithToken);
    
    // Create SDK instance with mocked provider
    sdk = new FabstirLLMSDK(mockProvider as any);
  });

  describe('USDC Payment Flow', () => {
    it('should call postJobWithToken for USDC payments', async () => {
      const usdcJobParams = {
        modelId: 'tiny-vicuna',
        prompt: 'Test USDC payment',
        maxTokens: 1000,
        offerPrice: '1000000', // 1 USDC (6 decimals)
        paymentToken: 'USDC' as const,
        paymentAmount: '1000000'
      };

      const jobId = await sdk.submitJob(usdcJobParams);

      // Should NOT call postJob
      expect(mockContract['postJob']).not.toHaveBeenCalled();
      
      // Should call postJobWithToken with correct parameters
      expect(mockContract['postJobWithToken']).toHaveBeenCalledWith(
        'tiny-vicuna',
        'Test USDC payment',
        '1000000',
        1000,
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC address
        '1000000'
      );

      expect(jobId).toBe('2');
    });

    it('should approve USDC spending before job submission', async () => {
      const usdcJobParams = {
        modelId: 'tiny-vicuna',
        prompt: 'Test USDC approval',
        maxTokens: 500,
        offerPrice: '2000000', // 2 USDC
        paymentToken: 'USDC' as const,
        paymentAmount: '2000000'
      };

      await sdk.submitJob(usdcJobParams);

      // Should check allowance
      expect(mockContract['allowance']).toHaveBeenCalledWith(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0fEb7',
        '0x6C4283A2aAee2f94BcD2EB04e951EfEa1c35b0B6'
      );

      // Should approve USDC spending
      expect(mockContract['approve']).toHaveBeenCalledWith(
        '0x6C4283A2aAee2f94BcD2EB04e951EfEa1c35b0B6',
        '2000000'
      );

      // Should call postJobWithToken after approval
      expect(mockContract['postJobWithToken']).toHaveBeenCalled();
    });

    it('should not re-approve if allowance is sufficient', async () => {
      // Set allowance to be sufficient
      mockContract['allowance'].mockResolvedValue(ethers.BigNumber.from('10000000'));

      const usdcJobParams = {
        modelId: 'tiny-vicuna',
        prompt: 'Test sufficient allowance',
        maxTokens: 500,
        offerPrice: '2000000', // 2 USDC
        paymentToken: 'USDC' as const,
        paymentAmount: '2000000'
      };

      await sdk.submitJob(usdcJobParams);

      // Should check allowance
      expect(mockContract['allowance']).toHaveBeenCalled();

      // Should NOT approve again
      expect(mockContract['approve']).not.toHaveBeenCalled();

      // Should still call postJobWithToken
      expect(mockContract['postJobWithToken']).toHaveBeenCalled();
    });

    it('should throw error for insufficient USDC balance', async () => {
      // Set balance to 0
      mockContract['balanceOf'].mockResolvedValue(ethers.BigNumber.from('0'));

      const usdcJobParams = {
        modelId: 'tiny-vicuna',
        prompt: 'Test insufficient balance',
        maxTokens: 500,
        offerPrice: '2000000', // 2 USDC
        paymentToken: 'USDC' as const,
        paymentAmount: '2000000'
      };

      await expect(sdk.submitJob(usdcJobParams)).rejects.toThrow('Insufficient USDC balance');

      // Should not call any contract functions
      expect(mockContract['approve']).not.toHaveBeenCalled();
      expect(mockContract['postJobWithToken']).not.toHaveBeenCalled();
    });
  });

  describe('ETH Payment Flow', () => {
    it('should call postJob for ETH payments', async () => {
      const ethJobParams = {
        modelId: 'tiny-vicuna',
        prompt: 'Test ETH payment',
        maxTokens: 1000,
        offerPrice: '1000000000000000', // 0.001 ETH
        paymentToken: 'ETH' as const
      };

      const jobId = await sdk.submitJob(ethJobParams);

      // Should call postJob with msg.value
      expect(mockContract['postJob']).toHaveBeenCalledWith(
        'tiny-vicuna',
        'Test ETH payment',
        '1000000000000000',
        1000,
        { value: '1000000000000000' }
      );

      // Should NOT call postJobWithToken
      expect(mockContract['postJobWithToken']).not.toHaveBeenCalled();

      expect(jobId).toBe('1');
    });

    it('should maintain backward compatibility for undefined paymentToken', async () => {
      const legacyJobParams = {
        modelId: 'tiny-vicuna',
        prompt: 'Test legacy ETH payment',
        maxTokens: 1000,
        offerPrice: '1000000000000000' // 0.001 ETH
        // No paymentToken specified - should default to ETH
      };

      const jobId = await sdk.submitJob(legacyJobParams as any);

      // Should call postJob (ETH payment)
      expect(mockContract['postJob']).toHaveBeenCalledWith(
        'tiny-vicuna',
        'Test legacy ETH payment',
        '1000000000000000',
        1000,
        { value: '1000000000000000' }
      );

      // Should NOT call postJobWithToken
      expect(mockContract['postJobWithToken']).not.toHaveBeenCalled();

      expect(jobId).toBe('1');
    });
  });

  describe('Parameter Formatting', () => {
    it('should correctly format parameters for postJobWithToken', async () => {
      const usdcJobParams = {
        modelId: 'gpt-4',
        prompt: 'Complex prompt with special characters: "test" & symbols!',
        maxTokens: 2048,
        offerPrice: '5000000', // 5 USDC
        paymentToken: 'USDC' as const,
        paymentAmount: '5000000'
      };

      await sdk.submitJob(usdcJobParams);

      expect(mockContract['postJobWithToken']).toHaveBeenCalledWith(
        'gpt-4',
        'Complex prompt with special characters: "test" & symbols!',
        '5000000',
        2048,
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        '5000000'
      );
    });

    it('should correctly format parameters for postJob', async () => {
      const ethJobParams = {
        modelId: 'llama-2',
        prompt: 'Another complex prompt\nwith newlines',
        maxTokens: 4096,
        offerPrice: '2000000000000000', // 0.002 ETH
        paymentToken: 'ETH' as const
      };

      await sdk.submitJob(ethJobParams);

      expect(mockContract['postJob']).toHaveBeenCalledWith(
        'llama-2',
        'Another complex prompt\nwith newlines',
        '2000000000000000',
        4096,
        { value: '2000000000000000' }
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle postJobWithToken transaction failure', async () => {
      // Make postJobWithToken reject
      mockContract['postJobWithToken'].mockRejectedValue(new Error('Transaction failed'));

      const usdcJobParams = {
        modelId: 'tiny-vicuna',
        prompt: 'Test transaction failure',
        maxTokens: 500,
        offerPrice: '1000000',
        paymentToken: 'USDC' as const,
        paymentAmount: '1000000'
      };

      await expect(sdk.submitJob(usdcJobParams)).rejects.toThrow('Transaction failed');
    });

    it('should handle postJob transaction failure', async () => {
      // Make postJob reject
      mockContract['postJob'].mockRejectedValue(new Error('Insufficient ETH'));

      const ethJobParams = {
        modelId: 'tiny-vicuna',
        prompt: 'Test ETH failure',
        maxTokens: 500,
        offerPrice: '10000000000000000000', // 10 ETH
        paymentToken: 'ETH' as const
      };

      await expect(sdk.submitJob(ethJobParams)).rejects.toThrow('Insufficient ETH');
    });

    it('should handle USDC approval failure', async () => {
      // Make approve reject
      mockContract['approve'].mockRejectedValue(new Error('Approval denied'));

      const usdcJobParams = {
        modelId: 'tiny-vicuna',
        prompt: 'Test approval failure',
        maxTokens: 500,
        offerPrice: '1000000',
        paymentToken: 'USDC' as const,
        paymentAmount: '1000000'
      };

      await expect(sdk.submitJob(usdcJobParams)).rejects.toThrow('Approval denied');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero offer price', async () => {
      const jobParams = {
        modelId: 'tiny-vicuna',
        prompt: 'Test zero price',
        maxTokens: 100,
        offerPrice: '0',
        paymentToken: 'USDC' as const,
        paymentAmount: '0'
      };

      await sdk.submitJob(jobParams);

      expect(mockContract['postJobWithToken']).toHaveBeenCalledWith(
        'tiny-vicuna',
        'Test zero price',
        '0',
        100,
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        '0'
      );
    });

    it('should handle very large token amounts', async () => {
      const jobParams = {
        modelId: 'gpt-4',
        prompt: 'Test large tokens',
        maxTokens: 100000,
        offerPrice: '1000000000', // 1000 USDC
        paymentToken: 'USDC' as const,
        paymentAmount: '1000000000'
      };

      await sdk.submitJob(jobParams);

      expect(mockContract['postJobWithToken']).toHaveBeenCalledWith(
        'gpt-4',
        'Test large tokens',
        '1000000000',
        100000,
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        '1000000000'
      );
    });
  });
});