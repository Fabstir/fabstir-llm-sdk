// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for SessionJobManager.getMinTokensFee()
 *
 * February 2026 Contract Update: Early cancellation fee query
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionJobManager } from '../../src/contracts/SessionJobManager';

// Mock contract - returns fee value
const mockMinTokensFee = vi.fn().mockResolvedValue(BigInt(100));

const mockJobMarketplace = {
  minTokensFee: mockMinTokensFee,
  target: '0xMockJobMarketplace',
  interface: { format: vi.fn() }
};

const mockContractManager = {
  getJobMarketplace: vi.fn().mockReturnValue(mockJobMarketplace),
  getContractAddress: vi.fn().mockReturnValue('0xMockJobMarketplace'),
  setSigner: vi.fn().mockResolvedValue(undefined)
};

describe('SessionJobManager.getMinTokensFee() (Feb 2026)', () => {
  let sessionJobManager: SessionJobManager;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionJobManager = new SessionJobManager(mockContractManager as any);
  });

  it('should return bigint value', async () => {
    const fee = await sessionJobManager.getMinTokensFee();

    expect(typeof fee).toBe('bigint');
    expect(fee).toBe(BigInt(100));
  });

  it('should call contract method', async () => {
    await sessionJobManager.getMinTokensFee();

    expect(mockMinTokensFee).toHaveBeenCalled();
  });

  it('should not require signer (view function)', async () => {
    // No signer set - should still work for view function
    const fee = await sessionJobManager.getMinTokensFee();

    expect(fee).toBe(BigInt(100));
  });

  it('should handle zero fee', async () => {
    mockMinTokensFee.mockResolvedValueOnce(BigInt(0));

    const fee = await sessionJobManager.getMinTokensFee();

    expect(fee).toBe(BigInt(0));
  });
});
