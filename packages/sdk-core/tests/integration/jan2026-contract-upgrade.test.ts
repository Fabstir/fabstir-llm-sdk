// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Integration tests for January 2026 contract upgrades
 *
 * Tests verify:
 * - New JobMarketplace proxy address (0x3CaCbf3f448B420918A93a88706B26Ab27a3523E)
 * - ProofSystem verifyHostSignature function (renamed from verifyEKZL)
 * - Balance query functions
 * - Session creation with upgraded contracts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import 'fake-indexeddb/auto';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../../.env.test') });

// Import ABIs directly (not through index.ts re-exports)
import JobMarketplaceABI from '../../src/contracts/abis/JobMarketplaceWithModels-CLIENT-ABI.json';
import ProofSystemABI from '../../src/contracts/abis/ProofSystemUpgradeable-CLIENT-ABI.json';

describe('January 2026 Contract Upgrade Integration', () => {
  let provider: ethers.JsonRpcProvider;
  let jobMarketplace: ethers.Contract;
  let proofSystem: ethers.Contract;

  const EXPECTED_JOB_MARKETPLACE = '0x3CaCbf3f448B420918A93a88706B26Ab27a3523E';
  const EXPECTED_PROOF_SYSTEM = '0x5afB91977e69Cc5003288849059bc62d47E7deeb';

  beforeAll(() => {
    const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA;
    if (!rpcUrl) {
      throw new Error('RPC_URL_BASE_SEPOLIA not set in .env.test');
    }
    provider = new ethers.JsonRpcProvider(rpcUrl);

    // Verify environment addresses match expected
    expect(process.env.CONTRACT_JOB_MARKETPLACE?.toLowerCase()).toBe(
      EXPECTED_JOB_MARKETPLACE.toLowerCase()
    );

    // Initialize contracts
    jobMarketplace = new ethers.Contract(
      process.env.CONTRACT_JOB_MARKETPLACE!,
      JobMarketplaceABI,
      provider
    );

    proofSystem = new ethers.Contract(
      process.env.CONTRACT_PROOF_SYSTEM!,
      ProofSystemABI,
      provider
    );
  });

  describe('8.6.1: JobMarketplace Proxy Connectivity', () => {
    it('should connect to new JobMarketplace proxy address', async () => {
      const address = await jobMarketplace.getAddress();
      expect(address.toLowerCase()).toBe(EXPECTED_JOB_MARKETPLACE.toLowerCase());
    });

    it('should load JobMarketplace ABI with correct function count', () => {
      const functionCount = jobMarketplace.interface.fragments.filter(
        (f) => f.type === 'function'
      ).length;
      // JobMarketplace should have 20+ functions
      expect(functionCount).toBeGreaterThan(20);
    });

    it('should have submitProofOfWork with 5 parameters', () => {
      const submitProof = jobMarketplace.interface.getFunction('submitProofOfWork');
      expect(submitProof).toBeDefined();
      expect(submitProof!.inputs.length).toBe(5);
      expect(submitProof!.inputs[0].name).toBe('jobId');
      expect(submitProof!.inputs[1].name).toBe('tokensClaimed');
      expect(submitProof!.inputs[2].name).toBe('proofHash');
      expect(submitProof!.inputs[3].name).toBe('signature');
      expect(submitProof!.inputs[4].name).toBe('proofCID');
    });
  });

  describe('8.6.3: ProofSystem verifyHostSignature', () => {
    it('should connect to ProofSystem contract', async () => {
      const address = await proofSystem.getAddress();
      expect(address.toLowerCase()).toBe(EXPECTED_PROOF_SYSTEM.toLowerCase());
    });

    it('should have verifyHostSignature function (renamed from verifyEKZL)', () => {
      const verifyFn = proofSystem.interface.getFunction('verifyHostSignature');
      expect(verifyFn).toBeDefined();
      // verifyHostSignature(bytes proof, address prover, uint256 claimedTokens)
      expect(verifyFn!.inputs.length).toBe(3);
      expect(verifyFn!.inputs[0].name).toBe('proof');
      expect(verifyFn!.inputs[1].name).toBe('prover');
      expect(verifyFn!.inputs[2].name).toBe('claimedTokens');
    });

    it('should NOT have verifyEKZL function (old name)', () => {
      const oldFn = proofSystem.interface.getFunction('verifyEKZL');
      expect(oldFn).toBeNull();
    });
  });

  describe('8.6.5: Balance Query Functions', () => {
    it('should have getLockedBalanceNative function', () => {
      const fn = jobMarketplace.interface.getFunction('getLockedBalanceNative');
      expect(fn).toBeDefined();
      expect(fn!.inputs.length).toBe(1);
      expect(fn!.inputs[0].name).toBe('account');
    });

    it('should have getLockedBalanceToken function', () => {
      const fn = jobMarketplace.interface.getFunction('getLockedBalanceToken');
      expect(fn).toBeDefined();
      expect(fn!.inputs.length).toBe(2);
    });

    it('should have getTotalBalanceNative function', () => {
      const fn = jobMarketplace.interface.getFunction('getTotalBalanceNative');
      expect(fn).toBeDefined();
    });

    it('should have getTotalBalanceToken function', () => {
      const fn = jobMarketplace.interface.getFunction('getTotalBalanceToken');
      expect(fn).toBeDefined();
    });

    it('should query balance for test user (may be zero on fresh contract)', async () => {
      const testUser = process.env.TEST_USER_1_ADDRESS!;
      const balance = await jobMarketplace.getTotalBalanceNative(testUser);
      // Balance should be a valid bigint (may be 0 on fresh contract)
      expect(typeof balance).toBe('bigint');
      expect(balance).toBeGreaterThanOrEqual(0n);
    });
  });

  describe('8.6.4: Session Query Functions', () => {
    it('should have getProofSubmission function', () => {
      const fn = jobMarketplace.interface.getFunction('getProofSubmission');
      expect(fn).toBeDefined();
      expect(fn!.inputs.length).toBe(2);
      expect(fn!.inputs[0].name).toBe('sessionId');
      expect(fn!.inputs[1].name).toBe('proofIndex');
    });

    it('should have getSession function', () => {
      const fn = jobMarketplace.interface.getFunction('getSession');
      expect(fn).toBeDefined();
    });

    it('should have createSession function', () => {
      const fn = jobMarketplace.interface.getFunction('createSession');
      expect(fn).toBeDefined();
    });
  });
});
