// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  handleRegistrationError,
  RegistrationError,
  ErrorCode,
  recoverFromError,
  getErrorMessage,
  getErrorStatistics,
  getErrorSummary
} from '../../src/registration/errors';
import { registerHost } from '../../src/registration/manager';
import { stakeTokens } from '../../src/registration/staking';
import { initializeSDK, authenticateSDK, cleanupSDK } from '../../src/sdk/client';
import * as path from 'path';
import { config } from 'dotenv';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('Registration Error Handling', () => {
  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();
  });

  afterEach(async () => {
    await cleanupSDK();
  });

  describe('Common Registration Errors', () => {
    it('should handle insufficient balance error', async () => {
      const error = new RegistrationError(
        'Insufficient FAB balance',
        ErrorCode.INSUFFICIENT_BALANCE,
        { required: 1000n, available: 500n }
      );

      const handled = handleRegistrationError(error);

      expect(handled).toBeDefined();
      expect(handled.code).toBe(ErrorCode.INSUFFICIENT_BALANCE);
      expect(handled.message).toContain('Insufficient');
      expect(handled.resolution).toContain('acquire more FAB');
    });

    it('should handle already registered error', async () => {
      const error = new RegistrationError(
        'Host already registered',
        ErrorCode.ALREADY_REGISTERED,
        { hostAddress: '0x123' }
      );

      const handled = handleRegistrationError(error);

      expect(handled.code).toBe(ErrorCode.ALREADY_REGISTERED);
      expect(handled.resolution).toContain('update');
    });

    it('should handle network errors', async () => {
      const error = new RegistrationError(
        'Network timeout',
        ErrorCode.NETWORK_ERROR,
        { attempt: 1, maxAttempts: 3 }
      );

      const handled = handleRegistrationError(error);

      expect(handled.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(handled.retryable).toBe(true);
      expect(handled.resolution).toContain('retry');
    });

    it('should handle transaction failures', async () => {
      const error = new RegistrationError(
        'Transaction reverted',
        ErrorCode.TRANSACTION_FAILED,
        { reason: 'Out of gas' }
      );

      const handled = handleRegistrationError(error);

      expect(handled.code).toBe(ErrorCode.TRANSACTION_FAILED);
      expect(handled.message).toContain('reverted');
      expect(handled.resolution).toBeDefined();
    });

    it('should handle approval errors', async () => {
      const error = new RegistrationError(
        'Token approval failed',
        ErrorCode.APPROVAL_FAILED,
        { tokenAddress: '0xabc' }
      );

      const handled = handleRegistrationError(error);

      expect(handled.code).toBe(ErrorCode.APPROVAL_FAILED);
      expect(handled.resolution).toContain('approval');
    });
  });

  describe('Error Recovery', () => {
    it('should attempt recovery for retryable errors', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const error = new RegistrationError(
        'Network error',
        ErrorCode.NETWORK_ERROR,
        { retryable: true }
      );

      const recovery = await recoverFromError(error, {
        maxRetries: 3,
        retryDelay: 100
      });

      expect(recovery).toBeDefined();
      expect(recovery.attempted).toBe(true);
    });

    it('should not retry non-retryable errors', async () => {
      const error = new RegistrationError(
        'Invalid configuration',
        ErrorCode.INVALID_CONFIG,
        { retryable: false }
      );

      const recovery = await recoverFromError(error);

      expect(recovery.attempted).toBe(false);
      expect(recovery.reason).toContain('not retryable');
    });

    it('should provide recovery suggestions', async () => {
      const errors = [
        { code: ErrorCode.INSUFFICIENT_BALANCE, suggestion: 'fab tokens' },
        { code: ErrorCode.INSUFFICIENT_GAS, suggestion: 'eth' },
        { code: ErrorCode.INVALID_API_URL, suggestion: 'valid url' },
        { code: ErrorCode.CONTRACT_NOT_FOUND, suggestion: 'check your network' }
      ];

      for (const { code, suggestion } of errors) {
        const error = new RegistrationError('Test error', code);
        const handled = handleRegistrationError(error);
        expect(handled.resolution.toLowerCase()).toContain(suggestion);
      }
    });
  });

  describe('Error Messages', () => {
    it('should provide user-friendly error messages', () => {
      const testCases = [
        {
          code: ErrorCode.INSUFFICIENT_BALANCE,
          expected: 'insufficient FAB token balance'
        },
        {
          code: ErrorCode.ALREADY_REGISTERED,
          expected: 'already registered as a host'
        },
        {
          code: ErrorCode.INVALID_MODELS,
          expected: 'Invalid model configuration'
        },
        {
          code: ErrorCode.STAKE_TOO_LOW,
          expected: 'below the minimum required'
        }
      ];

      for (const { code, expected } of testCases) {
        const message = getErrorMessage(code);
        expect(message.toLowerCase()).toContain(expected.toLowerCase());
      }
    });

    it('should include error details in message', () => {
      const error = new RegistrationError(
        'Custom error',
        ErrorCode.TRANSACTION_FAILED,
        {
          transactionHash: '0x123',
          reason: 'Reverted: insufficient allowance'
        }
      );

      const message = error.getDetailedMessage();

      expect(message).toContain('Custom error');
      expect(message).toContain('0x123');
      expect(message).toContain('insufficient allowance');
    });
  });

  describe('Transaction Error Handling', () => {
    it('should handle gas estimation errors', async () => {
      const error = new RegistrationError(
        'Gas estimation failed',
        ErrorCode.GAS_ESTIMATION_FAILED,
        { estimatedGas: 1000000, provided: 21000 }
      );

      const handled = handleRegistrationError(error);
      expect(handled.code).toBe(ErrorCode.GAS_ESTIMATION_FAILED);
      expect(handled.retryable).toBe(true);
    });

    it('should handle nonce errors', async () => {
      const error = new RegistrationError(
        'Nonce too low',
        ErrorCode.NONCE_ERROR,
        { expected: 10, got: 9 }
      );

      const handled = handleRegistrationError(error);

      expect(handled.code).toBe(ErrorCode.NONCE_ERROR);
      expect(handled.retryable).toBe(true);
      expect(handled.resolution).toContain('retry');
    });

    it('should handle contract revert errors', async () => {
      const error = new RegistrationError(
        'Contract execution reverted',
        ErrorCode.CONTRACT_REVERT,
        { reason: 'Host: Already registered' }
      );

      const handled = handleRegistrationError(error);

      expect(handled.code).toBe(ErrorCode.CONTRACT_REVERT);
      expect(handled.message).toContain('reverted');
      expect(handled.resolution).toBeDefined();
    });
  });

  describe('Validation Errors', () => {
    it('should handle invalid API URL errors', async () => {
      const error = new RegistrationError(
        'Invalid API URL',
        ErrorCode.INVALID_API_URL,
        { provided: 'not-a-url' }
      );

      const handled = handleRegistrationError(error);
      expect(handled.code).toBe(ErrorCode.INVALID_API_URL);
      expect(handled.resolution).toContain('valid URL');
    });

    it('should handle invalid model errors', async () => {
      const error = new RegistrationError(
        'Invalid model names',
        ErrorCode.INVALID_MODELS,
        { invalidModel: 'invalid!model@name' }
      );

      const handled = handleRegistrationError(error);
      expect(handled.code).toBe(ErrorCode.INVALID_MODELS);
      expect(handled.resolution).toContain('valid model names');
    });

    it('should handle metadata validation errors', async () => {
      const error = new RegistrationError(
        'Metadata validation failed',
        ErrorCode.INVALID_METADATA,
        { field: 'name', maxLength: 255 }
      );

      const handled = handleRegistrationError(error);
      expect(handled.code).toBe(ErrorCode.INVALID_METADATA);
    });
  });

  describe('Error Logging and Reporting', () => {
    it('should log errors with appropriate severity', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const error = new RegistrationError(
        'Critical error',
        ErrorCode.CONTRACT_NOT_FOUND,
        { severity: 'critical' }
      );

      handleRegistrationError(error);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should track error occurrences', () => {
      // Create and handle errors
      for (let i = 0; i < 3; i++) {
        const error = new RegistrationError(`Error ${i}`, ErrorCode.INSUFFICIENT_BALANCE);
        handleRegistrationError(error);
      }

      const stats = getErrorStatistics();
      expect(stats[ErrorCode.INSUFFICIENT_BALANCE]).toBeGreaterThanOrEqual(3);
    });

    it('should provide error summary', () => {
      const errors = [
        new RegistrationError('Error 1', ErrorCode.NETWORK_ERROR),
        new RegistrationError('Error 2', ErrorCode.NETWORK_ERROR),
        new RegistrationError('Error 3', ErrorCode.INSUFFICIENT_BALANCE),
        new RegistrationError('Error 4', ErrorCode.TRANSACTION_FAILED)
      ];

      const summary = getErrorSummary(errors);

      expect(summary.total).toBe(4);
      expect(summary.byCode[ErrorCode.NETWORK_ERROR]).toBe(2);
      expect(summary.byCode[ErrorCode.INSUFFICIENT_BALANCE]).toBe(1);
      expect(summary.retryable).toBe(3); // Network and transaction errors are retryable
    });
  });
});