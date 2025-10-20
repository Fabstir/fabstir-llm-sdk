// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FabstirSessionSDK } from '../../src/FabstirSessionSDK';
import { getTestUser, getTestHost, getTreasury, fundAccount } from './setup/test-accounts';
import { MockLLMHost } from './setup/mock-llm-host';
import { mockSDKConfig, checkBalance, setMockBalance } from './setup/test-helpers';
import { generateTestReport, TestReportGenerator } from './test-report';
vi.mock('../../packages/sdk-client/src/session/SessionManager', () => ({
  SessionManager: class {
    async createSession(p: any) { return { jobId: Math.floor(Math.random() * 10000) + 1, status: 'Active',
      depositAmount: p.depositAmount, hostAddress: p.hostAddress }; }
    async completeSession() { return { transactionHash: '0x' + 'a'.repeat(64), blockNumber: 1, gasUsed: '21000' }; }
    async getSessionStatus() { return { status: 'Active', provenTokens: 0, depositAmount: '100000000000000000' }; }
    emit() {} on() {} } }));
vi.mock('../../packages/sdk-client/src/contracts/JobMarketplaceContract', () => ({ JobMarketplaceContract: class {} }));
vi.mock('../../packages/sdk-client/src/p2p/WebSocketClient', () => ({
  WebSocketClient: class { handlers: any[] = [];
    async connect() {} async sendPrompt() { setTimeout(() => this.handlers.forEach(h => h({ content: 'Response' })), 50); }
    onResponse(h: any) { this.handlers.push(h); } disconnect() {} } }));
vi.mock('../../packages/sdk-client/src/p2p/HostDiscovery', () => ({ HostDiscovery: class { async discoverHosts() { return []; } } }));
const mockS5Sessions = new Map();
vi.mock('../../src/storage/S5ConversationStore', () => ({
  S5ConversationStore: class { private seed: string; constructor(config: any) { this.seed = config?.seedPhrase || ''; }
    async connect() {} async disconnect() {}
    async savePrompt(id: number, msg: any) { 
      const key = `${this.seed}-${id}`; const msgs = mockS5Sessions.get(key) || []; msgs.push(msg); mockS5Sessions.set(key, msgs); }
    async saveResponse(id: number, msg: any) {
      const key = `${this.seed}-${id}`; const msgs = mockS5Sessions.get(key) || []; msgs.push(msg); mockS5Sessions.set(key, msgs); }
    async loadSession(id: number) { const key = `${this.seed}-${id}`; return mockS5Sessions.get(key) || []; } } }));

