// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * @file resolveModelPricePerToken Tests (Sub-phase 1.2)
 * @description Standalone mirror of startSession's on-chain price lookup
 *   (convertModelToBytes32 + hostManager.getModelPricing). Returns the RAW
 *   bigint price (no zero-guard, no native default — the caller owns those).
 *   Also asserts startSession's price block is unmodified (regression).
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SessionManager } from '../../src/managers/SessionManager';

// Mock ChainRegistry to avoid environment variable requirements
vi.mock('../../src/config/ChainRegistry', () => ({
  ChainRegistry: {
    isChainSupported: vi.fn().mockReturnValue(true),
    getSupportedChains: vi.fn().mockReturnValue([84532])
  }
}));

describe('SessionManager.resolveModelPricePerToken', () => {
  let sessionManager: SessionManager;
  let mockPaymentManager: any;
  let mockStorageManager: any;
  let mockHostManager: any;

  const host = '0x' + '1'.repeat(40);
  const usdcToken = '0x' + 'a'.repeat(40);
  // keccak256("repo/file") form: a 0x + 64-hex bytes32 id (e.g. computeTranscodeModelId output)
  const bytes32ModelId = '0x' + 'b'.repeat(64);
  // "repo:file" form that convertModelToBytes32 will hash
  const stringModelId = 'CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf';
  const onChainPrice = 5000n;

  beforeEach(() => {
    mockPaymentManager = {
      isInitialized: vi.fn().mockReturnValue(true),
      signer: { getAddress: vi.fn().mockResolvedValue('0x' + '2'.repeat(40)) }
    };
    mockStorageManager = { isInitialized: vi.fn().mockReturnValue(true) };
    mockHostManager = {
      getModelPricing: vi.fn().mockResolvedValue(onChainPrice)
    };

    sessionManager = new SessionManager(
      mockPaymentManager as any,
      mockStorageManager as any,
      mockHostManager as any
    );
  });

  it('returns the raw on-chain bigint and calls getModelPricing with the hashed id + token', async () => {
    const price = await sessionManager.resolveModelPricePerToken(host, stringModelId, usdcToken);

    expect(price).toBe(onChainPrice);
    expect(typeof price).toBe('bigint');
    expect(mockHostManager.getModelPricing).toHaveBeenCalledTimes(1);

    // The id passed to getModelPricing must be the bytes32 hash, not the raw string.
    const [calledHost, calledId, calledToken] = mockHostManager.getModelPricing.mock.calls[0];
    expect(calledHost).toBe(host);
    expect(calledToken).toBe(usdcToken);
    expect(calledId).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(calledId).not.toBe(stringModelId);
  });

  it('passes an already-bytes32 modelId through unchanged (idempotent) to getModelPricing', async () => {
    await sessionManager.resolveModelPricePerToken(host, bytes32ModelId, usdcToken);

    expect(mockHostManager.getModelPricing).toHaveBeenCalledWith(host, bytes32ModelId, usdcToken);
  });

  it('does NOT default paymentToken to native — the passed token is used as-is', async () => {
    await sessionManager.resolveModelPricePerToken(host, bytes32ModelId, usdcToken);

    const [, , calledToken] = mockHostManager.getModelPricing.mock.calls[0];
    expect(calledToken).toBe(usdcToken);
    expect(calledToken).not.toBe('0x0000000000000000000000000000000000000000');
  });

  it('returns the raw price even when it is 0n (no zero-guard here — caller owns it)', async () => {
    mockHostManager.getModelPricing.mockResolvedValue(0n);

    const price = await sessionManager.resolveModelPricePerToken(host, bytes32ModelId, usdcToken);
    expect(price).toBe(0n);
  });

  describe('regression: startSession price block unmodified', () => {
    it('still resolves price via convertModelToBytes32 + getModelPricing(provider, idBytes32, tokenAddress)', () => {
      const src = readFileSync(
        join(__dirname, '../../src/managers/SessionManager.ts'),
        'utf8'
      );
      // The exact startSession primitives must remain intact.
      expect(src).toContain('modelIdBytes32 = convertModelToBytes32(model);');
      expect(src).toContain(
        'const modelPrice = await this.hostManager.getModelPricing(provider, modelIdBytes32, tokenAddress);'
      );
      // modelIdBytes32 is reused downstream in the session-job params.
      expect(src).toContain('modelId: modelIdBytes32');
    });
  });
});
