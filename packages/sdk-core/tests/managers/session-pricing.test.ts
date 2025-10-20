// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * @file Session Manager Pricing Tests
 * @description Tests for session price validation against host minimums (Sub-phase 2.4)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { PaymentManager } from '../../src/managers/PaymentManager';
import { StorageManager } from '../../src/managers/StorageManager';
import { HostManager } from '../../src/managers/HostManager';
import { PricingValidationError } from '../../src/errors/pricing-errors';
import dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: '.env.test' });

// Mock ChainRegistry to avoid environment variable requirements
vi.mock('../../src/config/ChainRegistry', () => ({
  ChainRegistry: {
    isChainSupported: vi.fn().mockReturnValue(true),
    getSupportedChains: vi.fn().mockReturnValue([84532])
  }
}));

describe('SessionManager Price Validation', () => {
  let sessionManager: SessionManager;
  let mockPaymentManager: any;
  let mockStorageManager: any;
  let mockHostManager: any;

  const mockHostAddress = '0x' + '1'.repeat(40);
  const mockHostMinPrice = 1500n; // Host's minimum price per token

  beforeEach(() => {
    // Mock PaymentManager
    mockPaymentManager = {
      isInitialized: vi.fn().mockReturnValue(true),
      createSessionJob: vi.fn().mockResolvedValue(123), // Returns job ID
      signer: {
        getAddress: vi.fn().mockResolvedValue('0x' + '2'.repeat(40))
      }
    };

    // Mock StorageManager
    mockStorageManager = {
      isInitialized: vi.fn().mockReturnValue(true),
      storeConversation: vi.fn().mockResolvedValue(undefined),
      appendMessage: vi.fn().mockResolvedValue(undefined)
    };

    // Mock HostManager with price info
    mockHostManager = {
      getHostInfo: vi.fn().mockResolvedValue({
        address: mockHostAddress,
        apiUrl: 'http://localhost:8080',
        isActive: true,
        supportedModels: ['model1'],
        stake: 1000n * (10n ** 18n),
        minPricePerToken: mockHostMinPrice // Host requires minimum 1500
      })
    };

    // Create SessionManager without HostManager initially
    sessionManager = new SessionManager(
      mockPaymentManager as any,
      mockStorageManager as any
    );
  });

  describe('Price validation with HostManager', () => {
    beforeEach(async () => {
      // Set HostManager for price validation
      (sessionManager as any).setHostManager(mockHostManager);

      // Initialize SessionManager
      await sessionManager.initialize();
    });

    it('should accept price >= host minimum', async () => {
      const config = {
        chainId: 84532,
        host: mockHostAddress,
        modelId: 'model1',
        depositAmount: '100',
        pricePerToken: 2000, // Above host minimum (1500)
        proofInterval: 100,
        duration: 3600
      };

      const result = await sessionManager.startSession(config);

      expect(result.sessionId).toBeDefined();
      expect(result.jobId).toBeDefined();
      expect(mockPaymentManager.createSessionJob).toHaveBeenCalledWith(
        expect.objectContaining({
          pricePerToken: 2000 // Should use client-specified price
        })
      );
    });

    it('should throw PricingValidationError when price < host minimum', async () => {
      const config = {
        chainId: 84532,
        host: mockHostAddress,
        modelId: 'model1',
        depositAmount: '100',
        pricePerToken: 1000, // Below host minimum (1500)
        proofInterval: 100,
        duration: 3600
      };

      await expect(sessionManager.startSession(config))
        .rejects
        .toThrow(PricingValidationError);

      await expect(sessionManager.startSession(config))
        .rejects
        .toThrow(/Price 1000 is below host minimum 1500/);

      // Should not create session
      expect(mockPaymentManager.createSessionJob).not.toHaveBeenCalled();
    });

    it('should default to host minimum when pricePerToken not provided', async () => {
      const config = {
        chainId: 84532,
        host: mockHostAddress,
        modelId: 'model1',
        depositAmount: '100',
        // pricePerToken omitted - should default to host minimum
        proofInterval: 100,
        duration: 3600
      };

      const result = await sessionManager.startSession(config);

      expect(result.sessionId).toBeDefined();
      expect(mockPaymentManager.createSessionJob).toHaveBeenCalledWith(
        expect.objectContaining({
          pricePerToken: 1500 // Should use host minimum
        })
      );
    });

    it('should handle host lookup failures gracefully', async () => {
      // Mock getHostInfo to fail
      mockHostManager.getHostInfo.mockRejectedValue(new Error('Host not found'));

      const config = {
        chainId: 84532,
        host: 'invalid-host-address',
        modelId: 'model1',
        depositAmount: '100',
        pricePerToken: 2000,
        proofInterval: 100,
        duration: 3600
      };

      // Should not throw - just log warning and proceed
      const result = await sessionManager.startSession(config);

      expect(result.sessionId).toBeDefined();
      // Should still create session with provided price
      expect(mockPaymentManager.createSessionJob).toHaveBeenCalledWith(
        expect.objectContaining({
          pricePerToken: 2000
        })
      );
    });
  });

  describe('Backward compatibility without HostManager', () => {
    it('should skip validation when hostManager not set', async () => {
      // Don't set HostManager - should skip validation
      await sessionManager.initialize();

      const config = {
        chainId: 84532,
        host: mockHostAddress,
        modelId: 'model1',
        depositAmount: '100',
        pricePerToken: 500, // Would be rejected if validation was active
        proofInterval: 100,
        duration: 3600
      };

      const result = await sessionManager.startSession(config);

      // Should succeed even with low price
      expect(result.sessionId).toBeDefined();
      expect(mockPaymentManager.createSessionJob).toHaveBeenCalledWith(
        expect.objectContaining({
          pricePerToken: 500
        })
      );
    });
  });
});
