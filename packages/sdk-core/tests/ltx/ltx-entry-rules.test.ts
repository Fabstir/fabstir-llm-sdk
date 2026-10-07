// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Allow-list v26 (docs/development/IMPLEMENTATION-LTX25-NEW-MODES.md): an entry's own fps list and resolutionRule
// (L1, L2), the template/model check before any price lookup or escrow (L4), and the node's own code reaching generate()
// callers (L5; the submitLtxWs half lives in ltx-ws.test.ts). M1 pins ltxModelIdFor to the registered ids.
import { describe, it, expect, vi } from 'vitest';
import bundleFixture from './bundle-fixture.json';
import { canonicalBundleHash, ltxModelIdFor as modelOf } from '../../src/utils/ltx-utils';
import { LtxManager } from '../../src/managers/LtxManager';
import { LtxError } from '../../src/errors/ltx-errors';
import * as entry from '../../src/index';
import { SDKError } from '../../src/types';
import { realSdk } from '../helpers/sdk-instance';

const hash = (b: number) => '0x' + b.toString(16).padStart(2, '0').repeat(32);
const T2V = bundleFixture.templates[0];
const refused = { code: 'LTX_PREVALIDATION_FAILED' };

/** The live v26 bounds (host 4, 2026-10-06). */
const V26_BOUNDS = {
  frames: { min: 121, max: 751 },
  fps: [24, 25, 48, 50],
  resolutions: [
    [768, 512], [1280, 720], [1920, 1080], [2560, 1440], [3840, 2160], [512, 768], [720, 1280], [1080, 1920],
    [1024, 1024], [1920, 1088], [1088, 1920], [2560, 1408], [1408, 2560], [1536, 1024], [1024, 1536], [3840, 2176], [2176, 3840],
  ].map(([w, h]) => ({ w, h })),
  imageMaxBytes: 33554432, imageFormats: ['png', 'jpeg', 'webp'], videoMaxBytes: 134217728, videoFormats: ['mp4'],
  deepVideoMaxBytes: 4294967296,
};
const ALPHA = {
  templateId: 'ltx-alpha-hdr', templateHash: hash(0xa1), imageInputs: 0, videoInputs: 1, videoSemantics: ['sourceVideo'],
  fps: [24, 25], maxFrames: 145, resolutionRule: 'div64-fhd', exactControl: true, frameGrid: true,
};

/** v26 bundle: t2v plus Alpha (with `alphaOver` applied), authenticated. */
function bundle(alphaOver: Record<string, unknown> = {}, bounds: Record<string, unknown> = V26_BOUNDS, t2vOver: Record<string, unknown> = {}) {
  const { bundleHash: _drop, ...rest } = bundleFixture as any;
  const b: any = { ...rest, allowListVersion: 26, bounds, templates: [{ ...T2V, ...t2vOver }, { ...ALPHA, ...alphaOver }] };
  b.bundleHash = canonicalBundleHash(b);
  return b;
}
const meta = (b: any) => ({ allowListVersion: 26, bundleHash: b.bundleHash, bundleCID: 'bCid' });

function alphaJob(over: Record<string, unknown> = {}) {
  return {
    templateId: 'ltx-alpha-hdr', templateHash: ALPHA.templateHash, prompt: 'p', seed: '1', frames: 121, fps: 25,
    resolution: { w: 1536, h: 1024 }, lora: 'ltx-alpha-hdr@v1', output: 'exr-sequence', videos: ['uSrc'], ...over,
  } as any;
}
const t2vJob = (over: Record<string, unknown> = {}) =>
  ({ ...alphaJob(), templateId: T2V.templateId, templateHash: T2V.templateHash, videos: undefined, fps: 24, ...over }) as any;

