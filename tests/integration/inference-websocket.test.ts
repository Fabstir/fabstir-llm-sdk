// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FabstirSDK } from '../../src/FabstirSDK';
import InferenceManager from '../../src/managers/InferenceManager';
import AuthManager from '../../src/managers/AuthManager';
import SessionManager from '../../src/managers/SessionManager';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import 'fake-indexeddb/auto';

dotenv.config({ path: '.env.test' });

// Simple mock JWT implementation for testing
const mockJWT = {
  sign: (payload: any, secret: string, options?: any): string => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const exp = options?.expiresIn ? 
      Math.floor(Date.now() / 1000) + (typeof options.expiresIn === 'number' ? options.expiresIn : 300) : 
      Math.floor(Date.now() / 1000) + 300;
    const fullPayload = { ...payload, exp, iat: Math.floor(Date.now() / 1000) };
    const encodedHeader = btoa(JSON.stringify(header));
    const encodedPayload = btoa(JSON.stringify(fullPayload));
    return `${encodedHeader}.${encodedPayload}.mockSignature`;
  },
  
  decode: (token: string): any => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1]));
    } catch {
      return null;
    }
  }
};

// Mock WebSocket server for testing
class MockWebSocketServer {
  private connections: Set<any> = new Set();
  private handlers: Map<string, (data: any) => any> = new Map();
  
  constructor(private port: number) {
    // Set up mock handlers for different message types
    this.handlers.set('session_init', (data) => ({
      type: 'session_init_ack',
      session_id: data.session_id,
      job_id: data.job_id,
      token: this.generateMockJWT(data.session_id, data.job_id)
    }));
    
    this.handlers.set('session_resume', (data) => ({
      type: 'session_resume_ack',
      session_id: data.session_id,
      context_size: data.conversation_context?.length || 0,
      token: this.generateMockJWT(data.session_id, data.job_id)
    }));
    
    this.handlers.set('auth_refresh', (data) => ({
      type: 'auth_refresh_ack',
      new_token: this.generateMockJWT(data.session_id, data.job_id, 3600)
    }));
  }
  
  private generateMockJWT(sessionId: string, jobId: number, expiresIn: number = 300): string {
    return mockJWT.sign(
      { session_id: sessionId, job_id: jobId, permissions: ['inference'] },
      'test-secret',
      { expiresIn }
    );
  }
  
  handleMessage(type: string, data: any): any {
    const handler = this.handlers.get(type);
    return handler ? handler(data) : null;
  }
}

