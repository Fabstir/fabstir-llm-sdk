// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Contract Address Configuration Tests - January 2026 Updates
 *
 * Verifies that the SDK loads the correct contract addresses from environment.
 * The JobMarketplace proxy was updated to a new clean-slate deployment.
 *
 * New address: 0x3CaCbf3f448B420918A93a88706B26Ab27a3523E
 * Old address: 0xeebEEbc9BCD35e81B06885b63f980FeC71d56e2D
 */

import { describe, test, expect } from 'vitest';

// Expected contract addresses from .env.test (January 2026)
const EXPECTED_ADDRESSES = {
  // NEW JobMarketplace proxy (clean-slate deployment Jan 2026)
  jobMarketplace: '0x3CaCbf3f448B420918A93a88706B26Ab27a3523E',
  // Unchanged addresses
  nodeRegistry: '0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22',
  modelRegistry: '0x1a9d91521c85bD252Ac848806Ff5096bBb9ACDb2',
  proofSystem: '0x5afB91977e69Cc5003288849059bc62d47E7deeb',
  hostEarnings: '0xE4F33e9e132E60fc3477509f99b9E1340b91Aee0',
  fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
  usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
} as const;

// Old JobMarketplace address (should NOT be used)
const OLD_JOB_MARKETPLACE = '0xeebEEbc9BCD35e81B06885b63f980FeC71d56e2D';

describe('Contract Address Configuration - January 2026 Updates', () => {
  describe('Environment Variables', () => {
    test('CONTRACT_JOB_MARKETPLACE should be the NEW address', () => {
      const address = process.env.CONTRACT_JOB_MARKETPLACE;
      expect(address).toBeDefined();
      expect(address?.toLowerCase()).toBe(
        EXPECTED_ADDRESSES.jobMarketplace.toLowerCase()
      );
    });

    test('CONTRACT_JOB_MARKETPLACE should NOT be the old address', () => {
      const address = process.env.CONTRACT_JOB_MARKETPLACE;
      expect(address?.toLowerCase()).not.toBe(OLD_JOB_MARKETPLACE.toLowerCase());
    });

    test('CONTRACT_NODE_REGISTRY should be correct', () => {
      const address = process.env.CONTRACT_NODE_REGISTRY;
      expect(address).toBeDefined();
      expect(address?.toLowerCase()).toBe(
        EXPECTED_ADDRESSES.nodeRegistry.toLowerCase()
      );
    });

    test('CONTRACT_PROOF_SYSTEM should be correct', () => {
      const address = process.env.CONTRACT_PROOF_SYSTEM;
      expect(address).toBeDefined();
      expect(address?.toLowerCase()).toBe(
        EXPECTED_ADDRESSES.proofSystem.toLowerCase()
      );
    });

    test('CONTRACT_HOST_EARNINGS should be correct', () => {
      const address = process.env.CONTRACT_HOST_EARNINGS;
      expect(address).toBeDefined();
      expect(address?.toLowerCase()).toBe(
        EXPECTED_ADDRESSES.hostEarnings.toLowerCase()
      );
    });

    test('CONTRACT_MODEL_REGISTRY should be correct', () => {
      const address = process.env.CONTRACT_MODEL_REGISTRY;
      expect(address).toBeDefined();
      expect(address?.toLowerCase()).toBe(
        EXPECTED_ADDRESSES.modelRegistry.toLowerCase()
      );
    });
  });
});
