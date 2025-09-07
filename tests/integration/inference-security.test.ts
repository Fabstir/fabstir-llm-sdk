import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import InferenceManager from '../../src/managers/InferenceManager';
import { WebSocketClient } from '../../packages/sdk-client/src/p2p/WebSocketClient';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';

// Mock WebSocketClient
vi.mock('../../packages/sdk-client/src/p2p/WebSocketClient');

// Mock jsonwebtoken
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(),
    verify: vi.fn(),
    decode: vi.fn()
  }
}));

describe('Inference Security Integration', () => {
  let inferenceManager: InferenceManager;
  const TEST_SESSION_ID = 'test-session-123';
  const TEST_HOST_URL = 'ws://localhost:8080';
  const TEST_JOB_ID = 42;
  const TEST_JWT_SECRET = 'test-secret-key';

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
    inferenceManager.sendPrompt = vi.fn().mockResolvedValue({ 
      response: 'mocked',
      promptId: 'test-prompt-id',
      timestamp: Date.now()
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('JWT Authentication', () => {
    // Test 1
    it('should authenticate session with JWT token', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      const token = await inferenceManager.authenticateSession(TEST_JOB_ID);
      
      // Verify it's a valid JWT-like token structure
      expect(token).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
      
      // Verify payload contains jobId
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      expect(payload.jobId).toBe(TEST_JOB_ID);
    });

    // Test 2
    it('should refresh expired token', async () => {
      // Create a valid token first
      const originalToken = await inferenceManager.authenticateSession(TEST_JOB_ID);
      
      // Refresh it
      const refreshed = await inferenceManager.refreshToken(originalToken);
      
      // Verify it's a new valid token
      expect(refreshed).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
      expect(refreshed).not.toBe(originalToken);
    });

    // Test 3
    it('should validate JWT token claims', async () => {
      const validToken = await inferenceManager.authenticateSession(TEST_JOB_ID);
      
      const isValid = inferenceManager.validateToken(validToken);
      expect(isValid).toBe(true);
    });

    // Test 4
    it('should reject invalid JWT token', () => {
      const invalidToken = 'invalid-token';
      
      const isValid = inferenceManager.validateToken(invalidToken);
      expect(isValid).toBe(false);
    });

    // Test 5
    it('should auto-refresh token before expiry', async () => {
      vi.useFakeTimers();
      
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      const initialToken = await inferenceManager.authenticateSession(TEST_JOB_ID);
      inferenceManager.setCurrentToken(TEST_SESSION_ID, initialToken);
      inferenceManager.setAutoRefresh(true, initialToken);
      
      // Fast forward to 1 minute before expiry
      vi.advanceTimersByTime(3540000); // 59 minutes
      
      // Allow async refresh to complete
      await vi.runAllTimersAsync();
      
      // Check that token was refreshed
      const currentToken = inferenceManager.getCurrentToken(TEST_SESSION_ID);
      expect(currentToken).toBeDefined();
      expect(currentToken).not.toBe(initialToken);
      
      vi.useRealTimers();
    });
  });

  describe('Ed25519 Signing', () => {
    // Test 6
    it('should generate Ed25519 key pair', async () => {
      const keyPair = await inferenceManager.generateKeyPair();
      expect(keyPair).toHaveProperty('publicKey');
      expect(keyPair).toHaveProperty('privateKey');
      expect(keyPair.publicKey).toMatch(/^0x[0-9a-f]{64}$/i);
      expect(keyPair.privateKey).toMatch(/^0x[0-9a-f]{64}$/i);
    });

    // Test 7
    it('should sign messages with Ed25519', async () => {
      const message = 'Important prompt requiring signature';
      const keyPair = await inferenceManager.generateKeyPair();
      
      const signature = await inferenceManager.signMessage(message, keyPair.privateKey);
      expect(signature).toMatch(/^0x[0-9a-f]{128}$/i);
    });

    // Test 8
    it('should verify valid Ed25519 signatures', async () => {
      const message = 'Test message';
      const keyPair = await inferenceManager.generateKeyPair();
      const signature = await inferenceManager.signMessage(message, keyPair.privateKey);
      
      const isValid = await inferenceManager.verifySignature(
        message,
        signature,
        keyPair.publicKey
      );
      expect(isValid).toBe(true);
    });

    // Test 9
    it('should reject invalid Ed25519 signatures', async () => {
      const message = 'Test message';
      const keyPair = await inferenceManager.generateKeyPair();
      const invalidSignature = '0x' + '0'.repeat(128);
      
      const isValid = await inferenceManager.verifySignature(
        message,
        invalidSignature,
        keyPair.publicKey
      );
      expect(isValid).toBe(false);
    });

    // Test 10
    it('should sign high-value prompts automatically', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      const keyPair = await inferenceManager.generateKeyPair();
      inferenceManager.setSigningKey(TEST_SESSION_ID, keyPair.privateKey);
      
      // Set high token limit that triggers signing
      inferenceManager.setTokenLimit(TEST_SESSION_ID, 10000);
      inferenceManager.setSigningThreshold(5); // Sign if > 5 tokens
      
      const prompt = 'This is a very expensive prompt with many tokens';
      const signSpy = vi.spyOn(inferenceManager, 'signMessage');
      
      // Send secure prompt with high token estimate
      await inferenceManager.sendSecurePrompt(TEST_SESSION_ID, prompt);
      
      expect(signSpy).toHaveBeenCalled();
      expect(inferenceManager.sendPrompt).toHaveBeenCalledWith(prompt, { sessionId: TEST_SESSION_ID });
    });

    // Test 11
    it('should store signing keys securely', async () => {
      const keyPair = await inferenceManager.generateKeyPair();
      await inferenceManager.storeKeyPair(TEST_SESSION_ID, keyPair);
      
      const retrieved = await inferenceManager.getKeyPair(TEST_SESSION_ID);
      expect(retrieved).toEqual(keyPair);
      
      // Verify keys are encrypted in storage
      const rawStorage = inferenceManager['keyStorage'].get(TEST_SESSION_ID);
      expect(rawStorage).not.toEqual(keyPair);
    });

    // Test 12
    it('should handle signature verification from node', async () => {
      const nodeMessage = { response: 'AI response', signature: '0x' + '1'.repeat(128) };
      const nodePublicKey = '0x' + '2'.repeat(64);
      
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      inferenceManager.setNodePublicKey(TEST_SESSION_ID, nodePublicKey);
      
      const verified = await inferenceManager.verifyNodeResponse(
        TEST_SESSION_ID,
        nodeMessage
      );
      expect(verified).toBeDefined();
    });
  });

  describe('Permission Controls', () => {
    // Test 13
    it('should check permissions before operations', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      inferenceManager.setPermissions(TEST_SESSION_ID, ['read', 'write']);
      
      const canRead = inferenceManager.hasPermission(TEST_SESSION_ID, 'read');
      const canDelete = inferenceManager.hasPermission(TEST_SESSION_ID, 'delete');
      
      expect(canRead).toBe(true);
      expect(canDelete).toBe(false);
    });

    // Test 14
    it('should handle permission denied errors', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      inferenceManager.setPermissions(TEST_SESSION_ID, ['read']);
      
      await expect(
        inferenceManager.performRestrictedOperation(TEST_SESSION_ID, 'write')
      ).rejects.toThrow('Permission denied: write');
    });

    // Test 15
    it('should request elevated permissions', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      inferenceManager.setPermissions(TEST_SESSION_ID, ['read']);
      
      const requested = await inferenceManager.requestPermission(TEST_SESSION_ID, 'write');
      expect(requested).toHaveProperty('status');
      expect(requested.status).toMatch(/pending|approved|denied/);
    });

    // Test 16
    it('should track permission usage', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      inferenceManager.setPermissions(TEST_SESSION_ID, ['read', 'write']);
      
      await inferenceManager.performRestrictedOperation(TEST_SESSION_ID, 'read');
      await inferenceManager.performRestrictedOperation(TEST_SESSION_ID, 'write');
      await inferenceManager.performRestrictedOperation(TEST_SESSION_ID, 'read');
      
      const usage = inferenceManager.getPermissionUsage(TEST_SESSION_ID);
      expect(usage.read).toBe(2);
      expect(usage.write).toBe(1);
    });

    // Test 17
    it('should enforce rate limits on permissions', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      inferenceManager.setPermissions(TEST_SESSION_ID, ['read']);
      inferenceManager.setRateLimit('read', 2, 60000); // 2 per minute
      
      await inferenceManager.performRestrictedOperation(TEST_SESSION_ID, 'read');
      await inferenceManager.performRestrictedOperation(TEST_SESSION_ID, 'read');
      
      await expect(
        inferenceManager.performRestrictedOperation(TEST_SESSION_ID, 'read')
      ).rejects.toThrow('Rate limit exceeded');
    });

    // Test 18
    it('should handle permission expiry', async () => {
      vi.useFakeTimers();
      
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      inferenceManager.setPermissions(TEST_SESSION_ID, ['read'], { expiresIn: 3600000 }); // 1 hour
      
      expect(inferenceManager.hasPermission(TEST_SESSION_ID, 'read')).toBe(true);
      
      // Fast forward past expiry
      vi.advanceTimersByTime(3700000);
      
      expect(inferenceManager.hasPermission(TEST_SESSION_ID, 'read')).toBe(false);
      
      vi.useRealTimers();
    });
  });

  describe('Security Integration', () => {
    // Test 19
    it('should integrate JWT with Ed25519 signing', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      const keyPair = await inferenceManager.generateKeyPair();
      
      // Authenticate and sign
      const token = await inferenceManager.authenticateSession(TEST_JOB_ID);
      const signedToken = await inferenceManager.signMessage(token, keyPair.privateKey);
      
      expect(token).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
      expect(signedToken).toMatch(/^0x[0-9a-f]{128}$/i);
    });

    // Test 20
    it('should enforce security policies across features', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      // Set security policy
      inferenceManager.setSecurityPolicy({
        requireAuth: true,
        requireSigning: true,
        minPermissions: ['read'],
        tokenExpiry: 3600
      });
      
      // Try to send prompt without auth
      await expect(
        inferenceManager.sendSecurePrompt(TEST_SESSION_ID, 'test prompt')
      ).rejects.toThrow('Authentication required');
      
      // Authenticate
      const token = await inferenceManager.authenticateSession(TEST_JOB_ID);
      inferenceManager.setCurrentToken(TEST_SESSION_ID, token);
      
      // Try without signing key
      await expect(
        inferenceManager.sendSecurePrompt(TEST_SESSION_ID, 'test prompt')
      ).rejects.toThrow('Signing key required');
      
      // Add signing key
      const keyPair = await inferenceManager.generateKeyPair();
      inferenceManager.setSigningKey(TEST_SESSION_ID, keyPair.privateKey);
      
      // Try without permissions
      await expect(
        inferenceManager.sendSecurePrompt(TEST_SESSION_ID, 'test prompt')
      ).rejects.toThrow('Insufficient permissions');
      
      // Add permissions
      inferenceManager.setPermissions(TEST_SESSION_ID, ['read', 'write']);
      
      // Now should work
      const result = await inferenceManager.sendSecurePrompt(TEST_SESSION_ID, 'test prompt');
      expect(result).toBeDefined();
      expect(result.response).toBe('mocked');
      expect(inferenceManager.sendPrompt).toHaveBeenCalledWith('test prompt', { sessionId: TEST_SESSION_ID })
    });
  });
});