function validate(b: any, job: any) { // validateJob is bundle-only: the manager's model is not read
  const m = new LtxManager({ storageManager: { getByCID: vi.fn().mockResolvedValue(b) }, ltxModelId: '0x01', usdcAddress: '0xabc' } as any);
  return m.validateJob(job, meta(b));
}
/** Alpha at w×h, with that size added to the bounds so only the rule can refuse it. */
const atSize = (w: number, h: number) =>
  validate(bundle({}, { ...V26_BOUNDS, resolutions: [...V26_BOUNDS.resolutions, { w, h }] }), alphaJob({ resolution: { w, h } }));

describe('L1 — an entry\'s own fps list', () => {
  it('R1: Alpha at 24 and 25 fps passes', async () => {
    for (const fps of [24, 25]) await expect(validate(bundle(), alphaJob({ fps }))).resolves.toBeTruthy();
  });

  it('R2: Alpha at 48 and 50 fps (both in bounds.fps) is refused, naming the entry\'s list', async () => {
    for (const fps of [48, 50]) {
      await expect(validate(bundle(), alphaJob({ fps }))).rejects.toMatchObject({ ...refused, message: expect.stringMatching(/24, ?25/) });
    }
  });

  it('R3: a template without its own list keeps the bounds list (t2v at 48 fps passes)', async () => {
    await expect(validate(bundle(), t2vJob({ fps: 48, frames: 241 }))).resolves.toBeTruthy();
  });

  it('R4: a malformed entry fps list is refused (fail closed)', async () => {
    for (const fps of [[], [24, '25'], [0, 25], [24.5], '24', null]) {
      await expect(validate(bundle({ fps }), alphaJob())).rejects.toMatchObject(refused);
    }
  });
});

describe('L2 — an entry\'s resolutionRule', () => {
  it('R5: Alpha at each of the seven div64-fhd sizes passes', async () => {
    for (const [w, h] of [[768, 512], [512, 768], [1024, 1024], [1536, 1024], [1024, 1536], [1920, 1088], [1088, 1920]]) {
      await expect(validate(bundle(), alphaJob({ resolution: { w, h } }))).resolves.toBeTruthy();
    }
  });

  it('R6: in-bounds sizes that break div64-fhd are refused, naming the rule', async () => {
    // 1280x720: not ÷64; 1920x1080: 1080 not ÷64; 2560x1408: long side > 1920
    for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1408], [1408, 2560]]) {
      await expect(validate(bundle(), alphaJob({ resolution: { w, h } }))).rejects.toMatchObject({ ...refused, message: expect.stringContaining('div64-fhd') });
    }
  });

  it('R6: each clause holds on its own — ÷64, long side ≤ 1920, area ≤ 1920 × 1088', async () => {
    await expect(atSize(1984, 64)).rejects.toMatchObject(refused);   // long side
    await expect(atSize(1920, 1152)).rejects.toMatchObject(refused); // area
    await expect(atSize(1000, 512)).rejects.toMatchObject(refused);  // ÷64
    await expect(atSize(1920, 64)).resolves.toBeTruthy();            // all three hold
  });

  it('R7: an unknown or non-string rule is refused outright', async () => {
    for (const resolutionRule of ['div32-uhd', '', 64, null]) {
      await expect(validate(bundle({ resolutionRule }), alphaJob({ resolution: { w: 1024, h: 1024 } }))).rejects.toMatchObject(refused);
    }
  });

  it('R7b: a name inherited from Object.prototype is not a rule — refused as an LtxError', async () => {
    for (const resolutionRule of ['toString', 'constructor', '__proto__', 'valueOf', 'hasOwnProperty']) {
      const err = await validate(bundle({ resolutionRule }), alphaJob({ resolution: { w: 1280, h: 720 } })).catch((e) => e);
      expect(err).toBeInstanceOf(LtxError);
      expect(err).toMatchObject(refused);
    }
  });

  it('R8: no rule → unchanged (t2v at 1920x1080 passes); a ruled entry still needs a bounds size', async () => {
    await expect(validate(bundle(), t2vJob({ resolution: { w: 1920, h: 1080 } }))).resolves.toBeTruthy();
    await expect(validate(bundle(), alphaJob({ resolution: { w: 640, h: 640 } }))).rejects.toMatchObject(refused); // div64-fhd, not in bounds
  });
});

