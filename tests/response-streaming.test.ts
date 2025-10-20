// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { FabstirSDK, JobStatus } from '../src';
import { ethers } from 'ethers';

describe('Response Streaming', () => {
  let sdk: FabstirSDK;
  let completedJobId: number;
  let activeJobId: number;
  
  beforeAll(async () => {
    sdk = new FabstirSDK({ network: 'base-sepolia' });
    
    const mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532, name: 'base-sepolia' }),
      getSigner: vi.fn().mockReturnValue({
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890')
      })
    };
    
    await sdk.connect(mockProvider as any);
    
    // Create a completed job for testing
    completedJobId = await sdk.submitJob({
      prompt: 'Explain blockchain in one paragraph',
      modelId: 'llama2-7b',
      maxTokens: 150
    });
    
    // Simulate job completion with result
    await sdk._simulateStatusChange(completedJobId, JobStatus.COMPLETED);
    await sdk._simulateJobResult(completedJobId, {
      response: 'Blockchain is a revolutionary distributed ledger technology that enables secure, transparent, and tamper-proof record-keeping across a network of computers.',
      tokensUsed: 127,
      completionTime: Date.now()
    });
    
    // Create an active job for streaming
    activeJobId = await sdk.submitJob({
      prompt: 'Write a story about a robot',
      modelId: 'llama2-7b',
      maxTokens: 200
    });
  });

  it('should retrieve completed job result', async () => {
    const result = await sdk.getJobResult(completedJobId);
    
    expect(result).toBeDefined();
    expect(result.response).toContain('Blockchain');
    expect(result.tokensUsed).toBe(127);
    expect(result.completionTime).toBeGreaterThan(0);
  });

  it('should throw error for non-existent job result', async () => {
    await expect(sdk.getJobResult(99999)).rejects.toThrow('Job result not found');
  });

  it('should stream response tokens in real-time', async () => {
    const tokens: string[] = [];
    
    // Simulate job processing
    await sdk._simulateStatusChange(activeJobId, JobStatus.PROCESSING);
    
    // Start streaming
    const streamPromise = sdk.streamJobResponse(activeJobId, (token) => {
      tokens.push(token);
    });
    
    // Simulate tokens being generated
    await sdk._simulateStreamToken(activeJobId, 'Once ');
    await sdk._simulateStreamToken(activeJobId, 'upon ');
    await sdk._simulateStreamToken(activeJobId, 'a ');
    await sdk._simulateStreamToken(activeJobId, 'time...');
    
    // Complete the job
    await sdk._simulateStatusChange(activeJobId, JobStatus.COMPLETED);
    await streamPromise;
    
    expect(tokens).toEqual(['Once ', 'upon ', 'a ', 'time...']);
    expect(tokens.join('')).toBe('Once upon a time...');
  });

  it('should create async iterator for response streaming', async () => {
    const jobId = await sdk.submitJob({
      prompt: 'Tell me about AI',
      modelId: 'llama2-7b',
      maxTokens: 100
    });
    
    await sdk._simulateStatusChange(jobId, JobStatus.PROCESSING);
    
    const tokens: any[] = [];
    const stream = sdk.createResponseStream(jobId);
    
    // Start consuming stream
    const consumePromise = (async () => {
      for await (const token of stream) {
        tokens.push(token);
        if (tokens.length >= 3) break; // Take first 3 tokens
      }
    })();
    
    // Simulate tokens
    await sdk._simulateStreamToken(jobId, 'AI ');
    await sdk._simulateStreamToken(jobId, 'is ');
    await sdk._simulateStreamToken(jobId, 'fascinating');
    
    await consumePromise;
    
    expect(tokens.length).toBe(3);
    expect(tokens[0].content).toBe('AI ');
    expect(tokens[0].index).toBe(0);
    expect(tokens[0].timestamp).toBeGreaterThan(0);
  });

  it('should get result metadata', async () => {
    const metadata = await sdk.getResultMetadata(completedJobId);
    
    expect(metadata.model).toBe('llama2-7b');
    expect(metadata.temperature).toBe(0.7);
    expect(metadata.inferenceTime).toBeGreaterThan(0);
    expect(metadata.tokensPerSecond).toBeGreaterThan(0);
    expect(metadata.totalTokens).toBe(127);
  });

  it('should handle stream interruption gracefully', async () => {
    const jobId = await sdk.submitJob({
      prompt: 'Test interruption',
      modelId: 'llama2-7b',
      maxTokens: 50
    });
    
    await sdk._simulateStatusChange(jobId, JobStatus.PROCESSING);
    
    const tokens: string[] = [];
    const streamPromise = sdk.streamJobResponse(jobId, (token) => {
      tokens.push(token);
    });
    
    // Simulate some tokens then failure
    await sdk._simulateStreamToken(jobId, 'Hello ');
    await sdk._simulateStatusChange(jobId, JobStatus.FAILED);
    
    await expect(streamPromise).rejects.toThrow('Job failed');
    expect(tokens).toEqual(['Hello ']);
  });
});
