// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
/**
 * LTX generate() against an existing (vault-deposited) session — Phase 2.
 *
 * The card-paid flow mints sessionId/jobId server-side (`POST /fiat/session` against vault
 * deposits) and delivers FC1.6 session-auth itself. generate() must then run with NO session
 * creation, NO escrow and NO wallet touch: guards → validateJob → seed the registry → the
 * SAME submit/tripwire/enrichment block as the escrow path.
 *
 * See docs/development/IMPLEMENTATION-LTX-EXISTING-SESSION.md §3 (D1–D7) / §4 / §5.
 */
import { describe, it, expect, vi } from 'vitest';
import vectors from './vectors.json';
import bundleFixture from './bundle-fixture.json';
import { LtxManager } from '../../src/managers/LtxManager';
import { LtxError } from '../../src/errors/ltx-errors';

const LTX_MODEL_ID = '0x' + '01'.repeat(32);
const USDC = '0x00000000000000000000000000000000000000abcd';
const HOST = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const PRICE = 5n;
const ENDPOINT = 'https://host1.fabstir.net';
const VAULT = { sessionId: 954n, jobId: 456n };
const validJob = { ...vectors.job, templateHash: bundleFixture.templates[0].templateHash };
const meta = { allowListVersion: 1, bundleHash: bundleFixture.bundleHash, bundleCID: 'bCid' };

function completeResult(over: Record<string, unknown> = {}) {
  return {
    outputCID: 'bOut', proofCID: 'bProof',
    manifest: { frameCount: 2, fps: 24, resolution: { w: 1280, h: 720 }, colourEncoding: 'x', frameHashes: ['0xaa', '0xbb'], merkleRoot: '0x' },
    frames: ['uF0', 'uF1'], billing: { unit: 'megapixel-frame', tokens: 111514 }, requestId: 'r', allowListVersion: 1, ...over,
  };
}

/**
 * A paymentManager that records ANY property access. The vault contract is "no wallet
 * touch at all" — stronger than "getTokenMinDeposit wasn't called" — so the assertion is
 * that this proxy was never read from, which also covers methods added in future.
 */
function makePaymentSpy() {
  const touched: string[] = [];
  const paymentManager = new Proxy({} as any, {
    get(_target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined; // don't trap await/inspection
      touched.push(String(prop));
      return vi.fn();
    },
  });
  return { paymentManager, touched };
}

function makeVaultManager(opts: {
  order?: string[];
  resultOverride?: Record<string, unknown>;
  chainId?: number | undefined;
  omitSessionManager?: boolean;
  submitImpl?: () => Promise<any>;
} = {}) {
  const { order, resultOverride = {}, omitSessionManager = false } = opts;
  // NB: `in`, not a destructuring default — an explicit `chainId: undefined` must stay undefined
  // so the "no resolvable chainId" case actually reaches the guard.
  const chainId = 'chainId' in opts ? opts.chainId : 84532;
  const resolveModelPricePerToken = vi.fn(async () => { order?.push('estimate'); return PRICE; });
  const startSession = vi.fn(async () => { order?.push('session'); return { sessionId: 7n, jobId: 7n }; });
  const registerExternalSession = vi.fn(() => { order?.push('register'); });
  const submitLtx = vi.fn(opts.submitImpl ?? (async () => {
    order?.push('submit');
    return { requestId: 'r', cancel() {}, result: Promise.resolve(completeResult(resultOverride)) };
  }));
  const getByCID = vi.fn(async () => { order?.push('validate'); return bundleFixture; });
  const { paymentManager, touched } = makePaymentSpy();
  const manager = new LtxManager({
    sessionManager: omitSessionManager
      ? undefined
      : { resolveModelPricePerToken, startSession, submitLtx, registerExternalSession },
    storageManager: { getByCID },
    paymentManager,
    ltxModelId: LTX_MODEL_ID, usdcAddress: USDC, chainId,
  } as any);
  return { manager, startSession, submitLtx, registerExternalSession, getByCID, touched };
}

const vaultOptions = (over: Record<string, unknown> = {}) =>
  ({ existingSession: VAULT, endpoint: ENDPOINT, ...over }) as any;

