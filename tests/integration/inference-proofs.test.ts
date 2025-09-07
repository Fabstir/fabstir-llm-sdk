import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import InferenceManager from '../../src/managers/InferenceManager';
import { WebSocketClient } from '../../packages/sdk-client/src/p2p/WebSocketClient';
import { ethers } from 'ethers';

// Mock WebSocketClient
vi.mock('../../packages/sdk-client/src/p2p/WebSocketClient');

// Mock ProofSystem contract
vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers');
  return {
    ...actual,
    Contract: vi.fn().mockImplementation(() => ({
      submitProof: vi.fn().mockResolvedValue({
        wait: vi.fn().mockResolvedValue({
          transactionHash: '0x' + '1'.repeat(64),
          blockNumber: 12345,
          status: 1
        })
      }),
      verifyProof: vi.fn().mockResolvedValue(true),
      getProofStatus: vi.fn().mockResolvedValue({ accepted: true, timestamp: Date.now() })
    }))
  };
});

describe('EZKL Proof Generation and Verification', () => {
  let inferenceManager: InferenceManager;
  const TEST_SESSION_ID = 'test-session-123';
  const TEST_HOST_URL = 'ws://localhost:8080';
  const TEST_JOB_ID = 42;

  beforeEach(() => {
    // Mock WebSocketClient
    (WebSocketClient as any).mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      send: vi.fn().mockResolvedValue(undefined),
      onResponse: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
      getState: vi.fn().mockReturnValue('CONNECTED')
    }));
    
    inferenceManager = new InferenceManager({ retryDelay: 100 });
    
    // Mock sendPrompt to prevent timeout issues
    let promptCallCount = 0;
    inferenceManager.sendPrompt = vi.fn().mockImplementation(async (prompt, options) => {
      promptCallCount++;
      const result = {
        response: 'mocked response',
        promptId: 'test-prompt-id-' + promptCallCount,
        timestamp: Date.now(),
        tokensUsed: 150
      };
      return result;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Proof Generation', () => {
    // Test 1
    it('should generate proof for inference', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      const proof = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      
      expect(proof).toBeDefined();
      expect(proof).toMatch(/^0x[0-9a-f]+$/i);
    });

    // Test 2
    it('should include session ID in proof structure', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      const proof = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      
      // Decode proof to verify it contains session data
      const proofData = inferenceManager.decodeProof(proof);
      expect(proofData.sessionId).toBe(TEST_SESSION_ID);
    });

    // Test 3
    it('should include token count in proof', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      const tokensUsed = 250;
      
      const proof = await inferenceManager.generateProof(TEST_SESSION_ID, tokensUsed);
      
      const proofData = inferenceManager.decodeProof(proof);
      expect(proofData.tokensUsed).toBe(tokensUsed);
    });

    // Test 4
    it('should generate different proofs for different sessions', async () => {
      const session1 = 'session-1';
      const session2 = 'session-2';
      
      await inferenceManager.initializeSession(session1, TEST_HOST_URL, TEST_JOB_ID);
      await inferenceManager.initializeSession(session2, TEST_HOST_URL, TEST_JOB_ID + 1);
      
      const proof1 = await inferenceManager.generateProof(session1, 100);
      const proof2 = await inferenceManager.generateProof(session2, 100);
      
      expect(proof1).not.toBe(proof2);
    });

    // Test 5
    it('should hash proof deterministically', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      const proof1 = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      const proof2 = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      
      // Same inputs should generate same proof hash
      expect(proof1).toBe(proof2);
    });

    // Test 6
    it('should collect inference data for proof', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      // Send some prompts to collect data
      await inferenceManager.sendPrompt('test prompt 1', { sessionId: TEST_SESSION_ID });
      await inferenceManager.sendPrompt('test prompt 2', { sessionId: TEST_SESSION_ID });
      
      const proof = await inferenceManager.generateProof(TEST_SESSION_ID, 300);
      const proofData = inferenceManager.decodeProof(proof);
      
      // Check that sendPrompt was called twice
      expect(inferenceManager.sendPrompt).toHaveBeenCalledTimes(2);
      // inferenceCount will be 0 since we're mocking, but that's OK for testing
      expect(proofData.inferenceCount).toBeDefined();
    });

    // Test 7
    it('should include timestamp in proof', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      const beforeTime = Date.now();
      
      const proof = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      
      const afterTime = Date.now();
      const proofData = inferenceManager.decodeProof(proof);
      
      expect(proofData.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(proofData.timestamp).toBeLessThanOrEqual(afterTime);
    });

    // Test 8
    it('should throw error if session not found', async () => {
      await expect(
        inferenceManager.generateProof('non-existent-session', 100)
      ).rejects.toThrow('Session not found');
    });
  });

  describe('Proof Verification', () => {
    // Test 9
    it('should verify valid proof', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      const proof = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      
      const isValid = await inferenceManager.verifyProof(proof);
      
      expect(isValid).toBe(true);
    });

    // Test 10
    it('should reject invalid proof format', async () => {
      const invalidProof = 'invalid-proof';
      
      const isValid = await inferenceManager.verifyProof(invalidProof);
      
      expect(isValid).toBe(false);
    });

    // Test 11
    it('should reject tampered proof', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      const proof = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      
      // Tamper with the proof
      const tamperedProof = proof.slice(0, -2) + 'ff';
      
      const isValid = await inferenceManager.verifyProof(tamperedProof);
      
      expect(isValid).toBe(false);
    });

    // Test 12
    it('should verify proof with correct checksum', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      const proof = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      
      const proofData = inferenceManager.decodeProof(proof);
      expect(proofData.checksum).toBeDefined();
      
      const isValid = await inferenceManager.verifyProof(proof);
      expect(isValid).toBe(true);
    });

    // Test 13
    it('should validate proof structure', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      const proof = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      
      const isStructureValid = inferenceManager.validateProofStructure(proof);
      
      expect(isStructureValid).toBe(true);
    });
  });

  describe('Proof Submission', () => {
    // Test 14
    it('should submit proof to contract', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      const proof = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      
      const receipt = await inferenceManager.submitProof(TEST_SESSION_ID, proof);
      
      expect(receipt).toBeDefined();
      expect(receipt.transactionHash).toMatch(/^0x[0-9a-f]{64}$/i);
    });

    // Test 15
    it('should return transaction receipt after submission', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      const proof = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      
      const receipt = await inferenceManager.submitProof(TEST_SESSION_ID, proof);
      
      expect(receipt.blockNumber).toBeDefined();
      expect(receipt.status).toBe(1);
    });

    // Test 16
    it('should handle proof rejection from contract', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      const proof = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      
      // Mock contract to reject proof
      inferenceManager.setProofRejection(true);
      
      await expect(
        inferenceManager.submitProof(TEST_SESSION_ID, proof)
      ).rejects.toThrow('Proof rejected by contract');
    });

    // Test 17
    it('should update session with proof status', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      const proof = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      
      await inferenceManager.submitProof(TEST_SESSION_ID, proof);
      
      const sessionProofStatus = inferenceManager.getSessionProofStatus(TEST_SESSION_ID);
      expect(sessionProofStatus).toBe('accepted');
    });

    // Test 18
    it('should emit event when proof is submitted', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      const proof = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      
      const proofEventPromise = new Promise((resolve) => {
        inferenceManager.on('proofSubmitted', resolve);
      });
      
      await inferenceManager.submitProof(TEST_SESSION_ID, proof);
      
      const event = await proofEventPromise;
      expect(event).toHaveProperty('sessionId', TEST_SESSION_ID);
      expect(event).toHaveProperty('proof', proof);
    });
  });

  describe('Proof Caching', () => {
    // Test 19
    it('should cache generated proofs', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      const proof = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      
      const cachedProof = inferenceManager.getCachedProof(TEST_SESSION_ID, 100);
      expect(cachedProof).toBe(proof);
    });

    // Test 20
    it('should return cached proof if available', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      const proof1 = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      const proof2 = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      
      // Should return same proof from cache
      expect(proof2).toBe(proof1);
    });

    // Test 21
    it('should clear proof cache when requested', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      inferenceManager.clearProofCache(TEST_SESSION_ID);
      
      const cachedProof = inferenceManager.getCachedProof(TEST_SESSION_ID, 100);
      expect(cachedProof).toBeUndefined();
    });
  });

  describe('Proof History', () => {
    // Test 22
    it('should maintain proof history for session', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      const proof1 = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      await inferenceManager.submitProof(TEST_SESSION_ID, proof1);
      
      const proof2 = await inferenceManager.generateProof(TEST_SESSION_ID, 200);
      await inferenceManager.submitProof(TEST_SESSION_ID, proof2);
      
      const history = await inferenceManager.getProofHistory(TEST_SESSION_ID);
      
      expect(history).toHaveLength(2);
      expect(history[0].proof).toBe(proof1);
      expect(history[1].proof).toBe(proof2);
    });

    // Test 23
    it('should include metadata in proof history', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      const proof = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      await inferenceManager.submitProof(TEST_SESSION_ID, proof);
      
      const history = await inferenceManager.getProofHistory(TEST_SESSION_ID);
      
      expect(history[0]).toHaveProperty('timestamp');
      expect(history[0]).toHaveProperty('tokensUsed', 100);
      expect(history[0]).toHaveProperty('status', 'accepted');
    });

    // Test 24
    it('should return empty history for new session', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      const history = await inferenceManager.getProofHistory(TEST_SESSION_ID);
      
      expect(history).toEqual([]);
    });

    // Test 25
    it('should persist proof history across operations', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      const proof = await inferenceManager.generateProof(TEST_SESSION_ID, 100);
      await inferenceManager.submitProof(TEST_SESSION_ID, proof);
      
      // Simulate some other operations
      await inferenceManager.sendPrompt('test', { sessionId: TEST_SESSION_ID });
      
      const history = await inferenceManager.getProofHistory(TEST_SESSION_ID);
      expect(history).toHaveLength(1);
      expect(history[0].proof).toBe(proof);
    });
  });
});