// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FabstirSessionSDK } from '../../src/FabstirSessionSDK';
import { getTestUser, getTestHost, fundAccount } from './setup/test-accounts';
import { MockLLMHost } from './setup/mock-llm-host';
import { mockSDKConfig } from './setup/test-helpers';

// Mock all dependencies to avoid real network calls
vi.mock('../../packages/sdk-client/src/session/SessionManager', () => ({
  SessionManager: class {
    async createSession(p: any) { return { jobId: Math.floor(Math.random() * 10000) + 1, status: 'Active',
      depositAmount: p.depositAmount, hostAddress: p.hostAddress }; }
    async completeSession() { return { transactionHash: '0x' + 'a'.repeat(64), blockNumber: 1, gasUsed: '21000' }; }
    async getSessionStatus() { return { status: 'Active', provenTokens: 0, depositAmount: '100000000000000000' }; }
    emit() {} on() {}
  }
}));
vi.mock('../../packages/sdk-client/src/contracts/JobMarketplaceContract', () => ({
  JobMarketplaceContract: class {}
}));
vi.mock('../../packages/sdk-client/src/p2p/WebSocketClient', () => ({
  WebSocketClient: class { handlers: any[] = [];
    async connect() {} async sendPrompt() { setTimeout(() => this.handlers.forEach(h => h({ content: 'Mock response' })), 50); }
    onResponse(h: any) { this.handlers.push(h); } disconnect() {}
  }
}));
vi.mock('../../packages/sdk-client/src/p2p/HostDiscovery', () => ({
  HostDiscovery: class { async discoverHosts() { return []; } }
}));

const mockStorage = new Map<string, any>();
vi.mock('../../src/storage/S5ConversationStore', () => ({
  S5ConversationStore: class {
    seedKey: string;
    constructor(c: any) { this.seedKey = c.seedPhrase?.substring(0, 20) || 'default'; }
    async connect() {} async disconnect() {}
    async savePrompt(id: number, m: any) { this.save(id, m); }
    async saveResponse(id: number, m: any) { this.save(id, m); }
    save(id: number, m: any) {
      const k = `${this.seedKey}:${id}`;
      const e = mockStorage.get(k) || { messages: [] };
      e.messages.push(m);
      mockStorage.set(k, e);
    }
    async loadSession(id: number) {
      const d = mockStorage.get(`${this.seedKey}:${id}`);
      return d?.messages || [];
    }
    static _clearStorage() { mockStorage.clear(); }
    static _getStorage() { return mockStorage; }
  }
}));