describe('LtxManager.generate — existingSession (vault) path', () => {
  it('creates no session and never touches the paymentManager (no escrow, no wallet)', async () => {
    const { manager, startSession, submitLtx, touched } = makeVaultManager();

    await manager.generate(validJob, HOST, meta, vaultOptions());

    expect(startSession).not.toHaveBeenCalled();
    expect(touched).toEqual([]); // the WHOLE paymentManager mock is untouched
    expect(submitLtx).toHaveBeenCalledWith('954', validJob, expect.objectContaining({ existingSession: VAULT }));
  });

  it('seeds the session registry with the exact six fields BEFORE submitting', async () => {
    const order: string[] = [];
    const { manager, registerExternalSession } = makeVaultManager({ order });

    await manager.generate(validJob, HOST, meta, vaultOptions());

    expect(registerExternalSession).toHaveBeenCalledWith({
      sessionId: 954n, jobId: 456n, endpoint: ENDPOINT,
      hostAddress: HOST, model: LTX_MODEL_ID, chainId: 84532,
    });
    expect(order.indexOf('register')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('register')).toBeLessThan(order.indexOf('submit'));
  });

  it('rejects a missing endpoint before ANY network activity (no bundle fetch, no seed, no submit)', async () => {
    const { manager, registerExternalSession, submitLtx, getByCID } = makeVaultManager();

    await expect(manager.generate(validJob, HOST, meta, { existingSession: VAULT } as any))
      .rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });

    expect(getByCID).not.toHaveBeenCalled(); // guards precede validateJob (D2)
    expect(registerExternalSession).not.toHaveBeenCalled();
    expect(submitLtx).not.toHaveBeenCalled();
  });

  // Every one of these passes a naive `/^https?:\/\//i` test but breaks submitLtx's
  // derivation, which is case-SENSITIVE and treats a 'ws://' substring anywhere as
  // "already a WS URL" (verified: 'HTTPS://h' → 'HTTPS://h/v1/ws';
  // 'https://h/?next=ws://x' → passed through verbatim).
  it.each([
    ['ws://host1.fabstir.net', 'ws-form endpoint'],
    ['wss://host1.fabstir.net', 'wss-form endpoint'],
    ['https://host1.fabstir.net/?next=ws://evil', 'http base carrying a ws:// substring'],
  ])('rejects %s (%s) before any network activity', async (endpoint) => {
    const { manager, submitLtx, getByCID, registerExternalSession } = makeVaultManager();

    await expect(manager.generate(validJob, HOST, meta, vaultOptions({ endpoint })))
      .rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });

    expect(getByCID).not.toHaveBeenCalled();
    expect(registerExternalSession).not.toHaveBeenCalled();
    expect(submitLtx).not.toHaveBeenCalled();
  });

  // Q8's promise is that ONE nodeHttpUrl string serves both postSessionAuth and generate.
  // postSessionAuth strips trailing slashes and matches the scheme case-insensitively; the WS
  // derivation does neither, so an accepted-there value must be normalised to an equivalent
  // the derivation can convert — otherwise the same string authorises and then yields
  // '…//v1/ws' or an unconverted 'HTTPS://…'.
  it.each([
    ['https://host1.fabstir.net/', 'trailing slash'],
    ['https://host1.fabstir.net///', 'repeated trailing slashes'],
    ['HTTPS://host1.fabstir.net', 'uppercase scheme'],
    ['HtTpS://host1.fabstir.net/', 'mixed-case scheme AND trailing slash'],
  ])('normalises %s (%s) to the form the WS derivation accepts (Q8)', async (endpoint) => {
    const { manager, registerExternalSession } = makeVaultManager();

    await manager.generate(validJob, HOST, meta, vaultOptions({ endpoint }));

    expect(registerExternalSession).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://host1.fabstir.net' }),
    );
  });

  it('preserves path case while normalising the scheme (paths are case-sensitive)', async () => {
    const { manager, registerExternalSession } = makeVaultManager();

    await manager.generate(validJob, HOST, meta, vaultOptions({ endpoint: 'HTTPS://host1.fabstir.net/Node/Api/' }));

    expect(registerExternalSession).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://host1.fabstir.net/Node/Api' }),
    );
  });

  it('rejects when no chainId is resolvable (options and deps both absent)', async () => {
    const { manager, submitLtx, getByCID } = makeVaultManager({ chainId: undefined });

    await expect(manager.generate(validJob, HOST, meta, vaultOptions()))
      .rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });

    expect(getByCID).not.toHaveBeenCalled();
    expect(submitLtx).not.toHaveBeenCalled();
  });

  it('uses options.chainId over the dep default when both are present', async () => {
    const { manager, registerExternalSession } = makeVaultManager();

    await manager.generate(validJob, HOST, meta, vaultOptions({ chainId: 5611 }));

    expect(registerExternalSession).toHaveBeenCalledWith(expect.objectContaining({ chainId: 5611 }));
  });

  it('rejects with a typed LtxError (not a raw TypeError) when the SessionManager is absent', async () => {
    const { manager } = makeVaultManager({ omitSessionManager: true });

    const err: any = await manager.generate(validJob, HOST, meta, vaultOptions()).catch((e) => e);
    expect(err).toBeInstanceOf(LtxError);
    expect(err.code).toBe('LTX_PREVALIDATION_FAILED');
  });

  it('rejects typed (not a raw TypeError) when the SessionManager predates registerExternalSession', async () => {
    // The realistic D2a case: a SessionManager IS present but is an older build / a double
    // without the seeding method. Without this guard the path dies with an untyped
    // "registerExternalSession is not a function" thrown outside generate()'s wrapper.
    const manager = new LtxManager({
      sessionManager: { resolveModelPricePerToken: vi.fn(), startSession: vi.fn(), submitLtx: vi.fn() },
      storageManager: { getByCID: vi.fn(async () => bundleFixture) },
      paymentManager: makePaymentSpy().paymentManager,
      ltxModelId: LTX_MODEL_ID, usdcAddress: USDC, chainId: 84532,
    } as any);

    const err: any = await manager.generate(validJob, HOST, meta, vaultOptions()).catch((e) => e);
    expect(err).toBeInstanceOf(LtxError);
    expect(err.code).toBe('LTX_PREVALIDATION_FAILED');
    expect(err.details).toMatchObject({ sessionId: 954n, jobId: 456n });
  });

  it('attaches the vault ids to PRE-submit failures too — the vault is already debited', async () => {
    // On the escrow path a pre-escrow failure has no ids because no session exists yet. Here
    // the session was minted and the vault charged BEFORE generate() was called, so every
    // failure must carry {sessionId, jobId} for the service-side reclaim relay (Q4/Q6).
    const { manager } = makeVaultManager();

    const err: any = await manager.generate({ ...validJob, fps: 60 }, HOST, meta, vaultOptions()).catch((e) => e);
    expect(err).toBeInstanceOf(LtxError);
    expect(err.code).toBe('LTX_PREVALIDATION_FAILED');
    expect(err.details).toMatchObject({ sessionId: 954n, jobId: 456n });
  });

  it('attaches the vault ids to guard failures as well (uniform error shape for the UI)', async () => {
    const { manager } = makeVaultManager();

    const err: any = await manager.generate(validJob, HOST, meta, { existingSession: VAULT } as any).catch((e) => e);
    expect(err.details).toMatchObject({ sessionId: 954n, jobId: 456n });
  });

  it('still validates the job — a bounds miss throws before the WS submit (D4)', async () => {
    const { manager, registerExternalSession, submitLtx } = makeVaultManager();

    await expect(manager.generate({ ...validJob, fps: 60 }, HOST, meta, vaultOptions()))
      .rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });

    expect(registerExternalSession).not.toHaveBeenCalled();
    expect(submitLtx).not.toHaveBeenCalled();
  });

  it('enriches the result with the vault ids and echoes the seed', async () => {
    const { manager } = makeVaultManager();

    const res = await manager.generate(validJob, HOST, meta, vaultOptions());

    expect(res.sessionId).toBe(954n);
    expect(res.jobId).toBe(456n);
    expect(res.seed).toBe(validJob.seed);
    expect(res.billing.pricePerToken).toBe(PRICE.toString()); // post-result enrichment still runs
  });

  it('fires the allowListVersion-drift tripwire with the vault ids attached', async () => {
    const { manager } = makeVaultManager({ resultOverride: { allowListVersion: 2 } });

    const err: any = await manager.generate(validJob, HOST, meta, vaultOptions()).catch((e) => e);
    expect(err.code).toBe('LTX_BUNDLE_STALE');
    expect(err.details).toMatchObject({ sessionId: 954n, jobId: 456n });
  });

  it('fires the billing over-claim tripwire', async () => {
    const { manager } = makeVaultManager({ resultOverride: { billing: { unit: 'megapixel-frame', tokens: 999999 } } });

    await expect(manager.generate(validJob, HOST, meta, vaultOptions()))
      .rejects.toMatchObject({ code: 'GENERATION_FAILED' });
  });

  it('wraps a node-side failure as LtxError with the vault ids for service-side reclaim', async () => {
    const { manager } = makeVaultManager({
      submitImpl: async () => ({ requestId: 'r', cancel() {}, result: Promise.reject(new LtxError('node timed out', 'TIMEOUT')) }),
    });

    const err: any = await manager.generate(validJob, HOST, meta, vaultOptions()).catch((e) => e);
    expect(err).toBeInstanceOf(LtxError);
    expect(err.code).toBe('TIMEOUT');
    expect(err.details).toMatchObject({ sessionId: 954n, jobId: 456n });
  });

  it('no-regression: without existingSession the escrow path is unchanged', async () => {
    const order: string[] = [];
    const resolveModelPricePerToken = vi.fn(async () => { order.push('estimate'); return PRICE; });
    const startSession = vi.fn(async () => { order.push('session'); return { sessionId: 7n, jobId: 7n }; });
    const registerExternalSession = vi.fn();
    const submitLtx = vi.fn(async () => { order.push('submit'); return { requestId: 'r', cancel() {}, result: Promise.resolve(completeResult()) }; });
    const getByCID = vi.fn(async () => { order.push('validate'); return bundleFixture; });
    const manager = new LtxManager({
      sessionManager: { resolveModelPricePerToken, startSession, submitLtx, registerExternalSession },
      storageManager: { getByCID },
      paymentManager: { getTokenMinDeposit: vi.fn(async () => 0n) },
      ltxModelId: LTX_MODEL_ID, usdcAddress: USDC, chainId: 84532,
    } as any);

    const res = await manager.generate(validJob, HOST, meta);

    expect(order).toEqual(['validate', 'estimate', 'session', 'submit', 'estimate']);
    expect(registerExternalSession).not.toHaveBeenCalled();
    expect(res.sessionId).toBe(7n);
  });
});
