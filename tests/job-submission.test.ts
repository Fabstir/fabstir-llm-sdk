import { describe, it, expect, beforeAll, vi } from 'vitest';
import { FabstirSDK } from '../src';
import { ethers } from 'ethers';

describe('Job Submission Flow', () => {
  let sdk: FabstirSDK;
  
  beforeAll(async () => {
    sdk = new FabstirSDK({ network: 'base-sepolia' });
    
    // Mock provider with contract mocking
    const mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532, name: 'base-sepolia' }),
      getSigner: vi.fn().mockReturnValue({
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890')
      })
    };
    
    await sdk.connect(mockProvider as any);
  });

  it('should create a job request object', () => {
    const jobRequest = {
      prompt: 'Explain blockchain in one paragraph',
      modelId: 'llama2-7b',
      maxTokens: 150,
      temperature: 0.7,
      paymentToken: 'USDC',
      maxPrice: ethers.utils.parseUnits('0.001', 6) // $0.001 USDC
    };
    
    expect(jobRequest.prompt).toBeDefined();
    expect(jobRequest.modelId).toBe('llama2-7b');
  });

  it('should estimate job cost before submission', async () => {
    const jobRequest = {
      prompt: 'Explain blockchain in one paragraph',
      modelId: 'llama2-7b',
      maxTokens: 150
    };
    
    const estimate = await sdk.estimateJobCost(jobRequest);
    expect(estimate.estimatedCost).toBeDefined();
    expect(estimate.estimatedCost.gt(0)).toBe(true); // BigNumber greater than 0
    expect(estimate.estimatedTokens).toBeGreaterThan(0);
    expect(estimate.pricePerToken).toBeDefined();
    expect(estimate.pricePerToken.gt(0)).toBe(true);
  });

  it('should submit job to marketplace', async () => {
    const jobRequest = {
      prompt: 'Explain blockchain in one paragraph',
      modelId: 'llama2-7b',
      maxTokens: 150,
      temperature: 0.7,
      paymentToken: 'USDC',
      maxPrice: ethers.utils.parseUnits('0.001', 6)
    };
    
    const jobId = await sdk.submitJob(jobRequest);
    expect(jobId).toBeGreaterThan(0);
    expect(typeof jobId).toBe('number');
  });

  it('should validate job request parameters', () => {
    const invalidRequest = {
      prompt: '', // Empty prompt
      modelId: 'llama2-7b',
      maxTokens: -1 // Invalid
    };
    
    expect(() => sdk.validateJobRequest(invalidRequest)).toThrow('Invalid job request');
  });

  it('should estimate higher costs for longer prompts', async () => {
    const shortRequest = {
      prompt: 'Hi',
      modelId: 'llama2-7b',
      maxTokens: 50
    };
    
    const longRequest = {
      prompt: 'Explain blockchain technology, its history, applications, and future potential in detail',
      modelId: 'llama2-7b',
      maxTokens: 500
    };
    
    const shortEstimate = await sdk.estimateJobCost(shortRequest);
    const longEstimate = await sdk.estimateJobCost(longRequest);
    
    expect(longEstimate.estimatedCost.gt(shortEstimate.estimatedCost)).toBe(true);
    expect(longEstimate.estimatedTokens).toBeGreaterThan(shortEstimate.estimatedTokens);
  });
});
