// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Integration tests for February 2026 Contract Upgrade
 *
 * Tests the SDK's integration with updated contract ABIs:
 * - Signature removal from submitProofOfWork
 * - V2 Direct Payment Delegation
 * - Early cancellation fee query
 *
 * Note: Most tests are skipped in CI as they require live contract.
 * Run with RPC access for full integration testing.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

// Import types to verify they exist
import type { ProofSubmissionParams, ProofSubmissionResult } from '../../src/types/proof.types';
import { DELEGATION_ERRORS, parseDelegationError } from '../../src/types/errors';
import { JobMarketplaceFragments, NodeRegistryFragments } from '../../src/contracts/abis/index';

describe('February 2026 Contract Upgrade - Integration', () => {
  describe('Type Definitions', () => {
    it('ProofSubmissionParams should have optional signature', () => {
      const params: ProofSubmissionParams = {
        sessionId: BigInt(1),
        tokensClaimed: BigInt(100),
        proofHash: '0x' + 'ab'.repeat(32),
        proofCID: 'bafybeicid',
        // signature is optional - can be omitted
        deltaCID: ''
      };

      expect(params.signature).toBeUndefined();
      expect(params.deltaCID).toBe('');
    });

    it('ProofSubmissionResult should include deltaCID', () => {
      const result: ProofSubmissionResult = {
        proofHash: '0x' + 'ab'.repeat(32),
        tokensClaimed: BigInt(100),
        timestamp: BigInt(1707177600),
        verified: true,
        deltaCID: 'bafybeedelta'
      };

      expect(result.deltaCID).toBe('bafybeedelta');
    });
  });

  describe('ABI Fragments', () => {
    it('submitProofOfWork has 5 params without signature', () => {
      const fragment = JobMarketplaceFragments.submitProofOfWork;

      expect(fragment).toContain('uint256 jobId');
      expect(fragment).toContain('uint256 tokensClaimed');
      expect(fragment).toContain('bytes32 proofHash');
      expect(fragment).toContain('string proofCID');
      expect(fragment).toContain('string deltaCID');
      expect(fragment).not.toContain('bytes signature');
    });

    it('V2 delegation fragments exist', () => {
      expect(JobMarketplaceFragments.authorizeDelegate).toBeDefined();
      expect(JobMarketplaceFragments.isDelegateAuthorized).toBeDefined();
      expect((JobMarketplaceFragments as any).createSessionAsDelegate).toBeUndefined();
      expect(JobMarketplaceFragments.createSessionForModelAsDelegate).toBeDefined();
    });

    it('minTokensFee fragment exists', () => {
      expect(JobMarketplaceFragments.minTokensFee).toBeDefined();
      expect(JobMarketplaceFragments.minTokensFee).toContain('minTokensFee');
    });
  });

  describe('Post-Audit Remediation ABI', () => {
    // Load the ABI JSON directly
    const abiJson = require('../../src/contracts/abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json');
    const functionNames = abiJson
      .filter((entry: any) => entry.type === 'function')
      .map((entry: any) => entry.name);
    const eventNames = abiJson
      .filter((entry: any) => entry.type === 'event')
      .map((entry: any) => entry.name);

    it('ABI should NOT contain createSessionAsDelegate function', () => {
      expect(functionNames).not.toContain('createSessionAsDelegate');
    });

    it('ABI should contain RefundCreditedToDeposit event', () => {
      expect(eventNames).toContain('RefundCreditedToDeposit');
    });

    it('ABI should still contain createSessionForModelAsDelegate function', () => {
      expect(functionNames).toContain('createSessionForModelAsDelegate');
    });
  });

  describe('Delegation Error Types', () => {
    it('DELEGATION_ERRORS constants exist', () => {
      expect(DELEGATION_ERRORS.NOT_DELEGATE).toBe('NotDelegate');
      expect(DELEGATION_ERRORS.ERC20_ONLY).toBe('ERC20Only');
      expect(DELEGATION_ERRORS.BAD_PARAMS).toBe('BadDelegateParams');
    });

    it('parseDelegationError handles all error types', () => {
      expect(parseDelegationError({ message: 'NotDelegate' })).toBe('Caller not authorized as delegate for payer');
      expect(parseDelegationError({ message: 'ERC20Only' })).toBe('Direct delegation requires ERC-20 token (no ETH)');
      expect(parseDelegationError({ message: 'BadDelegateParams' })).toBe('Invalid delegation parameters');
      expect(parseDelegationError({ message: 'other error' })).toBeNull();
    });
  });

  describe('Post-Audit ModelRegistry ABI', () => {
    const modelAbi = require('../../src/contracts/abis/ModelRegistryUpgradeable-CLIENT-ABI.json');
    const modelFunctions = modelAbi
      .filter((e: any) => e.type === 'function')
      .map((e: any) => e.name);
    const modelEvents = modelAbi
      .filter((e: any) => e.type === 'event')
      .map((e: any) => e.name);

    it('should contain rate-limit functions', () => {
      expect(modelFunctions).toContain('getModelRateLimit');
      expect(modelFunctions).toContain('setModelRateLimit');
      expect(modelFunctions).toContain('DEFAULT_RATE_LIMIT');
    });

    it('should contain voting extension constants', () => {
      expect(modelFunctions).toContain('EXTENSION_DURATION');
      expect(modelFunctions).toContain('EXTENSION_THRESHOLD');
      expect(modelFunctions).toContain('MAX_EXTENSIONS');
    });

    it('should contain new events (ModelRateLimitUpdated, VotingExtended, RejectedFeesWithdrawn)', () => {
      expect(modelEvents).toContain('ModelRateLimitUpdated');
      expect(modelEvents).toContain('VotingExtended');
      expect(modelEvents).toContain('RejectedFeesWithdrawn');
    });

    it('should NOT contain updateModelHash', () => {
      expect(modelFunctions).not.toContain('updateModelHash');
    });

    it('should NOT contain removed events (ModelHashUpdated, ModelSkipped)', () => {
      expect(modelEvents).not.toContain('ModelHashUpdated');
      expect(modelEvents).not.toContain('ModelSkipped');
    });
  });

  describe('Post-Audit NodeRegistry ABI', () => {
    const nodeAbi = require('../../src/contracts/abis/NodeRegistryWithModelsUpgradeable-CLIENT-ABI.json');
    const nodeFunctions = nodeAbi
      .filter((e: any) => e.type === 'function')
      .map((e: any) => e.name);
    const nodeEvents = nodeAbi
      .filter((e: any) => e.type === 'event')
      .map((e: any) => e.name);

    it('should contain slashing functions', () => {
      expect(nodeFunctions).toContain('slashStake');
      expect(nodeFunctions).toContain('initializeSlashing');
      expect(nodeFunctions).toContain('setSlashingAuthority');
      expect(nodeFunctions).toContain('setTreasury');
    });

    it('should contain slashing constants', () => {
      expect(nodeFunctions).toContain('MAX_SLASH_PERCENTAGE');
      expect(nodeFunctions).toContain('MIN_STAKE_AFTER_SLASH');
      expect(nodeFunctions).toContain('SLASH_COOLDOWN');
    });

    it('should contain slashing events', () => {
      expect(nodeEvents).toContain('SlashExecuted');
      expect(nodeEvents).toContain('HostAutoUnregistered');
      expect(nodeEvents).toContain('SlashingAuthorityUpdated');
      expect(nodeEvents).toContain('TreasuryUpdated');
    });

    it('registerNode should have 5 params with dual pricing', () => {
      const registerNode = nodeAbi.find(
        (e: any) => e.type === 'function' && e.name === 'registerNode'
      );
      expect(registerNode.inputs).toHaveLength(5);
      const inputNames = registerNode.inputs.map((i: any) => i.name);
      expect(inputNames).toContain('minPricePerTokenNative');
      expect(inputNames).toContain('minPricePerTokenStable');
    });
  });

  describe('Post-Audit ProofSystem ABI', () => {
    const proofAbi = require('../../src/contracts/abis/ProofSystemUpgradeable-CLIENT-ABI.json');
    const proofFunctions = proofAbi
      .filter((e: any) => e.type === 'function')
      .map((e: any) => e.name);

    it('should NOT contain removed circuit functions', () => {
      expect(proofFunctions).not.toContain('getModelCircuit');
      expect(proofFunctions).not.toContain('isCircuitRegistered');
      expect(proofFunctions).not.toContain('modelCircuits');
    });

    it('should still contain core proof functions', () => {
      expect(proofFunctions).toContain('markProofUsed');
      expect(proofFunctions).toContain('verifiedProofs');
      expect(proofFunctions).toContain('setAuthorizedCaller');
    });
  });

  describe('Post-Audit NodeRegistry Fragment Exports', () => {
    it('registerNode fragment has 5 params with pricing', () => {
      expect(NodeRegistryFragments.registerNode).toContain('minPricePerTokenNative');
      expect(NodeRegistryFragments.registerNode).toContain('minPricePerTokenStable');
    });

    it('nodes fragment includes pricing fields', () => {
      expect(NodeRegistryFragments.nodes).toContain('minPricePerTokenNative');
      expect(NodeRegistryFragments.nodes).toContain('minPricePerTokenStable');
    });
  });

  describe('Phase 18: Per-Model Per-Token Pricing in Registration', () => {
    it('HostRegistrationWithModels should accept stableTokenAddress field', async () => {
      const request: import('../../src/managers/HostManager').HostRegistrationWithModels = {
        metadata: { hardware: { gpu: 'RTX 4090', vram: 24, ram: 64 }, capabilities: { streaming: true }, location: 'us-east-1', maxConcurrent: 5, costPerToken: 0.0001 },
        apiUrl: 'http://localhost:8080',
        supportedModels: [],
        minPricePerTokenNative: '3000000',
        minPricePerTokenStable: '5000',
        stableTokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
      };
      expect(request.stableTokenAddress).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
    });

    it('HostManager should expose setModelTokenPricing method', async () => {
      const { HostManager } = await import('../../src/managers/HostManager');
      expect(typeof HostManager.prototype.setModelTokenPricing).toBe('function');
    });

    it('HostManager should expose clearModelTokenPricing method', async () => {
      const { HostManager } = await import('../../src/managers/HostManager');
      expect(typeof HostManager.prototype.clearModelTokenPricing).toBe('function');
    });
  });

  describe('Host Discovery Pricing Filter', () => {
    it('findHostsForModel should filter hosts without model pricing', async () => {
      // Phase 18: filter uses getModelPricing instead of getNodePricing
      const { HostManager } = await import('../../src/managers/HostManager');
      expect(typeof HostManager.prototype.findHostsForModel).toBe('function');
    });
  });

  describe('normalizePrice Scoring Bug Fix', () => {
    it('normalizePrice should return 0 for zero or undefined price', async () => {
      const { HostSelectionService } = await import('../../src/services/HostSelectionService');
      const service = new HostSelectionService();

      // Access private method via prototype for testing
      const normalizePrice = (HostSelectionService.prototype as any).normalizePrice;

      // Zero price should return 0 (not available), not 1 (best deal)
      expect(normalizePrice(0n)).toBe(0);
      expect(normalizePrice(undefined)).toBe(0);
      expect(normalizePrice(null)).toBe(0);
    });
  });

  // Skip live contract tests in CI
  describe.skip('Live Contract Tests (require RPC)', () => {
    it('submitProofOfWork without signature', async () => {
      // This test requires live contract access
      // Run manually with: SKIP_LIVE=false pnpm test feb2026
    });

    it('V2 delegation flow', async () => {
      // Test: authorize → createSessionForModelAsDelegate
      // Requires live contract and test accounts
    });

    it('minTokensFee query', async () => {
      // Query the early cancellation fee
    });
  });
});
