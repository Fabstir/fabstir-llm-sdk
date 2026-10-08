// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// VFX Passes, bundle v27 (docs/development/IMPLEMENTATION-VFX-PASSES.md): the model family comes from the entry's
// `sidecar` (V1, V2), the relight rules (V3, V4), and createLtxSession's optional proofTimeoutWindow (V5).
// V15 (docs/development/IMPLEMENTATION-LONG-VIDEO-SESSIONS.md): sessionDuration and the passes client wait (1.39.6).
import { describe, it, expect, vi } from 'vitest';
import { ethers } from 'ethers';
import bundleFixture from './bundle-fixture.json';
import { canonicalBundleHash, ltxModelIdFor } from '../../src/utils/ltx-utils';
import { LtxManager } from '../../src/managers/LtxManager';
import { SessionManager } from '../../src/managers/SessionManager';
import { LtxError } from '../../src/errors/ltx-errors';
import * as entry from '../../src/index';

const T2V = bundleFixture.templates[0];
const refused = { code: 'LTX_PREVALIDATION_FAILED' };
/** Registered on host 1 and approved on-chain (read-only probe, 2026-10-07). */
const PASSES_IDS: Record<string, string> = {
  'cosmos-passes-key': '0x54ab12370f7426db759f6b0df01cbffbeea55753d4aceef23657406d7494fae0',
  'cosmos-passes-std': '0x01d3a8502c21c9e92deb1218c47a4f983f28a2308e32049602d5ba78a8311fab',
  'cosmos-passes-full': '0xc003ede527a0d0bbd4ef7759c509890fc5b9a6eb379e3d4762b2e92518605580',
};
const LTX_T2V_ID = '0xd1960cd5073ff50278a61fd5a10dc40f14a06297b4359b58a83e9c8767201a84';
/** The live v27 passes entry (host 1, 2026-10-07). */
const PASSES = {
  templateId: 'cosmos-passes-key', templateHash: '0xfadcb1b1e26452782fc899128e25db940db255753d32c39694b30d163967e571',
  imageInputs: 0, videoInputs: 1, videoSemantics: ['sourceVideo'], fps: [24, 25], maxFrames: 145,
  resolutionRule: 'relight-fhd', exactControl: true, frameGrid: true, sidecar: 'relight',
};
const BOUNDS = {
  frames: { min: 121, max: 751 }, fps: [24, 25, 48, 50],
  resolutions: [[768, 512], [1280, 720], [1920, 1080], [1024, 1024], [1920, 1088], [1088, 1920]].map(([w, h]) => ({ w, h })),
  videoMaxBytes: 134217728, videoFormats: ['mp4'],
};

function bundle(passesOver: Record<string, unknown> = {}, bounds: Record<string, unknown> = BOUNDS) {
  const { bundleHash: _drop, ...rest } = bundleFixture as any;
  const b: any = { ...rest, allowListVersion: 27, bounds, templates: [T2V, { ...PASSES, ...passesOver }] };
  b.bundleHash = canonicalBundleHash(b);
  return b;
}
const meta = (b: any) => ({ allowListVersion: 27, bundleHash: b.bundleHash, bundleCID: 'bCid' });
const passesJob = (over: Record<string, unknown> = {}) => ({
  templateId: PASSES.templateId, templateHash: PASSES.templateHash, prompt: '', seed: '1', frames: 121, fps: 24,
  resolution: { w: 1920, h: 1088 }, lora: 'cosmos-passes-key@v1', output: 'exr-frames', videos: ['uSrc'], ...over,
}) as any;
const t2vJob = (over: Record<string, unknown> = {}) => ({
  templateId: T2V.templateId, templateHash: T2V.templateHash, prompt: 'a corridor', seed: '1', frames: 121, fps: 24,
  resolution: { w: 1920, h: 1088 }, lora: 'ltx-iclora-hdr@v1', output: 'exr-sequence', ...over,
}) as any;

