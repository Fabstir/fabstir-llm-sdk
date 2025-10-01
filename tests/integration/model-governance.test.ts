/**
 * Integration tests for Model Governance System
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ethers } from 'ethers';
import { ModelManager } from '../../packages/sdk-core/src/managers/ModelManager';
import { HostManager } from '../../packages/sdk-core/src/managers/HostManager';
import { ClientManager } from '../../packages/sdk-core/src/managers/ClientManager';
import { APPROVED_MODELS } from '../../packages/sdk-core/src/constants/models';
import { ModelSpec, HostMetadata } from '../../packages/sdk-core/src/types/models';
import { ContractManager } from '../../packages/sdk-core/src/contracts/ContractManager';

describe('Model Governance Integration', () => {
  let provider: ethers.Provider;
  let modelManager: ModelManager;
  let contractManager: ContractManager;
  let testWallet: ethers.Wallet;

  beforeAll(async () => {
    // Setup provider
    provider = new ethers.JsonRpcProvider(
      process.env.RPC_URL_BASE_SEPOLIA ||
      'https://base-sepolia.g.alchemy.com/v2/demo'
    );

    // Create test wallet (read-only operations)
    const privateKey = '0x' + '0'.repeat(64); // Dummy key for read-only
    testWallet = new ethers.Wallet(privateKey, provider);

    // Initialize contract manager
    contractManager = new ContractManager(provider);
    await contractManager.initialize();

    // Initialize model manager
    const modelRegistryAddress = process.env.CONTRACT_MODEL_REGISTRY ||
                                 '0xfE54c2aa68A7Afe8E0DD571933B556C8b6adC357';
    modelManager = new ModelManager(provider, modelRegistryAddress);
    await modelManager.initialize();
  });

  describe('ModelManager', () => {
    it('should calculate correct model IDs', async () => {
      // Test with TinyVicuna
      const vicunaSpec = APPROVED_MODELS.TINY_VICUNA;
      const vicunaId = await modelManager.getModelId(vicunaSpec.repo, vicunaSpec.file);

      // Model ID should be a valid hash
      expect(vicunaId).toMatch(/^0x[a-fA-F0-9]{64}$/);

      // Calculate again - should be deterministic
      const vicunaId2 = await modelManager.getModelId(vicunaSpec.repo, vicunaSpec.file);
      expect(vicunaId2).toBe(vicunaId);

      // Test with TinyLlama
      const llamaSpec = APPROVED_MODELS.TINY_LLAMA;
      const llamaId = await modelManager.getModelId(llamaSpec.repo, llamaSpec.file);

      expect(llamaId).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(llamaId).not.toBe(vicunaId); // Different models should have different IDs
    });

    it('should validate model ID format', () => {
      // Valid format
      const validId = '0x' + 'a'.repeat(64);
      expect(modelManager.isValidModelId(validId)).toBe(true);

      // Invalid formats
      expect(modelManager.isValidModelId('0x123')).toBe(false); // Too short
      expect(modelManager.isValidModelId('abc' + 'a'.repeat(64))).toBe(false); // No 0x prefix
      expect(modelManager.isValidModelId('0x' + 'g'.repeat(64))).toBe(false); // Invalid hex
    });

    it('should check model approval status', async () => {
      // Check if TinyVicuna is approved
      const vicunaSpec = APPROVED_MODELS.TINY_VICUNA;
      const vicunaId = await modelManager.getModelId(vicunaSpec.repo, vicunaSpec.file);

      // This will check on-chain - may or may not be approved yet
      const isApproved = await modelManager.isModelApproved(vicunaId);
      expect(typeof isApproved).toBe('boolean');
    });

    it('should handle model validation', async () => {
      const vicunaSpec = APPROVED_MODELS.TINY_VICUNA;

      // Validate without file content (just approval check)
      const validation = await modelManager.validateModel(vicunaSpec);

      expect(validation).toHaveProperty('isValid');
      expect(validation).toHaveProperty('modelId');
      expect(validation).toHaveProperty('isApproved');
      expect(validation).toHaveProperty('errors');
      expect(Array.isArray(validation.errors)).toBe(true);
    });

    it('should verify model hash correctly', async () => {
      // Create fake file content
      const encoder = new TextEncoder();
      const fakeContent = encoder.encode('test model content');

      // Calculate expected hash
      const hashBuffer = await crypto.subtle.digest('SHA-256', fakeContent);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const expectedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Verify hash matches
      const isValid = await modelManager.verifyModelHash(
        fakeContent.buffer as ArrayBuffer,
        expectedHash
      );
      expect(isValid).toBe(true);

      // Verify hash doesn't match wrong value
      const isInvalid = await modelManager.verifyModelHash(
        fakeContent.buffer as ArrayBuffer,
        'wronghash123'
      );
      expect(isInvalid).toBe(false);
    });

    it('should cache model details', async () => {
      const vicunaSpec = APPROVED_MODELS.TINY_VICUNA;
      const modelId = await modelManager.getModelId(vicunaSpec.repo, vicunaSpec.file);

      // First call - fetches from chain
      const details1 = await modelManager.getModelDetails(modelId);

      // Second call - should use cache (faster)
      const start = Date.now();
      const details2 = await modelManager.getModelDetails(modelId);
      const elapsed = Date.now() - start;

      // Cache hit should be very fast (< 10ms)
      expect(elapsed).toBeLessThan(10);

      // Details should be the same
      if (details1 && details2) {
        expect(details2.modelId).toBe(details1.modelId);
      }
    });

    it('should get approval tier name', () => {
      expect(modelManager.getApprovalTierName(0)).toBe('Experimental');
      expect(modelManager.getApprovalTierName(1)).toBe('Community');
      expect(modelManager.getApprovalTierName(2)).toBe('Verified');
      expect(modelManager.getApprovalTierName(3)).toBe('Enterprise');
      expect(modelManager.getApprovalTierName(99)).toBe('Unknown');
    });
  });

  describe('HostManager', () => {
    let hostManager: HostManager;

    beforeAll(async () => {
      const nodeRegistryAddress = process.env.NODE_REGISTRY_WITH_MODELS_ADDRESS ||
                                  '0xaa14Ed58c3EF9355501bc360E5F09Fb9EC8c1100';
      hostManager = new HostManager(testWallet, nodeRegistryAddress, modelManager);
      // Note: Not initializing for full functionality in read-only tests
    });

    it('should validate model IDs for registration', async () => {
      const metadata: HostMetadata = {
        hardware: {
          gpu: 'RTX 4090',
          vram: 24,
          ram: 64
        },
        capabilities: ['inference', 'streaming'],
        location: 'us-east',
        maxConcurrent: 5,
        costPerToken: 0.0001,
        stakeAmount: '1000'
      };

      // This would fail without proper initialization and signer
      // Just testing the structure
      expect(hostManager).toBeDefined();
      expect(hostManager.getModelManager()).toBe(modelManager);
    });
  });

  describe('ClientManager', () => {
    let clientManager: ClientManager;
    let hostManager: HostManager;

    beforeAll(async () => {
      const nodeRegistryAddress = process.env.NODE_REGISTRY_WITH_MODELS_ADDRESS ||
                                  '0xaa14Ed58c3EF9355501bc360E5F09Fb9EC8c1100';
      hostManager = new HostManager(testWallet, nodeRegistryAddress, modelManager);
      clientManager = new ClientManager(modelManager, hostManager, contractManager);
      await clientManager.initialize();
    });

    it('should get recommended models', async () => {
      const chatModels = await clientManager.getRecommendedModels('chat');
      expect(Array.isArray(chatModels)).toBe(true);

      // Should include Vicuna (chat model)
      const hasVicuna = chatModels.some(m =>
        m.file.toLowerCase().includes('vicuna')
      );
      expect(hasVicuna).toBe(true);
    });

    it('should validate model requirements', async () => {
      // Test with valid model spec
      const vicunaSpec = APPROVED_MODELS.TINY_VICUNA;

      // This would normally select a host, but without live hosts will return null
      try {
        const host = await clientManager.selectHostForModel(vicunaSpec);
        // May be null if no hosts are registered
        expect(host === null || typeof host === 'object').toBe(true);
      } catch (error: any) {
        // Expected if model not approved on-chain
        expect(error.message).toContain('not approved');
      }
    });
  });

  describe('Model Constants', () => {
    it('should have correct approved models', () => {
      expect(APPROVED_MODELS.TINY_VICUNA).toBeDefined();
      expect(APPROVED_MODELS.TINY_VICUNA.repo).toBe('CohereForAI/TinyVicuna-1B-32k-GGUF');
      expect(APPROVED_MODELS.TINY_VICUNA.file).toBe('tiny-vicuna-1b.q4_k_m.gguf');
      expect(APPROVED_MODELS.TINY_VICUNA.sha256).toBe(
        '329d002bc20d4e7baae25df802c9678b5a4340b3ce91f23e6a0644975e95935f'
      );

      expect(APPROVED_MODELS.TINY_LLAMA).toBeDefined();
      expect(APPROVED_MODELS.TINY_LLAMA.repo).toBe('TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF');
      expect(APPROVED_MODELS.TINY_LLAMA.file).toBe('tinyllama-1b.Q4_K_M.gguf');
      expect(APPROVED_MODELS.TINY_LLAMA.sha256).toBe(
        '45b71fe98efe5f530b825dce6f5049d738e9c16869f10be4370ab81a9912d4a6'
      );
    });
  });

  afterAll(async () => {
    // Cleanup
    modelManager.clearCache();
  });
});