describe('L10 — the node\'s own job rules (fabstir-llm-node 8.59.1), before escrow', () => {
  it('N1: a template without frameGrid takes 5 to 15 whole seconds (check_length → validate_duration)', async () => {
    for (const frames of [121, 361]) await expect(validate(bundle(), t2vJob({ frames }))).resolves.toBeTruthy();       // 5 s, 15 s at 24 fps
    for (const frames of [385, 481]) await expect(validate(bundle(), t2vJob({ frames }))).rejects.toMatchObject(refused); // 16 s, 20 s
    await expect(validate(bundle(), t2vJob({ fps: 48, frames: 145 }))).rejects.toMatchObject(refused);                  // 3 s
    await expect(validate(bundle(), t2vJob({ fps: 50, frames: 201 }))).rejects.toMatchObject(refused);                  // 4 s
  });

  it('N2: maxFrames bounds every template that carries it, not only frameGrid ones (check_template_rules)', async () => {
    const b = bundle({}, V26_BOUNDS, { maxFrames: 145 });
    await expect(validate(b, t2vJob({ frames: 121 }))).resolves.toBeTruthy();
    await expect(validate(b, t2vJob({ frames: 241 }))).rejects.toMatchObject(refused); // 10 s, but over 145
    await expect(validate(bundle({}, V26_BOUNDS, { maxFrames: 0 }), t2vJob())).rejects.toMatchObject(refused); // malformed
  });

  it('N3: output is one of the node\'s two kinds (OutputKind: exr-sequence, exr-frames)', async () => {
    for (const output of ['exr-sequence', 'exr-frames']) await expect(validate(bundle(), alphaJob({ output }))).resolves.toBeTruthy();
    for (const output of ['mp4', 'EXR-FRAMES', 'exr-movie', '', undefined]) await expect(validate(bundle(), alphaJob({ output }))).rejects.toMatchObject(refused);
  });
});