function manager(b = bundle()) {
  const resolveModelPricePerToken = vi.fn(async () => 1000n);
  const startSession = vi.fn(async () => ({ sessionId: 7n, jobId: 7n }));
  const registerExternalSession = vi.fn();
  const submitLtx = vi.fn(async () => ({ requestId: 'r', cancel() {}, result: Promise.reject(new Error('stop')) }));
  const getByCID = vi.fn(async () => b);
  const getHostInfo = vi.fn(async () => ({ metadata: { ltx: meta(b) } }));
  const m = new LtxManager({
    sessionManager: { resolveModelPricePerToken, startSession, registerExternalSession, submitLtx },
    storageManager: { getByCID }, paymentManager: { getTokenMinDeposit: vi.fn(async () => 1n) },
    hostManager: { getHostInfo }, usdcAddress: '0xabc', chainId: 84532,
  } as any);
  return { m, b, resolveModelPricePerToken, startSession, registerExternalSession, submitLtx, getByCID, getHostInfo };
}
const validate = (b: any, job: any) => manager(b).m.validateJob(job, meta(b));

describe('V1/V2 — the model family comes from the entry\'s sidecar', () => {
  it('F1: ltxModelIdFor with "relight" gives the NVIDIA ids registered on host 1', () => {
    for (const [t, id] of Object.entries(PASSES_IDS)) expect(ltxModelIdFor(t, 'relight')).toBe(id);
  });

  it('F2: no sidecar keeps the Lightricks ids; an unknown sidecar is an LtxError', () => {
    expect(ltxModelIdFor('ltx-t2v-hdr')).toBe(LTX_T2V_ID);
    expect(ltxModelIdFor('ltx-t2v-hdr', undefined)).toBe(LTX_T2V_ID);
    for (const sidecar of ['other', '', 'Relight']) expect(() => ltxModelIdFor('cosmos-passes-key', sidecar)).toThrow(LtxError);
  });

  it('F3: estimateCost with hostMetadata prices a passes job on its NVIDIA model (and t2v on Lightricks)', async () => {
    const h = manager();
    await h.m.estimateCost(passesJob(), '0xhost', '0xabc', meta(h.b));
    await h.m.estimateCost(t2vJob(), '0xhost', '0xabc', meta(h.b));
    expect(h.resolveModelPricePerToken.mock.calls.map((c: any[]) => c[1])).toEqual([PASSES_IDS['cosmos-passes-key'], LTX_T2V_ID]);
    expect(h.getHostInfo).not.toHaveBeenCalled();
  });

  it('F4: without hostMetadata it reads the host\'s current bundle; a template not in it is refused before any price read', async () => {
    const h = manager();
    await h.m.estimateCost(passesJob(), '0xhost');
    expect(h.getHostInfo).toHaveBeenCalledWith('0xhost');
    expect(h.resolveModelPricePerToken).toHaveBeenCalledWith('0xhost', PASSES_IDS['cosmos-passes-key'], '0xabc');
    const g = manager();
    await expect(g.m.estimateCost(passesJob({ templateId: 'cosmos-passes-nope' }), '0xhost')).rejects.toMatchObject(refused);
    expect(g.resolveModelPricePerToken).not.toHaveBeenCalled();
  });

  it('F5: escrow and vault paths open / register a passes session on the NVIDIA model', async () => {
    const h = manager();
    await h.m.createLtxSession(passesJob(), '0xhost', meta(h.b));
    expect(h.startSession).toHaveBeenCalledWith(expect.objectContaining({ modelId: PASSES_IDS['cosmos-passes-key'] }));
    expect(h.resolveModelPricePerToken).toHaveBeenCalledWith('0xhost', PASSES_IDS['cosmos-passes-key'], '0xabc');
    await h.m.generate(passesJob(), '0xhost', meta(h.b), { existingSession: { sessionId: 5n, jobId: 6n }, endpoint: 'http://node:8080', chainId: 84532 }).catch(() => {});
    expect(h.registerExternalSession).toHaveBeenCalledWith(expect.objectContaining({ model: PASSES_IDS['cosmos-passes-key'] }));
  });
});

