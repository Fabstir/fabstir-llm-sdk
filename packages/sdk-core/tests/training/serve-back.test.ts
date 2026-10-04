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

// acquireSessionTransport stands up a REAL WebSocketClient when the session's socket is not
// already live, so the re-init tests below need it stubbed to reach the code they are about.
vi.mock('../../src/websocket/WebSocketClient', () => ({
  WebSocketClient: vi.fn().mockImplementation(() => {
    let handler: ((d: any) => void) | undefined;
    return {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
      onMessage: (h: (d: any) => void) => { handler = h; return () => { handler = undefined; }; },
      // Answer the init, otherwise the real sendEncryptedInit waits 30 s for an ack that a
      // silent stub never sends and the test reports a timeout instead of its assertion.
      sendWithoutResponse: vi.fn(async (m: any) => {
        if (m?.type === 'encrypted_session_init') setTimeout(() => handler?.({ type: 'session_init_ack' }), 0);
      }),
    };
  }),
}));
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

describe('E.2 — `lora` must survive a RE-INIT, which is the only init production performs', () => {
  // Found by the Platformless UI developer, and it is the CP1 defect class again: every
  // sendEncryptedInit call site RECONSTRUCTS ExtendedSessionConfig from the stored SessionState,
  // and none of them carried `lora`. The tests above call sendEncryptedInit directly, so they
  // proved the function works and never proved anything reaches it. E.3: "A re-init MUST
  // re-send `lora`. If the job id is unchanged and the field has vanished, the node keeps
  // refusing rather than silently moving that session to the base model."
  const seed = (sm: any, lora?: unknown) => {
    sm.sessions.set('7', {
      sessionId: 7n, jobId: 8n, chainId: 84532, model: 'm', provider: '0xhost',
      endpoint: 'http://h', status: 'active', prompts: [], responses: [], checkpoints: [],
      totalTokens: 0, startTime: 0, encryption: true, lora,
    });
  };

  it('carries lora into the config that acquireSessionTransport rebuilds', async () => {
    const { sm } = harness();
    seed(sm, LORA);
    const seen: any[] = [];
    sm.sendEncryptedInit = async (_ws: any, cfg: any) => { seen.push(cfg); sm.sessionKey = new Uint8Array(32); };
    await sm.acquireSessionTransport('7');
    expect(seen).toHaveLength(1);
    expect(seen[0].lora).toEqual(LORA);
  });

  it('leaves a non-lora session untouched', async () => {
    const { sm } = harness();
    seed(sm, undefined);
    const seen: any[] = [];
    sm.sendEncryptedInit = async (_ws: any, cfg: any) => { seen.push(cfg); sm.sessionKey = new Uint8Array(32); };
    await sm.acquireSessionTransport('7');
    expect(seen[0].lora).toBeUndefined();
  });

  it('RECORDS lora onto the session at init, so later re-inits can find it', async () => {
    // The field has to LIVE on SessionState — the same way `webSearch` does — or every path
    // that rebuilds a config from the session loses it again. Recording it in
    // sendEncryptedInit makes that ONE choke point rather than six call sites to keep in step.
    const { sm } = harness();
    sm.sessions.set('7', {
      sessionId: 7n, jobId: 8n, chainId: 84532, model: 'm', provider: '0xhost',
      endpoint: 'http://h', status: 'active', prompts: [], responses: [], checkpoints: [],
      totalTokens: 0, startTime: 0, encryption: true,
    });
    const ws = new FakeWs();
    const p = sm.sendEncryptedInit(ws, cfg({ lora: LORA }), 7n, 8n);
    await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThan(0));
    ws.emit({ type: 'session_init_ack' });
    await p;
    expect(sm.sessions.get('7').lora).toEqual(LORA);
  });
});