describe('L4 — every job runs on its own template\'s model', () => {
  it('M1: ltxModelIdFor reproduces the registered ids', () => {
    const known: Record<string, string> = {
      'ltx-t2v-hdr': '0xd1960cd5073ff50278a61fd5a10dc40f14a06297b4359b58a83e9c8767201a84',
      'ltx-i2v-hdr': '0x36463775eaf8320e499cae855b0248f77e4e920687d9836defb177cea833debb',
      'ltx-flf2v-hdr': '0x754e35055d7d24b448cab8c5d314c407b6fdf720f90bf33f5213f88730f2050d',
      'ltx-alpha-hdr': '0x0b134c8911722f9945eca58f9fdc7fa3e412f25973600a5a1ec50acc68a1c495',
      'ltx-layout-hdr': '0xed9d14af2917130759428682f91ec4d6aa922be81004eba315be1c5458b814a5',
    };
    for (const [t, id] of Object.entries(known)) expect((entry as any).ltxModelIdFor(t)).toBe(id);
    for (const bad of ['', '\uD800']) expect(() => (entry as any).ltxModelIdFor(bad)).toThrow(LtxError); // never a bare TypeError
  });

  function manager(configured: string) {
    const b = bundle();
    const resolveModelPricePerToken = vi.fn(async () => 1000n);
    const startSession = vi.fn(async () => ({ sessionId: 7n, jobId: 7n }));
    const registerExternalSession = vi.fn();
    const submitLtx = vi.fn();
    const getByCID = vi.fn(async () => b);
    const getTokenMinDeposit = vi.fn(async () => 1n);
    const m = new LtxManager({
      sessionManager: { resolveModelPricePerToken, startSession, registerExternalSession, submitLtx },
      storageManager: { getByCID }, paymentManager: { getTokenMinDeposit },
      hostManager: { getHostInfo: vi.fn(async () => ({ metadata: { ltx: meta(b) } })) }, // 1.39.4: estimateCost reads the entry
      ltxModelId: configured, usdcAddress: '0xabc', chainId: 84532,
    } as any);
    return { m, b, resolveModelPricePerToken, startSession, registerExternalSession, submitLtx, getByCID };
  }

  it('M2: a legacy config.ltxModelId of another template is ignored on every path (round 2 — no pin)', async () => {
    const h = manager(modelOf('ltx-t2v-hdr'));
    await h.m.estimateCost(alphaJob(), '0xhost');
    expect(h.resolveModelPricePerToken).toHaveBeenCalledWith('0xhost', modelOf('ltx-alpha-hdr'), '0xabc');
    await h.m.createLtxSession(alphaJob(), '0xhost', meta(h.b));
    expect(h.startSession).toHaveBeenCalledWith(expect.objectContaining({ modelId: modelOf('ltx-alpha-hdr') }));
    // card-paid: the vault was debited before generate(); the node checks the on-chain session's model, so the SDK
    // must not refuse here — it registers the job's own model and submits
    h.submitLtx.mockResolvedValue({ requestId: 'r', cancel() {}, result: Promise.reject(new Error('stop')) });
    await h.m.generate(alphaJob(), '0xhost', meta(h.b), { existingSession: { sessionId: 5n, jobId: 6n }, endpoint: 'http://node:8080', chainId: 84532 }).catch(() => {});
    expect(h.registerExternalSession).toHaveBeenCalledWith(expect.objectContaining({ model: modelOf('ltx-alpha-hdr') }));
    expect(h.submitLtx).toHaveBeenCalled();
  });

  it('M4: each job runs on its own template\'s model — one manager serves every template', async () => {
    const h = manager(undefined as any);
    await h.m.estimateCost(alphaJob(), '0xhost');
    await h.m.estimateCost(t2vJob(), '0xhost');
    expect(h.resolveModelPricePerToken.mock.calls.map((c: any[]) => c[1])).toEqual([modelOf('ltx-alpha-hdr'), modelOf('ltx-t2v-hdr')]);
    await h.m.createLtxSession(alphaJob(), '0xhost', meta(h.b));
    expect(h.startSession).toHaveBeenCalledWith(expect.objectContaining({ modelId: modelOf('ltx-alpha-hdr') }));
    h.submitLtx.mockResolvedValue({ requestId: 'r', cancel() {}, result: Promise.reject(new Error('stop')) });
    await h.m.generate(alphaJob(), '0xhost', meta(h.b), { existingSession: { sessionId: 5n, jobId: 6n }, endpoint: 'http://node:8080', chainId: 84532 }).catch(() => {});
    expect(h.registerExternalSession).toHaveBeenCalledWith(expect.objectContaining({ model: modelOf('ltx-alpha-hdr') }));
  });

  it('M5: an unusable templateId is an LtxError on both paths, with the session ids on the vault path', async () => {
    const h = manager(undefined as any);
    for (const templateId of ['', '\uD800']) {
      const escrow = await h.m.estimateCost(alphaJob({ templateId }), '0xhost').catch((e) => e);
      expect(escrow).toBeInstanceOf(LtxError);
      expect(escrow).toMatchObject(refused);
      const vault = await h.m.generate(alphaJob({ templateId }), '0xhost', meta(h.b), { existingSession: { sessionId: 5n, jobId: 6n }, endpoint: 'http://node:8080', chainId: 84532 }).catch((e) => e);
      expect(vault).toMatchObject({ ...refused, details: { sessionId: 5n, jobId: 6n } });
    }
    expect(h.resolveModelPricePerToken).not.toHaveBeenCalled();
  });

  it('M6: the SDK builds an LtxManager without config.ltxModelId', async () => {
    const sdk = realSdk({
      sessionManager: {}, storageManager: {}, paymentManager: {}, hostManager: {}, currentChainId: 84532,
      contractManager: { getContractAddress: async () => '0xusdc' },
    });
    await sdk.buildSidecarManagers(false, false);
    expect(sdk.ltxManager).toBeInstanceOf(LtxManager);
  });
});