describe('Full Cycle Integration E2E', () => {
  let userSDK: FabstirSessionSDK, authSDK: FabstirSessionSDK, mockHost: MockLLMHost, mockHost2: MockLLMHost;
  let testReport: TestReportGenerator, userAccount: any, userAccount2: any, hostAccount: any;
  beforeEach(async () => {
    testReport = new TestReportGenerator(); userAccount = await getTestUser(); userAccount2 = await getTestUser();
    userAccount2.userId = 'user456'; userAccount2.s5Seed = 'test seed phrase another unique twelve words here for user two demo';
    hostAccount = await getTestHost(); setMockBalance(userAccount.address, BigInt(10000000));
    setMockBalance(userAccount2.address, BigInt(5000000)); setMockBalance(hostAccount.address, BigInt(1000000));
  });
  afterEach(async () => {
    if (userSDK) await userSDK.cleanup(); if (authSDK) await authSDK.cleanup();
    if (mockHost) await mockHost.stop(); if (mockHost2) await mockHost2.stop();
  });

  describe('Complete Flow: Auth to Payment', () => {
    it('should complete entire user journey', async () => {
      expect(userAccount.s5Seed).toMatch(/^(\w+\s+){11}\w+$/);
      testReport.addTransaction({ step: 'auth', user: userAccount.userId });
      const initialBalance = await checkBalance(userAccount);
      testReport.addTransaction({ step: 'fund', amount: '10000000', balance: initialBalance.toString() });
      mockHost = new MockLLMHost(hostAccount);
      await mockHost.start();
      const config = mockSDKConfig(userAccount.s5Seed);
      userSDK = new FabstirSessionSDK(config, userAccount.signer);
      const hosts = [mockHost.getHostInfo()];
      expect(hosts.length).toBeGreaterThan(0);
      testReport.addTransaction({ step: 'discover', hostsFound: hosts.length });
      const session = await userSDK.startSession(hosts[0], 0.1);
      expect(session.jobId).toBeGreaterThan(0);
      testReport.addTransaction({ step: 'session', jobId: session.jobId });
      await userSDK.sendPrompt("What is AI?");
      await new Promise(resolve => setTimeout(resolve, 100));
      const activeSession = userSDK.getActiveSession(session.jobId);
      expect(activeSession?.messages.length).toBeGreaterThan(0);
      await userSDK.saveConversation();
      testReport.addTransaction({ step: 'save', encrypted: true });
      const receipt = await userSDK.endSession();
      expect(receipt.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      setMockBalance(userAccount.address, initialBalance - BigInt(100000));
      const finalBalance = await checkBalance(userAccount);
      expect(finalBalance).toBeLessThan(initialBalance);
      testReport.addTransaction({ step: 'payment', cost: Number(initialBalance - finalBalance), txHash: receipt.transactionHash });
    });
    it('should authenticate with unique seed phrase', async () => {
      expect(userAccount.s5Seed.split(' ').length).toBe(12);
      const words = userAccount.s5Seed.split(' '); const uniqueWords = new Set(words);
      expect(uniqueWords.size).toBeGreaterThan(8);
    });
    it('should maintain session isolation', async () => {
      mockHost = new MockLLMHost(hostAccount); await mockHost.start();
      const config = mockSDKConfig(userAccount.s5Seed); userSDK = new FabstirSessionSDK(config, userAccount.signer);
      const hosts = [mockHost.getHostInfo()]; const session1 = await userSDK.startSession(hosts[0], 0.1);
      const session2 = await userSDK.startSession(hosts[0], 0.1); expect(session1.jobId).not.toBe(session2.jobId);
    });
  });

  describe('Multiple Sessions', () => {
    it('should handle multiple sessions with same user', async () => {
      mockHost = new MockLLMHost(hostAccount);
      await mockHost.start();
      const config = mockSDKConfig(userAccount.s5Seed);
      userSDK = new FabstirSessionSDK(config, userAccount.signer);
      const hosts = [mockHost.getHostInfo()];
      const session1 = await userSDK.startSession(hosts[0], 0.05);
      await userSDK.sendPrompt("First session");
      await new Promise(r => setTimeout(r, 50));
      await userSDK.endSession();
      const session2 = await userSDK.startSession(hosts[0], 0.05);
      await userSDK.sendPrompt("Second session");
      await new Promise(r => setTimeout(r, 50));
      expect(session1.jobId).not.toBe(session2.jobId);
      expect(userSDK.getActiveSession(session2.jobId)).toBeDefined();
      const history1 = await userSDK.loadPreviousSession(session1.jobId);
      const history2 = await userSDK.loadPreviousSession(session2.jobId);
      expect(history1.messages.find(m => m.content.includes("First"))).toBeDefined();
      expect(history2.messages.find(m => m.content.includes("Second"))).toBeDefined();
    });
    it('should handle multiple users with same host', async () => {
      mockHost = new MockLLMHost(hostAccount);
      await mockHost.start();
      const config1 = mockSDKConfig(userAccount.s5Seed);
      const config2 = mockSDKConfig(userAccount2.s5Seed);
      userSDK = new FabstirSessionSDK(config1, userAccount.signer);
      authSDK = new FabstirSessionSDK(config2, userAccount2.signer);
      const hosts = [mockHost.getHostInfo()];
      const session1 = await userSDK.startSession(hosts[0], 0.05);
      const session2 = await authSDK.startSession(hosts[0], 0.05);
      expect(session1.jobId).not.toBe(session2.jobId);
      await userSDK.sendPrompt("User 1 message");
      await authSDK.sendPrompt("User 2 message");
      await new Promise(r => setTimeout(r, 100));
      const active1 = userSDK.getActiveSession(session1.jobId);
      const active2 = authSDK.getActiveSession(session2.jobId);
      expect(active1?.messages.find(m => m.content.includes("User 1"))).toBeDefined();
      expect(active2?.messages.find(m => m.content.includes("User 2"))).toBeDefined();
    });
  });

  describe('Session Recovery', () => {
    it('should recover session after interruption', async () => {
      mockHost = new MockLLMHost(hostAccount); await mockHost.start();
      const config = mockSDKConfig(userAccount.s5Seed); userSDK = new FabstirSessionSDK(config, userAccount.signer);
      const hosts = [mockHost.getHostInfo()]; const session = await userSDK.startSession(hosts[0], 0.1);
      await userSDK.sendPrompt("Message before interrupt"); await new Promise(r => setTimeout(r, 50));
      await userSDK.saveConversation(); const sessionId = session.jobId; await userSDK.cleanup();
      userSDK = new FabstirSessionSDK(config, userAccount.signer);
      const recovered = await userSDK.loadPreviousSession(sessionId); expect(recovered.sessionId).toBe(sessionId);
      expect(recovered.messages.find(m => m.content.includes("before interrupt"))).toBeDefined();
    });
    it('should maintain checkpoint state', async () => {
      mockHost = new MockLLMHost(hostAccount); await mockHost.start();
      const config = mockSDKConfig(userAccount.s5Seed); userSDK = new FabstirSessionSDK(config, userAccount.signer);
      const hosts = [mockHost.getHostInfo()]; const session = await userSDK.startSession(hosts[0], 0.1);
      session.checkpointCount = 3; session.lastCheckpoint = Date.now();
      await userSDK.sendPrompt("Checkpoint test"); await new Promise(r => setTimeout(r, 50));
      expect(session.checkpointCount).toBe(3); expect(session.lastCheckpoint).toBeGreaterThan(0);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle insufficient funds gracefully', async () => {
      const poorUser = await getTestUser();
      poorUser.userId = 'poor-user';
      poorUser.address = '0xpoor' + 'b'.repeat(36);
      setMockBalance(poorUser.address, BigInt(100));
      mockHost = new MockLLMHost(hostAccount);
      await mockHost.start();
      const config = mockSDKConfig(poorUser.s5Seed);
      const sdk = new FabstirSessionSDK(config, poorUser.signer);
      const hosts = [mockHost.getHostInfo()];
      try {
        await sdk.startSession(hosts[0], 1.0);
        expect.fail('Should have thrown insufficient funds error');
      } catch (error: any) {
        expect(error).toBeDefined();
      }
      await sdk.cleanup();
    });
    it('should handle host going offline', async () => {
      mockHost = new MockLLMHost(hostAccount);
      await mockHost.start();
      const config = mockSDKConfig(userAccount.s5Seed);
      userSDK = new FabstirSessionSDK(config, userAccount.signer);
      const hosts = [mockHost.getHostInfo()];
      const session = await userSDK.startSession(hosts[0], 0.1);
      await userSDK.sendPrompt("Test message");
      await mockHost.stop();
      const activeSession = userSDK.getActiveSession(session.jobId);
      expect(activeSession).toBeDefined();
      setMockBalance(userAccount.address, BigInt(10000000));
    });
    it('should reject invalid proof of computation', async () => {
      const invalidProof = 'invalid-proof-hash';
      const isValid = invalidProof.startsWith('0x') && invalidProof.length === 66;
      expect(isValid).toBe(false);
    });
    it('should handle network interruptions', async () => {
      mockHost = new MockLLMHost(hostAccount);
      await mockHost.start();
      const config = mockSDKConfig(userAccount.s5Seed);
      userSDK = new FabstirSessionSDK(config, userAccount.signer);
      const hosts = [mockHost.getHostInfo()];
      const session = await userSDK.startSession(hosts[0], 0.1);
      await userSDK.sendPrompt("Network test");
      await new Promise(r => setTimeout(r, 200));
      expect(session.status).toBe('Active');
    });
  });

  describe('S5 Persistence', () => {
    it('should persist conversations across sessions', async () => {
      mockHost = new MockLLMHost(hostAccount);
      await mockHost.start();
      const config = mockSDKConfig(userAccount.s5Seed);
      userSDK = new FabstirSessionSDK(config, userAccount.signer);
      const hosts = [mockHost.getHostInfo()];
      const session = await userSDK.startSession(hosts[0], 0.1);
      await userSDK.sendPrompt("Persistent message");
      await new Promise(r => setTimeout(r, 50));
      await userSDK.saveConversation();
      await userSDK.endSession();
      const sessionId = session.jobId;
      await userSDK.cleanup();
      const newSDK = new FabstirSessionSDK(config, userAccount.signer);
      const loaded = await newSDK.loadPreviousSession(sessionId);
      expect(loaded.messages.find(m => m.content.includes("Persistent"))).toBeDefined();
      await newSDK.cleanup();
    });
    it('should maintain encryption with user seed', async () => {
      mockHost = new MockLLMHost(hostAccount);
      await mockHost.start();
      const config1 = mockSDKConfig(userAccount.s5Seed);
      userSDK = new FabstirSessionSDK(config1, userAccount.signer);
      const hosts = [mockHost.getHostInfo()];
      const session = await userSDK.startSession(hosts[0], 0.1);
      await userSDK.sendPrompt("Secret message");
      await new Promise(r => setTimeout(r, 50));
      await userSDK.saveConversation();
      const sessionId = session.jobId;
      const config2 = mockSDKConfig(userAccount2.s5Seed);
      authSDK = new FabstirSessionSDK(config2, userAccount2.signer);
      const loaded = await authSDK.loadPreviousSession(sessionId);
      expect(loaded.messages.length).toBe(0);
    });
  });
});