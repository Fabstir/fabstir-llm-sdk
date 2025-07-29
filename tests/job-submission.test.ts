import { describe, it, expect, beforeAll } from 'vitest';
import { FabstirSDK } from '../src';
import { ethers } from 'ethers';

describe('Job Submission Flow', () => {
  let sdk: FabstirSDK;
  
  beforeAll(async () => {
    sdk = new FabstirSDK({ network: 'base-sepolia' });
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

  it.skip('should estimate job cost before submission', async () => {
    const jobRequest = {
      prompt: 'Explain blockchain in one paragraph',
      modelId: 'llama2-7b',
      maxTokens: 150
    };
    
    const estimate = await sdk.estimateJobCost(jobRequest);
    expect(estimate.estimatedCost).toBeGreaterThan(0);
    expect(estimate.estimatedTokens).toBeGreaterThan(0);
    expect(estimate.pricePerToken).toBeGreaterThan(0);
  });

  it.skip('should submit job to marketplace', async () => {
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
});
