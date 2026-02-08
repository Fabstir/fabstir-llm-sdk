// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for SessionJobManager.submitCheckpointProof()
 *
 * February 2026 Contract Update: Signature removed from proof submission.
 * Method now takes 5 params: sessionId, tokensClaimed, proofHash, proofCID, deltaCID
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { SessionJobManager } from '../../src/contracts/SessionJobManager';

// Mock ContractManager
const mockJobMarketplace = {
  connect: vi.fn().mockReturnThis(),
  submitProofOfWork: vi.fn().mockResolvedValue({
    wait: vi.fn().mockResolvedValue({ hash: '0xmocktxhash' })
  }),
  target: '0xMockJobMarketplace',
  interface: {}
};

const mockContractManager = {
  getJobMarketplace: vi.fn().mockReturnValue(mockJobMarketplace),
  getContractAddress: vi.fn().mockReturnValue('0xMockJobMarketplace'),
  setSigner: vi.fn().mockResolvedValue(undefined)
};

describe('SessionJobManager.submitCheckpointProof() (Feb 2026)', () => {
  let sessionJobManager: SessionJobManager;
  let mockSigner: any;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionJobManager = new SessionJobManager(mockContractManager as any);
    mockSigner = {
      getAddress: vi.fn().mockResolvedValue('0xMockSignerAddress')
    };
  });

  it('should accept 5 params (no signature param)', async () => {
    await sessionJobManager.setSigner(mockSigner);

    // Call with 5 params - no signature
    await sessionJobManager.submitCheckpointProof(
      BigInt(123),          // sessionId
      100,                  // tokensClaimed
      '0xproofhash',        // proofHash
      'cid123',             // proofCID
      'deltacid456'         // deltaCID
    );

    // Verify contract was called
    expect(mockJobMarketplace.connect).toHaveBeenCalledWith(mockSigner);
    expect(mockJobMarketplace.submitProofOfWork).toHaveBeenCalled();
  });

  it('should call contract with correct 5 params', async () => {
    await sessionJobManager.setSigner(mockSigner);

    const sessionId = BigInt(999);
    const tokensClaimed = 500;
    const proofHash = '0xabcdef1234567890';
    const proofCID = 'bafybeicid';
    const deltaCID = 'bafybeedelta';

    await sessionJobManager.submitCheckpointProof(
      sessionId,
      tokensClaimed,
      proofHash,
      proofCID,
      deltaCID
    );

    // Verify contract was called with exactly 5 params (no signature)
    expect(mockJobMarketplace.submitProofOfWork).toHaveBeenCalledWith(
      sessionId,        // jobId
      tokensClaimed,    // tokensClaimed
      proofHash,        // proofHash (bytes32)
      proofCID,         // proofCID (string)
      deltaCID          // deltaCID (string)
    );
  });

  it('should use empty string as default for deltaCID', async () => {
    await sessionJobManager.setSigner(mockSigner);

    // Call with only 4 params - deltaCID should default to ''
    await sessionJobManager.submitCheckpointProof(
      BigInt(123),
      100,
      '0xproofhash',
      'cid123'
      // deltaCID omitted - should default to ''
    );

    expect(mockJobMarketplace.submitProofOfWork).toHaveBeenCalledWith(
      BigInt(123),
      100,
      '0xproofhash',
      'cid123',
      ''  // Empty string default
    );
  });

  it('should return transaction hash', async () => {
    await sessionJobManager.setSigner(mockSigner);

    const txHash = await sessionJobManager.submitCheckpointProof(
      BigInt(1),
      10,
      '0x123',
      'cid'
    );

    expect(txHash).toBe('0xmocktxhash');
  });
});
