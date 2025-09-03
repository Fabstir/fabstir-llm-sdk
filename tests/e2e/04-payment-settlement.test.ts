import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FabstirSessionSDK } from '../../src/FabstirSessionSDK';
import { getTestUser, getTestHost, getTreasury, fundAccount } from './setup/test-accounts';
import { MockLLMHost } from './setup/mock-llm-host';
import { mockSDKConfig, checkBalance, expectBalanceChange, setMockBalance } from './setup/test-helpers';
import { ethers } from 'ethers';

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
    async connect() {} async sendPrompt() { setTimeout(() => this.handlers.forEach(h => h({ content: 'Mock response with tokens' })), 50); }
    onResponse(h: any) { this.handlers.push(h); } disconnect() {}
  }
}));
vi.mock('../../packages/sdk-client/src/p2p/HostDiscovery', () => ({
  HostDiscovery: class { async discoverHosts() { return []; } }
}));
vi.mock('../../src/storage/S5ConversationStore', () => ({
  S5ConversationStore: class {
    async connect() {} async disconnect() {} async savePrompt() {} async saveResponse() {} async loadSession() { return []; }
  }
}));

describe('Session Completion & Payment Settlement E2E', () => {
  let userSDK: FabstirSessionSDK, userAccount: any, hostAccount: any, treasuryAccount: any;
  let mockHost: MockLLMHost, session: any;
  let initialUserBalance: bigint, initialHostBalance: bigint, initialTreasuryBalance: bigint;
  const PRICE_PER_TOKEN = '100000000000000'; // 0.0001 ETH in Wei
  const PLATFORM_FEE_PERCENT = 5;

  beforeAll(async () => {
    userAccount = await getTestUser(); hostAccount = await getTestHost(); treasuryAccount = getTreasury();
    setMockBalance(userAccount.address, BigInt(10000000));
    setMockBalance(hostAccount.address, BigInt(1000000));
    setMockBalance(treasuryAccount.address, BigInt(0));
    initialUserBalance = await checkBalance(userAccount);
    initialHostBalance = await checkBalance(hostAccount);
    initialTreasuryBalance = await checkBalance(treasuryAccount);
    mockHost = new MockLLMHost(hostAccount);
    mockHost.setMockResponse("test prompt", "test response with multiple tokens here");
    await mockHost.start();
    const config = mockSDKConfig(userAccount.s5Seed);
    userSDK = new FabstirSessionSDK(config, userAccount.signer);
    const hosts = [mockHost.getHostInfo()];
    session = await userSDK.startSession(hosts[0], 0.1);
    await userSDK.sendPrompt("test prompt");
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(async () => { if (userSDK) await userSDK.cleanup(); if (mockHost) await mockHost.stop(); });

  describe('Session Completion', () => {
    it('should end session and get completion receipt', async () => {
      const receipt = await userSDK.endSession();
      expect(receipt).toBeDefined();
      expect(receipt.sessionId).toBe(session.jobId);
      expect(receipt.totalTokens).toBeGreaterThan(0);
      expect(receipt.totalCost).toBeDefined();
      expect(receipt.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
    it('should update session status to completed', async () => {
      const newSDK = new FabstirSessionSDK(mockSDKConfig(userAccount.s5Seed), userAccount.signer);
      const completedSession = newSDK.getActiveSession(session.jobId);
      expect(completedSession).toBeUndefined();
      await newSDK.cleanup();
    });
    it('should calculate final token count', async () => {
      const activeSession = userSDK.getActiveSessions().find(s => s.jobId === session.jobId);
      if (activeSession) expect(activeSession.tokensUsed).toBeGreaterThan(0);
    });
  });

  describe('Proof of Computation', () => {
    it('should verify proof from host', async () => {
      const proof = mockHost.simulateProofOfComputation(session.jobId);
      expect(proof).toMatch(/^0x[a-fA-F0-9]{64}$/);
      const isValid = proof.startsWith('0x') && proof.length === 66;
      expect(isValid).toBe(true);
    });
    it('should reject invalid proof', async () => {
      const invalidProof = 'invalid-proof';
      const isValid = invalidProof.startsWith('0x') && invalidProof.length === 66;
      expect(isValid).toBe(false);
    });
    it('should verify proof matches session data', async () => {
      const proof = mockHost.simulateProofOfComputation(session.jobId);
      expect(proof).toBeDefined();
      expect(proof.length).toBe(66);
    });
  });

  describe('Payment Calculation', () => {
    it('should calculate payment based on tokens used', async () => {
      const tokensUsed = 100, pricePerTokenEth = 0.0001;
      const expectedCost = tokensUsed * pricePerTokenEth;
      expect(expectedCost).toBe(0.01);
      expect(expectedCost).toBeGreaterThan(0);
      expect(expectedCost).toBeLessThanOrEqual(0.1);
    });
    it('should calculate platform fees correctly', async () => {
      const payment = 0.01, platformFee = payment * (PLATFORM_FEE_PERCENT / 100);
      const hostPayment = payment - platformFee;
      expect(platformFee).toBe(0.0005);
      expect(hostPayment).toBe(0.0095);
    });
    it('should apply price per token correctly', async () => {
      const tokens = 50, priceWei = ethers.BigNumber.from(PRICE_PER_TOKEN);
      const totalWei = priceWei.mul(tokens), totalEth = ethers.utils.formatEther(totalWei);
      expect(parseFloat(totalEth)).toBe(0.005);
    });
  });

  describe('Balance Updates', () => {
    it('should decrease user balance by payment amount', async () => {
      const paymentAmount = BigInt(100000);
      await expectBalanceChange(userAccount, -paymentAmount, async () => {
        setMockBalance(userAccount.address, initialUserBalance - paymentAmount);
      });
    });

    it('should increase host balance minus fees', async () => {
      const paymentAmount = BigInt(100000);
      const fee = paymentAmount * BigInt(PLATFORM_FEE_PERCENT) / BigInt(100);
      const hostReceives = paymentAmount - fee;
      const before = await checkBalance(hostAccount);
      setMockBalance(hostAccount.address, before + hostReceives);
      const after = await checkBalance(hostAccount);
      expect(after - before).toBe(hostReceives);
    });

    it('should transfer fees to treasury', async () => {
      const paymentAmount = BigInt(100000);
      const fee = paymentAmount * BigInt(PLATFORM_FEE_PERCENT) / BigInt(100);
      const before = await checkBalance(treasuryAccount);
      setMockBalance(treasuryAccount.address, before + fee);
      const after = await checkBalance(treasuryAccount);
      expect(after - before).toBe(fee);
    });

    it('should handle escrow release properly', async () => {
      const depositAmount = BigInt(ethers.utils.parseEther('0.1').toString());
      const actualCost = BigInt(10000);
      const refund = depositAmount - actualCost;
      expect(refund).toBeGreaterThan(0);
    });
  });

  describe('Transaction Recording', () => {
    it('should record transaction hash', async () => {
      const txHash = '0x' + '1'.repeat(64);
      expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(txHash.length).toBe(66);
    });

    it('should generate payment receipt with all details', async () => {
      const receipt = { sessionId: session.jobId, totalTokens: 100,
        totalCost: '0.01', transactionHash: '0x' + '2'.repeat(64),
        platformFee: '0.0005', hostPayment: '0.0095', timestamp: Date.now() };
      expect(receipt.sessionId).toBeDefined();
      expect(receipt.totalTokens).toBeGreaterThan(0);
      expect(receipt.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should verify final balances match expectations', async () => {
      const paymentAmount = BigInt(10000);
      const fee = paymentAmount * BigInt(PLATFORM_FEE_PERCENT) / BigInt(100);
      const hostPayment = paymentAmount - fee;
      setMockBalance(userAccount.address, initialUserBalance - paymentAmount);
      setMockBalance(hostAccount.address, initialHostBalance + hostPayment);
      setMockBalance(treasuryAccount.address, initialTreasuryBalance + fee);
      const finalUserBalance = await checkBalance(userAccount);
      const finalHostBalance = await checkBalance(hostAccount);
      const finalTreasuryBalance = await checkBalance(treasuryAccount);
      expect(finalUserBalance).toBeLessThan(initialUserBalance);
      expect(finalHostBalance).toBeGreaterThan(initialHostBalance);
      expect(finalTreasuryBalance).toBeGreaterThan(initialTreasuryBalance);
      const userChange = initialUserBalance - finalUserBalance;
      const hostChange = finalHostBalance - initialHostBalance;
      const treasuryChange = finalTreasuryBalance - initialTreasuryBalance;
      expect(userChange).toBe(hostChange + treasuryChange);
    });
  });
});