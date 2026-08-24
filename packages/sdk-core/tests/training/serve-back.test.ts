/**
 * Phase 6 — serve-back client path (§E.1/E.2/E.3) at v0.3.9.
 *
 * The load-bearing test is the post-ack listener. E.3 pins `LORA_STAGING_FAILED` as
 * post-ack and UNCORRELATED, while `sendEncryptedInit` unsubscribes the moment the ack
 * lands — so the frame arrives with nobody listening and is dropped in silence. The
 * customer then gets BASE-MODEL output on a session they are paying for and believe is
 * running their fine-tune. That is the what-is-owed trap, and it is reproduced here as a
 * failing test before anything is changed.
 */
import { describe, it, expect, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { SessionManager } from '../../src/managers/SessionManager';
import { toServeBackError, serveBackAvailable, firstResponseTimeoutMs, ADAPTER_STAGE_BUDGET_MS } from '../../src/utils/training-serve-back';
import { TrainingError } from '../../src/errors/training-errors';

const LORA = { manifestCID: 'uABCdef', manifestSha256: `0x${'ab'.repeat(32)}`, file: 'adapter.gguf' };

class FakeWs {
  sent: any[] = [];
  handlers = new Set<(d: any) => void>();
  onMessage(h: (d: any) => void) {
    this.handlers.add(h);
    return () => { this.handlers.delete(h); };
  }
  async sendWithoutResponse(m: any) { this.sent.push(m); }
  emit(frame: any) { for (const h of [...this.handlers]) h(frame); }
}

function harness() {
  const captured: any[] = [];
  const sm: any = new SessionManager({} as any, {} as any, {
    getHostPublicKey: async () => `0x${'02'.repeat(33)}`,
  } as any);
  sm.encryptionManager = {
    getRecoveryPublicKey: () => '0xrecovery',
    encryptSessionInit: async (_k: string, payload: any) => {
      captured.push(payload);
      return { type: 'encrypted_session_init', payload: {} };
    },
  };
  return { sm, captured };
}

const cfg = (extra: Record<string, unknown> = {}) => ({
  chainId: 84532, host: '0xhost', endpoint: 'http://h', modelId: 'm', paymentMethod: 'deposit',
  pricePerToken: 1, encryption: true, ...extra,
});

async function init(sm: any, ws: FakeWs, config: any) {
  const before = ws.sent.length;
  const p = sm.sendEncryptedInit(ws, config, 1n, 2n);
  await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThan(before));
  ws.emit({ type: 'session_init_ack' });
  await p;
}

describe('E.2 — the `lora` field reaches the init payload verbatim-keyed', () => {
  it('carries manifestCID / manifestSha256 / file with EXACT capitalisation', async () => {
    const { sm, captured } = harness();
    await init(sm, new FakeWs(), cfg({ lora: LORA }));
    expect(captured[0].lora).toEqual(LORA);
    // A misspelt key fails the WHOLE init parse as DECRYPTION_FAILED (E.3), deliberately —
    // silently dropping it would serve base-model output on a paid fine-tune.
    expect(Object.keys(captured[0].lora)).toEqual(['manifestCID', 'manifestSha256', 'file']);
    expect(captured[0].lora).not.toHaveProperty('manifestCid');
  });
  it('omits `lora` entirely when the session is not a serve-back session', async () => {
    const { sm, captured } = harness();
    await init(sm, new FakeWs(), cfg());
    expect(captured[0]).not.toHaveProperty('lora');
  });
  it('RE-SENDS `lora` on re-init — a vanished field makes the node keep refusing (E.3)', async () => {
    const { sm, captured } = harness();
    const ws = new FakeWs();
    await init(sm, ws, cfg({ lora: LORA }));
    await init(sm, new FakeWs(), cfg({ lora: LORA }));
    expect(captured).toHaveLength(2);
    expect(captured[1].lora).toEqual(LORA);
  });
});

