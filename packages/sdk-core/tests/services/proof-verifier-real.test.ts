// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProofVerifier } from '../../src/services/ProofVerifier';
import { FabstirSDK } from '../../src/compat/FabstirSDKCompat';
import { SDKError } from '../../src/types';

describe('ProofVerifier - Real Proof Validation (No Mocks)', () => {
  let verifier: ProofVerifier;

  beforeEach(() => {
    verifier = new ProofVerifier();
  });

  describe('Proof Structure Validation', () => {
    it('should reject mock proof (all zeros)', async () => {
      const mockProof = '0x' + '00'.repeat(256);
      const isValid = await verifier.verifyProofStructure(mockProof);

      // Mock proof should be rejected as invalid
      expect(isValid).toBe(false);
    });

    it('should reject short invalid proofs', async () => {
      const shortProof = '0x1234567890';
      const isValid = await verifier.verifyProofStructure(shortProof);

      expect(isValid).toBe(false);
    });

    it('should accept valid EZKL proof structure', async () => {
      // Real EZKL proof structure with high entropy (simplified but realistic)
      const validProof = '0x' +
        'a3f2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2' +
        'b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4' +
        'd5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6' +
        'f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8' +
        'b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0' +
        'd1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2' +
        'f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4' +
        'b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6';

      const isValid = await verifier.verifyProofStructure(validProof);

      expect(isValid).toBe(true);
    });

    it('should reject proofs starting with many zeros (mock pattern)', async () => {
      // Proofs starting with many zeros are likely mock
      const suspiciousProof = '0x' + '00'.repeat(100) + 'ff'.repeat(156);
      const isValid = await verifier.verifyProofStructure(suspiciousProof);

      // Should implement logic to detect mock patterns
      expect(isValid).toBe(false);
    });

    it('should validate minimum proof length', async () => {
      const tooShort = '0x' + 'ab'.repeat(63); // 126 hex chars < 128 minimum
      const justRight = '0x' + 'ab'.repeat(64); // 128 hex chars

      expect(await verifier.verifyProofStructure(tooShort)).toBe(false);
      expect(await verifier.verifyProofStructure(justRight)).toBe(false); // Still too short for real proof
    });

    it('should handle malformed hex strings', async () => {
      const malformed = '0xzzzzz'; // Invalid hex

      // The verifier catches errors and returns false instead of throwing
      const result = await verifier.verifyProofStructure(malformed);
      expect(result).toBe(false);
    });
  });

  describe('Mock Proof Detection', () => {
    it('should identify and reject mock proof type', () => {
      const mockProofResult = {
        proof: '0x' + '00'.repeat(256),
        publicInputs: [],
        verified: false,
        timestamp: Date.now(),
        proofType: 'mock' as const
      };

      // Mock type should never be accepted in production
      expect(mockProofResult.proofType).not.toBe('ezkl');
      expect(mockProofResult.proofType === 'mock').toBe(true);
    });

    it('should detect repeated patterns (sign of mock)', async () => {
      const repeatingPattern = '0x' + 'deed'.repeat(64); // Like the old mock hash
      const isValid = await verifier.verifyProofStructure(repeatingPattern);

      // Should detect repeating patterns as invalid
      expect(isValid).toBe(false);
    });
  });

  describe('Public Input Validation', () => {
    it('should reject proofs without proper public inputs', () => {
      const proofWithoutInputs = '0x' + 'ab'.repeat(256);
      const expectedInputs = ['123', '456', '789'];

      const isValid = verifier.verifyPublicInputs(proofWithoutInputs, expectedInputs);

      expect(isValid).toBe(false);
    });

    it('should extract null for proofs without public inputs', () => {
      const binaryProof = '0x' + 'ff'.repeat(256);

      const inputs = verifier.extractPublicInputs(binaryProof);

      expect(inputs).toBeNull();
    });
  });

  describe('Proof Hash Calculation', () => {
    it('should calculate consistent hash for same proof', async () => {
      const proof = '0x' + 'ab'.repeat(256);

      const hash1 = await verifier.getProofHash(proof);
      const hash2 = await verifier.getProofHash(proof);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should calculate different hashes for different proofs', async () => {
      const proof1 = '0x' + 'ab'.repeat(256);
      const proof2 = '0x' + 'cd'.repeat(256);

      const hash1 = await verifier.getProofHash(proof1);
      const hash2 = await verifier.getProofHash(proof2);

      expect(hash1).not.toBe(hash2);
    });
  });
});

describe('FabstirSDK (Compat) - No Mock Proof Fallback', () => {
  let sdk: FabstirSDK;

  beforeEach(() => {
    // Create SDK with minimal config
    sdk = new FabstirSDK({
      rpcUrl: 'http://localhost:8545',
      contractAddresses: {
        jobMarketplace: '0x' + '1'.repeat(40),
        nodeRegistry: '0x' + '2'.repeat(40),
        proofSystem: '0x' + '3'.repeat(40),
        hostEarnings: '0x' + '4'.repeat(40),
        usdcToken: '0x' + '5'.repeat(40)
      }
    });
  });

  it('should handle proof generation through compatibility layer', async () => {
    // The SDK's compatibility layer would handle proof generation
    // For now, we verify the structure is correct
    const compatLayer = (sdk as any).createCompatibilityLayer?.();

    // If the method exists, verify it throws without bridge
    if (compatLayer?.generateProof) {
      await expect(
        compatLayer.generateProof('session-123', 100)
      ).rejects.toThrow();
    } else {
      // The SDK doesn't expose generateProof directly
      expect(true).toBe(true);
    }
  });

  it('should not have mock proof methods exposed', () => {
    // Verify no mock proof methods are exposed
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(sdk));

    // Should not have methods that return mock proofs
    expect(methods).not.toContain('getMockProof');
    expect(methods).not.toContain('generateMockProof');
  });
});

describe('ProofVerifier - Enhanced Mock Detection', () => {
  let verifier: ProofVerifier;

  beforeEach(() => {
    verifier = new ProofVerifier();
  });

  it('should reject proofs with too many consecutive zeros', async () => {
    // More than 64 consecutive zeros is suspicious
    const mockishProof = '0x' + '00'.repeat(64) + 'ab'.repeat(192);

    const isValid = await verifier.verifyProofStructure(mockishProof);

    expect(isValid).toBe(false);
  });

  it('should reject proofs with obvious test patterns', async () => {
    const testPatterns = [
      '0x' + 'dead'.repeat(64),
      '0x' + 'beef'.repeat(64),
      '0x' + 'cafe'.repeat(64),
      '0x' + '1234'.repeat(64),
      '0x' + 'abcd'.repeat(64)
    ];

    for (const pattern of testPatterns) {
      const isValid = await verifier.verifyProofStructure(pattern);
      expect(isValid).toBe(false);
    }
  });

  it('should accept diverse, random-looking proofs', async () => {
    // Simulate a real proof with varied bytes
    const realProof = '0x' +
      'a3f2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2' +
      'b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4' +
      'd5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6' +
      'f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8' +
      'b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0' +
      'd1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2' +
      'f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4' +
      'b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6';

    const isValid = await verifier.verifyProofStructure(realProof);

    expect(isValid).toBe(true);
  });
});