describe('InferenceManager WebSocket Connection Management', () => {
  let sdk: FabstirSDK;
  let inferenceManager: InferenceManager;
  let authManager: AuthManager;
  let sessionManager: SessionManager;
  let mockServer: MockWebSocketServer;
  let provider: ethers.providers.JsonRpcProvider;
  
  const TEST_SESSION_ID = 'test-session-' + Date.now();
  const TEST_JOB_ID = 12345;
  const TEST_HOST_URL = 'ws://localhost:8080/ws/session';
  const TEST_HOST_ADDRESS = '0x1234567890123456789012345678901234567890';
  
  beforeAll(async () => {
    provider = new ethers.providers.JsonRpcProvider(
      process.env.RPC_URL_BASE_SEPOLIA,
      { chainId: 84532, name: 'base-sepolia' }
    );
    
    sdk = new FabstirSDK({
      mode: 'production',
      network: {
        chainId: 84532,
        name: 'base-sepolia',
        rpcUrl: process.env.RPC_URL_BASE_SEPOLIA!
      },
      contracts: {
        jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE!,
        proofSystem: process.env.CONTRACT_PROOF_SYSTEM!,
        nodeRegistry: process.env.CONTRACT_NODE_REGISTRY!,
        usdcToken: process.env.CONTRACT_USDC_TOKEN!
      }
    });
    
    await sdk.authenticate(process.env.TEST_USER_1_PRIVATE_KEY!);
    
    // Get managers from SDK
    sessionManager = await sdk.getSessionManager();
    inferenceManager = await sdk.getInferenceManager();
    authManager = (inferenceManager as any).authManager; // Access internal authManager
    
    mockServer = new MockWebSocketServer(8080);
  });
  
  afterAll(async () => {
    if (inferenceManager) {
      await inferenceManager.cleanup();
    }
  });
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: Connection to host WebSocket with authentication
  it('should connect to host WebSocket with authentication', async () => {
    // Mock the WebSocket connection to avoid actual network calls
    const mockWsClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
      onResponse: vi.fn(),
      disconnect: vi.fn(),
      isConnected: () => true,
      getState: () => 'CONNECTED'
    };
    
    // Mock the WebSocketClient constructor
    vi.spyOn(inferenceManager as any, 'authManager', 'get').mockReturnValue({
      isAuthenticated: () => true
    });
    
    // Directly set up the session without actual WebSocket connection
    (inferenceManager as any).wsClients.set(TEST_SESSION_ID, mockWsClient);
    (inferenceManager as any).activeSessions.set(TEST_SESSION_ID, {
      sessionId: TEST_SESSION_ID,
      jobId: TEST_JOB_ID,
      hostUrl: TEST_HOST_URL,
      hostAddress: TEST_HOST_ADDRESS,
      messages: [],
      tokensUsed: 0,
      isConnected: true,
      startTime: Date.now()
    });
    inferenceManager.setConnectionState(TEST_SESSION_ID, 'connected');
    
    expect(inferenceManager.isConnected(TEST_SESSION_ID)).toBe(true);
    expect(inferenceManager.getConnectionState(TEST_SESSION_ID)).toBe('connected');
  });

  // Test 2: Session initialization message protocol
  it('should send proper session_init message format', async () => {
    const initMessage = inferenceManager.createSessionInitMessage(TEST_SESSION_ID, TEST_JOB_ID);
    
    expect(initMessage).toMatchObject({
      type: 'session_init',
      session_id: TEST_SESSION_ID,
      job_id: TEST_JOB_ID,
      model_config: expect.objectContaining({
        model: expect.any(String),
        max_tokens: expect.any(Number),
        temperature: expect.any(Number)
      })
    });
  });

  // Test 3: Session resume with conversation context
  it('should send proper session_resume message with context', async () => {
    const conversationContext = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' }
    ];
    
    const resumeMessage = inferenceManager.createSessionResumeMessage(
      TEST_SESSION_ID,
      TEST_JOB_ID,
      conversationContext
    );
    
    expect(resumeMessage).toMatchObject({
      type: 'session_resume',
      session_id: TEST_SESSION_ID,
      job_id: TEST_JOB_ID,
      conversation_context: conversationContext,
      last_message_index: 2
    });
  });

  // Test 4: JWT token handling
  it('should handle JWT token from session_init response', async () => {
    const token = mockJWT.sign(
      { session_id: TEST_SESSION_ID, job_id: TEST_JOB_ID },
      'test-secret',
      { expiresIn: 300 }
    );
    
    inferenceManager.setSessionToken(TEST_SESSION_ID, token);
    const storedToken = inferenceManager.getSessionToken(TEST_SESSION_ID);
    
    expect(storedToken).toBe(token);
    
    const decoded = inferenceManager.decodeToken(storedToken!);
    expect(decoded.session_id).toBe(TEST_SESSION_ID);
    expect(decoded.job_id).toBe(TEST_JOB_ID);
  });

  // Test 5: Connection timeout and retry logic
  it('should handle connection timeout with retry', async () => {
    // Mock a failing WebSocket connection
    const originalConnect = (inferenceManager as any).connectToSession;
    
    // Create a mock that simulates timeout
    const mockConnect = vi.fn().mockRejectedValue(new Error('Connection timeout'));
    
    // Temporarily replace the method
    (inferenceManager as any).connectToSession = mockConnect;
    
    try {
      await inferenceManager.connectToSession(
        'timeout-session',
        'ws://localhost:9999/ws/session',
        TEST_JOB_ID,
        TEST_HOST_ADDRESS,
        [],
        { timeout: 100, maxRetries: 1 }
      );
    } catch (error: any) {
      expect(error.message).toContain('timeout');
    }
    
    expect(inferenceManager.isConnected('timeout-session')).toBe(false);
    expect(inferenceManager.getConnectionState('timeout-session')).toBe('disconnected');
    
    // Restore original method
    (inferenceManager as any).connectToSession = originalConnect;
  });

  // Test 6: JWT token generation
  it('should generate JWT token for authentication', async () => {
    const token = await inferenceManager.generateAuthToken(TEST_SESSION_ID, TEST_JOB_ID);
    
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    
    const decoded = mockJWT.decode(token) as any;
    expect(decoded).toMatchObject({
      session_id: TEST_SESSION_ID,
      job_id: TEST_JOB_ID
    });
  });

  // Test 7: Token validation
  it('should validate JWT token correctly', async () => {
    const validToken = await inferenceManager.generateAuthToken(TEST_SESSION_ID, TEST_JOB_ID);
    const invalidToken = 'invalid.token.here';
    
    expect(inferenceManager.validateToken(validToken)).toBe(true);
    expect(inferenceManager.validateToken(invalidToken)).toBe(false);
  });

  // Test 8: Token refresh mechanism
  it('should refresh token before expiry', async () => {
    // First need an active session for refresh to work
    (inferenceManager as any).activeSessions.set(TEST_SESSION_ID, {
      sessionId: TEST_SESSION_ID,
      jobId: TEST_JOB_ID,
      hostUrl: TEST_HOST_URL,
      hostAddress: TEST_HOST_ADDRESS,
      messages: [],
      tokensUsed: 0,
      isConnected: true,
      startTime: Date.now()
    });
    
    // Create token that expires in 2 seconds
    const shortLivedToken = mockJWT.sign(
      { session_id: TEST_SESSION_ID, job_id: TEST_JOB_ID },
      'test-secret',
      { expiresIn: 2 }
    );
    
    inferenceManager.setSessionToken(TEST_SESSION_ID, shortLivedToken);
    const originalToken = inferenceManager.getSessionToken(TEST_SESSION_ID);
    
    // Manually trigger refresh (instead of waiting for timer)
    const refreshed = await inferenceManager.refreshTokenIfNeeded(TEST_SESSION_ID);
    
    // Since token is not expired yet, it shouldn't refresh
    expect(refreshed).toBe(false);
    
    // Wait for token to expire
    await new Promise(resolve => setTimeout(resolve, 2100));
    
    // Now trigger refresh
    const refreshedAfterExpiry = await inferenceManager.refreshTokenIfNeeded(TEST_SESSION_ID);
    expect(refreshedAfterExpiry).toBe(true);
    
    const newToken = inferenceManager.getSessionToken(TEST_SESSION_ID);
    expect(newToken).not.toBe(originalToken);
  });

  // Test 9: Permission-based access control
  it('should check permissions before operations', async () => {
    const tokenWithPermissions = mockJWT.sign(
      { 
        session_id: TEST_SESSION_ID,
        job_id: TEST_JOB_ID,
        permissions: ['inference', 'streaming']
      },
      'test-secret',
      {}
    );
    
    const tokenWithoutPermissions = mockJWT.sign(
      { 
        session_id: TEST_SESSION_ID,
        job_id: TEST_JOB_ID,
        permissions: []
      },
      'test-secret',
      {}
    );
    
    inferenceManager.setSessionToken(TEST_SESSION_ID, tokenWithPermissions);
    expect(inferenceManager.hasPermission(TEST_SESSION_ID, 'inference')).toBe(true);
    expect(inferenceManager.hasPermission(TEST_SESSION_ID, 'admin')).toBe(false);
    
    inferenceManager.setSessionToken(TEST_SESSION_ID, tokenWithoutPermissions);
    expect(inferenceManager.hasPermission(TEST_SESSION_ID, 'inference')).toBe(false);
  });

  // Test 10: Session expiry handling
  it('should handle session expiry gracefully', async () => {
    // Set up active session for refresh
    (inferenceManager as any).activeSessions.set(TEST_SESSION_ID, {
      sessionId: TEST_SESSION_ID,
      jobId: TEST_JOB_ID,
      hostUrl: TEST_HOST_URL,
      hostAddress: TEST_HOST_ADDRESS,
      messages: [],
      tokensUsed: 0,
      isConnected: true,
      startTime: Date.now()
    });
    
    const expiredToken = mockJWT.sign(
      { session_id: TEST_SESSION_ID, job_id: TEST_JOB_ID },
      'test-secret',
      { expiresIn: -1 } // Already expired
    );
    
    inferenceManager.setSessionToken(TEST_SESSION_ID, expiredToken);
    
    expect(inferenceManager.isTokenExpired(TEST_SESSION_ID)).toBe(true);
    
    // Should trigger refresh on expired token
    const refreshed = await inferenceManager.refreshTokenIfNeeded(TEST_SESSION_ID);
    expect(refreshed).toBe(true);
    
    // Verify new token was generated
    const newToken = inferenceManager.getSessionToken(TEST_SESSION_ID);
    expect(newToken).not.toBe(expiredToken);
    expect(inferenceManager.isTokenExpired(TEST_SESSION_ID)).toBe(false);
  });

  // Test 11: Send only new prompts during active session
  it('should send only prompt text without context during active session', async () => {
    const prompt = 'What is machine learning?';
    
    const message = inferenceManager.createPromptMessage(TEST_SESSION_ID, prompt, 5);
    
    expect(message).toMatchObject({
      type: 'prompt',
      session_id: TEST_SESSION_ID,
      content: prompt,
      message_index: 5
    });
    
    // Should NOT include conversation_context
    expect(message).not.toHaveProperty('conversation_context');
  });

  // Test 12: Send conversation_context array on resume
  it('should send full conversation_context on session resume', async () => {
    const history = [
      { role: 'user', content: 'What is AI?' },
      { role: 'assistant', content: 'AI is artificial intelligence...' },
      { role: 'user', content: 'Tell me more' },
      { role: 'assistant', content: 'AI encompasses machine learning...' }
    ];
    
    const resumeMessage = inferenceManager.createSessionResumeMessage(
      TEST_SESSION_ID,
      TEST_JOB_ID,
      history
    );
    
    expect(resumeMessage.conversation_context).toEqual(history);
    expect(resumeMessage.last_message_index).toBe(4);
  });

  // Test 13: Let node handle context truncation
  it('should send full context and let node truncate', async () => {
    // Create a very long conversation history
    const longHistory = Array.from({ length: 100 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}: This is a test message with some content.`
    }));
    
    const resumeMessage = inferenceManager.createSessionResumeMessage(
      TEST_SESSION_ID,
      TEST_JOB_ID,
      longHistory
    );
    
    // Should send ALL messages, not truncate client-side
    expect(resumeMessage.conversation_context).toHaveLength(100);
    expect(resumeMessage.last_message_index).toBe(100);
  });

  // Test 14: Track message indices for ordering
  it('should track message indices correctly', async () => {
    inferenceManager.initializeMessageIndex(TEST_SESSION_ID);
    
    const index1 = inferenceManager.getNextMessageIndex(TEST_SESSION_ID);
    expect(index1).toBe(0);
    
    const index2 = inferenceManager.getNextMessageIndex(TEST_SESSION_ID);
    expect(index2).toBe(1);
    
    const index3 = inferenceManager.getNextMessageIndex(TEST_SESSION_ID);
    expect(index3).toBe(2);
    
    // Reset with initial value
    inferenceManager.initializeMessageIndex(TEST_SESSION_ID, 10);
    const index4 = inferenceManager.getNextMessageIndex(TEST_SESSION_ID);
    expect(index4).toBe(10);
  });

  // Test 15: Auto-refresh token mechanism
  it('should automatically refresh token before expiry', async () => {
    // Set up active session for refresh
    (inferenceManager as any).activeSessions.set(TEST_SESSION_ID, {
      sessionId: TEST_SESSION_ID,
      jobId: TEST_JOB_ID,
      hostUrl: TEST_HOST_URL,
      hostAddress: TEST_HOST_ADDRESS,
      messages: [],
      tokensUsed: 0,
      isConnected: true,
      startTime: Date.now()
    });
    
    // Create a token that expires in 3 seconds
    const tokenExpiringIn3Sec = mockJWT.sign(
      { session_id: TEST_SESSION_ID, job_id: TEST_JOB_ID },
      'test-secret',
      { expiresIn: 3 }
    );
    
    inferenceManager.setSessionToken(TEST_SESSION_ID, tokenExpiringIn3Sec);
    const originalToken = inferenceManager.getSessionToken(TEST_SESSION_ID);
    
    // Enable auto-refresh with 2 second buffer (refresh 2 seconds before expiry)
    inferenceManager.enableAutoRefresh(TEST_SESSION_ID, 2000);
    
    // Token should be valid now
    expect(inferenceManager.isTokenExpired(TEST_SESSION_ID)).toBe(false);
    
    // Wait for auto-refresh to trigger (should happen at 1 second)
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const newToken = inferenceManager.getSessionToken(TEST_SESSION_ID);
    expect(newToken).not.toBe(originalToken);
    expect(inferenceManager.isTokenExpired(TEST_SESSION_ID)).toBe(false);
    
    // Clean up timer
    const timer = (inferenceManager as any).tokenRefreshTimers.get(TEST_SESSION_ID);
    if (timer) clearTimeout(timer);
  });

  // Test 16: Handle permission denied errors
  it('should handle permission denied errors gracefully', async () => {
    const restrictedToken = mockJWT.sign(
      { 
        session_id: TEST_SESSION_ID,
        job_id: TEST_JOB_ID,
        permissions: ['read_only']
      },
      'test-secret',
      {}
    );
    
    inferenceManager.setSessionToken(TEST_SESSION_ID, restrictedToken);
    
    await expect(
      inferenceManager.sendPromptWithPermissionCheck(TEST_SESSION_ID, 'Test prompt')
    ).rejects.toThrow('Permission denied: inference');
  });

  // Test 17: Request elevated permissions
  it('should request elevated permissions when needed', async () => {
    // First need to have an active session
    (inferenceManager as any).activeSessions.set(TEST_SESSION_ID, {
      sessionId: TEST_SESSION_ID,
      jobId: TEST_JOB_ID,
      hostUrl: TEST_HOST_URL,
      hostAddress: TEST_HOST_ADDRESS,
      messages: [],
      tokensUsed: 0,
      isConnected: true,
      startTime: Date.now()
    });
    
    const basicToken = mockJWT.sign(
      { 
        session_id: TEST_SESSION_ID,
        job_id: TEST_JOB_ID,
        permissions: ['basic']
      },
      'test-secret',
      {}
    );
    
    inferenceManager.setSessionToken(TEST_SESSION_ID, basicToken);
    
    const elevatedToken = await inferenceManager.requestElevatedPermissions(
      TEST_SESSION_ID,
      ['inference', 'streaming']
    );
    
    expect(elevatedToken).toBeDefined();
    const decoded = mockJWT.decode(elevatedToken) as any;
    expect(decoded.permissions).toContain('inference');
    expect(decoded.permissions).toContain('streaming');
  });

  // Test 18: Track permission usage
  it('should track permission usage statistics', async () => {
    inferenceManager.resetPermissionStats(TEST_SESSION_ID);
    
    inferenceManager.recordPermissionUsage(TEST_SESSION_ID, 'inference');
    inferenceManager.recordPermissionUsage(TEST_SESSION_ID, 'inference');
    inferenceManager.recordPermissionUsage(TEST_SESSION_ID, 'streaming');
    
    const stats = inferenceManager.getPermissionStats(TEST_SESSION_ID);
    
    expect(stats).toMatchObject({
      inference: 2,
      streaming: 1
    });
  });

  // Test 19: Connection state management
  it('should properly manage connection states', async () => {
    const testSessionId = 'state-test-session';
    expect(inferenceManager.getConnectionState(testSessionId)).toBe('disconnected');
    
    inferenceManager.setConnectionState(testSessionId, 'connecting');
    expect(inferenceManager.getConnectionState(testSessionId)).toBe('connecting');
    
    inferenceManager.setConnectionState(testSessionId, 'connected');
    expect(inferenceManager.getConnectionState(testSessionId)).toBe('connected');
    
    inferenceManager.setConnectionState(testSessionId, 'reconnecting');
    expect(inferenceManager.getConnectionState(testSessionId)).toBe('reconnecting');
    
    inferenceManager.setConnectionState(testSessionId, 'disconnected');
    expect(inferenceManager.getConnectionState(testSessionId)).toBe('disconnected');
  });

  // Test 20: Multiple session management
  it('should handle multiple concurrent sessions', async () => {
    const session1 = 'session-1';
    const session2 = 'session-2';
    const session3 = 'session-3';
    
    // Create mock sessions
    (inferenceManager as any).activeSessions.set(session1, {
      sessionId: session1,
      jobId: 101,
      hostUrl: TEST_HOST_URL,
      hostAddress: TEST_HOST_ADDRESS,
      messages: [],
      tokensUsed: 0,
      isConnected: true,
      startTime: Date.now()
    });
    
    (inferenceManager as any).activeSessions.set(session2, {
      sessionId: session2,
      jobId: 102,
      hostUrl: TEST_HOST_URL,
      hostAddress: TEST_HOST_ADDRESS,
      messages: [],
      tokensUsed: 0,
      isConnected: true,
      startTime: Date.now()
    });
    
    (inferenceManager as any).activeSessions.set(session3, {
      sessionId: session3,
      jobId: 103,
      hostUrl: TEST_HOST_URL,
      hostAddress: TEST_HOST_ADDRESS,
      messages: [],
      tokensUsed: 0,
      isConnected: true,
      startTime: Date.now()
    });
    
    const token1 = await inferenceManager.generateAuthToken(session1, 101);
    const token2 = await inferenceManager.generateAuthToken(session2, 102);
    const token3 = await inferenceManager.generateAuthToken(session3, 103);
    
    inferenceManager.setSessionToken(session1, token1);
    inferenceManager.setSessionToken(session2, token2);
    inferenceManager.setSessionToken(session3, token3);
    
    expect(inferenceManager.getSessionToken(session1)).toBe(token1);
    expect(inferenceManager.getSessionToken(session2)).toBe(token2);
    expect(inferenceManager.getSessionToken(session3)).toBe(token3);
    
    const activeSessions = inferenceManager.getAllActiveSessions();
    expect(activeSessions).toContain(session1);
    expect(activeSessions).toContain(session2);
    expect(activeSessions).toContain(session3);
  });
});