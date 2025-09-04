import { describe, it, expect, beforeEach, vi } from 'vitest';
import SessionManager from '../../src/managers/SessionManager';
import AuthManager from '../../src/managers/AuthManager';
import PaymentManager from '../../src/managers/PaymentManager';
import StorageManager from '../../src/managers/StorageManager';
import DiscoveryManager from '../../src/managers/DiscoveryManager';

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let mockAuthManager: AuthManager;
  let mockPaymentManager: PaymentManager;
  let mockStorageManager: StorageManager;
  let mockDiscoveryManager: DiscoveryManager;

  beforeEach(() => {
    // Mock AuthManager
    mockAuthManager = {
      isAuthenticated: vi.fn(() => true),
      getUserAddress: vi.fn(() => '0xUser123'),
      getSigner: vi.fn(),
      getS5Seed: vi.fn(() => 'mock seed phrase')
    } as any;

    // Mock PaymentManager
    mockPaymentManager = {
      createETHSessionJob: vi.fn().mockResolvedValue({
        jobId: '42',
        txHash: '0xETHTx123',
        hostAddress: '0xHost789'
      }),
      createUSDCSessionJob: vi.fn().mockResolvedValue({
        jobId: '43',
        txHash: '0xUSDCTx456',
        hostAddress: '0xHost789'
      }),
      completeSessionJob: vi.fn().mockResolvedValue('0xCompleteTx789'),
      approveUSDC: vi.fn().mockResolvedValue('0xApprovalTx')
    } as any;

    // Mock StorageManager  
    mockStorageManager = {
      storeData: vi.fn().mockResolvedValue('bafybeiExample123'),
      retrieveData: vi.fn().mockResolvedValue({
        jobId: '42',
        hostAddress: '0xHost789',
        status: 'active',
        amount: '0.005',
        created: Date.now()
      }),
      listKeys: vi.fn().mockResolvedValue(['session-42', 'session-43']),
      deleteData: vi.fn().mockResolvedValue(true)
    } as any;

    // Mock DiscoveryManager
    mockDiscoveryManager = {
      createNode: vi.fn().mockResolvedValue('12D3KooWPeerId'),
      connectToPeer: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      getConnectedPeers: vi.fn().mockReturnValue(['12D3KooWHost1', '12D3KooWHost2']),
      findHost: vi.fn().mockResolvedValue('0xDiscoveredHost')
    } as any;

    sessionManager = new SessionManager(
      mockAuthManager,
      mockPaymentManager,
      mockStorageManager,
      mockDiscoveryManager
    );
  });

  describe('Session Creation', () => {
    it('should create ETH session with discovery', async () => {
      const options = {
        paymentType: 'ETH' as const,
        amount: '0.005',
        pricePerToken: 5000,
        duration: 3600,
        hostCriteria: { minReputation: 100 }
      };

      const result = await sessionManager.createSession(options);

      expect(result).toMatchObject({
        sessionId: 'session-42',
        jobId: '42',
        hostAddress: '0xHost789',
        txHash: '0xETHTx123'
      });

      expect(mockPaymentManager.createETHSessionJob).toHaveBeenCalledWith(
        '0xDiscoveredHost', // Uses discovered host when hostCriteria is provided
        '0.005',
        5000,
        3600,
        300 // Default proof interval
      );

      expect(mockStorageManager.storeData).toHaveBeenCalledWith(
        'session-42',
        expect.objectContaining({
          jobId: '42',
          hostAddress: '0xHost789',
          status: 'active',
          paymentType: 'ETH'
        })
      );
    });

    it('should create USDC session with provided host', async () => {
      const options = {
        paymentType: 'USDC' as const,
        amount: '5',
        hostAddress: '0xSpecificHost',
        tokenAddress: '0xUSDCToken'
      };

      const result = await sessionManager.createSession(options);

      expect(result.sessionId).toBe('session-43');
      expect(result.jobId).toBe('43');
      expect(mockPaymentManager.createUSDCSessionJob).toHaveBeenCalled();
    });

    it('should throw error when not authenticated', async () => {
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await expect(
        sessionManager.createSession({
          paymentType: 'ETH',
          amount: '0.005'
        })
      ).rejects.toThrow('Must authenticate first');
    });

    it('should use discovery to find host when not provided', async () => {
      const options = {
        paymentType: 'ETH' as const,
        amount: '0.005',
        hostCriteria: { region: 'us-west' }
      };

      await sessionManager.createSession(options);

      expect(mockDiscoveryManager.findHost).toHaveBeenCalledWith({ region: 'us-west' });
    });
  });

  describe('Proof Submission', () => {
    it('should submit proof for active session', async () => {
      const proofData = {
        tokensGenerated: 1000,
        completionTime: 1234567890,
        modelUsed: 'llama2-7b'
      };

      const txHash = await sessionManager.submitProof('session-42', proofData);

      expect(txHash).toBe('0xProofTx123');
      expect(mockStorageManager.storeData).toHaveBeenCalledWith(
        'session-42-proof',
        proofData
      );
    });

    it('should throw error for invalid session', async () => {
      mockStorageManager.retrieveData.mockRejectedValue(new Error('Not found'));

      await expect(
        sessionManager.submitProof('invalid-session', {})
      ).rejects.toThrow('Session not found');
    });
  });

  describe('Session Completion', () => {
    it('should complete session and trigger payment', async () => {
      const result = await sessionManager.completeSession('session-42');

      expect(result).toMatchObject({
        txHash: '0xCompleteTx789',
        paymentDistribution: {
          host: '0.0045', // 90% of 0.005
          treasury: '0.0005' // 10% of 0.005
        }
      });

      expect(mockPaymentManager.completeSessionJob).toHaveBeenCalledWith('42');
      
      expect(mockStorageManager.storeData).toHaveBeenCalledWith(
        'session-42',
        expect.objectContaining({
          status: 'completed'
        })
      );
    });

    it('should handle completion failure gracefully', async () => {
      mockPaymentManager.completeSessionJob.mockRejectedValue(
        new Error('Already completed')
      );

      await expect(
        sessionManager.completeSession('session-42')
      ).rejects.toThrow('Failed to complete session');
    });
  });

  describe('Session Data Management', () => {
    it('should store session data to S5', async () => {
      const data = {
        messages: ['Hello', 'World'],
        tokens: 1500,
        metadata: { model: 'gpt-4' }
      };

      const cid = await sessionManager.storeSessionData('session-42', data);

      expect(cid).toBe('bafybeiExample123');
      expect(mockStorageManager.storeData).toHaveBeenCalledWith(
        'session-42-data',
        data
      );
    });

    it('should retrieve session data from S5', async () => {
      const mockData = { messages: ['Test'], tokens: 500 };
      mockStorageManager.retrieveData.mockResolvedValue(mockData);

      const data = await sessionManager.getSessionData('session-42');

      expect(data).toEqual(mockData);
      expect(mockStorageManager.retrieveData).toHaveBeenCalledWith('session-42-data');
    });

    it('should return null for non-existent session data', async () => {
      mockStorageManager.retrieveData.mockRejectedValue(new Error('Not found'));

      const data = await sessionManager.getSessionData('non-existent');
      expect(data).toBeNull();
    });
  });

  describe('Session Status', () => {
    it('should get active sessions', async () => {
      const sessions = await sessionManager.getActiveSessions();

      expect(sessions).toEqual(['session-42', 'session-43']);
      expect(mockStorageManager.listKeys).toHaveBeenCalledWith('session-');
    });

    it('should return correct session status for active session', async () => {
      const status = await sessionManager.getSessionStatus('session-42');
      expect(status).toBe('active');
    });

    it('should return correct session status for completed session', async () => {
      mockStorageManager.retrieveData.mockResolvedValue({
        status: 'completed',
        jobId: '42'
      });

      const status = await sessionManager.getSessionStatus('session-42');
      expect(status).toBe('completed');
    });

    it('should return failed status for non-existent session', async () => {
      mockStorageManager.retrieveData.mockRejectedValue(new Error('Not found'));

      const status = await sessionManager.getSessionStatus('invalid');
      expect(status).toBe('failed');
    });
  });

  describe('Constants', () => {
    it('should have correct default constants', () => {
      expect(SessionManager.DEFAULT_PRICE_PER_TOKEN).toBe(5000);
      expect(SessionManager.DEFAULT_DURATION).toBe(3600);
      expect(SessionManager.DEFAULT_PROOF_INTERVAL).toBe(300);
      expect(SessionManager.MIN_ETH_PAYMENT).toBe('0.005');
      expect(SessionManager.PAYMENT_SPLIT).toEqual({
        host: 0.9,
        treasury: 0.1
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle discovery failure in session creation', async () => {
      mockDiscoveryManager.findHost.mockRejectedValue(new Error('No hosts found'));

      await expect(
        sessionManager.createSession({
          paymentType: 'ETH',
          amount: '0.005',
          hostCriteria: { impossible: true }
        })
      ).rejects.toThrow('Failed to find suitable host');
    });

    it('should handle storage failure in session creation', async () => {
      mockStorageManager.storeData.mockRejectedValue(new Error('Storage error'));

      await expect(
        sessionManager.createSession({
          paymentType: 'ETH',
          amount: '0.005',
          hostAddress: '0xHost'
        })
      ).rejects.toThrow('Failed to store session metadata');
    });
  });
});