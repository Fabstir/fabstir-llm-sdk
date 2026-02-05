// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for SessionJobManager.isDelegateAuthorized()
 *
 * February 2026 Contract Update: V2 Direct Payment Delegation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionJobManager } from '../../src/contracts/SessionJobManager';

// Mock contract - no signer needed for view function
const mockIsDelegateAuthorized = vi.fn();

const mockJobMarketplace = {
  isDelegateAuthorized: mockIsDelegateAuthorized,
  target: '0xMockJobMarketplace',
  interface: { format: vi.fn() }
};

const mockContractManager = {
  getJobMarketplace: vi.fn().mockReturnValue(mockJobMarketplace),
  getContractAddress: vi.fn().mockReturnValue('0xMockJobMarketplace'),
  setSigner: vi.fn().mockResolvedValue(undefined)
};

describe('SessionJobManager.isDelegateAuthorized() (Feb 2026)', () => {
  let sessionJobManager: SessionJobManager;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionJobManager = new SessionJobManager(mockContractManager as any);
  });

  it('should call contract with correct params', async () => {
    mockIsDelegateAuthorized.mockResolvedValue(true);

    const payer = '0xPayerAddress';
    const delegate = '0xDelegateAddress';

    await sessionJobManager.isDelegateAuthorized(payer, delegate);

    expect(mockIsDelegateAuthorized).toHaveBeenCalledWith(payer, delegate);
  });

  it('should return true when delegate is authorized', async () => {
    mockIsDelegateAuthorized.mockResolvedValue(true);

    const result = await sessionJobManager.isDelegateAuthorized(
      '0xPayer',
      '0xDelegate'
    );

    expect(result).toBe(true);
  });

  it('should return false when delegate is not authorized', async () => {
    mockIsDelegateAuthorized.mockResolvedValue(false);

    const result = await sessionJobManager.isDelegateAuthorized(
      '0xPayer',
      '0xDelegate'
    );

    expect(result).toBe(false);
  });

  it('should not require signer (view function)', async () => {
    mockIsDelegateAuthorized.mockResolvedValue(true);

    // No signer set - should still work for view function
    const result = await sessionJobManager.isDelegateAuthorized(
      '0xPayer',
      '0xDelegate'
    );

    expect(result).toBe(true);
  });
});
