// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * IMPLEMENTATION-CONFIDENTIAL-HOSTS (1.39.19): one allowlist, `confidentialHosts`, for every job that puts keys in the
 * host's hands — an encrypted transcode, every LTX job, every training job. Fail closed: with no list, none of them goes.
 * Checked before any session is funded or adopted, and again at the one submit choke point.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { LtxManager } from '../../src/managers/LtxManager';
import { TrainingManager } from '../../src/managers/TrainingManager';
import { SDK_CAPABILITIES } from '../../src/capabilities';
import { LTX_ERROR_CODES } from '../../src/errors/ltx-errors';
import { TRAINING_ERROR_CODES } from '../../src/errors/training-errors';
import { submitLtxWs } from '../../src/utils/ltx-ws';
import { submitTrainingWs } from '../../src/utils/training-ws';
import { submitTranscodeWs } from '../../src/utils/transcode-ws';
import { FakeWebSocket, stubNodeVersion } from '../helpers/session-doubles';
import { MODEL, HOST, JOB } from '../training/fixtures';

vi.mock('../../src/utils/ltx-ws', async (o) => ({ ...(await o<typeof import('../../src/utils/ltx-ws')>()), submitLtxWs: vi.fn() }));
vi.mock('../../src/utils/training-ws', async (o) => ({ ...(await o<typeof import('../../src/utils/training-ws')>()), submitTrainingWs: vi.fn() }));
vi.mock('../../src/utils/transcode-ws', async (o) => ({ ...(await o<typeof import('../../src/utils/transcode-ws')>()), submitTranscodeWs: vi.fn() }));

const OTHER = '0x' + '77'.repeat(20);
const pending = () => ({ taskId: 't', requestId: 'r', cancel: vi.fn(), result: new Promise(() => {}), slices: [], pointers: [], forfeitedSlices: [] });

function manager(list: string[] | null = [HOST]) {
  const mgr: any = new SessionManager({} as any, { storeConversation: vi.fn() } as any);
  mgr.encryptionManager = { encryptMessage: vi.fn(), decryptMessage: vi.fn() };
  vi.spyOn(mgr, 'sendEncryptedInit').mockImplementation(async () => new Uint8Array(32).fill(9));
  mgr.setSessionJobReader(() => ({ getSessionJobOnChain: vi.fn(async () => ({ startTime: BigInt(Math.floor(Date.now() / 1000)), maxDuration: 3600n })) }));
  mgr.registerExternalSession({ sessionId: 1600n, jobId: 3200n, endpoint: 'https://host1.fabstir.test', hostAddress: HOST, model: MODEL, chainId: 84532 });
  if (list) mgr.setConfidentialHosts(list);
  return mgr;
}

