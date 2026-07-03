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
      // LTX_RESOLUTION="WxH" (v4 ladder shakedown, default 768x512); LTX_TIMEOUT_MS for long HD renders.
      frames: 121, fps: 24,
      resolution: (([w, h]) => ({ w, h }))((process.env.LTX_RESOLUTION || '768x512').split('x').map(Number)),
      lora: 'ltx-iclora-hdr@v1', output: 'exr-sequence',
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
      timeoutMs: Number(process.env.LTX_TIMEOUT_MS || 600000), // HD renders can exceed the 600s default
    });

    expect(result.outputCID).toBeTruthy();
    expect(result.frames.length).toBe(result.manifest.frameCount);
    expect(stages.length).toBeGreaterThan(0);

    const frames = await ltx.downloadFrames(result);
    expect(frames[0].length).toBeGreaterThan(0);

    const verification = await ltx.verifyAttestation(job, result, { sessionId: result.sessionId });
    expect(verification.inputBinding).toBe(true);

    // M1 economics gate (LTX_EXPECT_PROOF=1): proof on-chain, integrity live, exact settle math (90/10 fee-from-gross, fee floors).
    if (process.env.LTX_EXPECT_PROOF === '1') {
      const { JobMarketplaceWrapper } = await import('../../src/contracts/JobMarketplace');
      const wrapper = new JobMarketplaceWrapper(ChainId.BASE_SEPOLIA, wallet);
      let proof: any;
      for (let i = 0; i < 24; i++) {  // node submits with confirmations pre-ltx_complete; poll defensively (≤2min)
        try {
          proof = await wrapper.getProofSubmission(result.sessionId!, 0);
          if (proof?.proofHash && !/^0x0+$/.test(proof.proofHash)) break;
        } catch { /* contract reverts "Bad index" while the slot is empty — keep polling */ }
        await new Promise((r) => setTimeout(r, 5000));
      }
      expect(proof?.proofHash, 'no on-chain proof appeared within the poll window').toBeTruthy();
      expect(verification.integrity === 'ok' || (await ltx.verifyAttestation(job, result, { sessionId: result.sessionId })).integrity).toBe('ok');
      expect(Number(proof.tokensClaimed)).toBe(result.billing.tokens);        // §B triple equality (est == billing asserted above)
      // SessionCompleted numbers per the contracts dev's exact formulas
      const price = 904n;
      const gross = (BigInt(result.billing.tokens) * price) / 1000n;
      const fee = (gross * 1000n) / 10000n;                                    // floors → treasury
      const host = gross - fee;                                               // host gets the leftover unit
      const abi = ['event SessionCompleted(uint256 indexed jobId, uint256 totalTokensUsed, uint256 hostEarnings, uint256 userRefund)'];
      const c = new ethers.Contract(chain.contracts.jobMarketplace, abi, wallet.provider);
      let ev: any;
      for (let i = 0; i < 30 && !ev; i++) {                                    // 30s eligibility wait + completion tx (≤3min)
        const latest = await wallet.provider!.getBlockNumber();
        [ev] = await c.queryFilter(c.filters.SessionCompleted(result.jobId!), latest - 900, latest);
        if (!ev) await new Promise((r) => setTimeout(r, 6000));
      }
      expect(ev, 'SessionCompleted not observed').toBeTruthy();
      expect(ev.args.totalTokensUsed).toBe(BigInt(result.billing.tokens));
      expect(ev.args.hostEarnings).toBe(host);                                 // hosts finally earn
      // Deposit rule (1.28.3): max(floor, ceil(est × 1.05)); est == gross to the unit (triple equality above)
      const padded = (gross * 105n + 99n) / 100n;
      const deposit = padded > 500000n ? padded : 500000n;
      expect(ev.args.userRefund).toBe(deposit - gross);
      console.log(`[ECONOMICS] tokens=${result.billing.tokens} gross=${gross} host=${host} fee=${fee} deposit=${deposit} refund=${deposit - gross} ✓`);
    }

    // Opt-in: persist the decrypted clip + provenance for human viewing (LTX_SAVE_DIR=/path)
    if (process.env.LTX_SAVE_DIR) {
      const dir = process.env.LTX_SAVE_DIR;
      mkdirSync(dir, { recursive: true });
      frames.forEach((f, i) => writeFileSync(join(dir, `frame_${String(i).padStart(4, '0')}.exr`), f));
      writeFileSync(join(dir, 'result.json'), JSON.stringify(
        { outputCID: result.outputCID, proofCID: result.proofCID, manifest: result.manifest, billing: result.billing, verification }, null, 2));
      console.log(`[LTX_SAVE_DIR] wrote ${frames.length} EXR frames + result.json -> ${dir}`);
    }
  }, 1800000); // HD render (LTX_TIMEOUT_MS) + (LTX_EXPECT_PROOF) proof poll + 30s settle window + SessionCompleted poll

  // M1a image-to-video — additionally gated on the i2v pending inputs (own model id + template + an input image).
  const I2V_READY = !!(process.env.LTX_I2V_MODEL_ID && process.env.LTX_I2V_TEMPLATE_HASH && process.env.LTX_I2V_IMAGE_PATH);
  it.skipIf(!I2V_READY)('i2v: uploads an encrypted image, generates, verifies the v2 image binding', async () => {
    for (const [k, v] of Object.entries({ NODE_WS, LTX_HOST, BUNDLE_CID, BUNDLE_HASH })) {
      if (!v) throw new Error(`LTX i2v E2E requires env ${k}`);
    }
    const { readFileSync } = await import('fs');
    const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
    const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA!;
    const wallet = new ethers.Wallet(process.env.TEST_USER_1_PRIVATE_KEY!, new ethers.JsonRpcProvider(rpcUrl));
    const sdk = new FabstirSDKCore({
      mode: 'production', chainId: ChainId.BASE_SEPOLIA, rpcUrl,
      ltxModelId: process.env.LTX_I2V_MODEL_ID!,          // i2v has its OWN registered model id
      contractAddresses: chain.contracts,
      s5Config: { seedPhrase: process.env.S5_SEED_PHRASE },
    });
    await sdk.authenticate('signer', { signer: wallet });
    const ltx = sdk.getLtxManager();
    const hostMetadata: LtxBundleMetadata = { allowListVersion: BUNDLE_VERSION, bundleHash: BUNDLE_HASH!, bundleCID: BUNDLE_CID };

    const imageBytes = new Uint8Array(readFileSync(process.env.LTX_I2V_IMAGE_PATH!));
    const { cids } = await ltx.uploadImages([imageBytes], hostMetadata);

    const job: LtxJob = {
      templateId: 'ltx-i2v-hdr', templateHash: process.env.LTX_I2V_TEMPLATE_HASH!,
      prompt: process.env.LTX_PROMPT || 'camera slowly pushes in, cinematic',
      seed: process.env.LTX_SEED || String(Date.now()),
      frames: 121, fps: 24, resolution: { w: 1280, h: 720 },   // i2v default 720p; delivered = 5*fps+1
      lora: 'ltx-iclora-hdr@v1', output: 'exr-sequence', images: cids,
    };
    await (sdk.getPaymentManager() as any).approveToken(chain.contracts.jobMarketplace, ethers.parseUnits('1', 6), chain.contracts.usdcToken);

    const stages: string[] = [];
    const result = await ltx.generate(job, LTX_HOST!, hostMetadata, { endpoint: NODE_WS, onProgress: (p) => stages.push(p.stage) });
    expect(result.frames.length).toBe(result.manifest.frameCount);
    const frames = await ltx.downloadFrames(result);
    expect(frames[0].length).toBeGreaterThan(0);
    const verification = await ltx.verifyAttestation(job, result);  // v2 commitment binds the image content
    expect(verification.inputBinding).toBe(true);
    if (process.env.LTX_SAVE_DIR) {
      mkdirSync(process.env.LTX_SAVE_DIR, { recursive: true });
      writeFileSync(join(process.env.LTX_SAVE_DIR, 'i2v_frame_0000.exr'), frames[0]);
      console.log(`[LTX_SAVE_DIR] wrote i2v result -> ${process.env.LTX_SAVE_DIR}`);
    }
  }, 600000);

  // M1b first-last-frame — gated on the flf2v inputs (own model id + template + TWO comma-separated image paths).
  const FLF2V_READY = !!(process.env.LTX_FLF2V_MODEL_ID && process.env.LTX_FLF2V_TEMPLATE_HASH && process.env.LTX_FLF2V_IMAGE_PATHS?.includes(','));
  it.skipIf(!FLF2V_READY)('flf2v: two images (first,last), generates the in-between, verifies the v2 binding', async () => {
    for (const [k, v] of Object.entries({ NODE_WS, LTX_HOST, BUNDLE_CID, BUNDLE_HASH })) {
      if (!v) throw new Error(`LTX flf2v E2E requires env ${k}`);
    }
    const { readFileSync } = await import('fs');
    const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
    const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA!;
    const wallet = new ethers.Wallet(process.env.TEST_USER_1_PRIVATE_KEY!, new ethers.JsonRpcProvider(rpcUrl));
    const sdk = new FabstirSDKCore({
      mode: 'production', chainId: ChainId.BASE_SEPOLIA, rpcUrl,
      ltxModelId: process.env.LTX_FLF2V_MODEL_ID!,        // flf2v has its OWN registered model id
      contractAddresses: chain.contracts,
      s5Config: { seedPhrase: process.env.S5_SEED_PHRASE },
    });
    await sdk.authenticate('signer', { signer: wallet });
    const ltx = sdk.getLtxManager();
    const hostMetadata: LtxBundleMetadata = { allowListVersion: BUNDLE_VERSION, bundleHash: BUNDLE_HASH!, bundleCID: BUNDLE_CID };

    const [firstPath, lastPath] = process.env.LTX_FLF2V_IMAGE_PATHS!.split(',');
    const images = [firstPath, lastPath].map((p) => new Uint8Array(readFileSync(p.trim())));
    const { cids } = await ltx.uploadImages(images, hostMetadata); // ORDER: [firstFrame, lastFrame]

    const job: LtxJob = {
      templateId: 'ltx-flf2v-hdr', templateHash: process.env.LTX_FLF2V_TEMPLATE_HASH!,
      prompt: process.env.LTX_PROMPT || 'smooth cinematic motion from the first still to the last',
      seed: process.env.LTX_SEED || String(Date.now()),
      frames: 121, fps: 24, resolution: { w: 1280, h: 720 },
      lora: 'ltx-iclora-hdr@v1', output: 'exr-sequence', images: cids,
    };
    await (sdk.getPaymentManager() as any).approveToken(chain.contracts.jobMarketplace, ethers.parseUnits('1', 6), chain.contracts.usdcToken);

    const stages: string[] = [];
    const result = await ltx.generate(job, LTX_HOST!, hostMetadata, { endpoint: NODE_WS, onProgress: (p) => stages.push(p.stage) });
    expect(result.frames.length).toBe(result.manifest.frameCount);
    const frames = await ltx.downloadFrames(result);
    expect(frames[0].length).toBeGreaterThan(0);
    const verification = await ltx.verifyAttestation(job, result);  // binds BOTH image hashes, in order
    expect(verification.inputBinding).toBe(true);
    if (process.env.LTX_SAVE_DIR) {
      mkdirSync(process.env.LTX_SAVE_DIR, { recursive: true });
      writeFileSync(join(process.env.LTX_SAVE_DIR, 'flf2v_frame_0000.exr'), frames[0]);
      console.log(`[LTX_SAVE_DIR] wrote flf2v result -> ${process.env.LTX_SAVE_DIR}`);
    }
  }, 600000);
});