describe('V3/V4 — relight rules', () => {
  it('R1: relight-fhd is exactly 1920x1088', async () => {
    await expect(validate(bundle(), passesJob())).resolves.toBeTruthy();
    // both sides count: a 1088-high size of another width, admitted by the bounds, is still refused
    const wide = bundle({}, { ...BOUNDS, resolutions: [...BOUNDS.resolutions, { w: 1280, h: 1088 }] });
    await expect(validate(wide, passesJob({ resolution: { w: 1280, h: 1088 } }))).rejects.toMatchObject({ ...refused, message: expect.stringContaining('relight-fhd') });
    for (const [w, h] of [[1088, 1920], [1920, 1080], [1024, 1024]]) {
      await expect(validate(bundle(), passesJob({ resolution: { w, h } }))).rejects.toMatchObject({ ...refused, message: expect.stringContaining('relight-fhd') });
    }
  });

  it('R2: a relight job must request exr-frames and carry no prompt; an LTX template is unaffected', async () => {
    await expect(validate(bundle(), passesJob({ output: 'exr-sequence' }))).rejects.toMatchObject({ ...refused, message: expect.stringContaining('exr-frames') });
    await expect(validate(bundle(), passesJob({ prompt: 'make it moody' }))).rejects.toMatchObject({ ...refused, message: expect.stringContaining('prompt') });
    await expect(validate(bundle(), t2vJob({ output: 'exr-sequence', prompt: 'a corridor' }))).resolves.toBeTruthy();
  });

  it('R3: an entry with an unknown sidecar is refused (the node refuses such a bundle at load)', async () => {
    await expect(validate(bundle({ sidecar: 'other' }), passesJob())).rejects.toMatchObject({ ...refused, message: expect.stringContaining('sidecar') });
  });
});

describe('V5 — createLtxSession\'s optional proofTimeoutWindow', () => {
  it('P1/P4: 3600 reaches startSession, from createLtxSession and through generate', async () => {
    const h = manager();
    await h.m.createLtxSession(passesJob(), '0xhost', meta(h.b), { proofTimeoutWindow: 3600 });
    expect(h.startSession.mock.calls[0][0]).toMatchObject({ proofTimeoutWindow: 3600 });
    await h.m.generate(passesJob(), '0xhost', meta(h.b), { proofTimeoutWindow: 3600 }).catch(() => {});
    expect(h.startSession.mock.calls[1][0]).toMatchObject({ proofTimeoutWindow: 3600 });
  });

  it('P2: absent, the startSession call carries no proofTimeoutWindow key (unchanged)', async () => {
    const h = manager();
    await h.m.createLtxSession(t2vJob(), '0xhost', meta(h.b));
    expect('proofTimeoutWindow' in h.startSession.mock.calls[0][0]).toBe(false);
  });

  it('P3: a window that is not an integer in 60..3600 is refused before the bundle read and any escrow', async () => {
    for (const proofTimeoutWindow of [59, 3601, 120.5, NaN, '3600', 0]) {
      const h = manager();
      await expect(h.m.createLtxSession(passesJob(), '0xhost', meta(h.b), { proofTimeoutWindow } as any)).rejects.toMatchObject(refused);
      expect(h.getByCID).not.toHaveBeenCalled();
      expect(h.startSession).not.toHaveBeenCalled();
    }
    for (const proofTimeoutWindow of [60, 3600]) {
      const h = manager();
      await expect(h.m.createLtxSession(passesJob(), '0xhost', meta(h.b), { proofTimeoutWindow })).resolves.toBeTruthy();
    }
  });

  it('P5 / S8: through the REAL SessionManager.startSession the window and the duration reach the payment manager (contract layers: wallet-path-onchain-args)', async () => {
    const b = bundle();
    const HOST = ethers.Wallet.createRandom().address;
    const signer: any = { provider: { getNetwork: async () => ({ chainId: 84532n }), getBlockNumber: async () => 1 }, getAddress: async () => `0x${'ee'.repeat(20)}` };
    const paymentManager: any = { isInitialized: () => true, createSessionJob: vi.fn(async () => 123), signer, getTokenMinDeposit: vi.fn(async () => 1n) };
    const storage: any = { isInitialized: () => true, storeConversation: vi.fn(async () => {}), appendMessage: vi.fn(async () => {}), assertConversationLogWritable: vi.fn(), getByCID: vi.fn(async () => b) };
    const hostManager: any = {
      getHostInfo: vi.fn(async () => ({ address: HOST, apiUrl: 'https://host1.fabstir.net', isActive: true, supportedModels: [PASSES_IDS['cosmos-passes-key']], stake: 0n, minPricePerToken: 904n })),
      resolveModelPricePerToken: vi.fn(async () => 904n),
      getModelPricing: vi.fn(async () => 904n),
    };
    const sm: any = new SessionManager(paymentManager, storage);
    sm.setHostManager(hostManager);
    await sm.initialize();
    const m = new LtxManager({ sessionManager: sm, storageManager: storage, paymentManager, hostManager, usdcAddress: `0x${'ab'.repeat(20)}`, chainId: 84532 } as any);
    await m.createLtxSession(passesJob(), HOST, meta(b), { proofTimeoutWindow: 3600, endpoint: 'https://host1.fabstir.net' });
    expect(paymentManager.createSessionJob).toHaveBeenCalledWith(expect.objectContaining({ proofTimeoutWindow: 3600, duration: 14400, modelId: PASSES_IDS['cosmos-passes-key'] }));
  });
});