describe('E.3 — the post-ack listener (the dropped-frame trap)', () => {
  it('STAYS SUBSCRIBED past the ack on a lora session', async () => {
    const { sm } = harness();
    const ws = new FakeWs();
    await init(sm, ws, cfg({ lora: LORA }));
    // The ack means ACCEPTED, not READY: staging runs after it, so the only frame that can
    // report a staging failure arrives when the init handler has already unsubscribed.
    expect(ws.handlers.size).toBeGreaterThan(0);
  });
  it('does NOT STACK listeners across re-inits on the SAME socket', async () => {
    // Five call sites re-init on `this.wsClient`, the SHARED session socket. Without disposing
    // the previous listener each re-init adds another, and one LORA_STAGING_FAILED then fires
    // the caller's handler N times — N refund prompts for one failure. The earlier re-init test
    // used a FRESH socket, so it could not see this.
    const { sm } = harness();
    const ws = new FakeWs();
    const seen: any[] = [];
    await init(sm, ws, cfg({ lora: LORA, onServeBackError: (e: any) => seen.push(e) }));
    await init(sm, ws, cfg({ lora: LORA, onServeBackError: (e: any) => seen.push(e) }));
    await init(sm, ws, cfg({ lora: LORA, onServeBackError: (e: any) => seen.push(e) }));
    expect(ws.handlers.size).toBe(1);
    ws.emit({ type: 'error', code: 'LORA_STAGING_FAILED', reason: 'fetch' });
    expect(seen).toHaveLength(1);
  });
  it('releases the listener on a NON-lora session — zero behaviour change', async () => {
    const { sm } = harness();
    const ws = new FakeWs();
    await init(sm, ws, cfg());
    expect(ws.handlers.size).toBe(0);
  });
  it('surfaces a post-ack LORA_STAGING_FAILED through the callback AND the accessor', async () => {
    const { sm } = harness();
    const ws = new FakeWs();
    const seen: any[] = [];
    await init(sm, ws, cfg({ lora: LORA, onServeBackError: (e: any) => seen.push(e) }));
    ws.emit({ type: 'error', code: 'LORA_STAGING_FAILED', reason: 'fetch' });
    expect(seen).toHaveLength(1);
    expect(seen[0].code).toBe('LORA_STAGING_FAILED');
    expect(seen[0].detail.reason).toBe('fetch');
    expect(sm.getServeBackError()?.code).toBe('LORA_STAGING_FAILED');
  });
  it('CLEARS a stale staging error on re-init — the previous attempt is evicted (E.3)', async () => {
    const { sm } = harness();
    const ws = new FakeWs();
    await init(sm, ws, cfg({ lora: LORA }));
    ws.emit({ type: 'error', code: 'LORA_STAGING_FAILED', reason: 'fetch' });
    expect(sm.getServeBackError()).not.toBeNull();
    // A re-init carrying `lora` RE-TRIGGERS staging: a fresh attempt begins, so reporting the
    // dead one would tell the user their adapter failed when it may now be loaded.
    await init(sm, new FakeWs(), cfg({ lora: LORA }));
    expect(sm.getServeBackError()).toBeNull();
  });
  it('ignores unrelated post-ack traffic rather than mis-mapping it', async () => {
    const { sm } = harness();
    const ws = new FakeWs();
    const seen: any[] = [];
    await init(sm, ws, cfg({ lora: LORA, onServeBackError: (e: any) => seen.push(e) }));
    ws.emit({ type: 'encrypted_response', payload: {} });
    ws.emit({ type: 'stream_end' });
    expect(seen).toHaveLength(0);
    expect(sm.getServeBackError()).toBeNull();
  });
});

describe('E.3 — the serve-back error mapping', () => {
  it('maps every pinned LORA_STAGING_FAILED reason', () => {
    for (const reason of ['invalid', 'fetch', 'write', 'cancelled', 'budget', 'chain']) {
      const e = toServeBackError({ type: 'error', code: 'LORA_STAGING_FAILED', reason })!;
      expect(e.code).toBe('LORA_STAGING_FAILED');
      expect(e.detail?.reason).toBe(reason);
    }
  });
  it('CARRIES an unknown reason through rather than dropping it (forward-compat commitment)', () => {
    // `isRetryable` is false for every non-CAPACITY code, so asserting only that would pass
    // against a mapper that DISCARDS `reason` entirely. Assert the thing that actually varies.
    const e = toServeBackError({ type: 'error', code: 'LORA_STAGING_FAILED', reason: 'quantumFlux' })!;
    expect(e.detail?.reason).toBe('quantumFlux');
    expect(e.message).toMatch(/unrecognised/i);
    expect(e.isRetryable).toBe(false);
  });
  it('reason `invalid` is OUR claim being wrong — terminal, not re-shoppable', () => {
    // E.3: `invalid` = "the client's own claim is wrong (bad shape, unknown file, base
    // mismatch)". An adapter's base model is fixed, so another host reaches the identical
    // failure. `fetch` and `chain` are the host's problem and DO re-shop — the distinction is
    // the entire value of the reason vocabulary.
    expect(toServeBackError({ type: 'error', code: 'LORA_STAGING_FAILED', reason: 'invalid' })!.isReshoppable(0)).toBe(false);
    expect(toServeBackError({ type: 'error', code: 'LORA_STAGING_FAILED', reason: 'fetch' })!.isReshoppable(0)).toBe(true);
  });
  it('pins BOTH SIDES of the `chain` / `chainUnavailable` inversion', () => {
    // Same underlying event, adjacent surfaces, OPPOSITE correct action. A test that only
    // looks at the serve-back side pins no inversion at all — it has to construct both.
    const serve = toServeBackError({ type: 'error', code: 'LORA_STAGING_FAILED', reason: 'chain' })!;
    const capacity = new TrainingError('x', 'CAPACITY', { reason: 'chainUnavailable' });
    expect(serve.detail?.reason).toBe('chain');
    expect(serve.requiresFreshSession).toBe(true);      // re-shop
    expect(capacity.requiresFreshSession).toBe(false);  // retry the SAME session
    expect(serve.isRetryable).toBe(false);
    expect(capacity.isRetryable).toBe(true);
  });
  it('maps LORA_NOT_STAGED to a TERMINAL error — it never means "still staging"', () => {
    // E.3: the node's loop is strictly sequential, so a prompt sent during staging is
    // answered AFTER staging WITH the adapter. There is no "still running" state to wait on.
    const e = toServeBackError({ type: 'error', code: 'LORA_NOT_STAGED', requestId: 'r1' })!;
    expect(e.code).toBe('LORA_NOT_STAGED');
    expect(e.isRetryable).toBe(false);
  });
  it('returns null for anything that is not a serve-back frame', () => {
    expect(toServeBackError({ type: 'stream_end' })).toBeNull();
    expect(toServeBackError({ type: 'error', code: 'CAPACITY', reason: 'slotBusy' })).toBeNull();
  });
});

