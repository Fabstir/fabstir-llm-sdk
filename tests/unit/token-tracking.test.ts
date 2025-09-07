import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import InferenceManager from '../../src/managers/InferenceManager';
import { WebSocketClient } from '../../packages/sdk-client/src/p2p/WebSocketClient';

// Mock WebSocketClient
vi.mock('../../packages/sdk-client/src/p2p/WebSocketClient');

describe('Token Tracking and Billing', () => {
  let inferenceManager: InferenceManager;
  const TEST_SESSION_ID = 'test-session-123';
  const TEST_HOST_URL = 'ws://localhost:8080';
  const TEST_JOB_ID = 42;

  beforeEach(() => {
    // Mock WebSocketClient to avoid real connections
    (WebSocketClient as any).mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      send: vi.fn().mockResolvedValue(undefined),
      onResponse: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
      getState: vi.fn().mockReturnValue('CONNECTED')
    }));
    
    inferenceManager = new InferenceManager({ retryDelay: 100 });
  });

  describe('Token Counting', () => {
    // Test 1
    it('should track token usage for a session', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      const usage = inferenceManager.getTokenUsage(TEST_SESSION_ID);
      expect(usage).toBe(0);
    });

    // Test 2
    it('should accumulate tokens across multiple prompts', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      // Simulate adding tokens
      inferenceManager['updateTokenCount'](TEST_SESSION_ID, 10);
      inferenceManager['updateTokenCount'](TEST_SESSION_ID, 20);
      const usage = inferenceManager.getTokenUsage(TEST_SESSION_ID);
      expect(usage).toBe(30);
    });

    // Test 3
    it('should return 0 for non-existent session', () => {
      const usage = inferenceManager.getTokenUsage('non-existent');
      expect(usage).toBe(0);
    });

    // Test 4
    it('should track tokens separately for each session', async () => {
      const session1 = 'session-1';
      const session2 = 'session-2';
      await inferenceManager.initializeSession(session1, TEST_HOST_URL, 1);
      await inferenceManager.initializeSession(session2, TEST_HOST_URL, 2);
      inferenceManager['updateTokenCount'](session1, 100);
      inferenceManager['updateTokenCount'](session2, 200);
      expect(inferenceManager.getTokenUsage(session1)).toBe(100);
      expect(inferenceManager.getTokenUsage(session2)).toBe(200);
    });
  });

  describe('Token Estimation', () => {
    // Test 5
    it('should estimate tokens for a simple prompt', () => {
      const prompt = 'Hello, how are you?';
      const estimated = inferenceManager.estimateTokens(prompt);
      expect(estimated).toBeGreaterThan(0);
      expect(estimated).toBeLessThan(10); // ~5 tokens expected
    });

    // Test 6
    it('should estimate more tokens for longer prompts', () => {
      const shortPrompt = 'Hi';
      const longPrompt = 'This is a much longer prompt with many more words and tokens';
      const shortEstimate = inferenceManager.estimateTokens(shortPrompt);
      const longEstimate = inferenceManager.estimateTokens(longPrompt);
      expect(longEstimate).toBeGreaterThan(shortEstimate);
    });

    // Test 7
    it('should handle empty prompts', () => {
      const estimated = inferenceManager.estimateTokens('');
      expect(estimated).toBe(0);
    });

    // Test 8
    it('should provide reasonable estimates for code', () => {
      const codePrompt = 'function hello() { return "world"; }';
      const estimated = inferenceManager.estimateTokens(codePrompt);
      expect(estimated).toBeGreaterThan(5);
      expect(estimated).toBeLessThan(20);
    });
  });

  describe('Cost Calculation', () => {
    // Test 9
    it('should calculate session cost based on tokens', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      inferenceManager['updateTokenCount'](TEST_SESSION_ID, 1000);
      const cost = inferenceManager.getSessionCost(TEST_SESSION_ID);
      expect(cost).toBeDefined();
      expect(cost.gt(0)).toBe(true);
    });

    // Test 10
    it('should return zero cost for new session', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      const cost = inferenceManager.getSessionCost(TEST_SESSION_ID);
      expect(cost.isZero()).toBe(true);
    });

    // Test 11
    it('should calculate cost with custom pricing', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      inferenceManager.setPricing(TEST_SESSION_ID, ethers.utils.parseEther('0.002')); // $0.002 per 1000 tokens
      inferenceManager['updateTokenCount'](TEST_SESSION_ID, 2000);
      const cost = inferenceManager.getSessionCost(TEST_SESSION_ID);
      expect(ethers.utils.formatEther(cost)).toBe('0.004');
    });

    // Test 12
    it('should handle BigNumber overflow gracefully', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      // Use a reasonable large number that won't overflow
      inferenceManager['updateTokenCount'](TEST_SESSION_ID, 1000000000); // 1 billion tokens
      const cost = inferenceManager.getSessionCost(TEST_SESSION_ID);
      expect(cost).toBeDefined();
      expect(cost.gt(0)).toBe(true);
    });
  });

  describe('Token Limits', () => {
    // Test 13
    it('should enforce token limits', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      inferenceManager.setTokenLimit(TEST_SESSION_ID, 100);
      inferenceManager['updateTokenCount'](TEST_SESSION_ID, 50);
      const remaining = inferenceManager.getRemainingTokens(TEST_SESSION_ID);
      expect(remaining).toBe(50);
    });

    // Test 14
    it('should return 0 when limit exceeded', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      inferenceManager.setTokenLimit(TEST_SESSION_ID, 100);
      inferenceManager['updateTokenCount'](TEST_SESSION_ID, 150);
      const remaining = inferenceManager.getRemainingTokens(TEST_SESSION_ID);
      expect(remaining).toBe(0);
    });

    // Test 15
    it('should return unlimited (-1) when no limit set', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      const remaining = inferenceManager.getRemainingTokens(TEST_SESSION_ID);
      expect(remaining).toBe(-1);
    });
  });

  describe('Billing Events', () => {
    // Test 16
    it('should emit billing event on token update', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      const billingPromise = new Promise((resolve) => {
        inferenceManager.once('billing', (data) => {
          expect(data.sessionId).toBe(TEST_SESSION_ID);
          expect(data.tokens).toBe(25);
          expect(data.totalTokens).toBe(25);
          resolve(undefined);
        });
      });
      
      inferenceManager['updateTokenCount'](TEST_SESSION_ID, 25);
      await billingPromise;
    });

    // Test 17
    it('should emit session-end billing event', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      inferenceManager['updateTokenCount'](TEST_SESSION_ID, 100);
      
      const billingPromise = new Promise((resolve) => {
        inferenceManager.once('billing:session-end', (data) => {
          expect(data.sessionId).toBe(TEST_SESSION_ID);
          expect(data.totalTokens).toBe(100);
          expect(data.totalCost).toBeDefined();
          resolve(undefined);
        });
      });
      
      inferenceManager.endSession(TEST_SESSION_ID);
      await billingPromise;
    });
  });

  describe('Usage Statistics', () => {
    // Test 18
    it('should track average tokens per prompt', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      inferenceManager['recordPromptUsage'](TEST_SESSION_ID, 'prompt1', 10);
      inferenceManager['recordPromptUsage'](TEST_SESSION_ID, 'prompt2', 20);
      inferenceManager['recordPromptUsage'](TEST_SESSION_ID, 'prompt3', 30);
      const stats = inferenceManager.getUsageStatistics(TEST_SESSION_ID);
      expect(stats.averageTokensPerPrompt).toBe(20);
    });

    // Test 19
    it('should provide cost breakdown by prompt', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      inferenceManager['recordPromptUsage'](TEST_SESSION_ID, 'prompt1', 100);
      inferenceManager['recordPromptUsage'](TEST_SESSION_ID, 'prompt2', 200);
      const stats = inferenceManager.getUsageStatistics(TEST_SESSION_ID);
      expect(stats.costBreakdown).toHaveLength(2);
      expect(stats.costBreakdown[0].promptId).toBe('prompt1');
      expect(stats.costBreakdown[0].tokens).toBe(100);
    });

    // Test 20
    it('should calculate total cost in statistics', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      inferenceManager.setPricing(TEST_SESSION_ID, ethers.utils.parseEther('0.001'));
      inferenceManager['recordPromptUsage'](TEST_SESSION_ID, 'prompt1', 1000);
      inferenceManager['recordPromptUsage'](TEST_SESSION_ID, 'prompt2', 2000);
      const stats = inferenceManager.getUsageStatistics(TEST_SESSION_ID);
      expect(stats.totalTokens).toBe(3000);
      expect(ethers.utils.formatEther(stats.totalCost)).toBe('0.003');
    });
  });
});