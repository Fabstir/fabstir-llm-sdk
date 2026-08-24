/**
 * Phase 5 — `submitTrainingWs` dispatch (§ WebSocket protocol) at v0.3.9.
 *
 * Constraint 5 is the spine: every number the node echoes in `train_accepted` is
 * independently recomputable by the client, so an over-claim is caught BEFORE a slice
 * settles rather than reconciled after the money moves. The pointer rules (CK-6) are the
 * other half: capability pointers are delivered ONCE to a live socket with no reconnect
 * re-delivery in M0, so losing one loses the user's artifact.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { submitTrainingWs } from '../../src/utils/training-ws';
import { trainingTokens, trainingSliceSchedule } from '../../src/utils/training-utils';
import type { TrainingJob } from '../../src/types/training.types';

const JOB: TrainingJob = {
  templateId: 'train-qlora-qwen38-27b-v1',
  templateHash: `0x${'ab'.repeat(32)}`,
  dataset: {
    manifestCID: 'uDatasetManifestCap', manifestSha256: `0x${'cd'.repeat(32)}`,
    declaredTokens: 3_200_050, samples: 5000,   // NOT divisible by sliceTokens on purpose:
    // 9,600,150 total => [1.2M x7, 1_200_150]. A uniform schedule never exercises B.1's
    // last-slice-absorbs rule, so `expected[i]` and a raw `sliceTokens` would be indistinguishable.
  },
  epochs: 3,
  hyper: { rank: 16, alpha: 32, lr: '0.000200', seed: '18446744073709551629', seqLen: 2048 },
  output: 'adapter-v1',
};
const SLICE_TOKENS = 1_200_000;
const TOTAL = trainingTokens(JOB);                       // 9,600,000
const SCHEDULE = trainingSliceSchedule(TOTAL, SLICE_TOKENS);
const PRICE = '904';

const encryptionManager = {
  encryptMessage: vi.fn((_k: Uint8Array, plaintext: string) => ({ ciphertextHex: plaintext, nonceHex: '00', aadHex: 'aa' })),
  decryptMessage: vi.fn((_k: Uint8Array, payload: any) => payload.ciphertextHex),
};

function makeWs() {
  let handler: ((d: any) => void) | undefined;
  const sent: any[] = [];
  return {
    wsClient: {
      sendWithoutResponse: vi.fn(async (d: any) => { sent.push(d); }),
      onMessage: (h: (d: any) => void) => { handler = h; return () => { handler = undefined; }; },
    },
    sent,
    handlerCount: () => (handler ? 1 : 0),
    emit: (m: any) => handler?.({ type: 'encrypted_response', payload: { ciphertextHex: JSON.stringify(m), nonceHex: '', aadHex: '' } }),
    raw: (d: any) => handler?.(d),
  };
}

const accepted = (over: Record<string, unknown> = {}) => ({
  type: 'train_accepted', status: 'processing', sessionId: 's1', allowListVersion: 7,
  billing: { unit: 'training-token', tokens: TOTAL, pricePerToken: PRICE },
  schedule: { sliceTokens: SLICE_TOKENS, slices: SCHEDULE.length }, ...over,
});

const sliceEvent = (i: number, over: Record<string, unknown> = {}) => ({
  index: i, stepFrom: i * 10, stepTo: (i + 1) * 10,
  tokensDelta: SCHEDULE[i],
  cumulativeTokens: SCHEDULE.slice(0, i + 1).reduce((a, b) => a + b, 0),
  checkpoint: { manifestCID: `uCkpt${i}`, manifestSha256: `0x${String(i).repeat(64)}`, sizeBytes: 100 },
  proof: { proofCID: `uProof${i}`, submitted: true }, ...over,
});

function submit(extra: Record<string, unknown> = {}) {
  const ws = makeWs();
  const handle = submitTrainingWs({
    wsClient: ws.wsClient, encryptionManager, sessionId: 's1', sessionKey: new Uint8Array(32),
    messageIndex: { value: 0 }, job: JOB, onChainPricePerToken: PRICE,
    minAllowListVersion: 5, sliceTokens: SLICE_TOKENS, ...extra,
  } as any);
  return { ws, handle };
}

afterEach(() => { vi.useRealTimers(); });

describe('the submit envelope', () => {
  it('sends action=train at top level with the job fields and the requestId', async () => {
    const { ws } = submit({ requestId: 'req-1' });
    await (await ws.wsClient.sendWithoutResponse.mock.results[0]?.value);
    const inner = JSON.parse(ws.sent[0].payload.ciphertextHex);
    expect(inner.action).toBe('train');
    expect(inner.requestId).toBe('req-1');
    expect(inner.dataset.manifestCID).toBe('uDatasetManifestCap');
    expect(JSON.stringify(inner)).not.toContain('manifestCid"');
    expect(ws.sent[0].type).toBe('encrypted_message');
  });
});

describe('train_accepted — constraint 5, every echoed number recomputed', () => {
  it('accepts an echo that matches the client’s own computation', async () => {
    const { ws, handle } = submit();
    const h = await handle;
    ws.emit(accepted());
    ws.emit({ type: 'train_complete', adapter: { manifestCID: 'uA', manifestSha256: '0xaa' },
      billing: { unit: 'training-token', tokens: TOTAL, pricePerToken: PRICE },
      proofCIDs: [], moderation: { status: 'cleared' } });
    await expect(h.result).resolves.toMatchObject({ allowListVersion: 7 });
  });
  it('REJECTS an over-claimed token total', async () => {
    const { ws, handle } = submit();
    const h = await handle;
    ws.emit(accepted({ billing: { unit: 'training-token', tokens: TOTAL + 1, pricePerToken: PRICE } }));
    await expect(h.result).rejects.toMatchObject({ code: 'ESTIMATE_MISMATCH' });
  });
  it('REJECTS a price that is not the verified on-chain price (A.3)', async () => {
    const { ws, handle } = submit();
    const h = await handle;
    ws.emit(accepted({ billing: { unit: 'training-token', tokens: TOTAL, pricePerToken: '905' } }));
    await expect(h.result).rejects.toMatchObject({ code: 'ESTIMATE_MISMATCH' });
  });
  it('REJECTS a schedule echo that diverges from the pinned B.1 computation', async () => {
    const { ws, handle } = submit();
    const h = await handle;
    ws.emit(accepted({ schedule: { sliceTokens: SLICE_TOKENS, slices: SCHEDULE.length + 1 } }));
    await expect(h.result).rejects.toMatchObject({ code: 'ESTIMATE_MISMATCH' });
  });
  it('REJECTS an allowListVersion older than the bundle the client validated against', async () => {
    const { ws, handle } = submit();
    const h = await handle;
    ws.emit(accepted({ allowListVersion: 4 }));
    await expect(h.result).rejects.toMatchObject({ code: 'TRAINING_BUNDLE_STALE' });
  });
});

describe('train_progress — all seven stages, and the pointer rules (CK-6)', () => {
  it('routes every pinned stage to onProgress', async () => {
    const seen: string[] = [];
    const { ws, handle } = submit({ onProgress: (p: any) => seen.push(p.stage) });
    await handle;
    ws.emit(accepted());
    for (const stage of ['staging', 'scanning', 'counting', 'training', 'checkpointing', 'uploading', 'finalising']) {
      ws.emit({ type: 'train_progress', stage });
    }
    expect(seen).toEqual(['staging', 'scanning', 'counting', 'training', 'checkpointing', 'uploading', 'finalising']);
  });
  it('journals the uploading checkpoint and the finalising adapter BEFORE anything else', async () => {
    const order: string[] = [];
    const { ws, handle } = submit({
      persistPointer: (p: any) => { order.push(`persist:${p.kind}`); },
      onProgress: (p: any) => { order.push(`progress:${p.stage}`); },
    });
    await handle;
    ws.emit(accepted());
    ws.emit({ type: 'train_progress', stage: 'uploading', checkpoint: { manifestCID: 'uC', manifestSha256: '0xcc', sizeBytes: 9 } });
    ws.emit({ type: 'train_progress', stage: 'finalising', adapter: { manifestCID: 'uA', manifestSha256: '0xaa' } });
    // Money never moves ahead of the client holding the pointer, and M0 has NO reconnect
    // re-delivery — so the journal write must precede the callback that might throw.
    expect(order).toEqual(['persist:checkpoint', 'progress:uploading', 'persist:adapter', 'progress:finalising']);
  });
  it('KEEPS the pointer in memory when the durable journal fails', async () => {
    const { ws, handle } = submit({ persistPointer: () => { throw new Error('S5 down'); } });
    const h = await handle;
    ws.emit(accepted());
    ws.emit({ type: 'train_progress', stage: 'uploading', checkpoint: { manifestCID: 'uC', manifestSha256: '0xcc', sizeBytes: 9 } });
    // A POINTER_PERSIST_FAILED must never cost the user the artifact it was trying to save.
    expect(h.pointers).toHaveLength(1);
    expect(h.pointers[0]).toMatchObject({ kind: 'checkpoint', persisted: false });
    expect(h.pointers[0].pointer.manifestCID).toBe('uC');
  });
});

describe('slice events — the over-claim guard', () => {
  const start = async () => { const s = submit(); const h = await s.handle; s.ws.emit(accepted()); return { ...s, h }; };
  it('accepts slices that match the pinned schedule and records them', async () => {
    const { ws, h } = await start();
    ws.emit({ type: 'train_progress', stage: 'training', slice: sliceEvent(0) });
    ws.emit({ type: 'train_progress', stage: 'training', slice: sliceEvent(1) });
    expect(h.slices).toHaveLength(2);
    expect(h.pointers.filter((p: any) => p.kind === 'checkpoint')).toHaveLength(2);
  });
  it('REJECTS a slice whose tokensDelta is not the scheduled delta', async () => {
    const { ws, h } = await start();
    ws.emit({ type: 'train_progress', stage: 'training', slice: sliceEvent(0, { tokensDelta: SCHEDULE[0] + 1 }) });
    await expect(h.result).rejects.toMatchObject({ code: 'ESTIMATE_MISMATCH' });
  });
  it('REJECTS a cumulative overrun even when each delta looks right', async () => {
    const { ws, h } = await start();
    ws.emit({ type: 'train_progress', stage: 'training', slice: sliceEvent(0, { cumulativeTokens: TOTAL }) });
    await expect(h.result).rejects.toMatchObject({ code: 'ESTIMATE_MISMATCH' });
  });
  it('REJECTS an index gap — a skipped slice is an unbilled slice claimed as billed', async () => {
    const { ws, h } = await start();
    ws.emit({ type: 'train_progress', stage: 'training', slice: sliceEvent(0) });
    ws.emit({ type: 'train_progress', stage: 'training', slice: sliceEvent(2) });
    await expect(h.result).rejects.toMatchObject({ code: 'ESTIMATE_MISMATCH' });
  });
  it('records submitted:false as PARTIAL PROVENANCE rather than treating it as a failure', async () => {
    const { ws, h } = await start();
    ws.emit({ type: 'train_progress', stage: 'training', slice: sliceEvent(0, { proof: { proofCID: 'uP', submitted: false } }) });
    // E.1(a): a forfeited final proof means the adapter is bound only through the last landed
    // checkpoint. The run is still real and the artifact still owned — do not abort it.
    expect(h.slices[0].proof.submitted).toBe(false);
    expect(h.forfeitedSlices).toEqual([0]);
  });
});

describe('CK-2 arm (3) — the FINAL bill is re-derived too', () => {
  const start = async () => { const w = submit(); const h = await w.handle; w.ws.emit(accepted()); return { ...w, h }; };
  it('REJECTS a train_complete that inflates billing.tokens', async () => {
    // doc:588-593 pins THREE arms. Checking accept and each slice but not the final total lets
    // a host echo honestly at accept and inflate at the end, unchallenged.
    const { ws, h } = await start();
    ws.emit({ type: 'train_complete', adapter: { manifestCID: 'uA', manifestSha256: '0xaa' },
      billing: { unit: 'training-token', tokens: TOTAL + 1, pricePerToken: PRICE },
      proofCIDs: [], moderation: { status: 'cleared' } });
    await expect(h.result).rejects.toMatchObject({ code: 'ESTIMATE_MISMATCH' });
  });
  it('journals the FINAL adapter pointer on train_complete, not just on finalising', async () => {
    const persisted: any[] = [];
    const w = submit({ persistPointer: (r: any) => persisted.push(r) });
    const h = await w.handle; w.ws.emit(accepted());
    w.ws.emit({ type: 'train_complete', adapter: { manifestCID: 'uFinal', manifestSha256: '0xaa' },
      billing: { unit: 'training-token', tokens: TOTAL, pricePerToken: PRICE },
      proofCIDs: ['uP'], moderation: { status: 'cleared' } });
    await h.result;
    // Delivered once, no reconnect re-delivery in M0. This is the pointer to the artifact the
    // user actually paid for; the `finalising` frame is an EARLIER copy, not a substitute.
    expect(h.pointers.at(-1)).toMatchObject({ kind: 'adapter', pointer: { manifestCID: 'uFinal' } });
    expect(persisted.at(-1)).toMatchObject({ kind: 'adapter', persisted: true });
  });
  it('rejects a MISSING moderation verdict — C.4 fail-closed (rev-wire D-5)', async () => {
    // `proofCIDs` was guarded and `moderation` was not, though both are required and
    // `moderation` is typed non-optional. A frame without it resolved fine, and the first
    // consumer reading `result.moderation.status` got a TypeError from inside SDK code.
    // C.4's rule is that no dataset trains anywhere without a Cleared verdict, so an ABSENT
    // verdict is precisely the case that must not read as OK.
    const { ws, h } = await start();
    ws.emit({ type: 'train_complete', adapter: { manifestCID: 'uA', manifestSha256: '0xaa' },
      billing: { unit: 'training-token', tokens: TOTAL, pricePerToken: PRICE }, proofCIDs: [] });
    await expect(h.result).rejects.toThrow(/moderation/i);
  });
  it('rejects a MISSING proofCIDs rather than reporting a zero-proof run', async () => {
    const { ws, h } = await start();
    ws.emit({ type: 'train_complete', adapter: { manifestCID: 'uA', manifestSha256: '0xaa' },
      billing: { unit: 'training-token', tokens: TOTAL, pricePerToken: PRICE },
      moderation: { status: 'cleared' } });
    await expect(h.result).rejects.toThrow(/proofCIDs/i);
  });
});

describe('the guard cannot be disarmed by omission', () => {
  it('REJECTS a train_accepted with NO allowListVersion (undefined < n is false)', async () => {
    const { ws, handle } = submit();
    const h = await handle;
    const { allowListVersion, ...noVersion } = accepted() as any;
    ws.emit(noVersion);
    await expect(h.result).rejects.toMatchObject({ code: 'TRAINING_BUNDLE_STALE' });
  });
  it('ACCEPTS allowListVersion EQUAL to the validated minimum — the normal case', async () => {
    const { ws, handle } = submit();
    const h = await handle;
    ws.emit(accepted({ allowListVersion: 5 }));
    ws.emit({ type: 'train_complete', adapter: { manifestCID: 'uA', manifestSha256: '0xaa' },
      billing: { unit: 'training-token', tokens: TOTAL, pricePerToken: PRICE },
      proofCIDs: [], moderation: { status: 'cleared' } });
    await expect(h.result).resolves.toMatchObject({ allowListVersion: 5 });
  });
  it('REJECTS a slice claimed BEYOND the schedule — the direct over-billing move', async () => {
    const { ws, handle } = submit();
    const h = await handle;
    ws.emit(accepted());
    for (let i = 0; i < SCHEDULE.length; i++) ws.emit({ type: 'train_progress', stage: 'training', slice: sliceEvent(i) });
    ws.emit({ type: 'train_progress', stage: 'training',
      slice: { ...sliceEvent(0), index: SCHEDULE.length, cumulativeTokens: TOTAL + SCHEDULE[0] } });
    await expect(h.result).rejects.toMatchObject({ code: 'ESTIMATE_MISMATCH' });
  });
});

describe('the liveness watchdog', () => {
  it('fails after the allowed missed beats and names the transport, not the node', async () => {
    vi.useFakeTimers();
    const { ws, handle } = submit({ livenessMs: 1000, missedBeatsAllowed: 3 });
    const h = await handle;
    ws.emit(accepted());
    const settled = expect(h.result).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(3000);
    await settled;
  });
  it('a single beat resets the count — the node promises one every 60 s in EVERY stage', async () => {
    vi.useFakeTimers();
    const { ws, handle } = submit({ livenessMs: 1000, missedBeatsAllowed: 3 });
    const h = await handle;
    ws.emit(accepted());
    let rejected = false;
    h.result.catch(() => { rejected = true; });
    await vi.advanceTimersByTimeAsync(2000);
    ws.emit({ type: 'train_progress', stage: 'training' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(rejected).toBe(false);
  });
});

describe('train_error and cancel', () => {
  it('maps a wire code with its detail.reason', async () => {
    const { ws, handle } = submit();
    const h = await handle;
    ws.emit({ type: 'train_error', error: { code: 'CAPACITY', message: 'busy', detail: { reason: 'slotBusy' } } });
    await expect(h.result).rejects.toMatchObject({ code: 'CAPACITY', detail: { reason: 'slotBusy' } });
  });
  it('carries settledSlices so a caller can tell a k=0 death from a paid one', async () => {
    const { ws, handle } = submit();
    const h = await handle;
    ws.emit({ type: 'train_error', error: { code: 'TRAIN_FAILED', message: 'died', detail: { settledSlices: 3, billedTokens: 3_600_000 } } });
    await expect(h.result).rejects.toMatchObject({ code: 'TRAIN_FAILED', detail: { settledSlices: 3 } });
  });
  it('maps an UNKNOWN code conservatively AND refuses to re-shop it', async () => {
    // The doc's forward-compatibility commitments cover REASON vocabularies, never the code
    // set. So a newer node's code reaches an older SDK unrecognised. The two ways to be wrong
    // are not symmetric: treating an unknown MODERATION-class code as re-shoppable launders a
    // held job around the network, which the interface forbids outright; treating an unknown
    // capacity code as terminal merely costs a resubmit. Refuse.
    const { ws, handle } = submit();
    const h = await handle;
    ws.emit({ type: 'train_error', error: { code: 'CONTENT_QUARANTINED', message: 'future code' } });
    try { await h.result; expect.unreachable(); } catch (e: any) {
      expect(e.code).toBe('TRAIN_FAILED');
      expect(e.detail?.unknownCode).toBe('CONTENT_QUARANTINED');   // the original is preserved
      expect(e.isReshoppable(0)).toBe(false);                      // even at k = 0
    }
  });
  it('cancel sends the pinned action but does NOT settle — the run stops at the NEXT boundary', async () => {
    // The doc is explicit: after train_cancel the run "aborts at the next slice boundary,
    // completed slices settle", and a terminal CANCELLED carries the settled detail. Settling
    // locally the instant we send it unsubscribes before that slice's pointer arrives — the
    // user pays for a checkpoint whose capability CID is then unrecoverable.
    const { ws, handle } = submit();
    const h = await handle;
    ws.emit(accepted());
    let settled = false;
    h.result.catch(() => { settled = true; });
    await h.cancel();
    expect(JSON.parse(ws.sent[1].payload.ciphertextHex)).toEqual({ action: 'train_cancel' });
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it('KEEPS the slice that settles after cancel, and takes the node\'s terminal detail', async () => {
    const { ws, handle } = submit();
    const h = await handle;
    ws.emit(accepted());
    await h.cancel();
    // the in-flight slice completes and settles — this is billed work
    ws.emit({ type: 'train_progress', stage: 'training', slice: sliceEvent(0) });
    ws.emit({ type: 'train_error', error: { code: 'CANCELLED', message: 'cancelled',
      detail: { settledSlices: 1, billedTokens: SCHEDULE[0], lastCheckpoint: { manifestCID: 'uLast', manifestSha256: '0xaa' } } } });
    await expect(h.result).rejects.toMatchObject({
      code: 'CANCELLED', detail: { settledSlices: 1, billedTokens: SCHEDULE[0] },
    });
    expect(h.slices).toHaveLength(1);
    expect(h.pointers.some((p: any) => p.pointer.manifestCID === 'uCkpt0')).toBe(true);
  });

  it('surfaces a FAILED cancel send — the run is still executing and still billing', async () => {
    // Silence here is the worst outcome: the caller believes they stopped a multi-hour paid
    // run that is in fact still going. It must not read as a clean stop.
    const ws = makeWs();
    const handle = submitTrainingWs({
      wsClient: ws.wsClient, encryptionManager, sessionId: 's1', sessionKey: new Uint8Array(32),
      messageIndex: { value: 0 }, job: JOB, onChainPricePerToken: PRICE,
      minAllowListVersion: 5, sliceTokens: SLICE_TOKENS,
    } as any);
    const h = await handle;
    ws.emit(accepted());
    ws.wsClient.sendWithoutResponse = vi.fn(async () => { throw new Error('socket closed'); });
    await h.cancel();
    await expect(h.result).rejects.toMatchObject({ code: 'SIDECAR_UNAVAILABLE' });
  });

  it('gives up after a bounded grace period if no terminal frame arrives', async () => {
    vi.useFakeTimers();
    const { ws, handle } = submit({ cancelGraceMs: 1000, livenessMs: 100000 });
    const h = await handle;
    ws.emit(accepted());
    await h.cancel();
    const settled = expect(h.result).rejects.toMatchObject({ code: 'CANCELLED', detail: { reason: 'noTerminalFrame' } });
    await vi.advanceTimersByTimeAsync(1000);
    await settled;
  });
});

describe('the guard cannot be silently disarmed, and the socket cannot hang', () => {
  const submitRaw = (job: any) => {
    const ws = makeWs();
    return { ws, p: submitTrainingWs({
      wsClient: ws.wsClient, encryptionManager, sessionId: 's1', sessionKey: new Uint8Array(32),
      messageIndex: { value: 0 }, job, onChainPricePerToken: PRICE, sliceTokens: SLICE_TOKENS,
    } as any) };
  };

  it('gives a NAMED error for a non-finite total, not "Invalid array length"', async () => {
    // NaN epochs makes trainingTokens NaN, and `new Array(NaN)` throws a RangeError that names
    // neither the field nor the cause. A caller cannot act on that.
    const { ws, p } = submitRaw({ ...JOB, epochs: Number.NaN });
    await expect(p).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(ws.handlerCount()).toBe(0);
  });

  it('REJECTS a malformed job without leaking the listener (sync throw in the executor)', async () => {
    // A bad `lr` passes schedule computation and fails inside buildTrainAction — which runs
    // SYNCHRONOUSLY inside the Promise executor. A raw throw there rejects the promise but
    // never runs settle(), leaking the listener and the timers on every malformed submit.
    const { ws, p } = submitRaw({ ...JOB, hyper: { ...JOB.hyper, lr: 'not-a-number' } });
    const h = await p;
    await expect(h.result).rejects.toThrow();
    expect(ws.handlerCount()).toBe(0);      // released, because settle() ran
  });

  it('does not wait FOREVER for train_accepted on a funded session', async () => {
    // A node that accepts the socket and then goes silent leaves `result` pending indefinitely.
    // The liveness watchdog only starts at train_accepted, so nothing covered the gap before it.
    vi.useFakeTimers();
    const { handle } = submit({ livenessMs: 1000, missedBeatsAllowed: 3 });
    const h = await handle;
    const settled = expect(h.result).rejects.toMatchObject({ code: 'TIMEOUT', detail: { reason: 'noAccept' } });
    await vi.advanceTimersByTimeAsync(3000);
    await settled;
  });
});
