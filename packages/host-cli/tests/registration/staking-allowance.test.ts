// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Phase 1.1: Unit tests for checkAllowance() SDK integration
 * These tests verify that checkAllowance() uses PaymentManager.checkAllowance()
 * instead of direct contract calls
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RegistrationError, ErrorCode } from '../../src/registration/errors';
import * as sdkClient from '../../src/sdk/client';
import * as staking from '../../src/registration/staking';

const { checkAllowance } = staking;

// Mock SDK client module
vi.mock('../../src/sdk/client', () => ({
  getSDK: vi.fn(),
  getAuthenticatedAddress: vi.fn(),
}));

describe('checkAllowance() SDK Integration', () => {
  const mockPaymentManager = {
    checkAllowance: vi.fn(),
  };

  const spenderAddress = '0x9876543210987654321098765432109876543210';

  const mockSDK = {
    isAuthenticated: vi.fn(),
    getPaymentManager: vi.fn(),
    getProvider: vi.fn(),
    config: {
      contractAddresses: {
        fabToken: '0x1234567890123456789012345678901234567890',
        nodeRegistry: spenderAddress, // Used by getStakingRequirements()
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (sdkClient.getSDK as any).mockReturnValue(mockSDK);
    (sdkClient.getAuthenticatedAddress as any).mockReturnValue(
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    );
    mockSDK.isAuthenticated.mockReturnValue(true);
    mockSDK.getPaymentManager.mockReturnValue(mockPaymentManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Test 1: Verify PaymentManager.checkAllowance() is called with correct parameters
   */
  it('should call PaymentManager.checkAllowance() with correct params', async () => {
    const expectedAllowance = 1000000000000000000000n; // 1000 FAB
    mockPaymentManager.checkAllowance.mockResolvedValue(expectedAllowance);

    await checkAllowance();

    expect(mockPaymentManager.checkAllowance).toHaveBeenCalledWith(
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', // owner (authenticated address)
      spenderAddress, // spender (staking contract)
      '0x1234567890123456789012345678901234567890' // fabToken address
    );
  });

  /**
   * Test 2: Verify checkAllowance() returns bigint allowance value
   */
  it('should return bigint allowance value', async () => {
    const expectedAllowance = 5000000000000000000000n; // 5000 FAB
    mockPaymentManager.checkAllowance.mockResolvedValue(expectedAllowance);

    const result = await checkAllowance();

    expect(typeof result).toBe('bigint');
    expect(result).toBe(expectedAllowance);
  });

  /**
   * Test 3: Verify RegistrationError is thrown on SDK failure
   */
  it('should throw RegistrationError on SDK failure', async () => {
    const sdkError = new Error('Insufficient allowance data');
    mockPaymentManager.checkAllowance.mockRejectedValue(sdkError);

    await expect(checkAllowance()).rejects.toThrow(RegistrationError);
    await expect(checkAllowance()).rejects.toThrow(
      /Failed to check allowance/
    );

    try {
      await checkAllowance();
    } catch (error: any) {
      expect(error).toBeInstanceOf(RegistrationError);
      expect(error.code).toBe(ErrorCode.ALLOWANCE_CHECK_FAILED);
      expect(error.details.originalError).toBe(sdkError);
    }
  });

  /**
   * Test 4: Verify authenticated SDK is required
   */
  it('should require authenticated SDK', async () => {
    mockSDK.isAuthenticated.mockReturnValue(false);

    await expect(checkAllowance()).rejects.toThrow('SDK not authenticated');
  });

  /**
   * Test 5: Verify FAB token address from SDK config is used
   */
  it('should use FAB token address from SDK config', async () => {
    const customFabToken = '0xfabfabfabfabfabfabfabfabfabfabfabfabfab';
    mockSDK.config.contractAddresses.fabToken = customFabToken;
    mockPaymentManager.checkAllowance.mockResolvedValue(0n);

    await checkAllowance();

    const callArgs = mockPaymentManager.checkAllowance.mock.calls[0];
    expect(callArgs[2]).toBe(customFabToken); // tokenAddress parameter
  });
});