beforeEach(() => {
  FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket); stubNodeVersion();
  for (const m of [submitLtxWs, submitTrainingWs, submitTranscodeWs]) { vi.mocked(m).mockReset(); vi.mocked(m).mockImplementation(async () => pending() as any); }
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('C3: every LTX and training job is confidential', () => {
  it.each([
    ['LTX', (m: any) => m.submitLtx('1600', { seed: '1' } as any)],
    ['training', (m: any) => m.submitTraining('1600', JOB as any)],
  ])('%s: no list → refused before any socket (fail closed)', async (_l, submit) => {
    const mgr = manager(null);
    await expect(submit(mgr)).rejects.toMatchObject({ code: 'CONFIDENTIAL_HOST_NOT_ALLOWED', details: { reason: 'NO_ALLOWLIST', host: HOST } });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it.each([
    ['LTX', (m: any) => m.submitLtx('1600', { seed: '1' } as any), submitLtxWs],
    ['training', (m: any) => m.submitTraining('1600', JOB as any), submitTrainingWs],
  ])('%s: an unlisted host is refused; a listed one is sent', async (_l, submit, ws) => {
    await expect(submit(manager([OTHER]))).rejects.toMatchObject({ code: 'CONFIDENTIAL_HOST_NOT_ALLOWED', details: { reason: 'HOST_NOT_ALLOWED' } });
    await expect(submit(manager([HOST]))).resolves.toBeDefined();
    expect(ws).toHaveBeenCalledTimes(1);
  });

  it('a record swapped mid-submit is refused for LTX too', async () => {
    const mgr = manager();
    mgr.jobCompletionNodes.set('1600', true);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const realInit = mgr.sendEncryptedInit.getMockImplementation();
    mgr.sendEncryptedInit.mockImplementation(async (...a: any[]) => { await gate; return realInit(...a); });
    const p = mgr.submitLtx('1600', { seed: '1' } as any).catch((e: any) => e);
    await new Promise((r) => setTimeout(r, 0));
    mgr.registerExternalSession({ sessionId: 1600n, jobId: 3200n, endpoint: 'https://evil.test', hostAddress: OTHER, model: MODEL, chainId: 84532 });
    release();
    expect(await p).toMatchObject({ details: { reason: 'SESSION_CHANGED' } });
    expect(submitLtxWs).not.toHaveBeenCalled();
  });

  it('review 1: re-adopting the same session for the same host mid-submit is NOT a swap (no false SESSION_CHANGED)', async () => {
    const mgr = manager();
    mgr.jobCompletionNodes.set('1600', true);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const realInit = mgr.sendEncryptedInit.getMockImplementation();
    mgr.sendEncryptedInit.mockImplementation(async (...a: any[]) => { await gate; return realInit(...a); });
    const p = mgr.submitLtx('1600', { seed: '1' } as any).catch((e: any) => e);
    await new Promise((r) => setTimeout(r, 0));
    mgr.registerExternalSession({ sessionId: 1600n, jobId: 3200n, endpoint: 'https://host1.fabstir.test', hostAddress: HOST, model: MODEL, chainId: 84532 });
    release();
    const out = await p;
    expect(out?.code).not.toBe('SESSION_CHANGED');
    expect(submitLtxWs).toHaveBeenCalledTimes(1);
  });

  it('review 1: the same host at a different endpoint IS a swap (the job would go elsewhere)', async () => {
    const mgr = manager();
    mgr.jobCompletionNodes.set('1600', true);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const realInit = mgr.sendEncryptedInit.getMockImplementation();
    mgr.sendEncryptedInit.mockImplementation(async (...a: any[]) => { await gate; return realInit(...a); });
    const p = mgr.submitTraining('1600', JOB as any).catch((e: any) => e);
    await new Promise((r) => setTimeout(r, 0));
    mgr.registerExternalSession({ sessionId: 1600n, jobId: 3200n, endpoint: 'https://elsewhere.test', hostAddress: HOST, model: MODEL, chainId: 84532 });
    release();
    expect(await p).toMatchObject({ details: { reason: 'SESSION_CHANGED' } });
    expect(submitTrainingWs).not.toHaveBeenCalled();
  });

  it('transcode keeps its rule under the new name: encrypted refused unlisted, plain open', async () => {
    await expect(manager(null).submitTranscode('1600', 's5://uPlain', [] as any)).rejects.toMatchObject({ code: 'CONFIDENTIAL_HOST_NOT_ALLOWED', details: { reason: 'NO_ALLOWLIST' } });
    await expect(manager(null).submitTranscode('1600', 's5://uPlain', [] as any, { isEncrypted: false })).resolves.toBeDefined();
  });
});

describe('C4: the managers refuse before anything is funded or adopted', () => {
  const refusingSm = () => {
    const sm: any = new SessionManager({} as any, {} as any);
    sm.setConfidentialHosts([HOST]);
    sm.startSession = vi.fn(); sm.registerExternalSession = vi.fn();
    return sm;
  };

  it('LtxManager.generate (fresh) → LtxError, no session funded', async () => {
    const sm = refusingSm();
    const lm = new LtxManager({ sessionManager: sm, paymentManager: {} as any, chainId: 84532 } as any);
    const err: any = await lm.generate({ seed: '1' } as any, OTHER, {} as any).catch((e) => e);
    expect(err.name).toBe('LtxError');
    expect(err).toMatchObject({ code: 'CONFIDENTIAL_HOST_NOT_ALLOWED', details: { reason: 'HOST_NOT_ALLOWED', host: OTHER } });
    expect(sm.startSession).not.toHaveBeenCalled();
  });

  it('LtxManager.generate (existingSession) → LtxError with the ids, nothing registered', async () => {
    const sm = refusingSm();
    const lm = new LtxManager({ sessionManager: sm, paymentManager: {} as any, chainId: 84532 } as any);
    const err: any = await lm.generate({ seed: '1' } as any, OTHER, {} as any,
      { existingSession: { sessionId: 1600n, jobId: 3200n }, endpoint: 'https://h.test', chainId: 84532 } as any).catch((e) => e);
    expect(err).toMatchObject({ code: 'CONFIDENTIAL_HOST_NOT_ALLOWED', details: { sessionId: 1600n, jobId: 3200n } });
    expect(sm.registerExternalSession).not.toHaveBeenCalled();
  });

  it.each([
    ['fresh', {}],
    ['existingSession', { existingSession: { sessionId: 1600n, jobId: 3200n }, endpoint: 'https://h.test', chainId: 84532 }],
  ])('TrainingManager.submitTraining (%s) → TrainingError, consumed: false, nothing funded or registered', async (_l, extra) => {
    const sm = refusingSm();
    const tm = new TrainingManager({ sessionManager: sm, trainingModelId: MODEL, chainId: 84532 } as any);
    const err: any = await tm.submitTraining({ job: JOB, hostAddress: OTHER, bundle: {}, ...extra } as any).catch((e) => e);
    expect(err.name).toBe('TrainingError');
    expect(err.code).toBe('CONFIDENTIAL_HOST_NOT_ALLOWED');
    expect(err.detail).toMatchObject({ consumed: false, reason: 'HOST_NOT_ALLOWED', host: OTHER });
    expect(sm.startSession).not.toHaveBeenCalled();
    expect(sm.registerExternalSession).not.toHaveBeenCalled();
  });
});

describe('review 2/3: the managers relay a submit-time refusal, and training load balancing filters first', () => {
  const refusal = (code: string, reason: string) => Object.assign(new Error(`refused: ${reason}`), { code, details: { reason, host: OTHER, job: 'x', retryable: false } });

  it('TrainingManager: a submit-time CONFIDENTIAL_HOST_NOT_ALLOWED keeps its code, consumed: false; SESSION_CHANGED is a same-session retry', () => {
    const tag = { sessionId: 1600n, jobId: 3200n, adopted: true };
    const a: any = (TrainingManager as any).withSessionIds(refusal('CONFIDENTIAL_HOST_NOT_ALLOWED', 'HOST_NOT_ALLOWED'), tag, true);
    expect(a).toMatchObject({ code: 'CONFIDENTIAL_HOST_NOT_ALLOWED' });
    expect(a.detail).toMatchObject({ consumed: false, reason: 'HOST_NOT_ALLOWED', sessionId: 1600n });
    const b: any = (TrainingManager as any).withSessionIds(refusal('SESSION_CHANGED', 'SESSION_CHANGED'), tag, true);
    expect(b.code).not.toBe('ESTIMATE_MISMATCH');
    expect(b.detail).toMatchObject({ consumed: false, sdkCode: 'SESSION_CHANGED' });
  });

  it('LtxManager.generate: a submit-time CONFIDENTIAL_HOST_NOT_ALLOWED keeps its code (not GENERATION_FAILED)', async () => {
    const sm = { assertConfidentialHost: () => {}, submitLtx: vi.fn(async () => { throw refusal('CONFIDENTIAL_HOST_NOT_ALLOWED', 'HOST_NOT_ALLOWED'); }) };
    const lm: any = new LtxManager({ sessionManager: sm } as any);
    lm.adoptExistingSession = vi.fn(async () => ({ sessionId: 1600n, jobId: 3200n, entry: {} }));
    lm.clientWait = vi.fn(() => ({}));
    const err: any = await lm.generate({ seed: '1' }, OTHER, {} as any, { existingSession: { sessionId: 1600n, jobId: 3200n } } as any).catch((e: any) => e);
    expect(err).toMatchObject({ code: 'CONFIDENTIAL_HOST_NOT_ALLOWED', details: { reason: 'HOST_NOT_ALLOWED', sessionId: 1600n } });
  });

  it('TrainingManager.submitTrainingWithLoadBalancing: unlisted hosts do not use up the retry slots', async () => {
    const sm: any = new SessionManager({} as any, {} as any);
    sm.setConfidentialHosts([HOST]);
    const tm: any = new TrainingManager({ sessionManager: sm, trainingModelId: MODEL, chainId: 84532 } as any);
    const hosts = [1, 2, 3].map((n) => ({ host: { address: '0x' + String(n).repeat(40), apiUrl: `https://u${n}.test` } })).concat([{ host: { address: HOST, apiUrl: 'https://listed.test' } }]);
    tm.setHostSelectionService({ getRankedHostsForModel: vi.fn(async () => hosts) });
    tm.validateAgainstBundle = vi.fn();
    const tried: string[] = [];
    tm.submitTraining = vi.fn(async (o: any) => { tried.push(o.hostAddress); return { requestId: 'r' }; });
    await tm.submitTrainingWithLoadBalancing({ job: JOB, bundle: {} } as any, { maxHostRetries: 3 });
    expect(tried).toEqual([HOST]);
  });
});

describe('C1/C6: config, codes and flag', () => {
  const base = async () => {
    const { ChainRegistry } = await import('../../src/config/ChainRegistry');
    const { ChainId } = await import('../../src/types/chain.types');
    return { mode: 'production' as const, chainId: ChainId.BASE_SEPOLIA, rpcUrl: 'https://rpc.invalid', contractAddresses: { ...ChainRegistry.getChain(ChainId.BASE_SEPOLIA).contracts } };
  };

  it('confidentialHosts is validated; the 1.39.18 transcode.encryptedHosts is refused with the new name, never ignored', async () => {
    const { FabstirSDKCore } = await import('../../src/FabstirSDKCore');
    const b = await base();
    expect(() => new FabstirSDKCore({ ...b, confidentialHosts: [HOST] } as any)).not.toThrow();
    expect(() => new FabstirSDKCore({ ...b, confidentialHosts: ['host1'] } as any)).toThrow(expect.objectContaining({ code: 'INVALID_CONFIDENTIAL_HOSTS' }));
    expect(() => new FabstirSDKCore({ ...b, transcode: { encryptedHosts: [HOST] } } as any)).toThrow(expect.objectContaining({ code: 'CONFIG_RENAMED', message: expect.stringContaining('confidentialHosts') }));
  });

  it("the SDK hands its confidentialHosts and the read-provider session reader to the SessionManager it builds", async () => {
    const { FabstirSDKCore } = await import('../../src/FabstirSDKCore');
    const sdk: any = new FabstirSDKCore({ ...(await base()), confidentialHosts: [HOST] } as any);
    const sm: any = new SessionManager({} as any, {} as any);
    sdk.wireSessionManagerPolicy(sm);
    expect(sm.getConfidentialHosts()).toEqual([HOST.toLowerCase()]);
    expect(typeof sm.sessionJobReader).toBe('function');
    expect(() => sm.sessionJobReader(5611)).toThrow(expect.objectContaining({ code: 'CHAIN_MISMATCH' }));
    const none: any = new FabstirSDKCore(await base() as any);
    const sm2: any = new SessionManager({} as any, {} as any);
    none.wireSessionManagerPolicy(sm2);
    expect(sm2.getConfidentialHosts()).toBeUndefined();   // none configured: confidential jobs refused
  });

  it('the code is in the LTX and training lists, and the flag is set', () => {
    expect(LTX_ERROR_CODES).toContain('CONFIDENTIAL_HOST_NOT_ALLOWED');
    expect(TRAINING_ERROR_CODES).toContain('CONFIDENTIAL_HOST_NOT_ALLOWED');
    expect((SDK_CAPABILITIES as any).confidentialHosts).toBe(true);
  });
});