describe('L5 — the node\'s own code reaches generate() callers', () => {
  it('E3: a post-escrow node refusal keeps details.nodeCode alongside the session ids', async () => {
    const b = bundle();
    const refusal = new LtxError('session model differs', 'GENERATION_FAILED', { nodeCode: 'TEMPLATE_MODEL_MISMATCH' });
    const m = new LtxManager({
      sessionManager: {
        resolveModelPricePerToken: vi.fn(async () => 1000n),
        startSession: vi.fn(async () => ({ sessionId: 7n, jobId: 8n })),
        submitLtx: vi.fn(async () => ({ requestId: 'r', cancel() {}, result: Promise.reject(refusal) })),
      },
      storageManager: { getByCID: vi.fn(async () => b) }, paymentManager: { getTokenMinDeposit: vi.fn(async () => 1n) },
      ltxModelId: modelOf('ltx-alpha-hdr'), usdcAddress: '0xabc', chainId: 84532,
    } as any);
    const err = await m.generate(alphaJob(), '0xhost', meta(b)).catch((e) => e);
    expect(err).toMatchObject({ code: 'GENERATION_FAILED', details: { sessionId: 7n, jobId: 8n, nodeCode: 'TEMPLATE_MODEL_MISMATCH' } });
  });

  it('E4: an error of another type that carries a nodeCode keeps it through generate()', async () => {
    const b = bundle();
    const denied = new SDKError('session authorisation denied', 'SESSION_AUTH_DENIED', { nodeCode: 'SESSION_AUTH_DENIED', sessionId: '7' });
    const m = new LtxManager({
      sessionManager: {
        resolveModelPricePerToken: vi.fn(async () => 1000n),
        startSession: vi.fn(async () => ({ sessionId: 7n, jobId: 8n })),
        submitLtx: vi.fn(async () => { throw denied; }),
      },
      storageManager: { getByCID: vi.fn(async () => b) }, paymentManager: { getTokenMinDeposit: vi.fn(async () => 1n) },
      usdcAddress: '0xabc', chainId: 84532,
    } as any);
    const err = await m.generate(alphaJob(), '0xhost', meta(b)).catch((e) => e);
    expect(err).toMatchObject({ code: 'GENERATION_FAILED', details: { nodeCode: 'SESSION_AUTH_DENIED', sessionId: 7n, jobId: 8n } });
  });

  it('E5: nothing else from the error\'s details is copied (a raw WS error is circular)', async () => {
    const b = bundle();
    const socketEvent: any = { type: 'error' }; socketEvent.target = { onerror: socketEvent }; // circular, like a WS event
    const broken = new SDKError('WebSocket send failed', 'WS_SEND_FAILED', { originalError: socketEvent });
    const m = new LtxManager({
      sessionManager: {
        resolveModelPricePerToken: vi.fn(async () => 1000n),
        startSession: vi.fn(async () => ({ sessionId: 7n, jobId: 8n })),
        submitLtx: vi.fn(async () => { throw broken; }),
      },
      storageManager: { getByCID: vi.fn(async () => b) }, paymentManager: { getTokenMinDeposit: vi.fn(async () => 1n) },
      usdcAddress: '0xabc', chainId: 84532,
    } as any);
    const err = await m.generate(alphaJob(), '0xhost', meta(b)).catch((e) => e);
    expect(err.details).toEqual({ sessionId: 7n, jobId: 8n });
  });
});

it('C1 — capability flags and the root export', () => {
  expect((entry as any).SDK_CAPABILITIES.ltxEntryFpsAndResolutionRule).toBe(true);
  expect((entry as any).SDK_CAPABILITIES.ltxModelFromTemplate).toBe(true);
  expect(typeof (entry as any).ltxModelIdFor).toBe('function');
});
