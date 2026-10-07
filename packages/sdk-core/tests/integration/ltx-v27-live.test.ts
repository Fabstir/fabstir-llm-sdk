// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
/**
 * VFX Passes against host 1's LIVE bundle (docs/development/IMPLEMENTATION-VFX-PASSES.md V9). READ-ONLY: a signer
 * sign-in, NodeRegistry / ModelRegistry reads, the S5 bundle and one on-chain price read — no transaction, no funds.
 *   RUN_LTX_LIVE_BUNDLE=1 npx vitest run tests/integration/ltx-v27-live.test.ts
 * Needs .env.test: RPC_URL_BASE_SEPOLIA, TEST_USER_1_PRIVATE_KEY, S5_SEED_PHRASE, TEST_HOST_1_ADDRESS,
 * CONTRACT_NODE_REGISTRY (approval is read through the SDK's own ModelManager).
 */
import 'fake-indexeddb/auto';
import WS from 'ws';
import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { FabstirSDKCore, ltxModelIdFor } from '../../src';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { ChainId } from '../../src/types/chain.types';
import nodeRegistryAbi from '../../src/contracts/abis/NodeRegistryWithModels-CLIENT-ABI.json';

if (typeof (globalThis as any).WebSocket === 'undefined') (globalThis as any).WebSocket = WS as any;
const RUN = process.env.RUN_LTX_LIVE_BUNDLE === '1';

describe.skipIf(!RUN)('VFX Passes — host 1 live bundle (read-only, RUN_LTX_LIVE_BUNDLE=1)', () => {
  it('derives every model from its entry, prices passes on NVIDIA ids, and applies the relight rules', async () => {
    const host = process.env.TEST_HOST_1_ADDRESS!;
    const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
    const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA!;
    const provider = new ethers.JsonRpcProvider(rpcUrl, 84532, { staticNetwork: true });
    const sdk = new FabstirSDKCore({ mode: 'production', chainId: ChainId.BASE_SEPOLIA, rpcUrl, contractAddresses: chain.contracts,
      s5Config: { seedPhrase: process.env.S5_SEED_PHRASE } } as any);
    await sdk.authenticate('signer', { signer: new ethers.Wallet(process.env.TEST_USER_1_PRIVATE_KEY!, provider) });
    const ltx: any = sdk.getLtxManager();

    const meta = await ltx.getLtxBundleMetadata(host);
    const bundle = await ltx.getLtxBundle(meta);
    expect(bundle.allowListVersion).toBeGreaterThanOrEqual(27);
    const passes = bundle.templates.filter((t: any) => t.sidecar === 'relight');
    expect(passes.map((t: any) => t.templateId).sort()).toEqual(['cosmos-passes-full', 'cosmos-passes-key', 'cosmos-passes-std']);

    // (1) every template's derived id is approved; the passes ids are registered on host 1
    const registry = sdk.getModelManager();
    const nodes = new ethers.Contract(process.env.CONTRACT_NODE_REGISTRY!, nodeRegistryAbi as any, provider);
    const onHost: string[] = (await nodes.getNodeModels(host)).map((m: string) => m.toLowerCase());
    for (const t of bundle.templates) expect(await registry.isModelApproved(ltxModelIdFor(t.templateId, t.sidecar)), t.templateId).toBe(true);
    for (const t of passes) expect(onHost).toContain(ltxModelIdFor(t.templateId, 'relight'));

    // (2) relight-fhd + the relight job rules, against the live entry
    const p = passes.find((t: any) => t.templateId === 'cosmos-passes-key');
    const job = { templateId: p.templateId, templateHash: p.templateHash, prompt: '', seed: '1', frames: 121, fps: 24,
      resolution: { w: 1920, h: 1088 }, lora: 'cosmos-passes-key@v1', output: 'exr-frames', videos: ['uSourceVideo'] };
    await expect(ltx.validateJob(job, meta)).resolves.toBeTruthy();
    for (const bad of [{ resolution: { w: 1920, h: 1080 } }, { output: 'exr-sequence' }, { prompt: 'moody' }]) {
      await expect(ltx.validateJob({ ...job, ...bad }, meta)).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
    }

    // (1, end to end) host 1 prices the passes job on its NVIDIA model
    const est = await ltx.estimateCost(job, host, undefined, meta);
    expect(est.pricePerToken > 0n).toBe(true);
    console.log(`[live v27] bundle ${meta.bundleHash} v${bundle.allowListVersion}; ${p.templateId} on ${ltxModelIdFor(p.templateId, 'relight')}: ${est.tokens} tokens × ${est.pricePerToken} = ${est.totalCost} USDC`);
  }, 300000);
});