describe('V10 — generate waits long enough for a passes job (round 1)', () => {
  it('T1: a passes job without timeoutMs waits 14,400,000 ms; an explicit value and LTX jobs are unchanged', async () => {
    const h = manager();
    await h.m.generate(passesJob(), '0xhost', meta(h.b), { proofTimeoutWindow: 3600 }).catch(() => {});
    expect(h.submitLtx.mock.calls[0][2]).toMatchObject({ timeoutMs: 14_400_000, proofTimeoutWindow: 3600 });
    await h.m.generate(passesJob(), '0xhost', meta(h.b), { timeoutMs: 2_800_000 }).catch(() => {});
    expect(h.submitLtx.mock.calls[1][2]).toMatchObject({ timeoutMs: 14_400_000 }); // round 2: a shorter wait is raised, as the helper does
    await h.m.generate(t2vJob(), '0xhost', meta(h.b)).catch(() => {});
    expect(h.submitLtx.mock.calls[2][2]?.timeoutMs).toBeUndefined();
    await h.m.generate(passesJob(), '0xhost', meta(h.b), { existingSession: { sessionId: 5n, jobId: 6n }, endpoint: 'http://node:8080', chainId: 84532 }).catch(() => {});
    expect(h.submitLtx.mock.calls[3][2]).toMatchObject({ timeoutMs: 14_400_000 }); // the card-paid render is just as long

    await h.m.generate(passesJob(), '0xhost', meta(h.b), { timeoutMs: 20_000_000 }).catch(() => {});
    expect(h.submitLtx.mock.calls[4][2]).toMatchObject({ timeoutMs: 20_000_000 }); // a longer wait is kept

    await h.m.generate(passesJob(), '0xhost', meta(h.b), { timeoutMs: NaN }).catch(() => {});
    expect(h.submitLtx.mock.calls[5][2]).toMatchObject({ timeoutMs: 14_400_000 }); // a caller's NaN is not a wait (round 3)
  });

  it('T3: on the vault path a model-id failure still carries the session ids (round 3)', async () => {
    // an authenticated entry whose templateId cannot be hashed (lone surrogate survives JSON + canonical hashing)
    const h = manager(bundle({ templateId: '\uD800' }));
    const err = await h.m.generate(passesJob({ templateId: '\uD800' }), '0xhost', meta(h.b),
      { existingSession: { sessionId: 5n, jobId: 6n }, endpoint: 'http://node:8080', chainId: 84532 }).catch((e) => e);
    expect(err).toMatchObject({ ...refused, details: { sessionId: 5n, jobId: 6n } });
    expect(h.registerExternalSession).not.toHaveBeenCalled();
  });

  it('T2: no bundle read after the session opens — the validated entry decides the wait (round 2)', async () => {
    const h = manager();
    const order: string[] = [];
    const resolve = (h.m as any).resolveBundle.bind(h.m);
    (h.m as any).resolveBundle = async (m: any) => { order.push('bundle'); return resolve(m); };
    h.startSession.mockImplementation(async () => { order.push('session'); return { sessionId: 7n, jobId: 7n }; });
    h.registerExternalSession.mockImplementation(() => { order.push('register'); });
    await h.m.generate(passesJob(), '0xhost', meta(h.b)).catch(() => {});
    await h.m.generate(passesJob(), '0xhost', meta(h.b), { existingSession: { sessionId: 5n, jobId: 6n }, endpoint: 'http://node:8080', chainId: 84532 }).catch(() => {});
    expect(order).toEqual(['bundle', 'session', 'bundle', 'register']);
  });
});

