// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for SessionJobManager.getProofSubmission()
 *
 * February 2026 Contract Update: getProofSubmission now returns 5 values.
 * Returns: proofHash, tokensClaimed, timestamp, verified, deltaCID
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionJobManager } from '../../src/contracts/SessionJobManager';

// Mock contract response with 5 values
const mockGetProofSubmission = vi.fn().mockResolvedValue([
  '0xproofhash123',           // proofHash
  BigInt(500),                // tokensClaimed
  BigInt(1707177600),         // timestamp
  true,                       // verified
  'bafybeedelta789'           // deltaCID (5th value)
]);

const mockJobMarketplace = {
  getProofSubmission: mockGetProofSubmission,
  target: '0xMockJobMarketplace',
  interface: { format: vi.fn() }
};

const mockContractManager = {
  getJobMarketplace: vi.fn().mockReturnValue(mockJobMarketplace),
  getContractAddress: vi.fn().mockReturnValue('0xMockJobMarketplace'),
  setSigner: vi.fn().mockResolvedValue(undefined)
};

describe('SessionJobManager.getProofSubmission() (Feb 2026)', () => {
  let sessionJobManager: SessionJobManager;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionJobManager = new SessionJobManager(mockContractManager as any);
  });

  it('should return object with deltaCID field', async () => {
    const result = await sessionJobManager.getProofSubmission(BigInt(123), 0);

    expect(result).toHaveProperty('deltaCID');
    expect(result.deltaCID).toBe('bafybeedelta789');
  });

  it('should return deltaCID as string type', async () => {
    const result = await sessionJobManager.getProofSubmission(BigInt(456), 1);

    expect(typeof result.deltaCID).toBe('string');
  });

  it('should return all 5 fields correctly', async () => {
    const result = await sessionJobManager.getProofSubmission(BigInt(999), 2);

    expect(result).toEqual({
      proofHash: '0xproofhash123',
      tokensClaimed: BigInt(500),
      timestamp: BigInt(1707177600),
      verified: true,
      deltaCID: 'bafybeedelta789'
    });
  });

  it('should call contract with correct params', async () => {
    const sessionId = BigInt(777);
    const proofIndex = 3;

    await sessionJobManager.getProofSubmission(sessionId, proofIndex);

    expect(mockGetProofSubmission).toHaveBeenCalledWith(sessionId, proofIndex);
  });

  it('should handle empty deltaCID', async () => {
    // Override mock for this test - empty deltaCID
    mockGetProofSubmission.mockResolvedValueOnce([
      '0xhash',
      BigInt(100),
      BigInt(1000),
      false,
      ''  // Empty deltaCID
    ]);

    const result = await sessionJobManager.getProofSubmission(BigInt(1), 0);

    expect(result.deltaCID).toBe('');
  });
});
