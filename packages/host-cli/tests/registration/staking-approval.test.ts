// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Phase 1.3: Unit tests for approveTokens() SDK integration
 * These tests verify that approveTokens() uses PaymentManager.approveToken()
 * instead of direct contract calls
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RegistrationError, ErrorCode } from '../../src/registration/errors';
import * as sdkClient from '../../src/sdk/client';
import * as staking from '../../src/registration/staking';
import * as balanceChecker from '../../src/balance/checker';

const { approveTokens } = staking;

// Mock SDK client module
vi.mock('../../src/sdk/client', () => ({
  getSDK: vi.fn(),
  getAuthenticatedAddress: vi.fn(),
}));

// Mock balance checker
vi.mock('../../src/balance/checker', () => ({
  getFABBalance: vi.fn(),
}));

// Mock getStakingRequirements only (checkAllowance uses real implementation from Phase 1.2)
vi.mock('../../src/registration/staking', async () => {
  const actual = await vi.importActual('../../src/registration/staking');
  return {
    ...actual,
    getStakingRequirements: vi.fn(),
  };
});

describe('approveTokens() SDK Integration', () => {
  const mockPaymentManager = {
    approveToken: vi.fn(),
    checkAllowance: vi.fn(), // Required by checkAllowance() from Phase 1.2
  };

  const spenderAddress = '0x9876543210987654321098765432109876543210';
  const fabTokenAddress = '0x1234567890123456789012345678901234567890';
  const userAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

  const mockSDK = {
    isAuthenticated: vi.fn(),
    getPaymentManager: vi.fn(),
    getSigner: vi.fn(),
    getProvider: vi.fn(),
    config: {
      contractAddresses: {
        fabToken: fabTokenAddress,
        nodeRegistry: spenderAddress,
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (sdkClient.getSDK as any).mockReturnValue(mockSDK);
    (sdkClient.getAuthenticatedAddress as any).mockReturnValue(userAddress);
    (staking.getStakingRequirements as any).mockReturnValue({
      minimumStake: 1000000000000000000000n,
      contractAddress: spenderAddress,
    });
    mockSDK.isAuthenticated.mockReturnValue(true);
    mockSDK.getPaymentManager.mockReturnValue(mockPaymentManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Test 1: Verify PaymentManager.approveToken() is called with correct parameters
   */
  it('should call PaymentManager.approveToken() with correct params', async () => {
    const amount = 1000000000000000000000n; // 1000 FAB
    const mockReceipt = {
      hash: '0xabcdef1234567890', // ethers v6 uses 'hash' not 'transactionHash'
      blockNumber: 12345,
      confirmations: 1,
    };

    mockPaymentManager.checkAllowance.mockResolvedValue(0n); // No existing allowance
    (balanceChecker.getFABBalance as any).mockResolvedValue(amount * 2n); // Sufficient balance
    mockPaymentManager.approveToken.mockResolvedValue(mockReceipt);

    await approveTokens(amount);

    expect(mockPaymentManager.approveToken).toHaveBeenCalledWith(
      spenderAddress, // spender (staking contract)
      amount, // amount to approve
      fabTokenAddress // FAB token address
    );
  });

  /**
   * Test 2: Verify approveTokens() skips approval if allowance sufficient
   */
  it('should skip approval if allowance sufficient', async () => {
    const amount = 1000000000000000000000n; // 1000 FAB
    const existingAllowance = amount * 2n; // 2000 FAB already approved

    mockPaymentManager.checkAllowance.mockResolvedValue(existingAllowance);

    const result = await approveTokens(amount);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.message).toContain('already approved');
    expect(mockPaymentManager.approveToken).not.toHaveBeenCalled();
  });

  /**
   * Test 3: Verify approveTokens() checks balance before approving
   */
  it('should check balance before approving', async () => {
    const amount = 1000000000000000000000n; // 1000 FAB
    const balance = amount * 2n; // 2000 FAB
    const mockReceipt = {
      hash: '0xabcdef1234567890',
      blockNumber: 12345,
      confirmations: 1,
    };

    mockPaymentManager.checkAllowance.mockResolvedValue(0n);
    (balanceChecker.getFABBalance as any).mockResolvedValue(balance);
    mockPaymentManager.approveToken.mockResolvedValue(mockReceipt);

    await approveTokens(amount);

    expect(balanceChecker.getFABBalance).toHaveBeenCalled();
    expect(mockPaymentManager.approveToken).toHaveBeenCalled();
  });

  /**
   * Test 4: Verify approveTokens() returns receipt with confirmation data
   */
  it('should return receipt with confirmation data', async () => {
    const amount = 1000000000000000000000n; // 1000 FAB
    const mockReceipt = {
      hash: '0xabcdef1234567890',
      blockNumber: 12345,
      confirmations: 1,
    };

    mockPaymentManager.checkAllowance.mockResolvedValue(0n);
    (balanceChecker.getFABBalance as any).mockResolvedValue(amount * 2n);
    mockPaymentManager.approveToken.mockResolvedValue(mockReceipt);

    const result = await approveTokens(amount, { confirmations: 2 });

    expect(result.success).toBe(true);
    expect(result.transactionHash).toBe(mockReceipt.hash);
    expect(result.blockNumber).toBe(mockReceipt.blockNumber);
    expect(result.confirmations).toBeDefined();
  });

  /**
   * Test 5: Verify RegistrationError thrown on insufficient balance
   */
  it('should throw RegistrationError on insufficient balance', async () => {
    const amount = 1000000000000000000000n; // 1000 FAB
    const insufficientBalance = amount / 2n; // 500 FAB

    mockPaymentManager.checkAllowance.mockResolvedValue(0n);
    (balanceChecker.getFABBalance as any).mockResolvedValue(insufficientBalance);

    await expect(approveTokens(amount)).rejects.toThrow(RegistrationError);
    await expect(approveTokens(amount)).rejects.toThrow(/Insufficient FAB balance/);

    try {
      await approveTokens(amount);
    } catch (error: any) {
      expect(error).toBeInstanceOf(RegistrationError);
      expect(error.code).toBe(ErrorCode.INSUFFICIENT_BALANCE);
      expect(error.details.required).toBe(amount);
      expect(error.details.available).toBe(insufficientBalance);
    }

    expect(mockPaymentManager.approveToken).not.toHaveBeenCalled();
  });

  /**
   * Test 6: Verify RegistrationError thrown on SDK approval failure
   */
  it('should throw RegistrationError on SDK approval failure', async () => {
    const amount = 1000000000000000000000n; // 1000 FAB
    const sdkError = new Error('Transaction reverted');

    mockPaymentManager.checkAllowance.mockResolvedValue(0n);
    (balanceChecker.getFABBalance as any).mockResolvedValue(amount * 2n);
    mockPaymentManager.approveToken.mockRejectedValue(sdkError);

    await expect(approveTokens(amount)).rejects.toThrow(RegistrationError);
    await expect(approveTokens(amount)).rejects.toThrow(/Token approval failed/);

    try {
      await approveTokens(amount);
    } catch (error: any) {
      expect(error).toBeInstanceOf(RegistrationError);
      expect(error.code).toBe(ErrorCode.APPROVAL_FAILED);
      expect(error.details.originalError).toBe(sdkError);
    }
  });
});
