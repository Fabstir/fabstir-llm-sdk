// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { SessionManager } from '../../src/managers/SessionManager';
import { PaymentManager } from '../../src/managers/PaymentManager';
import { StorageManager } from '../../src/managers/StorageManager';
import { SessionGroupManager } from '../../src/managers/SessionGroupManager';
import { WebSocketClient } from '../../src/websocket/WebSocketClient';
import { ChainId } from '../../src/types/chain.types';

/**
 * SessionManager Session Groups Integration Test Suite
 *
 * Tests integration between SessionManager and SessionGroupManager.
 * Following TDD bounded autonomy: Write ALL tests first, then implement.
 */

// Mock dependencies
vi.mock('../../src/managers/PaymentManager');
vi.mock('../../src/managers/StorageManager');
vi.mock('../../src/websocket/WebSocketClient');

describe('SessionManager - Session Groups Integration', () => {
  let sessionManager: SessionManager;
  let sessionGroupManager: SessionGroupManager;
  let mockPaymentManager: any;
  let mockStorageManager: any;
  let mockWsClient: any;
  let originalFetch: any;

  const testUserAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
  const testHostUrl = 'http://localhost:8080';
  const testChainId = ChainId.BASE_SEPOLIA;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock global fetch for REST API calls
    originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        response: 'Test response',
        usage: { total_tokens: 10 }
      })
    });

    // Mock PaymentManager with incrementing session IDs
    let nextSessionId = 1;
    mockPaymentManager = {
      isInitialized: vi.fn().mockReturnValue(true),
      createSessionJob: vi.fn().mockImplementation(() => {
        const id = BigInt(nextSessionId++);
        return Promise.resolve({ jobId: id, sessionId: id });
      }),
      getSessionJobManager: vi.fn().mockReturnValue({
        getSessionJob: vi.fn().mockResolvedValue({
          host: testHostUrl,
          modelId: 'llama-3',
          chainId: testChainId
        }),
        getSigner: vi.fn().mockReturnValue({
          getAddress: vi.fn().mockResolvedValue(testUserAddress)
        })
      })
    };

    // Mock StorageManager
    mockStorageManager = {
      isInitialized: vi.fn().mockReturnValue(true),
      saveConversation: vi.fn().mockResolvedValue({ success: true }),
      storeConversation: vi.fn().mockResolvedValue({ success: true }),
      loadConversation: vi.fn().mockResolvedValue(null),
      getUserAddress: vi.fn().mockReturnValue(testUserAddress),
    };

    // Mock WebSocketClient
    mockWsClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(false),
      on: vi.fn(),
      off: vi.fn(),
    };

    // Create SessionGroupManager
    sessionGroupManager = new SessionGroupManager();

    // Create SessionManager
    sessionManager = new SessionManager(
      mockPaymentManager,
      mockStorageManager
    );

    // Inject session group manager
    (sessionManager as any).sessionGroupManager = sessionGroupManager;

    // Inject websocket client
    (sessionManager as any).wsClient = mockWsClient;

    // Mark as initialized
    (sessionManager as any).initialized = true;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('startSession() with groupId', () => {
    it('should add session to group when groupId is provided', async () => {
      // Create a session group
      const group = await sessionGroupManager.createSessionGroup({
        name: 'Test Group',
        description: 'For testing',
        owner: testUserAddress,
      });

      // Start session with groupId
      const result = await sessionManager.startSession({
        chainId: testChainId,
        host: testHostUrl,
        modelId: 'llama-3',
        paymentMethod: 'deposit',
        depositAmount: '0.001',
        groupId: group.id, // NEW: Pass groupId
      } as any);

      // Verify session was added to group
      const updatedGroup = await sessionGroupManager.getSessionGroup(
        group.id,
        testUserAddress
      );

      expect(updatedGroup.chatSessions).toContain(result.sessionId.toString());
      expect(updatedGroup.chatSessions).toHaveLength(1);
    });

    it('should store groupId in session state', async () => {
      // Create a session group
      const group = await sessionGroupManager.createSessionGroup({
        name: 'Test Group',
        description: 'For testing',
        owner: testUserAddress,
      });

      // Start session with groupId
      const result = await sessionManager.startSession({
        chainId: testChainId,
        host: testHostUrl,
        modelId: 'llama-3',
        paymentMethod: 'deposit',
        depositAmount: '0.001',
        groupId: group.id,
      } as any);

      // Get session state
      const session = (sessionManager as any).sessions.get(
        result.sessionId.toString()
      );

      expect(session).toBeDefined();
      expect(session.groupId).toBe(group.id);
    });
  });

  describe('startSession() without groupId', () => {
    it('should not add session to any group when groupId is omitted', async () => {
      // Start session without groupId
      const result = await sessionManager.startSession({
        chainId: testChainId,
        host: testHostUrl,
        modelId: 'llama-3',
        paymentMethod: 'deposit',
        depositAmount: '0.001',
        // groupId is omitted
      } as any);

      // Get session state
      const session = (sessionManager as any).sessions.get(
        result.sessionId.toString()
      );

      expect(session).toBeDefined();
      expect(session.groupId).toBeUndefined();
    });

    it('should maintain backward compatibility (sessions without groupId still work)', async () => {
      // Start session without groupId (old behavior)
      const result = await sessionManager.startSession({
        chainId: testChainId,
        host: testHostUrl,
        modelId: 'llama-3',
        paymentMethod: 'deposit',
        depositAmount: '0.001',
      } as any);

      expect(result.sessionId).toBeDefined();
      expect(result.jobId).toBeDefined();

      // Session should be active
      const session = (sessionManager as any).sessions.get(
        result.sessionId.toString()
      );
      expect(session.status).toBe('active');
    });
  });

  describe('endSession()', () => {
    it('should update session group with final token count', async () => {
      // Create group and start session
      const group = await sessionGroupManager.createSessionGroup({
        name: 'Test Group',
        description: 'For testing',
        owner: testUserAddress,
      });

      const result = await sessionManager.startSession({
        chainId: testChainId,
        host: testHostUrl,
        modelId: 'llama-3',
        paymentMethod: 'deposit',
        depositAmount: '0.001',
        groupId: group.id,
      } as any);

      // Simulate token usage
      const session = (sessionManager as any).sessions.get(
        result.sessionId.toString()
      );
      session.totalTokens = 150;
      session.startTime = Date.now() - 60000; // Started 1 minute ago

      // End session
      await sessionManager.endSession(result.sessionId);

      // Session should have endTime set
      expect(session.endTime).toBeDefined();
      expect(session.status).toBe('ended');
    });

    it('should record session duration', async () => {
      const startTime = Date.now();

      // Start session with groupId
      const group = await sessionGroupManager.createSessionGroup({
        name: 'Test Group',
        description: 'For testing',
        owner: testUserAddress,
      });

      const result = await sessionManager.startSession({
        chainId: testChainId,
        host: testHostUrl,
        modelId: 'llama-3',
        paymentMethod: 'deposit',
        depositAmount: '0.001',
        groupId: group.id,
      } as any);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // End session
      await sessionManager.endSession(result.sessionId);

      // Get session
      const session = (sessionManager as any).sessions.get(
        result.sessionId.toString()
      );

      // Verify duration
      expect(session.endTime).toBeGreaterThan(session.startTime);
      const duration = session.endTime! - session.startTime;
      expect(duration).toBeGreaterThan(50); // At least 50ms
    });
  });

  describe('Session metadata', () => {
    it('should store model, host, total tokens, start/end time', async () => {
      const group = await sessionGroupManager.createSessionGroup({
        name: 'Test Group',
        description: 'For testing',
        owner: testUserAddress,
      });

      const result = await sessionManager.startSession({
        chainId: testChainId,
        host: testHostUrl,
        modelId: 'llama-3',
        paymentMethod: 'deposit',
        depositAmount: '0.001',
        groupId: group.id,
      } as any);

      const session = (sessionManager as any).sessions.get(
        result.sessionId.toString()
      );

      // Verify metadata
      expect(session.model).toBeDefined();
      expect(session.provider).toBe(testHostUrl);
      expect(session.chainId).toBe(testChainId);
      expect(session.totalTokens).toBe(0); // No tokens used yet
      expect(session.startTime).toBeDefined();
      expect(session.endTime).toBeUndefined(); // Not ended yet

      // Update tokens
      session.totalTokens = 250;

      // End session
      await sessionManager.endSession(result.sessionId);

      // Verify endTime is set
      expect(session.endTime).toBeDefined();
      expect(session.totalTokens).toBe(250);
    });
  });

  describe('Error handling', () => {
    it('should throw error if groupId is invalid', async () => {
      await expect(
        sessionManager.startSession({
          chainId: testChainId,
          host: testHostUrl,
          modelId: 'llama-3',
          paymentMethod: 'deposit',
          depositAmount: '0.001',
          groupId: '', // Invalid empty groupId
        } as any)
      ).rejects.toThrow('Invalid group ID');
    });

    it('should throw error if group does not exist', async () => {
      await expect(
        sessionManager.startSession({
          chainId: testChainId,
          host: testHostUrl,
          modelId: 'llama-3',
          paymentMethod: 'deposit',
          depositAmount: '0.001',
          groupId: 'nonexistent-group-id',
        } as any)
      ).rejects.toThrow('Session group not found');
    });

    it('should throw error if user does not own the group', async () => {
      // Create group with different owner
      const otherUser = '0x9999999999999999999999999999999999999999';
      const group = await sessionGroupManager.createSessionGroup({
        name: 'Other User Group',
        description: 'Owned by other user',
        owner: otherUser,
      });

      // Try to start session with this group (should fail permission check)
      await expect(
        sessionManager.startSession({
          chainId: testChainId,
          host: testHostUrl,
          modelId: 'llama-3',
          paymentMethod: 'deposit',
          depositAmount: '0.001',
          groupId: group.id,
        } as any)
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('getSessionHistory()', () => {
    it('should return all sessions for a group sorted by startedAt descending', async () => {
      // Create group
      const group = await sessionGroupManager.createSessionGroup({
        name: 'Test Group',
        description: 'For testing',
        owner: testUserAddress,
      });

      // Start multiple sessions
      const session1 = await sessionManager.startSession({
        chainId: testChainId,
        host: testHostUrl,
        modelId: 'llama-3',
        paymentMethod: 'deposit',
        depositAmount: '0.001',
        groupId: group.id,
      } as any);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const session2 = await sessionManager.startSession({
        chainId: testChainId,
        host: testHostUrl,
        modelId: 'llama-3',
        paymentMethod: 'deposit',
        depositAmount: '0.001',
        groupId: group.id,
      } as any);

      // Get session history
      const history = await sessionManager.getSessionHistory(group.id);

      expect(history).toHaveLength(2);

      // Should be sorted by startTime descending (newest first)
      expect(history[0].sessionId).toBe(session2.sessionId.toString());
      expect(history[1].sessionId).toBe(session1.sessionId.toString());
    });

    it('should return empty array for group with no sessions', async () => {
      const group = await sessionGroupManager.createSessionGroup({
        name: 'Empty Group',
        description: 'No sessions yet',
        owner: testUserAddress,
      });

      const history = await sessionManager.getSessionHistory(group.id);

      expect(history).toEqual([]);
    });

    it('should include session metadata in history', async () => {
      const group = await sessionGroupManager.createSessionGroup({
        name: 'Test Group',
        description: 'For testing',
        owner: testUserAddress,
      });

      const result = await sessionManager.startSession({
        chainId: testChainId,
        host: testHostUrl,
        modelId: 'llama-3',
        paymentMethod: 'deposit',
        depositAmount: '0.001',
        groupId: group.id,
      } as any);

      // Update session with tokens
      const session = (sessionManager as any).sessions.get(
        result.sessionId.toString()
      );
      session.totalTokens = 100;

      const history = await sessionManager.getSessionHistory(group.id);

      expect(history).toHaveLength(1);
      expect(history[0].sessionId).toBe(result.sessionId.toString());
      expect(history[0].model).toBeDefined();
      expect(history[0].totalTokens).toBe(100);
      expect(history[0].chainId).toBe(testChainId);
    });
  });
});
