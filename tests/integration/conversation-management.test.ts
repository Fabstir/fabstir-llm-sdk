// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import InferenceManager from '../../src/managers/InferenceManager';
import { WebSocketClient } from '../../packages/sdk-client/src/p2p/WebSocketClient';
import { S5ConversationStore } from '../../src/storage/S5ConversationStore';

// Mock WebSocketClient
vi.mock('../../packages/sdk-client/src/p2p/WebSocketClient');

// Mock S5ConversationStore
vi.mock('../../src/storage/S5ConversationStore');

// Mock SessionCache  
vi.mock('../../src/storage/SessionCache', () => ({
  SessionCache: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    set: vi.fn(),
    clear: vi.fn()
  }))
}));

describe('Conversation Management', () => {
  let inferenceManager: InferenceManager;
  let mockStore: any;
  let mockWsClient: any;
  const TEST_SESSION_ID = 'test-session-123';
  const TEST_HOST_URL = 'ws://localhost:8080';
  const TEST_JOB_ID = 42;
  const TEST_S5_CONFIG = {
    seedPhrase: 'test seed phrase for s5 storage',
    portalUrl: 'https://s5.portal'
  };

  beforeEach(() => {
    // Mock WebSocketClient
    mockWsClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      send: vi.fn().mockResolvedValue(undefined),
      onResponse: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
      getState: vi.fn().mockReturnValue('CONNECTED')
    };
    (WebSocketClient as any).mockImplementation(() => mockWsClient);
    
    // Mock S5ConversationStore
    mockStore = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      savePrompt: vi.fn().mockResolvedValue(undefined),
      saveResponse: vi.fn().mockResolvedValue(undefined),
      loadSession: vi.fn().mockResolvedValue([]),
      exportSession: vi.fn().mockResolvedValue(''),
      deleteSession: vi.fn().mockResolvedValue(undefined)
    };
    (S5ConversationStore as any).mockImplementation(() => mockStore);
    
    // Initialize InferenceManager with S5 config
    inferenceManager = new InferenceManager({ 
      retryDelay: 100,
      s5Config: TEST_S5_CONFIG
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Server-Side Context Management', () => {
    // Test 1
    it('should manage conversation with server-side context', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      // Send a prompt - should only send prompt content, not full context
      await inferenceManager.sendPrompt('Hello', { sessionId: TEST_SESSION_ID });
      
      // Verify only prompt was sent, not conversation history
      const sentMessage = mockWsClient.send.mock.calls.find(
        call => call[0].type === 'prompt'
      )?.[0];
      
      expect(sentMessage).toBeDefined();
      expect(sentMessage.content).toBe('Hello');
      expect(sentMessage.conversation_context).toBeUndefined(); // Should NOT include context
    });

    // Test 2
    it('should only send new prompts during active session', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      // Send multiple prompts
      await inferenceManager.sendPrompt('First prompt', { sessionId: TEST_SESSION_ID });
      await inferenceManager.sendPrompt('Second prompt', { sessionId: TEST_SESSION_ID });
      
      // Check that each prompt message only contains the prompt
      const promptMessages = mockWsClient.send.mock.calls
        .filter(call => call[0].type === 'prompt')
        .map(call => call[0]);
      
      expect(promptMessages).toHaveLength(2);
      expect(promptMessages[0].content).toBe('First prompt');
      expect(promptMessages[1].content).toBe('Second prompt');
      // Neither should include conversation history
      expect(promptMessages[0].conversation_context).toBeUndefined();
      expect(promptMessages[1].conversation_context).toBeUndefined();
    });

    // Test 3
    it('should let node handle context window truncation', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      // Send many prompts that would exceed typical context window
      for (let i = 0; i < 50; i++) {
        await inferenceManager.sendPrompt(`Prompt ${i}`, { sessionId: TEST_SESSION_ID });
      }
      
      // SDK should not truncate - just send prompts
      const promptMessages = mockWsClient.send.mock.calls
        .filter(call => call[0].type === 'prompt');
      
      expect(promptMessages).toHaveLength(50);
      // All prompts should be sent without truncation logic
      promptMessages.forEach((call, i) => {
        expect(call[0].content).toBe(`Prompt ${i}`);
      });
    });

    // Test 4
    it('should maintain message ordering with indices', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      // Send prompts and check message indices
      await inferenceManager.sendPrompt('First', { sessionId: TEST_SESSION_ID });
      await inferenceManager.sendPrompt('Second', { sessionId: TEST_SESSION_ID });
      await inferenceManager.sendPrompt('Third', { sessionId: TEST_SESSION_ID });
      
      const promptMessages = mockWsClient.send.mock.calls
        .filter(call => call[0].type === 'prompt')
        .map(call => call[0]);
      
      // Check that message indices increment properly
      expect(promptMessages[0].message_index).toBe(0);
      expect(promptMessages[1].message_index).toBe(2); // After response
      expect(promptMessages[2].message_index).toBe(4); // After another response
    });

    // Test 5
    it('should maintain context continuity during session', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      // Simulate a conversation flow
      await inferenceManager.sendPrompt('What is AI?', { sessionId: TEST_SESSION_ID });
      
      // Simulate response
      mockWsClient.onResponse.mock.calls[0]?.[0]({
        type: 'response',
        session_id: TEST_SESSION_ID,
        content: 'AI is artificial intelligence...',
        tokens_used: 50,
        message_index: 1
      });
      
      await inferenceManager.sendPrompt('Tell me more', { sessionId: TEST_SESSION_ID });
      
      // Verify session maintains continuity
      const session = inferenceManager['activeSessions'].get(TEST_SESSION_ID);
      expect(session).toBeDefined();
      expect(session.messageIndex).toBeGreaterThan(0);
      expect(session.conversationContext).toBeDefined();
    });
  });

  describe('Session Recovery', () => {
    // Test 6
    it('should recover session with full history from S5', async () => {
      const mockHistory = [
        { role: 'user', content: 'What is AI?', timestamp: 1000, id: '1' },
        { role: 'assistant', content: 'AI is...', timestamp: 1001, id: '2', tokens: 50 },
        { role: 'user', content: 'Tell me more', timestamp: 1002, id: '3' },
        { role: 'assistant', content: 'More details...', timestamp: 1003, id: '4', tokens: 75 }
      ];
      
      mockStore.loadSession.mockResolvedValue(mockHistory);
      
      await inferenceManager.resumeSessionWithHistory(
        TEST_SESSION_ID, 
        TEST_HOST_URL, 
        TEST_JOB_ID
      );
      
      // Verify session_resume message was sent with full context
      const resumeMessage = mockWsClient.send.mock.calls.find(
        call => call[0].type === 'session_resume'
      )?.[0];
      
      expect(resumeMessage).toBeDefined();
      expect(resumeMessage.conversation_context).toEqual(mockHistory);
      expect(resumeMessage.job_id).toBe(TEST_JOB_ID);
    });

    // Test 7
    it('should rebuild context after host crash', async () => {
      // Initial session
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      await inferenceManager.sendPrompt('Initial prompt', { sessionId: TEST_SESSION_ID });
      
      // Simulate host crash (disconnect)
      mockWsClient.isConnected.mockReturnValue(false);
      mockWsClient.getState.mockReturnValue('DISCONNECTED');
      
      // Mock stored history
      mockStore.loadSession.mockResolvedValue([
        { role: 'user', content: 'Initial prompt', timestamp: 1000, id: '1' }
      ]);
      
      // Recover session with new host
      const NEW_HOST_URL = 'ws://new-host:8080';
      await inferenceManager.resumeSessionWithHistory(
        TEST_SESSION_ID,
        NEW_HOST_URL,
        TEST_JOB_ID
      );
      
      // Verify new connection and context rebuild
      expect(mockWsClient.connect).toHaveBeenCalledWith(NEW_HOST_URL);
      const resumeMessage = mockWsClient.send.mock.calls.find(
        call => call[0].type === 'session_resume'
      )?.[0];
      expect(resumeMessage.conversation_context).toHaveLength(1);
    });

    // Test 8
    it('should use proper conversation_context array format on resume', async () => {
      const expectedFormat = [
        { role: 'user', content: 'Question', timestamp: 1000, id: '1' },
        { role: 'assistant', content: 'Answer', timestamp: 1001, id: '2', tokens: 30 }
      ];
      
      mockStore.loadSession.mockResolvedValue(expectedFormat);
      
      await inferenceManager.resumeSessionWithHistory(
        TEST_SESSION_ID,
        TEST_HOST_URL,
        TEST_JOB_ID
      );
      
      const resumeMessage = mockWsClient.send.mock.calls.find(
        call => call[0].type === 'session_resume'
      )?.[0];
      
      // Verify proper format as per protocol spec
      expect(resumeMessage.conversation_context).toEqual(expectedFormat);
      expect(Array.isArray(resumeMessage.conversation_context)).toBe(true);
      resumeMessage.conversation_context.forEach((msg: any) => {
        expect(msg).toHaveProperty('role');
        expect(msg).toHaveProperty('content');
      });
    });

    // Test 9
    it('should track last_message_index correctly', async () => {
      const history = [
        { role: 'user', content: 'Q1', timestamp: 1000, id: '1' },
        { role: 'assistant', content: 'A1', timestamp: 1001, id: '2', tokens: 20 },
        { role: 'user', content: 'Q2', timestamp: 1002, id: '3' },
        { role: 'assistant', content: 'A2', timestamp: 1003, id: '4', tokens: 25 }
      ];
      
      mockStore.loadSession.mockResolvedValue(history);
      
      await inferenceManager.resumeSessionWithHistory(
        TEST_SESSION_ID,
        TEST_HOST_URL,
        TEST_JOB_ID
      );
      
      const resumeMessage = mockWsClient.send.mock.calls.find(
        call => call[0].type === 'session_resume'
      )?.[0];
      
      expect(resumeMessage.last_message_index).toBe(3); // 0-indexed, 4 messages
    });

    // Test 10
    it('should handle recovery with large conversation history', async () => {
      // Create large history (100 messages)
      const largeHistory = [];
      for (let i = 0; i < 50; i++) {
        largeHistory.push({ 
          role: 'user', 
          content: `Question ${i}`, 
          timestamp: 1000 + i * 2, 
          id: `${i * 2}`
        });
        largeHistory.push({ 
          role: 'assistant', 
          content: `Answer ${i}`, 
          timestamp: 1001 + i * 2, 
          id: `${i * 2 + 1}`,
          tokens: 20 + i
        });
      }
      
      mockStore.loadSession.mockResolvedValue(largeHistory);
      
      await inferenceManager.resumeSessionWithHistory(
        TEST_SESSION_ID,
        TEST_HOST_URL,
        TEST_JOB_ID
      );
      
      const resumeMessage = mockWsClient.send.mock.calls.find(
        call => call[0].type === 'session_resume'
      )?.[0];
      
      expect(resumeMessage.conversation_context).toHaveLength(100);
      expect(resumeMessage.last_message_index).toBe(99);
    });
  });

  describe('Storage Integration', () => {
    // Test 11
    it('should export conversation from S5 storage', async () => {
      const mockConversation = [
        { role: 'user', content: 'Hello', timestamp: 1000, id: '1' },
        { role: 'assistant', content: 'Hi there!', timestamp: 1001, id: '2', tokens: 10 }
      ];
      
      mockStore.loadSession.mockResolvedValue(mockConversation);
      
      const exported = await inferenceManager.exportConversation(TEST_SESSION_ID, 'json');
      
      expect(mockStore.loadSession).toHaveBeenCalledWith(TEST_SESSION_ID);
      const parsed = JSON.parse(exported);
      expect(parsed.sessionId).toBe(TEST_SESSION_ID);
      expect(parsed.messages).toEqual(mockConversation);
      expect(parsed.messageCount).toBe(2);
    });

    // Test 12
    it('should persist messages to S5 immediately', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      // Send a prompt
      await inferenceManager.sendPrompt('Test prompt', { sessionId: TEST_SESSION_ID });
      
      // Verify immediate save to S5
      expect(mockStore.savePrompt).toHaveBeenCalled();
      const savedPrompt = mockStore.savePrompt.mock.calls[0];
      expect(savedPrompt[1].content).toBe('Test prompt');
      expect(savedPrompt[1].role).toBe('user');
    });

    // Test 13
    it('should load full conversation history', async () => {
      const fullHistory = [
        { role: 'system', content: 'You are helpful', timestamp: 999, id: '0' },
        { role: 'user', content: 'Hi', timestamp: 1000, id: '1' },
        { role: 'assistant', content: 'Hello!', timestamp: 1001, id: '2', tokens: 5 }
      ];
      
      mockStore.loadSession.mockResolvedValue(fullHistory);
      
      const conversation = await inferenceManager.getConversation(TEST_SESSION_ID);
      
      expect(mockStore.loadSession).toHaveBeenCalledWith(TEST_SESSION_ID);
      expect(conversation).toEqual(fullHistory);
      expect(conversation).toHaveLength(3);
    });

    // Test 14
    it('should export conversation in different formats', async () => {
      const messages = [
        { role: 'user', content: 'What is TypeScript?', timestamp: 1000, id: '1' },
        { role: 'assistant', content: 'TypeScript is a typed superset of JavaScript.', timestamp: 1001, id: '2', tokens: 15 }
      ];
      
      mockStore.loadSession.mockResolvedValue(messages);
      
      // Test JSON export
      const jsonExport = await inferenceManager.exportConversation(TEST_SESSION_ID, 'json');
      expect(JSON.parse(jsonExport)).toHaveProperty('messages');
      
      // Test Markdown export
      const mdExport = await inferenceManager.exportConversation(TEST_SESSION_ID, 'markdown');
      expect(mdExport).toContain('# Conversation');
      expect(mdExport).toContain('**User:**');
      expect(mdExport).toContain('**Assistant:**');
      expect(mdExport).toContain('What is TypeScript?');
      expect(mdExport).toContain('TypeScript is a typed superset');
    });

    // Test 15
    it('should store conversation metadata', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      // Send prompts to generate metadata
      await inferenceManager.sendPrompt('First', { sessionId: TEST_SESSION_ID });
      await inferenceManager.sendPrompt('Second', { sessionId: TEST_SESSION_ID });
      
      // Export and check metadata
      mockStore.loadSession.mockResolvedValue([
        { role: 'user', content: 'First', timestamp: 1000, id: '1' },
        { role: 'user', content: 'Second', timestamp: 1002, id: '2' }
      ]);
      
      const exported = await inferenceManager.exportConversation(TEST_SESSION_ID, 'json');
      const parsed = JSON.parse(exported);
      
      expect(parsed).toHaveProperty('metadata');
      expect(parsed.metadata).toHaveProperty('totalTokens');
      expect(parsed.metadata).toHaveProperty('createdAt');
      expect(parsed.metadata).toHaveProperty('lastActivity');
    });
  });

  describe('Host Switching', () => {
    // Test 16
    it('should switch host seamlessly mid-conversation', async () => {
      // Start with first host
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      await inferenceManager.sendPrompt('Initial message', { sessionId: TEST_SESSION_ID });
      
      // Mock conversation history
      mockStore.loadSession.mockResolvedValue([
        { role: 'user', content: 'Initial message', timestamp: 1000, id: '1' }
      ]);
      
      // Switch to new host
      const NEW_HOST = 'ws://new-host:8080';
      await inferenceManager.switchHost(TEST_SESSION_ID, NEW_HOST);
      
      // Verify disconnection from old host and connection to new
      expect(mockWsClient.disconnect).toHaveBeenCalled();
      expect(mockWsClient.connect).toHaveBeenCalledWith(NEW_HOST);
      
      // Verify session_resume sent to new host
      const resumeMessage = mockWsClient.send.mock.calls.find(
        call => call[0].type === 'session_resume'
      )?.[0];
      expect(resumeMessage).toBeDefined();
      expect(resumeMessage.session_id).toBe(TEST_SESSION_ID);
    });

    // Test 17
    it('should transfer context to new host correctly', async () => {
      const existingContext = [
        { role: 'user', content: 'Question 1', timestamp: 1000, id: '1' },
        { role: 'assistant', content: 'Answer 1', timestamp: 1001, id: '2', tokens: 30 }
      ];
      
      // Initialize and build some context
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      mockStore.loadSession.mockResolvedValue(existingContext);
      
      // Switch host
      const NEW_HOST = 'ws://backup-host:8080';
      await inferenceManager.switchHost(TEST_SESSION_ID, NEW_HOST);
      
      // Verify context was transferred
      const resumeMessage = mockWsClient.send.mock.calls.find(
        call => call[0].type === 'session_resume'
      )?.[0];
      
      expect(resumeMessage.conversation_context).toEqual(existingContext);
      expect(resumeMessage.job_id).toBe(TEST_JOB_ID);
    });

    // Test 18
    it('should preserve session state during switch', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      // Set some session state
      const session = inferenceManager['activeSessions'].get(TEST_SESSION_ID);
      const originalTokens = 150;
      if (session) {
        session.tokensUsed = originalTokens;
      }
      
      mockStore.loadSession.mockResolvedValue([]);
      
      // Switch host
      await inferenceManager.switchHost(TEST_SESSION_ID, 'ws://new:8080');
      
      // Verify state preserved
      const newSession = inferenceManager['activeSessions'].get(TEST_SESSION_ID);
      expect(newSession).toBeDefined();
      expect(newSession.jobId).toBe(TEST_JOB_ID);
      expect(newSession.tokensUsed).toBe(originalTokens);
    });

    // Test 19
    it('should maintain token count continuity after switch', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      // Accumulate some tokens
      const session = inferenceManager['activeSessions'].get(TEST_SESSION_ID);
      if (session) {
        session.tokensUsed = 500;
      }
      
      mockStore.loadSession.mockResolvedValue([
        { role: 'user', content: 'Q', timestamp: 1000, id: '1' },
        { role: 'assistant', content: 'A', timestamp: 1001, id: '2', tokens: 500 }
      ]);
      
      // Switch host
      await inferenceManager.switchHost(TEST_SESSION_ID, 'ws://alt:8080');
      
      // Send new prompt and verify token continuity
      await inferenceManager.sendPrompt('New prompt', { sessionId: TEST_SESSION_ID });
      
      const updatedSession = inferenceManager['activeSessions'].get(TEST_SESSION_ID);
      expect(updatedSession.tokensUsed).toBeGreaterThanOrEqual(500);
    });

    // Test 20
    it('should handle automatic recovery on connection drop', async () => {
      await inferenceManager.initializeSession(TEST_SESSION_ID, TEST_HOST_URL, TEST_JOB_ID);
      
      // Mock stored conversation
      mockStore.loadSession.mockResolvedValue([
        { role: 'user', content: 'Test', timestamp: 1000, id: '1' }
      ]);
      
      // Simulate connection drop
      mockWsClient.isConnected.mockReturnValue(false);
      inferenceManager.emit('connection:lost', { sessionId: TEST_SESSION_ID });
      
      // Trigger automatic recovery
      await inferenceManager.handleConnectionLoss(TEST_SESSION_ID);
      
      // Verify recovery attempt
      expect(mockStore.loadSession).toHaveBeenCalledWith(TEST_SESSION_ID);
      
      // Should attempt to reconnect or find alternative host
      const session = inferenceManager['activeSessions'].get(TEST_SESSION_ID);
      expect(session).toBeDefined();
    });
  });
});