describe('V11 — a passes session defaults to the 3600 s proof window (1.39.5)', () => {
  it('W1: a passes job without a window opens its session with 3600 — via createLtxSession and generate', async () => {
    const h = manager();
    await h.m.createLtxSession(passesJob(), '0xhost', meta(h.b));
    expect(h.startSession.mock.calls[0][0]).toMatchObject({ proofTimeoutWindow: 3600 });
    await h.m.generate(passesJob(), '0xhost', meta(h.b)).catch(() => {});
    expect(h.startSession.mock.calls[1][0]).toMatchObject({ proofTimeoutWindow: 3600 });
  });

  it('W2: an explicit window wins', async () => {
    const h = manager();
    await h.m.createLtxSession(passesJob(), '0xhost', meta(h.b), { proofTimeoutWindow: 600 });
    expect(h.startSession.mock.calls[0][0]).toMatchObject({ proofTimeoutWindow: 600 });
  });

  it('W3/W4 / S6: an LTX job keeps the unchanged call; the vault path opens no session, whatever sessionDuration says', async () => {
    const h = manager();
    await h.m.createLtxSession(t2vJob(), '0xhost', meta(h.b));
    expect('proofTimeoutWindow' in h.startSession.mock.calls[0][0]).toBe(false);
    await h.m.generate(passesJob(), '0xhost', meta(h.b), { sessionDuration: 7200, existingSession: { sessionId: 5n, jobId: 6n }, endpoint: 'http://node:8080', chainId: 84532 }).catch(() => {});
    expect(h.startSession).toHaveBeenCalledTimes(1);
    expect(h.registerExternalSession).toHaveBeenCalled(); // the vault path ran (not an early throw)
  });
});

