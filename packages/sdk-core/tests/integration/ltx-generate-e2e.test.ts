// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Sub-phase 5.3: gated live E2E for the LTX video sidecar.
// Runs ONLY with RUN_LTX_E2E=1 AND the pending inputs present (live node WS URL + registered LTX model id
// + published bundleCID). Skips honestly otherwise — see docs/development/IMPLEMENTATION-LTX-SIDECAR-M0-SDK.md
// "Pending External Inputs". Do NOT fake this green.
import 'fake-indexeddb/auto';
import WS from 'ws';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { FabstirSDKCore } from '../../src';
import type { LtxJob, LtxBundleMetadata } from '../../src';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { ChainId } from '../../src/types/chain.types';

// Node < 21 has no global WebSocket; S5 storage AND the node WS client both use it (browser-first SDK).
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WS as any;
}

const RUN = process.env.RUN_LTX_E2E === '1';

// Pending external inputs (all required for a live run):
const NODE_WS = process.env.LTX_NODE_WS_URL;        // live node on the L40S host
const LTX_MODEL_ID = process.env.LTX_MODEL_ID;      // bytes32 registered by Jules
const LTX_HOST = process.env.LTX_HOST_ADDRESS;      // host operator address
const LTX_TEMPLATE_HASH = process.env.LTX_TEMPLATE_HASH;
const BUNDLE_CID = process.env.LTX_BUNDLE_CID;      // node-published allow-list bundle (S5)
const BUNDLE_VERSION = Number(process.env.LTX_BUNDLE_VERSION || '0');
const BUNDLE_HASH = process.env.LTX_BUNDLE_HASH;

describe.skipIf(!RUN)('LTX generate E2E (live node, RUN_LTX_E2E=1)', () => {
  it('generates a tiny clip, streams progress, decrypts a frame, verifies input-binding', async () => {
    // Fail loudly if enabled without the required inputs — never silently pass.
    for (const [k, v] of Object.entries({ NODE_WS, LTX_MODEL_ID, LTX_HOST, LTX_TEMPLATE_HASH, BUNDLE_CID, BUNDLE_HASH })) {
      if (!v) throw new Error(`LTX E2E requires env ${k} (pending external input)`);
    }

    const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
    const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA!;
    const wallet = new ethers.Wallet(process.env.TEST_USER_1_PRIVATE_KEY!, new ethers.JsonRpcProvider(rpcUrl));

    const sdk = new FabstirSDKCore({
      mode: 'production',
      chainId: ChainId.BASE_SEPOLIA,
      rpcUrl,
      ltxModelId: LTX_MODEL_ID,
      contractAddresses: chain.contracts, // forward all resolved addresses (proofSystem/hostEarnings are also required)
      s5Config: { seedPhrase: process.env.S5_SEED_PHRASE }, // use the project's portal-registered S5 identity, not an address-derived one
    });
    await sdk.authenticate('signer', { signer: wallet });
    const ltx = sdk.getLtxManager();

    const job: LtxJob = {
      templateId: 'ltx-t2v-hdr', templateHash: LTX_TEMPLATE_HASH!,
      // Overridable: a REPEATED seed makes ComfyUI serve its cache (0s, no GPU) — vary LTX_SEED for a real generation.
      prompt: process.env.LTX_PROMPT || 'interior of a derelict spaceship corridor',
      seed: process.env.LTX_SEED || '4815162342',
      // frames=121 matches what the node actually renders (~5s pinned) — the honest charge, and immune to the
      // node switching billing from requested→delivered frames (which would trip the over-claim guard at 25).
      frames: 121, fps: 24, resolution: { w: 768, h: 512 }, lora: 'ltx-iclora-hdr@v1', output: 'exr-sequence',
    };
    const hostMetadata: LtxBundleMetadata = { allowListVersion: BUNDLE_VERSION, bundleHash: BUNDLE_HASH!, bundleCID: BUNDLE_CID };

    // Direct deposit path pulls USDC via transferFrom → approve the JobMarketplace as spender first
    // (approveUSDC is a no-op; the standard path uses approveToken to the marketplace). 1 USDC ≫ the ~0.009 clip.
    // NB: the RUNTIME (impl) arg order is (spender, amount, tokenAddress) — the IPaymentManager interface
    // mistypes it as (tokenAddress, spenderAddress, amount), so cast to call the concrete signature.
    await (sdk.getPaymentManager() as any).approveToken(chain.contracts.jobMarketplace, ethers.parseUnits('1', 6), chain.contracts.usdcToken);

    const stages: string[] = [];
    const result = await ltx.generate(job, LTX_HOST!, hostMetadata, {
      endpoint: NODE_WS, // the node's WS URL — without this, submitLtx falls back to localhost
      onProgress: (p) => stages.push(p.stage),
    });

    expect(result.outputCID).toBeTruthy();
    expect(result.frames.length).toBe(result.manifest.frameCount);
    expect(stages.length).toBeGreaterThan(0);

    const frames = await ltx.downloadFrames(result);
    expect(frames[0].length).toBeGreaterThan(0);

    const verification = await ltx.verifyAttestation(job, result);
    expect(verification.inputBinding).toBe(true);

    // Opt-in: persist the decrypted clip + provenance for human viewing (LTX_SAVE_DIR=/path)
    if (process.env.LTX_SAVE_DIR) {
      const dir = process.env.LTX_SAVE_DIR;
      mkdirSync(dir, { recursive: true });
      frames.forEach((f, i) => writeFileSync(join(dir, `frame_${String(i).padStart(4, '0')}.exr`), f));
      writeFileSync(join(dir, 'result.json'), JSON.stringify(
        { outputCID: result.outputCID, proofCID: result.proofCID, manifest: result.manifest, billing: result.billing, verification }, null, 2));
      console.log(`[LTX_SAVE_DIR] wrote ${frames.length} EXR frames + result.json -> ${dir}`);
    }
  }, 600000);
});
