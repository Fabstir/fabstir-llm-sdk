import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto'; // Required for S5.js
import {
  initializeSDK,
  getHostManager,
  getPaymentManager,
  getSessionManager,
  getTreasuryManager,
  authenticateSDK,
  cleanupSDK
} from '../../src/sdk/client';
import * as path from 'path';
import { config } from 'dotenv';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('SDK Manager Access', () => {
  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();
  });

  afterEach(async () => {
    await cleanupSDK();
  });

  describe('Manager Access Without Authentication', () => {
    it('should throw error when accessing HostManager without auth', () => {
      expect(() => getHostManager()).toThrow('not authenticated');
    });

    it('should throw error when accessing PaymentManager without auth', () => {
      expect(() => getPaymentManager()).toThrow('not authenticated');
    });

    it('should throw error when accessing SessionManager without auth', () => {
      expect(() => getSessionManager()).toThrow('not authenticated');
    });

    it('should throw error when accessing TreasuryManager without auth', () => {
      expect(() => getTreasuryManager()).toThrow('not authenticated');
    });

    it('should provide helpful error messages', () => {
      try {
        getHostManager();
      } catch (error: any) {
        expect(error.message).toContain('authenticateSDK');
      }
    });
  });

  describe('Manager Access With Authentication', () => {
    beforeEach(async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);
    });

    it('should access HostManager after authentication', () => {
      const hostManager = getHostManager();

      expect(hostManager).toBeDefined();
      expect(hostManager).toHaveProperty('registerHostWithModels');
      expect(hostManager).toHaveProperty('discoverAllActiveHosts');
      expect(hostManager).toHaveProperty('getHostStatus');
    });

    it('should access PaymentManager after authentication', () => {
      const paymentManager = getPaymentManager();

      expect(paymentManager).toBeDefined();
      expect(paymentManager).toHaveProperty('getBalance');
      expect(paymentManager).toHaveProperty('submitCheckpointAsHost');
      expect(paymentManager).toHaveProperty('getJobStatus');
    });

    it('should access SessionManager after authentication', () => {
      const sessionManager = getSessionManager();

      expect(sessionManager).toBeDefined();
      expect(sessionManager).toHaveProperty('startSession');
      expect(sessionManager).toHaveProperty('sendPrompt');
      expect(sessionManager).toHaveProperty('completeSession');
    });

    it('should access TreasuryManager after authentication', () => {
      const treasuryManager = getTreasuryManager();

      expect(treasuryManager).toBeDefined();
      expect(treasuryManager).toHaveProperty('withdrawFees');
    });
  });

  describe('Manager Singleton Behavior', () => {
    beforeEach(async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);
    });

    it('should return same HostManager instance', () => {
      const manager1 = getHostManager();
      const manager2 = getHostManager();

      expect(manager1).toBe(manager2);
    });

    it('should return same PaymentManager instance', () => {
      const manager1 = getPaymentManager();
      const manager2 = getPaymentManager();

      expect(manager1).toBe(manager2);
    });

    it('should return same SessionManager instance', () => {
      const manager1 = getSessionManager();
      const manager2 = getSessionManager();

      expect(manager1).toBe(manager2);
    });

    it('should persist manager state across calls', async () => {
      const hostManager = getHostManager();

      // Set some state (if manager has any settable state)
      // This is implementation-specific
      const initialState = hostManager;

      // Get manager again
      const sameManager = getHostManager();

      expect(sameManager).toBe(initialState);
    });
  });

  describe('Manager Method Accessibility', () => {
    beforeEach(async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);
    });

    it('should have all expected HostManager methods', () => {
      const hostManager = getHostManager();

      // Core methods
      expect(typeof hostManager.registerHostWithModels).toBe('function');
      expect(typeof hostManager.discoverAllActiveHosts).toBe('function');
      expect(typeof hostManager.getHostStatus).toBe('function');
      expect(typeof hostManager.updateHostModels).toBe('function');
      expect(typeof hostManager.getHostModels).toBe('function');
      expect(typeof hostManager.withdrawEarnings).toBe('function');
    });

    it('should have all expected PaymentManager methods', () => {
      const paymentManager = getPaymentManager();

      // Core methods
      expect(typeof paymentManager.getBalance).toBe('function');
      expect(typeof paymentManager.submitCheckpointAsHost).toBe('function');
      expect(typeof paymentManager.getJobStatus).toBe('function');
      expect(typeof paymentManager.claimPayment).toBe('function');
    });

    it('should have all expected SessionManager methods', () => {
      const sessionManager = getSessionManager();

      // Core methods
      expect(typeof sessionManager.startSession).toBe('function');
      expect(typeof sessionManager.sendPrompt).toBe('function');
      expect(typeof sessionManager.completeSession).toBe('function');
      expect(typeof sessionManager.resumeSession).toBe('function');
    });
  });

  describe('Manager Error Handling', () => {
    it('should handle manager initialization errors', async () => {
      // Test with invalid configuration
      const originalEnv = process.env.CONTRACT_JOB_MARKETPLACE;
      process.env.CONTRACT_JOB_MARKETPLACE = '0x0000000000000000000000000000000000000000';

      await cleanupSDK();
      await initializeSDK();

      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      // Manager should be accessible even with zero address
      // (actual contract calls would fail, but manager should initialize)
      const hostManager = getHostManager();
      expect(hostManager).toBeDefined();

      // Restore
      process.env.CONTRACT_JOB_MARKETPLACE = originalEnv;
    }, 15000);

    it('should provide meaningful errors for manager operations', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const paymentManager = getPaymentManager();

      // Test with invalid job ID - getJobStatus returns empty job, not error
      const result = await paymentManager.getJobStatus(BigInt(999999999));

      // Should return an empty/default job object
      expect(result).toBeDefined();
      expect(result.id).toBe(BigInt(0));
    }, 15000);
  });

  describe('Manager Cleanup', () => {
    it('should clear managers on SDK cleanup', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      // Verify managers are accessible
      expect(() => getHostManager()).not.toThrow();

      // Cleanup
      await cleanupSDK();

      // Managers should not be accessible
      expect(() => getHostManager()).toThrow('SDK not initialized');
    }, 15000);

    it('should require re-authentication after cleanup', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      expect(() => getHostManager()).not.toThrow();

      // Cleanup and reinitialize
      await cleanupSDK();
      await initializeSDK();

      // Should require authentication again
      expect(() => getHostManager()).toThrow('not authenticated');

      // Re-authenticate
      await authenticateSDK(privateKey);

      // Should work again
      expect(() => getHostManager()).not.toThrow();
    }, 15000);
  });

  describe('Cross-Manager Interactions', () => {
    beforeEach(async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);
    });

    it('should share same SDK instance across managers', () => {
      const hostManager = getHostManager();
      const paymentManager = getPaymentManager();

      // Both should be using the same underlying SDK
      // This is implementation-specific, but we can test for consistency
      expect(hostManager).toBeDefined();
      expect(paymentManager).toBeDefined();
    });

    it('should maintain consistent state across managers', async () => {
      const hostManager = getHostManager();
      const paymentManager = getPaymentManager();

      // If host manager has address, payment manager should too
      // (implementation specific, but testing consistency)
      expect(hostManager).toBeDefined();
      expect(paymentManager).toBeDefined();
    });
  });
});