describe('V15 — sessionDuration and the passes client wait (1.39.6)', () => {
  it('S1: sessionDuration reaches startSession as duration — from createLtxSession and through generate', async () => {
    const h = manager();
    await h.m.createLtxSession(passesJob(), '0xhost', meta(h.b), { sessionDuration: 7200 });
    expect(h.startSession.mock.calls[0][0]).toMatchObject({ duration: 7200 });
    await h.m.generate(passesJob(), '0xhost', meta(h.b), { sessionDuration: 7200 }).catch(() => {});
    expect(h.startSession.mock.calls[1][0]).toMatchObject({ duration: 7200 });
  });

  it('S2: an LTX job without it keeps the unchanged call; with it, the value is sent', async () => {
    const h = manager();
    await h.m.createLtxSession(t2vJob(), '0xhost', meta(h.b));
    expect('duration' in h.startSession.mock.calls[0][0]).toBe(false);
    await h.m.createLtxSession(t2vJob(), '0xhost', meta(h.b), { sessionDuration: 900 });
    expect(h.startSession.mock.calls[1][0]).toMatchObject({ duration: 900 });
    expect('proofTimeoutWindow' in h.startSession.mock.calls[1][0]).toBe(false);
  });

  it('S3: a sessionDuration that is not a positive integer is refused before the bundle read and any escrow', async () => {
    for (const sessionDuration of [0, -1, 1.5, NaN, Infinity, '7200']) {
      const h = manager();
      await expect(h.m.createLtxSession(passesJob(), '0xhost', meta(h.b), { sessionDuration } as any)).rejects.toMatchObject({ ...refused, message: expect.stringContaining('sessionDuration') });
      expect(h.getByCID).not.toHaveBeenCalled();
      expect(h.startSession).not.toHaveBeenCalled();
    }
    const h = manager();
    await expect(h.m.createLtxSession(passesJob(), '0xhost', meta(h.b), { sessionDuration: 1 })).resolves.toBeTruthy();
  });

  it('S4: a passes job with nothing passed opens a 14400 s session with the 3600 s window', async () => {
    const h = manager();
    await h.m.createLtxSession(passesJob(), '0xhost', meta(h.b));
    expect(h.startSession.mock.calls[0][0]).toMatchObject({ duration: 14400, proofTimeoutWindow: 3600 });
    await h.m.generate(passesJob(), '0xhost', meta(h.b)).catch(() => {});
    expect(h.startSession.mock.calls[1][0]).toMatchObject({ duration: 14400, proofTimeoutWindow: 3600 });
  });

  it('S5: explicit values win, each on its own', async () => {
    const h = manager();
    await h.m.createLtxSession(passesJob(), '0xhost', meta(h.b), { sessionDuration: 9000 });
    expect(h.startSession.mock.calls[0][0]).toMatchObject({ duration: 9000, proofTimeoutWindow: 3600 });
    await h.m.createLtxSession(passesJob(), '0xhost', meta(h.b), { proofTimeoutWindow: 600 });
    expect(h.startSession.mock.calls[1][0]).toMatchObject({ duration: 14400, proofTimeoutWindow: 600 });
  });

  it('S7: a passes job waits at least as long as its session lives — the duration it opened with', async () => {
    const h = manager();
    await h.m.generate(passesJob(), '0xhost', meta(h.b), { sessionDuration: 28800, timeoutMs: 3_600_000 }).catch(() => {});
    expect(h.submitLtx.mock.calls[0][2]).toMatchObject({ timeoutMs: 28_800_000 }); // a longer session: a longer wait
    await h.m.generate(passesJob(), '0xhost', meta(h.b), { sessionDuration: 9000 }).catch(() => {});
    expect(h.submitLtx.mock.calls[1][2]).toMatchObject({ timeoutMs: 9_000_000 }); // past the session nothing is paid
    await h.m.generate(passesJob(), '0xhost', meta(h.b), { sessionDuration: 9000, existingSession: { sessionId: 5n, jobId: 6n }, endpoint: 'http://node:8080', chainId: 84532 }).catch(() => {});
    expect(h.submitLtx.mock.calls[2][2]).toMatchObject({ timeoutMs: 14_400_000 }); // vault: the card session's length is not ours
    await h.m.generate(passesJob(), '0xhost', meta(h.b), { existingSession: { sessionId: 5n, jobId: 6n, duration: 99n } as any, endpoint: 'http://node:8080', chainId: 84532 }).catch(() => {});
    expect(h.submitLtx.mock.calls[3][2]).toMatchObject({ timeoutMs: 14_400_000 }); // only the two ids are taken from existingSession
    await h.m.generate(passesJob(), '0xhost', meta(h.b), { timeoutMs: Infinity }).catch(() => {});
    expect(h.submitLtx.mock.calls[4][2]).toMatchObject({ timeoutMs: Infinity }); // the longest wait is kept (the timer holds it at its limit)
  });

  it('K4: generate keeps the closed-socket classification beside the session ids (and nothing raw)', async () => {
    const h = manager();
    const raw: any = { self: null }; raw.self = raw; // a circular WS error must not be relayed
    h.submitLtx.mockImplementationOnce(async () => ({ requestId: 'r', cancel() {}, result: Promise.reject(new LtxError('closed', 'GENERATION_FAILED', { reason: 'WS_CLOSED', closeCode: 1006, raw })) }));
    const err = await h.m.generate(passesJob(), '0xhost', meta(h.b)).catch((e) => e);
    expect(err).toBeInstanceOf(LtxError);
    expect(err.code).toBe('GENERATION_FAILED');
    expect(err.details).toEqual({ reason: 'WS_CLOSED', closeCode: 1006, sessionId: 7n, jobId: 7n });
  });
});

it('C1 — capability flags', () => {
  expect((entry as any).SDK_CAPABILITIES.ltxModelFamilyFromEntry).toBe(true);
  expect((entry as any).SDK_CAPABILITIES.ltxProofTimeoutWindow).toBe(true);
  expect((entry as any).SDK_CAPABILITIES.ltxRelightProofWindowDefault).toBe(true); // C2 (1.39.5)
  expect((entry as any).SDK_CAPABILITIES.ltxSessionDuration).toBe(true); // C3 (1.39.6)
});
