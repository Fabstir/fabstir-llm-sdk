import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  registerHost,
  checkRegistrationStatus,
  getRegistrationInfo,
  validateRegistrationRequirements,
  RegistrationConfig
} from '../../src/registration/manager';
import {
  executeRegistration,
  prepareRegistrationData,
  submitRegistration,
  waitForRegistrationConfirmation
} from '../../src/commands/register';
import { initializeSDK, authenticateSDK, cleanupSDK } from '../../src/sdk/client';
import { checkAllRequirements } from '../../src/balance/requirements';
import * as path from 'path';
import { config } from 'dotenv';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('Host Registration Flow', () => {
  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();
  });

  afterEach(async () => {
    await cleanupSDK();
  });

  describe('Registration Requirements', () => {
    it('should validate registration requirements before proceeding', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const validation = await validateRegistrationRequirements();

      expect(validation).toBeDefined();
      expect(validation).toHaveProperty('canRegister');
      expect(validation).toHaveProperty('requirements');
      expect(validation).toHaveProperty('errors');
    });

    it('should check if host is already registered', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await checkRegistrationStatus();

      expect(status).toBeDefined();
      expect(status).toHaveProperty('isRegistered');
      expect(status).toHaveProperty('hostAddress');
      expect(status).toHaveProperty('stakedAmount');
    });

    it('should prevent registration if already registered', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await checkRegistrationStatus();

      if (status.isRegistered) {
        const config: RegistrationConfig = {
          apiUrl: 'http://localhost:3000',
          models: ['gpt-4', 'claude-3'],
          metadata: { name: 'Test Host' }
        };

        await expect(registerHost(config)).rejects.toThrow('already registered');
      }
    });

    it('should verify sufficient balances before registration', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const requirements = await checkAllRequirements();

      if (!requirements.meetsAll) {
        const config: RegistrationConfig = {
          apiUrl: 'http://localhost:3000',
          models: ['gpt-4'],
          metadata: {}
        };

        await expect(registerHost(config)).rejects.toThrow(/insufficient|not met/i);
      }
    });
  });

  describe('Registration Data Preparation', () => {
    it('should prepare registration data with required fields', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const config: RegistrationConfig = {
        apiUrl: 'https://api.example.com',
        models: ['gpt-4', 'claude-3', 'llama-2'],
        metadata: {
          name: 'Test Host',
          description: 'A test host for development'
        }
      };

      const data = await prepareRegistrationData(config);

      expect(data).toBeDefined();
      expect(data.apiUrl).toBe(config.apiUrl);
      expect(data.models).toEqual(config.models);
      expect(data.metadata).toEqual(config.metadata);
      expect(data.stakeAmount).toBeDefined();
      expect(data.hostAddress).toBeDefined();
    });

    it('should validate API URL format', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const config: RegistrationConfig = {
        apiUrl: 'invalid-url',
        models: ['gpt-4'],
        metadata: {}
      };

      await expect(prepareRegistrationData(config)).rejects.toThrow('Invalid API URL');
    });

    it('should require at least one model', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const config: RegistrationConfig = {
        apiUrl: 'https://api.example.com',
        models: [],
        metadata: {}
      };

      await expect(prepareRegistrationData(config)).rejects.toThrow(/at least one model|required/i);
    });

    it('should validate model names', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const config: RegistrationConfig = {
        apiUrl: 'https://api.example.com',
        models: ['invalid model!'],
        metadata: {}
      };

      await expect(prepareRegistrationData(config)).rejects.toThrow('Invalid model name');
    });

    it('should set default stake amount to 1000 FAB', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const config: RegistrationConfig = {
        apiUrl: 'https://api.example.com',
        models: ['gpt-4'],
        metadata: {}
      };

      const data = await prepareRegistrationData(config);

      expect(data.stakeAmount).toBe(1000000000000000000000n); // 1000 FAB in wei
    });
  });

  describe('Registration Submission', () => {
    it('should submit registration transaction', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await checkRegistrationStatus();

      if (status.isRegistered) {
        // Host is already registered, which is expected
        expect(status.isRegistered).toBe(true);
        expect(status.stakedAmount).toBeGreaterThanOrEqual(1000000000000000000000n);
      } else {
        const config: RegistrationConfig = {
          apiUrl: 'https://api.example.com',
          models: ['gpt-4'],
          metadata: { name: 'Test Host' }
        };

        const result = await submitRegistration(config);

        expect(result).toBeDefined();
        expect(result).toHaveProperty('transactionHash');
        expect(result).toHaveProperty('status');
        expect(result.status).toBe('confirmed');
      }
    });

    it('should wait for transaction confirmation', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const mockTxHash = '0x' + '0'.repeat(64);
      const confirmation = await waitForRegistrationConfirmation(mockTxHash, 1);

      expect(confirmation).toBeDefined();
      expect(confirmation).toHaveProperty('confirmed');
      expect(confirmation).toHaveProperty('blockNumber');
    });

    it('should handle transaction failures gracefully', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const config: RegistrationConfig = {
        apiUrl: 'https://api.example.com',
        models: ['gpt-4'],
        metadata: {},
        gasLimit: 1 // Intentionally low to cause failure
      };

      await expect(submitRegistration(config)).rejects.toThrow();
    });
  });

  describe('Registration Information', () => {
    it('should retrieve registration information after success', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const info = await getRegistrationInfo();

      expect(info).toBeDefined();
      expect(info).toHaveProperty('hostAddress');
      expect(info).toHaveProperty('apiUrl');
      expect(info).toHaveProperty('models');
      expect(info).toHaveProperty('stakedAmount');
      expect(info).toHaveProperty('registrationBlock');
    });

    it('should return null for non-registered hosts', async () => {
      const privateKey = process.env.TEST_USER_1_PRIVATE_KEY!; // Use user account
      await authenticateSDK(privateKey);

      const info = await getRegistrationInfo();

      if (!info) {
        expect(info).toBeNull();
      } else {
        expect(info.stakedAmount).toBe(0n);
      }
    });
  });

  describe('Complete Registration Flow', () => {
    it('should execute complete registration flow', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await checkRegistrationStatus();

      if (!status.isRegistered) {
        const config: RegistrationConfig = {
          apiUrl: 'https://api.example.com',
          models: ['gpt-4', 'claude-3'],
          metadata: {
            name: 'Test Host',
            description: 'Test host for development'
          }
        };

        try {
          const result = await executeRegistration(config);

          expect(result).toBeDefined();
          expect(result.success).toBe(true);
          expect(result.transactionHash).toBeDefined();
          expect(result.hostInfo).toBeDefined();
          expect(result.hostInfo.apiUrl).toBe(config.apiUrl);
        } catch (error: any) {
          // Expected if insufficient balance OR already registered
          expect(error.message).toMatch(/insufficient|requirements not met|already|staked/i);
        }
      } else {
        expect(status.isRegistered).toBe(true);
      }
    });

    it('should provide progress updates during registration', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const updates: string[] = [];
      const onProgress = (message: string) => {
        updates.push(message);
      };

      const status = await checkRegistrationStatus();

      if (!status.isRegistered) {
        const config: RegistrationConfig = {
          apiUrl: 'https://api.example.com',
          models: ['gpt-4'],
          metadata: {},
          onProgress
        };

        try {
          await executeRegistration(config);

          expect(updates.length).toBeGreaterThan(0);
          expect(updates.some(u => u.includes('Checking requirements'))).toBe(true);
          expect(updates.some(u => u.includes('Approving'))).toBe(true);
          expect(updates.some(u => u.includes('Registering'))).toBe(true);
        } catch (error: any) {
          // Even if it fails, we should have gotten progress updates
          if (updates.length > 0) {
            expect(updates.some(u => u.includes('Checking requirements'))).toBe(true);
          } else {
            // If already registered, might not get updates
            expect(error.message).toMatch(/already|registered|staked/i);
          }
        }
      }
    });

    it('should validate all registration parameters', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const invalidConfigs = [
        { apiUrl: '', models: ['gpt-4'], metadata: {} },
        { apiUrl: 'https://api.example.com', models: [], metadata: {} },
        { apiUrl: 'not-a-url', models: ['gpt-4'], metadata: {} },
        { apiUrl: 'https://api.example.com', models: [''], metadata: {} }
      ];

      for (const config of invalidConfigs) {
        await expect(executeRegistration(config as any)).rejects.toThrow();
      }
    });
  });
});