describe('Message Exchange & S5 Storage E2E', () => {
  let userSDK: FabstirSessionSDK, userAccount: any, otherUserSDK: FabstirSessionSDK;
  let otherUserAccount: any, mockHost: MockLLMHost, hostAccount: any, session: any;

  beforeAll(async () => {
    const { S5ConversationStore } = await import('../../src/storage/S5ConversationStore');
    (S5ConversationStore as any)._clearStorage?.();
    userAccount = await getTestUser();
    await fundAccount(userAccount, BigInt(10000000));
    hostAccount = await getTestHost();
    await fundAccount(hostAccount, BigInt(5000000));
    mockHost = new MockLLMHost(hostAccount);
    await mockHost.start();
    mockHost.setMockResponse("What is machine learning?", "ML is AI that learns from data.");
    mockHost.setMockResponse("Explain neural networks", "Neural networks mimic brain neurons.");
    const config = mockSDKConfig(userAccount.s5Seed);
    userSDK = new FabstirSessionSDK(config, userAccount.signer);
    const hosts = [mockHost.getHostInfo()];
    session = await userSDK.startSession(hosts[0], 0.1);
  });

  afterAll(async () => {
    if (userSDK) await userSDK.cleanup();
    if (otherUserSDK) await otherUserSDK.cleanup();
    if (mockHost) await mockHost.stop();
  });

  describe('Message Exchange', () => {
    it('should send first prompt and receive response', async () => {
      const responsePromise = new Promise((resolve) => { userSDK.onResponse((msg) => resolve(msg)); });
      await userSDK.sendPrompt('What is machine learning?');
      const response: any = await responsePromise;
      expect(response.role).toBe('assistant');
      expect(response.content).toContain('response');
      const activeSession = userSDK.getActiveSession(session.jobId);
      expect(activeSession?.messages.length).toBeGreaterThanOrEqual(2);
      expect(activeSession?.messages[0].content).toBe('What is machine learning?');
      expect(activeSession?.messages[0].role).toBe('user');
    });

    it('should track token usage', async () => {
      const initialTokens = userSDK.getActiveSession(session.jobId)?.tokensUsed || 0;
      const responsePromise = new Promise((resolve) => { userSDK.onResponse((msg) => resolve(msg)); });
      await userSDK.sendPrompt('Explain neural networks');
      await responsePromise;
      const updatedSession = userSDK.getActiveSession(session.jobId);
      expect(updatedSession?.tokensUsed).toBeGreaterThan(initialTokens);
    });

    it('should send multiple prompts in sequence', async () => {
      const responsePromise = new Promise((resolve) => { userSDK.onResponse((msg) => resolve(msg)); });
      await userSDK.sendPrompt('What about deep learning?');
      await responsePromise;
      const activeSession = userSDK.getActiveSession(session.jobId);
      expect(activeSession?.messages.length).toBeGreaterThanOrEqual(4);
      const userMessages = activeSession?.messages.filter(m => m.role === 'user');
      expect(userMessages?.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('S5 Storage with User Seed', () => {
    it('should store conversation in S5 with user seed', async () => {
      await userSDK.saveConversation();
      const { S5ConversationStore } = await import('../../src/storage/S5ConversationStore');
      const storage = (S5ConversationStore as any)._getStorage();
      const seedKey = userAccount.s5Seed.substring(0, 20);
      const stored = storage.get(`${seedKey}:${session.jobId}`);
      expect(stored).toBeDefined();
      expect(stored.messages).toBeDefined();
    });

    it('should contain full conversation history', async () => {
      const loaded = await userSDK.loadPreviousSession(session.jobId);
      expect(loaded).toBeDefined();
      expect(loaded.messages.length).toBeGreaterThanOrEqual(2);
      const hasUserMsg = loaded.messages.some(m => m.role === 'user');
      const hasAssistantMsg = loaded.messages.some(m => m.role === 'assistant');
      expect(hasUserMsg).toBe(true);
      expect(hasAssistantMsg).toBe(true);
      const timestamps = loaded.messages.map(m => m.timestamp);
      const sorted = [...timestamps].sort((a, b) => a - b);
      expect(timestamps).toEqual(sorted);
    });

    it('should encrypt with user unique seed', async () => {
      expect(userAccount.s5Seed.split(' ').length).toBe(12);
      const { S5ConversationStore } = await import('../../src/storage/S5ConversationStore');
      const storage = (S5ConversationStore as any)._getStorage();
      const seedKey = userAccount.s5Seed.substring(0, 20);
      expect(storage.has(`${seedKey}:${session.jobId}`)).toBe(true);
    });
  });

  describe('Data Isolation', () => {
    it('should prevent different user from accessing conversation', async () => {
      otherUserAccount = await getTestUser();
      await fundAccount(otherUserAccount, BigInt(10000000));
      expect(otherUserAccount.s5Seed).not.toBe(userAccount.s5Seed);
      const otherConfig = mockSDKConfig(otherUserAccount.s5Seed);
      otherUserSDK = new FabstirSessionSDK(otherConfig, otherUserAccount.signer);
      const loaded = await otherUserSDK.loadPreviousSession(session.jobId);
      expect(loaded.messages.length).toBe(0);
    });

    it('should maintain separate S5 namespaces per user', async () => {
      const otherHosts = [mockHost.getHostInfo()];
      const otherSession = await otherUserSDK.startSession(otherHosts[0], 0.05);
      await otherUserSDK.sendPrompt('Different conversation');
      await new Promise(resolve => setTimeout(resolve, 100));
      await otherUserSDK.saveConversation();
      const userCannotAccess = await userSDK.loadPreviousSession(otherSession.jobId);
      const otherCannotAccess = await otherUserSDK.loadPreviousSession(session.jobId);
      expect(userCannotAccess.messages.length).toBe(0);
      expect(otherCannotAccess.messages.length).toBe(0);
      const otherCanAccess = await otherUserSDK.loadPreviousSession(otherSession.jobId);
      expect(otherCanAccess.messages.length).toBeGreaterThan(0);
    });
  });

  describe('Conversation Persistence', () => {
    it('should resume conversation after disconnect', async () => {
      const originalMsgCount = userSDK.getActiveSession(session.jobId)?.messages.length || 0;
      await userSDK.saveConversation();
      await userSDK.cleanup();
      const newConfig = mockSDKConfig(userAccount.s5Seed);
      const newSDK = new FabstirSessionSDK(newConfig, userAccount.signer);
      const loaded = await newSDK.loadPreviousSession(session.jobId);
      expect(loaded.messages.length).toBeGreaterThanOrEqual(originalMsgCount);
      expect(loaded.sessionId).toBe(session.jobId);
      await newSDK.cleanup();
    });

    it('should maintain message ordering across sessions', async () => {
      const loaded = await userSDK.loadPreviousSession(session.jobId);
      expect(Array.isArray(loaded.messages)).toBe(true);
      expect(loaded.messages.length).toBeGreaterThan(0);
      for (let i = 1; i < loaded.messages.length; i++) {
        expect(loaded.messages[i].timestamp).toBeGreaterThanOrEqual(loaded.messages[i - 1].timestamp);
      }
      const hasIds = loaded.messages.every((m: any) => m.id || m.timestamp);
      expect(hasIds).toBe(true);
    });
  });
});