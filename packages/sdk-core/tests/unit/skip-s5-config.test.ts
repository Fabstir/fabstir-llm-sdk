// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * skipS5 config normalization (inference-only mode for the orchestrator daemon).
 *
 * Guards the wiring of the `skipS5` flag (config + SKIP_S5_STORAGE env). The full
 * initializeManagers S5-skip path needs a live host/RPC, so it's exercised by the
 * gated integration test / the daemon at runtime, not here.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';

function cfg(over: any = {}) {
  return {
    mode: 'production', chainId: 84532,
    rpcUrl: process.env.RPC_URL_BASE_SEPOLIA || 'https://sepolia.base.org',
    contractAddresses: {
      jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE,
      nodeRegistry: process.env.CONTRACT_NODE_REGISTRY,
      proofSystem: process.env.CONTRACT_PROOF_SYSTEM,
      hostEarnings: process.env.CONTRACT_HOST_EARNINGS,
      usdcToken: process.env.CONTRACT_USDC_TOKEN,
    },
    ...over,
  };
}

describe('skipS5 config normalization', () => {
  afterEach(() => { delete process.env.SKIP_S5_STORAGE; });

  it('defaults to false', () => {
    const sdk = new FabstirSDKCore(cfg() as any);
    expect((sdk as any).config.skipS5).toBe(false);
  });

  it('honors the explicit skipS5 config flag', () => {
    const sdk = new FabstirSDKCore(cfg({ skipS5: true }) as any);
    expect((sdk as any).config.skipS5).toBe(true);
  });

  it('honors the SKIP_S5_STORAGE env var when the flag is absent', () => {
    process.env.SKIP_S5_STORAGE = 'true';
    const sdk = new FabstirSDKCore(cfg() as any);
    expect((sdk as any).config.skipS5).toBe(true);
  });

  it('explicit config flag takes precedence over a falsy env', () => {
    delete process.env.SKIP_S5_STORAGE;
    const sdk = new FabstirSDKCore(cfg({ skipS5: true }) as any);
    expect((sdk as any).config.skipS5).toBe(true);
  });
});
