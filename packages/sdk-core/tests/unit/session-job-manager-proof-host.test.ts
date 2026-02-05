// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for SessionJobManager.submitCheckpointProofAsHost()
 *
 * February 2026 Contract Update: Signature removed from proof submission.
 * Method now takes 6 params: sessionId, tokensClaimed, proofHash, proofCID, hostSigner, deltaCID
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { SessionJobManager } from '../../src/contracts/SessionJobManager';

// Mock Contract
const mockSubmitProofOfWork = vi.fn().mockResolvedValue({
  wait: vi.fn().mockResolvedValue({ hash: '0xhosttxhash' })
});

// Mock ethers.Contract constructor
vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ethers')>();
  return {
    ...actual,
    Contract: vi.fn().mockImplementation(() => ({
      submitProofOfWork: mockSubmitProofOfWork
    }))
  };
});

const mockJobMarketplace = {
  target: '0xMockJobMarketplace',
  interface: { format: vi.fn() }
};

const mockContractManager = {
  getJobMarketplace: vi.fn().mockReturnValue(mockJobMarketplace),
  getContractAddress: vi.fn().mockReturnValue('0xMockJobMarketplace'),
  setSigner: vi.fn().mockResolvedValue(undefined)
};

describe('SessionJobManager.submitCheckpointProofAsHost() (Feb 2026)', () => {
  let sessionJobManager: SessionJobManager;
  let mockHostSigner: any;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionJobManager = new SessionJobManager(mockContractManager as any);
    mockHostSigner = {
      getAddress: vi.fn().mockResolvedValue('0xHostSignerAddress')
    };
  });

  it('should accept 6 params (no signature param)', async () => {
    // Call with 6 params - no signature
    await sessionJobManager.submitCheckpointProofAsHost(
      BigInt(123),          // sessionId
      100,                  // tokensClaimed
      '0xproofhash',        // proofHash
      'cid123',             // proofCID
      mockHostSigner,       // hostSigner
      'deltacid456'         // deltaCID
    );

    // Verify contract was called
    expect(mockSubmitProofOfWork).toHaveBeenCalled();
  });

  it('should call contract with correct params (no signature)', async () => {
    const sessionId = BigInt(999);
    const tokensClaimed = 500;
    const proofHash = '0xabcdef1234567890';
    const proofCID = 'bafybeicid';
    const deltaCID = 'bafybeedelta';

    await sessionJobManager.submitCheckpointProofAsHost(
      sessionId,
      tokensClaimed,
      proofHash,
      proofCID,
      mockHostSigner,
      deltaCID
    );

    // Verify contract was called with exactly 5 params (no signature)
    expect(mockSubmitProofOfWork).toHaveBeenCalledWith(
      sessionId,        // jobId
      tokensClaimed,    // tokensClaimed
      proofHash,        // proofHash (bytes32)
      proofCID,         // proofCID (string)
      deltaCID          // deltaCID (string)
    );
  });

  it('should use empty string as default for deltaCID', async () => {
    // Call with 5 params - deltaCID omitted
    await sessionJobManager.submitCheckpointProofAsHost(
      BigInt(123),
      100,
      '0xproofhash',
      'cid123',
      mockHostSigner
      // deltaCID omitted - should default to ''
    );

    expect(mockSubmitProofOfWork).toHaveBeenCalledWith(
      BigInt(123),
      100,
      '0xproofhash',
      'cid123',
      ''  // Empty string default
    );
  });

  it('should return transaction hash', async () => {
    const txHash = await sessionJobManager.submitCheckpointProofAsHost(
      BigInt(1),
      10,
      '0x123',
      'cid',
      mockHostSigner
    );

    expect(txHash).toBe('0xhosttxhash');
  });
});