describe('E.2 — `session.lora` must be SEEDABLE from a public entry point', () => {
  // The re-init fix made every rebuild read `session.lora`, and the only writer read
  // `config.lora` inside the private `sendEncryptedInit`. So the value could only come from a
  // public entry point, and none of them carried it — the field was unreachable from outside
  // the class and the fix was inert in production. The earlier mutants passed because they
  // SEEDED the session by hand, which is a state production has no way to produce.
  //
  // These drive real public entry points and never touch sendEncryptedInit directly.
  const external = (sm: any, extra: Record<string, unknown> = {}) => sm.registerExternalSession({
    sessionId: 7n, jobId: 8n, chainId: 84532, model: 'm', hostAddress: '0xhost',
    endpoint: 'http://h', ...extra,
  });

  it('registerExternalSession seeds lora, and it reaches the init payload', async () => {
    const { sm, captured } = harness();
    external(sm, { lora: LORA });
    expect(sm.sessions.get('7').lora).toEqual(LORA);
    // …and travels all the way to the encrypted payload through a rebuilt config.
    await sm.acquireSessionTransport('7');
    expect(captured[0].lora).toEqual(LORA);
  });

  it('registerExternalSession without lora stays exactly as before', async () => {
    const { sm, captured } = harness();
    external(sm);
    await sm.acquireSessionTransport('7');
    expect(captured[0].lora).toBeUndefined();
  });

  it('registerDelegatedSession seeds it too — the popup-free path most chats use', async () => {
    // Their words: "this is how this app opens EVERY chat". Seeding only the external path
    // would leave the primary one silently adapter-less.
    const { sm } = harness();
    sm.storageManager = { storeConversation: async () => {}, isInitialized: () => true };
    await sm.registerDelegatedSession({
      sessionId: 9n, jobId: 10n, hostUrl: 'http://h', hostAddress: '0xhost', model: 'm',
      chainId: 84532, depositAmount: '1', pricePerToken: 1, proofInterval: 100, duration: 3600,
      lora: LORA, onServeBackError: () => {},
    }).catch(() => undefined);
    expect(sm.sessions.get('9')?.lora).toEqual(LORA);
    expect(typeof sm.sessions.get('9')?.onServeBackError).toBe('function');
  });
  it('carries onServeBackError too — a callback that cannot survive a re-init is silent', async () => {
    // Same seeding problem, and the consequence is worse: §4b's callback is the ONLY thing
    // that stops a post-ack staging failure from being silent. Losing it on a re-init means
    // the session answers from the base model with nobody told.
    const { sm } = harness();
    const seen: any[] = [];
    external(sm, { lora: LORA, onServeBackError: (e: any) => seen.push(e) });
    await sm.acquireSessionTransport('7');
    expect(typeof sm.sessions.get('7').onServeBackError).toBe('function');
  });
});

describe('every SessionState seeding site must carry lora (structural guard)', () => {
  // Deliberately a SOURCE-STRUCTURE test, which is unusual and is justified here: the defect
  // class is "a seeding path forgot the field", it has now occurred twice, and one of the three
  // paths — startSession — cannot be driven in a unit test without standing up chain,
  // payment and host-selection plumbing. Testing behaviour where possible (the external and
  // delegated paths above) and structure where it is not beats leaving the gap open again.
  it('each `this.sessions.set` builds a state that includes lora and onServeBackError', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/managers/SessionManager.ts', 'utf8');
    const lines = src.split('\n');
    const sites = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.includes('this.sessions.set('))
      // the re-store sites (updating an existing session) are not SEEDING sites
      // SEEDING sites only: those that build a SessionState from a caller's `config`. Excluded
      // deliberately, and each for a stated reason rather than to make the test pass:
      //   · one site re-stores an already-built session object (nothing to seed);
      //   · two restore from persisted S5 conversation metadata, which has never carried an
      //     adapter — see the limitation test below.
      // Discriminate on the CALL ITSELF, not a window: a seeding site stores either an inline
      // literal or a freshly-built `sessionState`. The excluded sites pass an existing
      // `session` identifier — one re-storing an already-built object, two restoring from
      // persisted S5 metadata (see the limitation test below). A window-based filter caught
      // `config.` from a neighbouring function and mis-classified the first of those.
      .filter(({ l }) => l.includes(', {') || l.includes('sessionState'));
    expect(sites.length).toBeGreaterThanOrEqual(3);
    for (const { i } of sites) {
      const window = lines.slice(Math.max(0, i - 45), i + 20).join('\n');
      expect(window, `sessions.set at line ${i + 1} builds a SessionState without lora`).toContain('lora');
      expect(window, `sessions.set at line ${i + 1} builds a SessionState without onServeBackError`).toContain('onServeBackError');
    }
  });
});

describe('KNOWN LIMITATION — a session restored from S5 loses its adapter', () => {
  it('is documented, not silently tolerated', async () => {
    // Two sites rebuild SessionState from persisted conversation metadata after a reload. That
    // metadata has never carried `lora`, so a restored serve-back session re-inits WITHOUT the
    // adapter and the node refuses (E.3) rather than silently serving the base model — the
    // fail-closed direction, but still a broken resume.
    //
    // Fixing it means persisting the adapter pointer into the conversation metadata schema,
    // which is a storage change rather than a session-wiring one, and a restored session's
    // adapter would need re-staging on the node regardless. Recorded here so the next person
    // finds a decision rather than an oversight.
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/managers/SessionManager.ts', 'utf8');
    const restores = src.split('\n').filter((l) => l.includes('conversation.metadata.totalTokens'));
    expect(restores.length).toBeGreaterThan(0);   // the restore paths still exist as described
  });
});