describe('E.1/E.2 — serve-back gating', () => {
  it('requires the bundle `training` section AND adapter.gguf in the manifest', () => {
    const files = ['adapter_model.safetensors', 'adapter.gguf'];
    expect(serveBackAvailable({ bundleHasTraining: true, manifestFiles: files }).ok).toBe(true);
    expect(serveBackAvailable({ bundleHasTraining: false, manifestFiles: files }).ok).toBe(false);
  });
  it('refuses a safetensors-only manifest — GGUF conversion is BEST-EFFORT (E.1, Open 5)', () => {
    // On conversion failure the run ships safetensors-only plus warnings:["gguf-conversion-failed"].
    // The artifact is still owned and usable; it just cannot be served back in M0.
    const r = serveBackAvailable({ bundleHasTraining: true, manifestFiles: ['adapter_model.safetensors'] });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('noGguf');
  });
  it('checks the BASE MODEL pin — E.2\'s third precondition, checkable since v0.3.10', () => {
    // "The session's model must equal the template's baseServingModelId pin." Until v0.3.10
    // that field was published nowhere a client could reach, so a mismatch could only surface
    // as LORA_STAGING_FAILED reason `invalid` — post-ack, UNCORRELATED, on a funded session.
    // It now sits in A.4's perTemplate block, so the check moves BEFORE the money.
    const files = ['adapter.gguf'];
    const base = `0x${'bb'.repeat(32)}`;
    expect(serveBackAvailable({ bundleHasTraining: true, manifestFiles: files,
      sessionModelId: base, baseServingModelId: base }).ok).toBe(true);
    const bad = serveBackAvailable({ bundleHasTraining: true, manifestFiles: files,
      sessionModelId: `0x${'cc'.repeat(32)}`, baseServingModelId: base });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBe('baseModelMismatch');
    // A bundle emitted before the template was re-authored carries NEITHER field, and one
    // carrying only half is equally possible. Failing closed on an absent field would break
    // serve-back against every host that has not re-published — so all three absence shapes
    // must pass, not just the both-absent one.
    expect(serveBackAvailable({ bundleHasTraining: true, manifestFiles: files }).ok).toBe(true);
    expect(serveBackAvailable({ bundleHasTraining: true, manifestFiles: files,
      sessionModelId: base }).ok).toBe(true);
    expect(serveBackAvailable({ bundleHasTraining: true, manifestFiles: files,
      baseServingModelId: base }).ok).toBe(true);
  });
  it('names WHICH gate failed, so a caller can tell the user something true', () => {
    expect(serveBackAvailable({ bundleHasTraining: false, manifestFiles: [] }).reason).toBe('noTrainingSection');
  });
});

describe('E.3 — the first-response timeout must clear the staging budget', () => {
  it('pins ADAPTER_STAGE_BUDGET_SECS = 300 s as published in v0.3.10', () => {
    expect(ADAPTER_STAGE_BUDGET_MS).toBe(300_000);
  });
  it('WIRES the flag through session init — the pure function alone proves nothing', async () => {
    // The helper being correct does not mean the manager passes it the right flag. Without
    // this, `loraSessionActive = false` everywhere is green and every lora session keeps the
    // 180 s allowance it was the whole point to raise.
    const { sm } = harness();
    await init(sm, new FakeWs(), cfg({ lora: LORA }));
    expect((sm as any).loraSessionActive).toBe(true);
    await init(sm, new FakeWs(), cfg());
    expect((sm as any).loraSessionActive).toBe(false);   // and a plain re-init clears it
  });
  it('adds the FULL stage budget on a lora session, and nothing on a plain one', () => {
    // A prompt sent during staging is not refused — it waits in the socket buffer and is
    // answered afterwards WITH the adapter. So the first response can legitimately need the
    // stage budget PLUS the cold-start inference the base timeout already allows. The SDK's
    // 180 s would abort a session that was going to answer, on a run the user is paying for.
    // v0.3.10 settled that there is no queue-depth term: 300 s is the whole of it.
    expect(firstResponseTimeoutMs(180_000, true)).toBe(480_000);
    expect(firstResponseTimeoutMs(180_000, false)).toBe(180_000);
  });
});
