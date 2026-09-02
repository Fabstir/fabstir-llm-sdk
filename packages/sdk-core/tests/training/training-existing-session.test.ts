/**
 * `submitTraining({ existingSession })` — the vault / card-paid path, and the A.3 pre-flight
 * that only the SDK can make (SDK-REQUEST-TRAINING-EXISTING-SESSION.md).
 *
 * On the wallet path the SDK creates the session, so its parameters are right by construction.
 * On the vault path a service created it with ITS constants (today `maxDuration 3600 /
 * proofTimeoutWindow 300`), and the node's A.3 then rejects `train` AFTER escrow — the session
 * is spent, one `train` per session, the deposit waits on the zero-proof settle. Refusing
 * locally, before `train`, is the whole point; every refusal after adoption carries the ids the
 * UI relays to the service for reclaim.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TrainingManager, TRAIN_JOB_TIMEOUT_SECS, A3_MIN_PROOF_TIMEOUT_WINDOW_SECS,
} from '../../src/managers/TrainingManager';
import { MAX_PROOF_TIMEOUT } from '../../src/contracts/JobMarketplace';
import {
  TrainingError, ADOPTED_SESSION_PARAMS_REASON, EXISTING_SESSION_CONFIG_REASON, SESSION_DECODE_REASON,
} from '../../src/errors/training-errors';
import { MODEL, USDC, HOST, JOB, BUNDLE } from './fixtures';

const IDS = { sessionId: 1145n, jobId: 2290n };   // never equal — an id swap must be visible
const NOW = 1_800_000_000;

// A correctly shaped, funded, Active session: 10 USDC at 904 covers trainingTokens(JOB) = 9.6M.
const session = (over: Record<string, unknown> = {}) => ({
  id: 2290n, depositor: `0x${'dd'.repeat(20)}`, host: HOST, paymentToken: USDC,
  deposit: 10_000_000n, pricePerToken: 904n, tokensUsed: 0n,
  maxDuration: 14400n, startTime: BigInt(NOW - 100), lastProofTime: BigInt(NOW - 100),
  proofInterval: 1000n, proofTimeoutWindow: 3600n, status: 0, ...over,
});

function wired(over: Record<string, unknown> = {}) {
  const handle = { requestId: 'r', result: Promise.resolve({}), cancel: vi.fn(), slices: [], pointers: [], forfeitedSlices: [] };
  const sm = {
    resolveModelPricePerToken: vi.fn().mockResolvedValue(904n),
    registerExternalSession: vi.fn(),
    startSession: vi.fn(async () => ({ sessionId: 1n, jobId: 2n })),
    submitTraining: vi.fn(async () => handle),
  };
  const jm = {
    getMinTokensFee: vi.fn(), triggerSessionTimeout: vi.fn().mockResolvedValue({ hash: '0xtx' }),
    getSessionJobOnChain: vi.fn(async () => session()), getSessionModel: vi.fn(async () => MODEL),
  };
  const pm = { getTokenMinDeposit: vi.fn().mockResolvedValue(0n) };
  const m = new TrainingManager({
    sessionManager: sm, paymentManager: pm,
    jobMarketplace: jm, trainingModelId: MODEL, usdcAddress: USDC, chainId: 84532, ...over,
  } as never);
  return { m, sm, jm, pm, handle };
}
type Harness = ReturnType<typeof wired>;
const submit = (m: TrainingManager, extra: Record<string, unknown> = {}) => m.submitTraining({
  job: JOB, bundle: BUNDLE as never, hostAddress: HOST, endpoint: 'https://host2.fabstir.net', existingSession: IDS, ...extra,
} as never);
const failing = async (p: Promise<unknown>): Promise<TrainingError> => {
  try { await p; } catch (e) { return e as TrainingError; }
  throw new Error('expected rejection');
};

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW * 1000); });
afterEach(() => { vi.useRealTimers(); });

describe('existingSession — adopt, never create', () => {
  it('never calls startSession, seeds the registry with the six fields, then submits', async () => {
    const { m, sm } = wired();
    await submit(m);
    expect(sm.startSession).not.toHaveBeenCalled();
    expect(sm.registerExternalSession).toHaveBeenCalledWith({
      sessionId: 1145n, jobId: 2290n, endpoint: 'https://host2.fabstir.net', hostAddress: HOST, model: MODEL, chainId: 84532,
    });
    expect(sm.submitTraining).toHaveBeenCalledWith('1145', JOB, expect.objectContaining({
      onChainPricePerToken: '904', minAllowListVersion: 26, sliceTokens: 1_000_000,
    }));
    // seed BEFORE submit — the real SessionManager.submitTraining throws SESSION_NOT_FOUND otherwise
    expect(sm.registerExternalSession.mock.invocationCallOrder[0]).toBeLessThan(sm.submitTraining.mock.invocationCallOrder[0]);
  });

  it('reads the on-chain session by JOB id and keys the registry by SESSION id — the two are different numbers', async () => {
    const { m, jm, sm } = wired();
    await submit(m);
    expect(jm.getSessionJobOnChain).toHaveBeenCalledWith(2290n);
    expect(jm.getSessionModel).toHaveBeenCalledWith(2290n);
    expect(sm.submitTraining.mock.calls[0][0]).toBe('1145');
  });

  it('touches the wallet for nothing: no deposit sizing, no approval, no paymentManager call at all', async () => {
    const { m, pm } = wired();
    await submit(m);
    expect(pm.getTokenMinDeposit).not.toHaveBeenCalled();
  });

  it('still prices the job on chain, for the SESSION’s token — the over-claim guard must not trust the echo', async () => {
    const DAI = `0x${'da'.repeat(20)}`;                                   // ≠ the SDK's configured USDC
    const { m, sm, jm } = wired();
    jm.getSessionJobOnChain.mockResolvedValue(session({ paymentToken: DAI }));
    await submit(m);
    expect(sm.resolveModelPricePerToken).toHaveBeenCalledWith(HOST, MODEL, DAI);
  });

  it('stamps sessionId/jobId on the handle (both paths)', async () => {
    const { m } = wired();
    const h = await submit(m);
    expect(h.sessionId).toBe(1145n);
    expect(h.jobId).toBe(2290n);
    const w = await m.submitTraining({ job: JOB, bundle: BUNDLE as never, hostAddress: HOST } as never);
    expect(w.sessionId).toBe(1n);
    expect(w.jobId).toBe(2n);
  });

  it('the reclaim affordance works off the handle: triggerSessionTimeout(Number(handle.jobId))', async () => {
    const { m, jm } = wired();
    const h = await submit(m);
    await m.triggerSessionTimeout(Number(h.jobId));
    expect(jm.triggerSessionTimeout).toHaveBeenCalledWith(2290);
  });

  it('normalises the endpoint the way postSessionAuth does (Q8) — one string serves both', async () => {
    const { m, sm } = wired();
    await submit(m, { endpoint: 'HTTPS://host2.fabstir.net//' });
    expect(sm.registerExternalSession.mock.calls[0][0].endpoint).toBe('https://host2.fabstir.net');
  });

  it('funds the wallet-path session with a 14400 s LIFETIME under the key startSession actually reads (`duration`)', async () => {
    // Found in Round 3: the literal said `maxDuration: 14400`, but SessionConfig has only `duration`
    // and PaymentManager defaults a missing one to 3600 — every wallet-created training session was
    // being minted with a lifetime the node's A.3 rejects post-escrow. The mocked-startSession test
    // asserted the dead key and was green.
    const { m, sm } = wired();
    await m.submitTraining({ job: JOB, bundle: BUNDLE as never, hostAddress: HOST } as never);
    const args = sm.startSession.mock.calls[0][0];
    expect(args.duration).toBe(14400);
    expect(args).not.toHaveProperty('maxDuration');
  });

  it('honours opts.chainId on the wallet path too — one options type, one meaning', async () => {
    const { m, sm } = wired();
    await m.submitTraining({ job: JOB, bundle: BUNDLE as never, hostAddress: HOST, chainId: 5611 } as never);
    expect(sm.startSession.mock.calls[0][0].chainId).toBe(5611);
  });

  it('is accepted per call, never cached: the next call without it takes the wallet path', async () => {
    const { m, sm } = wired();
    await submit(m);
    await m.submitTraining({ job: JOB, bundle: BUNDLE as never, hostAddress: HOST } as never);
    expect(sm.startSession).toHaveBeenCalledTimes(1);
  });
});

describe('existingSession — guards run BEFORE any network', () => {
  it.each([
    'wss://host2.fabstir.net/v1/ws',            // not http(s)
    'https://proxy.example/?u=ws://host',       // ws:// substring anywhere
    'https://proxy.example/?u=wss://host',      // the wss:// clause is the ONLY guard for this shape
    'https://n.example/?token=abc',             // a query: the derivation appends /v1/ws AFTER it → socket at the root
    'https://n.example#f',
    undefined,
  ])('rejects endpoint %s with the ids, without reading the chain', async (endpoint) => {
    const { m, jm, sm } = wired();
    const e = await failing(submit(m, { endpoint }));
    expect(e.code).toBe('VALIDATION_FAILED');
    expect(e.detail).toMatchObject({ reason: EXISTING_SESSION_CONFIG_REASON, ...IDS });
    expect(e.isReshoppable(0)).toBe(false);                               // our wiring — another host cannot fix it
    expect(jm.getSessionJobOnChain).not.toHaveBeenCalled();
    expect(sm.registerExternalSession).not.toHaveBeenCalled();
  });

  it('a non-string endpoint (a URL object from a JS caller) is refused, not a TypeError', async () => {
    const { m } = wired();
    const e = await failing(submit(m, { endpoint: new URL('https://host2.fabstir.net') }));
    expect(e).toBeInstanceOf(TrainingError);
    expect(e.detail).toMatchObject({ reason: EXISTING_SESSION_CONFIG_REASON, ...IDS });
  });

  it('requires a chainId (option or SDK default)', async () => {
    const { m } = wired({ chainId: undefined });
    const e = await failing(submit(m));
    expect(e.detail).toMatchObject({ reason: EXISTING_SESSION_CONFIG_REASON, ...IDS });
    expect(e.isReshoppable(0)).toBe(false);
    const { m: m2, sm } = wired({ chainId: undefined });
    await submit(m2, { chainId: 5611 });
    expect(sm.registerExternalSession.mock.calls[0][0].chainId).toBe(5611);
  });

  it('still validates against the bundle, and a bundle failure carries the ids', async () => {
    const { m, sm } = wired();
    const e = await failing(submit(m, { job: { ...JOB, epochs: 9 } }));
    expect(e.message).toMatch(/epoch/i);
    expect(e.detail).toMatchObject(IDS);
    expect(sm.registerExternalSession).not.toHaveBeenCalled();
  });

  it.each([3_200_000.5, NaN])('a non-integer declaredTokens (%s) is a tagged, terminal refusal — not a RangeError from BigInt()', async (declaredTokens) => {
    // Every bound in validateAgainstBundle is a `>` compare; NaN compares false and a fraction
    // passes them all, then BigInt(trainingTokens(job)) throws a raw RangeError with no ids.
    const { m, jm } = wired();
    const e = await failing(submit(m, { job: { ...JOB, dataset: { ...JOB.dataset, declaredTokens } } }));
    expect(e).toBeInstanceOf(TrainingError);
    expect(e.detail).toMatchObject({ reason: 'numericWireRule', ...IDS });
    expect(e.isReshoppable(0)).toBe(false);
    expect(jm.getSessionJobOnChain).not.toHaveBeenCalled();
  });

  it('the same guard protects the wallet path (validateAgainstBundle itself)', () => {
    const { m } = wired();
    expect(() => m.validateAgainstBundle({ ...JOB, dataset: { ...JOB.dataset, declaredTokens: NaN } }, BUNDLE as never))
      .toThrow(/whole number|integer/i);
  });
});

describe('A.3 pre-flight on an adopted session — refuse locally, before the session is spent', () => {
  const expectPreflight = (e: TrainingError, check: string) => {
    expect(e.code).toBe('VALIDATION_FAILED');
    expect(e.detail?.reason).toBe(ADOPTED_SESSION_PARAMS_REASON);
    expect(e.detail?.check).toBe(check);
    expect(e.detail).toMatchObject(IDS);
    // The JOB is fine; the SESSION is at fault. The recourse is a fresh, correctly shaped
    // session for the same job — so this must NOT read as terminal for the job.
    expect(e.isReshoppable(0)).toBe(true);
    expect(e.requiresFreshSession).toBe(true);
  };

  it('passes a correctly shaped, funded, Active session and reports the accept latitude', async () => {
    const { m } = wired();
    const r = await m.validateExistingSession(IDS, JOB, HOST);
    expect(r.pricePerToken).toBe(904n);
    expect(r.session.status).toBe(0);
    expect(r.acceptLatitudeSecs).toBe(14300 - (TRAIN_JOB_TIMEOUT_SECS + 600));   // 1100 s left to send `train`
  });

  it.each<[string, (h: Harness) => void, string]>([
    // A missing key on a public mapping is the ZERO struct: 640 bytes, every layout pin satisfied,
    // status 0 = Active. Without an existence check the refusal blames `host`.
    ['does not exist on this JobMarketplace (a stale or other-deployment jobId)', (h) => {
      const ZERO = `0x${'00'.repeat(20)}`;
      h.jm.getSessionJobOnChain.mockResolvedValue(session({ id: 0n, depositor: ZERO, host: ZERO, paymentToken: ZERO, deposit: 0n, pricePerToken: 0n, maxDuration: 0n, startTime: 0n, lastProofTime: 0n, proofInterval: 0n, proofTimeoutWindow: 0n, status: 0 }));
      h.jm.getSessionModel.mockResolvedValue(`0x${'00'.repeat(32)}`);
    }, 'exists'],
    ['is not Active', (h) => h.jm.getSessionJobOnChain.mockResolvedValue(session({ status: 1 })), 'status'],
    ['names a different sessionModel', (h) => h.jm.getSessionModel.mockResolvedValue(`0x${'22'.repeat(32)}`), 'model'],
    // Not one of the node’s five — the node IS the host, so it never needs this. The client does:
    // a session bound to host X, submitted to host Y’s endpoint, is a spent session at Y.
    ['is bound to a DIFFERENT host', (h) => h.jm.getSessionJobOnChain.mockResolvedValue(session({ host: `0x${'99'.repeat(20)}` })), 'host'],
    ['is priced off the registered price', (h) => h.sm.resolveModelPricePerToken.mockResolvedValue(905n), 'price'],
    ['is unpriced for its token', (h) => h.sm.resolveModelPricePerToken.mockResolvedValue(0n), 'price'],
    // 9.6M tokens needed; 1 USDC at 904 → 1,106,194 tokens of headroom.
    ['cannot cover trainingTokens(job)', (h) => h.jm.getSessionJobOnChain.mockResolvedValue(session({ deposit: 1_000_000n })), 'headroom'],
    ['has spent its headroom — tokensUsed counts', (h) => h.jm.getSessionJobOnChain.mockResolvedValue(session({ deposit: 9_000_000n, tokensUsed: 500_000n })), 'headroom'],
    // 14400 − 1300 = 13100 s left < 12600 + 600.
    ['has less than TRAIN_JOB_TIMEOUT_SECS + 600 left', (h) => h.jm.getSessionJobOnChain.mockResolvedValue(session({ startTime: BigInt(NOW - 1300) })), 'lifetime'],
    ['has proofTimeoutWindow below 3600', (h) => h.jm.getSessionJobOnChain.mockResolvedValue(session({ proofTimeoutWindow: 300n })), 'proofTimeoutWindow'],
  ])('refuses a session that %s', async (_name, arrange, check) => {
    const h = wired();
    arrange(h);
    expectPreflight(await failing(submit(h.m)), check);
  });

  it('an unpriced token is reported as WHY there is no price, not as a mismatch against a string', async () => {
    // Found by mutation: dropping the unpriced branch still yields check 'price' (the string
    // fails the equality compare), so only the expected/actual text — the UI's copy — tells
    // the two apart.
    const { m, sm } = wired();
    sm.resolveModelPricePerToken.mockResolvedValue(0n);
    const e = await failing(submit(m));
    expect(e.detail?.failed).toEqual([{ check: 'price', expected: 'a registered price for this host, model and token', actual: expect.stringMatching(/no registered price for token/) }]);
  });

  it('reports EVERY failing check at once — the live fiat-service shape fails two', async () => {
    const { m, jm } = wired();
    jm.getSessionJobOnChain.mockResolvedValue(session({ maxDuration: 3600n, proofTimeoutWindow: 300n }));
    const e = await failing(submit(m));
    expectPreflight(e, 'lifetime');
    expect((e.detail?.failed as any[]).map((f) => f.check)).toEqual(['lifetime', 'proofTimeoutWindow']);
    expect(e.message).toMatch(/lifetime/); expect(e.message).toMatch(/proofTimeoutWindow/);
  });

  it('TRAIN_JOB_TIMEOUT_SECS defaults to 12600 and is a constructor option (the node’s is deployable)', async () => {
    expect(TRAIN_JOB_TIMEOUT_SECS).toBe(12600);
    const { m, jm } = wired({ trainJobTimeoutSecs: 1000 });
    jm.getSessionJobOnChain.mockResolvedValue(session({ startTime: BigInt(NOW - 12000) }));   // 2400 s left, floor 1600
    expect((await m.validateExistingSession(IDS, JOB, HOST)).acceptLatitudeSecs).toBe(800);
  });

  it('exact headroom and exact remaining lifetime PASS — both bounds are inclusive', async () => {
    const { m, jm } = wired();
    // 8,678,400 base units at 904 → 9,600,000 tokens exactly; NOW − 1200 → 13,200 s left == floor
    jm.getSessionJobOnChain.mockResolvedValue(session({ deposit: 8_678_400n, startTime: BigInt(NOW - 1200) }));
    const r = await m.validateExistingSession(IDS, JOB, HOST);
    expect(r.acceptLatitudeSecs).toBe(0);
  });

  it('a price READ failure (RPC, wiring) is a terminal decode refusal — NOT "get a fresh session"', async () => {
    // Conflating the two sends a card user to a second /fiat/session for a failure that recurs.
    const { m, sm } = wired();
    sm.resolveModelPricePerToken.mockRejectedValue(new Error('could not detect network'));
    const e = await failing(submit(m));
    expect(e.detail).toMatchObject({ reason: SESSION_DECODE_REASON, ...IDS });
    expect(e.message).not.toMatch(/fresh, correctly shaped session/);
    expect(e.isReshoppable(0)).toBe(false);
  });

  it('the host’s own "no price" signal (ZERO_MODEL_PRICE, thrown not returned) is the price check, with the UI copy', async () => {
    const { m, sm } = wired();
    sm.resolveModelPricePerToken.mockRejectedValue(Object.assign(new Error('Model pricing returned 0'), { code: 'ZERO_MODEL_PRICE' }));
    const e = await failing(submit(m));
    expect(e.detail?.reason).toBe(ADOPTED_SESSION_PARAMS_REASON);
    expect(e.detail?.failed).toEqual([{ check: 'price', expected: 'a registered price for this host, model and token', actual: expect.stringMatching(/no registered price for token/) }]);
  });

  it('the A.3 floor and the chain’s MAX_PROOF_TIMEOUT are two authorities that agree — notice if either moves', () => {
    expect(A3_MIN_PROOF_TIMEOUT_WINDOW_SECS).toBe(MAX_PROOF_TIMEOUT);
  });

  it('never seeds the registry or submits when the pre-flight refuses', async () => {
    const { m, jm, sm } = wired();
    jm.getSessionJobOnChain.mockResolvedValue(session({ status: 2 }));
    await failing(submit(m));
    expect(sm.registerExternalSession).not.toHaveBeenCalled();
    expect(sm.submitTraining).not.toHaveBeenCalled();
  });
});

describe('the read fails CLOSED', () => {
  it('refuses when the wrapper cannot do the drift-proof read — never skips the check', async () => {
    const { m, sm } = wired({ jobMarketplace: { getMinTokensFee: vi.fn() } });
    const e = await failing(submit(m));
    expect(e.code).toBe('ESTIMATE_MISMATCH');
    expect(e.detail).toMatchObject({ reason: 'missingDependencyMethod', ...IDS });
    expect(sm.registerExternalSession).not.toHaveBeenCalled();
  });

  it('surfaces a layout-drift refusal as sessionDecode — terminal, our side, with the ids', async () => {
    const { m, jm } = wired();
    jm.getSessionJobOnChain.mockRejectedValue(new Error('sessionJobs return does not match the deployed 18-slot layout'));
    const e = await failing(submit(m));
    expect(e.detail).toMatchObject({ reason: SESSION_DECODE_REASON, ...IDS });
    expect(e.isReshoppable(0)).toBe(false);
  });

  it('a failing sessionModel read is the same class, and names the read', async () => {
    const { m, jm } = wired();
    jm.getSessionModel.mockRejectedValue(new Error('boom'));
    const e = await failing(submit(m));
    expect(e.detail).toMatchObject({ reason: SESSION_DECODE_REASON, ...IDS });
    expect(e.message).toMatch(/sessionModel/);
  });

  it('refuses when the SessionManager cannot seed the registry (older sdk-core) — terminal, with the ids', async () => {
    const { m } = wired({ sessionManager: { resolveModelPricePerToken: vi.fn().mockResolvedValue(904n) } });
    const e = await failing(submit(m));
    expect(e.code).toBe('ESTIMATE_MISMATCH');
    expect(e.detail).toMatchObject({ reason: 'missingDependencyMethod', ...IDS });
    expect(e.isReshoppable(0)).toBe(false);
  });

  it('a SessionManager without the price read is a tagged refusal, not a TypeError escaping untagged', async () => {
    const { m } = wired({ sessionManager: { registerExternalSession: vi.fn(), submitTraining: vi.fn() } });
    const e = await failing(submit(m));
    expect(e).toBeInstanceOf(TrainingError);
    expect(e.detail).toMatchObject(IDS);
    expect(e.isReshoppable(0)).toBe(false);
  });
});

describe('every failure after adoption carries { sessionId, jobId, adopted }', () => {
  it('a TrainingError from the submit keeps its code and reason, and gains the ids', async () => {
    const { m, sm } = wired();
    sm.submitTraining.mockRejectedValue(new TrainingError('busy', 'CAPACITY', { reason: 'slotBusy' }));
    const e = await failing(submit(m));
    expect(e).toBeInstanceOf(TrainingError);
    expect(e.code).toBe('CAPACITY');
    expect(e.detail).toMatchObject({ reason: 'slotBusy', adopted: true, ...IDS });
  });

  it.each([['addressBusy', true], ['chainUnavailable', false]])(
    'CAPACITY %s on an adopted session: requiresFreshSession = %s, and the job is never at fault', async (reason, fresh) => {
      // The node's carve-out wins: chainUnavailable consumed NOTHING, so a same-ids retry is free;
      // addressBusy (C.6 keyed on the vault as depositor) consumed it — fresh session.
      const { m, sm } = wired();
      sm.submitTraining.mockRejectedValue(new TrainingError('busy', 'CAPACITY', { reason }));
      const e = await failing(submit(m));
      expect(e.requiresFreshSession).toBe(fresh);
      expect(e.isReshoppable(0)).toBe(true);
      expect(e.detail).toMatchObject({ adopted: true, ...IDS });
    },
  );

  it('a LATE rejection of handle.result gains the ids and keeps settledSlices', async () => {
    const { m, sm } = wired();
    const late = { requestId: 'r', result: Promise.reject(new TrainingError('died', 'TRAIN_FAILED', { settledSlices: 1 })), cancel: vi.fn(), slices: [], pointers: [], forfeitedSlices: [] };
    late.result.catch(() => {});
    sm.submitTraining.mockResolvedValue(late);
    const e = await failing((await submit(m)).result);
    expect(e.code).toBe('TRAIN_FAILED');
    expect(e.detail).toMatchObject({ settledSlices: 1, adopted: true, ...IDS });
  });

  it('a failing adopted run nobody has awaited yet does not become an unhandled rejection', async () => {
    // training-ws marks its own result promise handled; the id re-wrap creates a NEW rejected
    // promise, and a consumer that attaches on the next tick (a React effect) must not crash the process.
    const late = { requestId: 'r', result: Promise.reject(new Error('node said no')), cancel: vi.fn(), slices: [], pointers: [], forfeitedSlices: [] };
    late.result.catch(() => {});
    const { m, sm } = wired();
    sm.submitTraining.mockResolvedValue(late);
    const seen: unknown[] = [];
    const on = (r: unknown) => seen.push(r);
    process.on('unhandledRejection', on);
    const h = await submit(m);
    await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
    process.off('unhandledRejection', on);
    expect(seen).toEqual([]);
    await expect(h.result).rejects.toMatchObject({ detail: expect.objectContaining(IDS) });   // still observable
  });

  it('a genuine transport failure (WS_* SDKError) becomes SIDECAR_UNAVAILABLE / transport — retryable, with the cause', async () => {
    const { m, sm } = wired();
    const cause = Object.assign(new Error('WebSocket connection failed'), { code: 'WS_CONNECTION_ERROR' });
    sm.submitTraining.mockRejectedValue(cause);
    const e = await failing(submit(m));
    expect(e).toBeInstanceOf(TrainingError);
    expect(e.code).toBe('SIDECAR_UNAVAILABLE');
    expect(e.detail).toMatchObject({ reason: 'transport', adopted: true, cause, consumed: false, ...IDS });
    expect(e.isRetryable).toBe(true);
    // Every transport code is raised BEFORE the `train` frame leaves: nothing on chain was consumed, so
    // "again" is the SAME session — a fresh /fiat/session here would be a second charge for nothing.
    expect(e.requiresFreshSession).toBe(false);
  });

  it.each(['HOST_PUBKEY_UNAVAILABLE', 'NO_API_URL'])(
    'a host that cannot be reached for its public key (%s) is a transport failure, not our wiring', async (code) => {
      const { m, sm } = wired();
      sm.submitTraining.mockRejectedValue(Object.assign(new Error('host down'), { code }));
      const e = await failing(submit(m));
      expect(e.code).toBe('SIDECAR_UNAVAILABLE');
      expect(e.isRetryable).toBe(true);
      expect(e.requiresFreshSession).toBe(false);
      expect(e.detail).toMatchObject({ reason: 'transport', consumed: false, sdkCode: code, ...IDS });
    },
  );

  it.each(['SESSION_NOT_FOUND', 'SESSION_ENDPOINT_MISSING', 'ENCRYPTION_NOT_AVAILABLE', 'SESSION_KEY_NOT_AVAILABLE', 'HOST_MANAGER_NOT_AVAILABLE'])(
    'the SDK’s own wiring fault %s is terminal — never retryable, never re-shoppable, ids kept', async (code) => {
      // The card path exists so the user never connects a wallet; an unset EncryptionManager is a
      // deterministic local fault. Calling it SIDECAR_UNAVAILABLE would send the UI to a second charge.
      const { m, sm } = wired();
      const cause = Object.assign(new Error('wiring'), { code });
      sm.submitTraining.mockRejectedValue(cause);
      const e = await failing(submit(m));
      expect(e).toBeInstanceOf(TrainingError);
      expect(e.detail).toMatchObject({ reason: 'missingDependency', sdkCode: code, cause, ...IDS });
      expect(e.isRetryable).toBe(false);
      expect(e.isReshoppable(0)).toBe(false);
    },
  );

  it('a registry seed failure is inside the envelope: tagged, terminal — the seed is our wiring, not the host', async () => {
    const { m, sm } = wired();
    sm.registerExternalSession.mockImplementation(() => { throw new Error('registry write failed'); });
    const e = await failing(submit(m));
    expect(e).toBeInstanceOf(TrainingError);
    expect(e.detail).toMatchObject(IDS);
    expect(e.isReshoppable(0)).toBe(false);
  });

  it('a programming fault (TypeError, no code) after adoption is terminal too, and keeps the ids', async () => {
    const { m, sm } = wired();
    sm.submitTraining.mockRejectedValue(new TypeError('x is not a function'));
    const e = await failing(submit(m));
    expect(e).toBeInstanceOf(TrainingError);
    expect(e.detail).toMatchObject(IDS);
    expect(e.isReshoppable(0)).toBe(false);
  });
});

describe('what existingSession cannot do', () => {
  it('cannot be load-balanced — the session is bound on-chain to ONE host', async () => {
    const { m, sm } = wired();
    m.setHostSelectionService({ getRankedHostsForModel: vi.fn(async () => [{ host: { address: HOST, apiUrl: 'https://h' } }]) });
    const e = await failing(m.submitTrainingWithLoadBalancing({
      job: JOB, bundle: BUNDLE as never, hostAddress: HOST, endpoint: 'https://h', existingSession: IDS,
    } as never));
    expect(e.detail).toMatchObject({ reason: EXISTING_SESSION_CONFIG_REASON, ...IDS });
    expect(sm.submitTraining).not.toHaveBeenCalled();
  });
});

describe('calls methods the REAL classes actually have (the CP1 lesson)', () => {
  it('SessionManager.registerExternalSession and the wrapper reads exist on the prototypes', async () => {
    const { SessionManager } = await import('../../src/managers/SessionManager');
    const { JobMarketplaceWrapper } = await import('../../src/contracts/JobMarketplace');
    expect(typeof SessionManager.prototype.registerExternalSession).toBe('function');
    expect(typeof SessionManager.prototype.resolveModelPricePerToken).toBe('function');
    expect(typeof SessionManager.prototype.submitTraining).toBe('function');
    expect(typeof SessionManager.prototype.startSession).toBe('function');
    expect(typeof JobMarketplaceWrapper.prototype.getSessionJobOnChain).toBe('function');
    expect(typeof JobMarketplaceWrapper.prototype.getSessionModel).toBe('function');
    expect(typeof JobMarketplaceWrapper.prototype.triggerSessionTimeout).toBe('function');
  });
});
