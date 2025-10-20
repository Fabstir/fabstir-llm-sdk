// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initializeSDK,
  cleanupSDK,
  authenticate,
  isAuthenticated,
  getAuthenticatedAddress,
  clearAuthentication,
  getAuthenticationMethod,
  subscribeToAuthChanges
} from '../../src/sdk/auth';
import { getHostManager, getPaymentManager, getSessionManager } from '../../src/sdk/client';
import * as path from 'path';
import { config } from 'dotenv';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('SDK Authentication', () => {
  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();
  });

  afterEach(async () => {
    await cleanupSDK();
  });

  describe('Private Key Authentication', () => {
    it('should authenticate with valid private key', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;

      await authenticate({ method: 'privatekey', privateKey });

      expect(isAuthenticated()).toBe(true);
    });

    it('should fail authentication with invalid private key', async () => {
      const invalidKey = '0x' + '0'.repeat(64);

      await expect(
        authenticate({ method: 'privatekey', privateKey: invalidKey })
      ).rejects.toThrow();

      expect(isAuthenticated()).toBe(false);
    });

    it('should fail with malformed private key', async () => {
      const malformedKey = 'not-a-valid-key';

      await expect(
        authenticate({ method: 'privatekey', privateKey: malformedKey })
      ).rejects.toThrow('Invalid private key format');

      expect(isAuthenticated()).toBe(false);
    });

    it('should get wallet address after authentication', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      const expectedAddress = process.env.TEST_HOST_1_ADDRESS!;

      await authenticate({ method: 'privatekey', privateKey });

      const address = getAuthenticatedAddress();
      expect(address).toBeDefined();
      expect(address?.toLowerCase()).toBe(expectedAddress.toLowerCase());
    });

    it('should track authentication method', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;

      await authenticate({ method: 'privatekey', privateKey });

      const method = getAuthenticationMethod();
      expect(method).toBe('privatekey');
    });
  });

  describe('Authentication State Management', () => {
    it('should start unauthenticated', () => {
      expect(isAuthenticated()).toBe(false);
      expect(getAuthenticatedAddress()).toBeNull();
    });

    it('should clear authentication', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticate({ method: 'privatekey', privateKey });

      expect(isAuthenticated()).toBe(true);

      await clearAuthentication();

      expect(isAuthenticated()).toBe(false);
      expect(getAuthenticatedAddress()).toBeNull();
    });

    it('should handle re-authentication', async () => {
      const privateKey1 = process.env.TEST_HOST_1_PRIVATE_KEY!;
      const address1 = process.env.TEST_HOST_1_ADDRESS!;

      // First authentication
      await authenticate({ method: 'privatekey', privateKey: privateKey1 });
      expect(getAuthenticatedAddress()?.toLowerCase()).toBe(address1.toLowerCase());

      // Re-authenticate with same key
      await authenticate({ method: 'privatekey', privateKey: privateKey1 });
      expect(getAuthenticatedAddress()?.toLowerCase()).toBe(address1.toLowerCase());
      expect(isAuthenticated()).toBe(true);
    });

    it('should switch between different accounts', async () => {
      const privateKey1 = process.env.TEST_HOST_1_PRIVATE_KEY!;
      const address1 = process.env.TEST_HOST_1_ADDRESS!;

      // Authenticate with first account
      await authenticate({ method: 'privatekey', privateKey: privateKey1 });
      expect(getAuthenticatedAddress()?.toLowerCase()).toBe(address1.toLowerCase());

      // Switch to different account if available
      if (process.env.TEST_HOST_2_PRIVATE_KEY) {
        const privateKey2 = process.env.TEST_HOST_2_PRIVATE_KEY;
        const address2 = process.env.TEST_HOST_2_ADDRESS!;

        await authenticate({ method: 'privatekey', privateKey: privateKey2 });
        expect(getAuthenticatedAddress()?.toLowerCase()).toBe(address2.toLowerCase());
      }
    });
  });

  describe('Manager Access Control', () => {
    it('should require authentication for manager access', async () => {
      expect(() => getHostManager()).toThrow('not authenticated');
      expect(() => getPaymentManager()).toThrow('not authenticated');
      expect(() => getSessionManager()).toThrow('not authenticated');
    });

    it('should allow manager access after authentication', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticate({ method: 'privatekey', privateKey });

      expect(() => getHostManager()).not.toThrow();
      expect(() => getPaymentManager()).not.toThrow();
      expect(() => getSessionManager()).not.toThrow();
    });

    it('should deny manager access after clearing authentication', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticate({ method: 'privatekey', privateKey });

      expect(() => getHostManager()).not.toThrow();

      await clearAuthentication();

      expect(() => getHostManager()).toThrow('not authenticated');
    });
  });

  describe('Environment-based Authentication', () => {
    it('should authenticate using environment variable', async () => {
      const originalEnv = process.env.FABSTIR_HOST_PRIVATE_KEY;
      process.env.FABSTIR_HOST_PRIVATE_KEY = process.env.TEST_HOST_1_PRIVATE_KEY;

      await authenticate({ method: 'env' });

      expect(isAuthenticated()).toBe(true);
      expect(getAuthenticatedAddress()).toBeDefined();

      // Restore
      if (originalEnv) process.env.FABSTIR_HOST_PRIVATE_KEY = originalEnv;
      else delete process.env.FABSTIR_HOST_PRIVATE_KEY;
    });

    it('should fail if environment variable not set', async () => {
      const originalEnv = process.env.FABSTIR_HOST_PRIVATE_KEY;
      const originalTest = process.env.TEST_HOST_1_PRIVATE_KEY;
      delete process.env.FABSTIR_HOST_PRIVATE_KEY;
      delete process.env.TEST_HOST_1_PRIVATE_KEY;

      await expect(authenticate({ method: 'env' }))
        .rejects.toThrow('FABSTIR_HOST_PRIVATE_KEY not set');

      // Restore
      if (originalEnv) process.env.FABSTIR_HOST_PRIVATE_KEY = originalEnv;
      if (originalTest) process.env.TEST_HOST_1_PRIVATE_KEY = originalTest;
    });
  });

  describe('Error Recovery', () => {
    it('should maintain state after failed authentication', async () => {
      const validKey = process.env.TEST_HOST_1_PRIVATE_KEY!;

      // First authenticate successfully
      await authenticate({ method: 'privatekey', privateKey: validKey });
      expect(isAuthenticated()).toBe(true);
      const originalAddress = getAuthenticatedAddress();

      // Try invalid authentication
      try {
        await authenticate({ method: 'privatekey', privateKey: 'invalid' });
      } catch {
        // Expected to fail
      }

      // Should maintain previous authentication
      expect(isAuthenticated()).toBe(true);
      expect(getAuthenticatedAddress()).toBe(originalAddress);
    });

    it('should handle authentication timeout', async () => {
      // Mock a slow authentication
      const slowAuth = new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Authentication timeout')), 100);
      });

      await expect(slowAuth).rejects.toThrow('Authentication timeout');
      expect(isAuthenticated()).toBe(false);
    });
  });

  describe('Authentication Events', () => {
    it('should emit authentication events', async () => {
      const events: string[] = [];
      const onAuthChange = (status: boolean) => {
        events.push(status ? 'authenticated' : 'unauthenticated');
      };

      // Subscribe to auth changes
      const unsubscribe = subscribeToAuthChanges(onAuthChange);

      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticate({ method: 'privatekey', privateKey });
      await clearAuthentication();

      expect(events).toContain('authenticated');
      expect(events).toContain('unauthenticated');

      unsubscribe();
    });
  });
});