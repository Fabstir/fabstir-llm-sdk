// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for ProofSigner deprecation
 *
 * February 2026 Contract Update: Signatures no longer required for proof submission.
 * signProofForSubmission() is deprecated but kept for backward compatibility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';
import { signProofForSubmission } from '../../src/utils/ProofSigner';

describe('ProofSigner Deprecation (Feb 2026)', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('should log deprecation warning when signProofForSubmission is called', async () => {
    const proofData = '0x1234567890abcdef';
    const hostAddress = '0x1234567890123456789012345678901234567890';
    const tokensClaimed = BigInt(100);
    const hostWallet = ethers.Wallet.createRandom();

    await signProofForSubmission(proofData, hostAddress, tokensClaimed, hostWallet);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEPRECATED]')
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('signProofForSubmission')
    );
  });

  it('should return proofHash with empty signature (0x)', async () => {
    const proofData = '0x1234567890abcdef';
    const hostAddress = '0x1234567890123456789012345678901234567890';
    const tokensClaimed = BigInt(100);
    const hostWallet = ethers.Wallet.createRandom();

    const result = await signProofForSubmission(proofData, hostAddress, tokensClaimed, hostWallet);

    // Should still return a valid proofHash
    expect(result.proofHash).toBeDefined();
    expect(result.proofHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

    // Signature should be empty (0x) since it's no longer needed
    expect(result.signature).toBe('0x');
  });

  it('should still generate correct proofHash from proof data', async () => {
    const proofData = '0xdeadbeef';
    const hostAddress = '0x1234567890123456789012345678901234567890';
    const tokensClaimed = BigInt(50);
    const hostWallet = ethers.Wallet.createRandom();

    const result = await signProofForSubmission(proofData, hostAddress, tokensClaimed, hostWallet);

    // proofHash should be keccak256 of the proof data
    const expectedHash = ethers.keccak256(proofData);
    expect(result.proofHash).toBe(expectedHash);
  });
});
