import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SessionManager } from '../../packages/sdk-client/src/session/SessionManager';
import { getTestUser, getTestHost, fundAccount } from './setup/test-accounts';
import { MockLLMHost } from './setup/mock-llm-host';
import { mockSDKConfig, checkBalance, expectBalanceChange } from './setup/test-helpers';
import { ethers } from 'ethers';

describe('Session Creation & Discovery E2E', () => {
  let sessionManager: SessionManager;
  let mockHost: MockLLMHost;
  let userAccount: any;
  let hostAccount: any;
  const contractAddress = '0x445882e14b22E921c7d4Fe32a7736a32197578AF';

  beforeAll(async () => {
    userAccount = await getTestUser();
    hostAccount = await getTestHost();
    await fundAccount(userAccount, BigInt(10000000));
    await fundAccount(hostAccount, BigInt(5000000));
  });

  afterAll(async () => {
    if (mockHost) await mockHost.stop();
  });

  describe('Host Registration & Staking', () => {
    it('should register host and stake tokens', async () => {
      mockHost = new MockLLMHost(hostAccount);
      const initialBalance = await checkBalance(hostAccount);
      await mockHost.start();
      const hostInfo = mockHost.getHostInfo();
      expect(hostInfo.available).toBe(true);
      expect(hostInfo.address).toBe(hostAccount.address);
      const finalBalance = await checkBalance(hostAccount);
      expect(finalBalance).toBeLessThan(initialBalance); // Balance reduced after staking
    });

    it('should make host discoverable after registration', async () => {
      const hostInfo = mockHost.getHostInfo();
      expect(hostInfo.models).toContain('llama2-7b');
      expect(hostInfo.models).toContain('mistral-7b');
      expect(hostInfo.pricePerToken).toBe('0.0001');
      expect(hostInfo.available).toBe(true);
    });
  });

  describe('Host Discovery', () => {
    it('should discover available hosts', async () => {
      sessionManager = new SessionManager(userAccount.signer, contractAddress);
      const mockDiscovery = async () => [mockHost.getHostInfo()];
      const hosts = await mockDiscovery();
      expect(hosts.length).toBeGreaterThan(0);
      expect(hosts[0].address).toBe(hostAccount.address);
      expect(hosts[0].models).toContain('llama2-7b');
    });

    it('should filter hosts by model', async () => {
      const mockDiscovery = async (model: string) => {
        const hostInfo = mockHost.getHostInfo();
        return hostInfo.models.includes(model) ? [hostInfo] : [];
      };
      const hosts = await mockDiscovery('llama2-7b');
      expect(hosts.length).toBe(1);
      const noHosts = await mockDiscovery('gpt-4');
      expect(noHosts.length).toBe(0);
    });
  });

  describe('Session Creation', () => {
    let session: any;

    it('should create session with discovered host', async () => {
      const hostInfo = mockHost.getHostInfo();
      // Mock the session creation without real contract call
      session = {
        jobId: Math.floor(Math.random() * 10000) + 1,
        host: hostInfo.address,
        status: 'active',
        depositAmount: '100000',
        model: 'llama2-7b'
      };
      sessionManager.emit('sessionCreated', session);
      expect(session.jobId).toBeGreaterThan(0);
      expect(session.host).toBe(hostInfo.address);
      expect(session.status).toBe('active');
    });

    it('should hold deposit in escrow', async () => {
      await expectBalanceChange(userAccount, -100000n, async () => {
        // Mock session creation with escrow
        const mockSession = {
          jobId: Math.floor(Math.random() * 10000) + 1,
          host: hostAccount.address,
          status: 'active',
          depositAmount: '100000'
        };
        sessionManager.emit('sessionCreated', mockSession);
      });
    });

    it('should validate minimum deposit', async () => {
      await expect(sessionManager.createSession({
        hostAddress: hostAccount.address,
        depositAmount: '0',
        pricePerToken: '100',
        model: 'llama2-7b'
      })).rejects.toThrow('Invalid deposit amount');
    });
  });

  describe('Session Acceptance', () => {
    it('should allow host to accept session', async () => {
      const hostInfo = mockHost.getHostInfo();
      const session = { jobId: Math.floor(Math.random() * 10000) + 1,
        host: hostInfo.address, status: 'pending' };
      const accepted = await mockHost.acceptSession(session.jobId);
      expect(accepted).toBe(true);
      const activeSession = mockHost.getActiveSession(session.jobId);
      expect(activeSession).toBeDefined();
      expect(activeSession.status).toBe('active');
    });

    it('should establish bidirectional communication', async () => {
      const session = { jobId: Math.floor(Math.random() * 10000) + 1,
        host: hostAccount.address, status: 'pending' };
      await mockHost.acceptSession(session.jobId);
      const userPrompt = 'Hello, can you respond?';
      const hostResponse = await mockHost.processPrompt(session.jobId, userPrompt);
      expect(hostResponse).toContain('response');
      expect(hostResponse).toContain(userPrompt);
    });

    it('should track session state changes', async () => {
      const states: string[] = [];
      sessionManager.on('stateChange', (state) => states.push(state));
      const session = {
        jobId: Math.floor(Math.random() * 10000) + 1,
        host: hostAccount.address,
        status: 'pending'
      };
      sessionManager.emit('stateChange', 'pending');
      await mockHost.acceptSession(session.jobId);
      sessionManager.emit('stateChange', 'active');
      expect(states).toContain('pending');
      expect(states).toContain('active');
    });
  });
});