// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// WebSocket-based encrypted training submit + dispatch. Mirrors utils/ltx-ws.ts (Constraint 2,
// 7) with the three things training adds: an over-claim guard on every echoed number
// (Constraint 5), durable pointer journalling (CK-6), and a liveness watchdog.
// docs/node-reference/DESIGN-TRAINING-M0-INTERFACE.md v0.3.12 § WebSocket protocol.
import type {
  TrainingJob, TrainingSliceEvent, TrainingCheckpointPointer, ManifestPointer,
  TrainingBilling, TrainingModerationStatus, TrainProgressFrame,
  TrainAction, TrainCancelAction,
} from '../types/training.types';
import { buildTrainAction, buildTrainCancelAction } from '../types/training.types';
import { TrainingError, TRAINING_WIRE_VISIBLE_CODES } from '../errors/training-errors';
import type { TrainingErrorCode } from '../errors/training-errors';
import { trainingTokens, trainingSliceSchedule } from './training-utils';

/** A capability pointer as it arrived, plus whether the durable write succeeded. */
export interface TrainingPointerRecord {
  kind: 'checkpoint' | 'adapter';
  sliceIndex?: number;
  pointer: ManifestPointer | TrainingCheckpointPointer;
  /** false = the journal write failed. The pointer is STILL HERE — that is the point. */
  persisted: boolean;
}

export interface TrainingResult {
  adapter: ManifestPointer;
  billing: TrainingBilling;
  proofCIDs: string[];
  moderation: TrainingModerationStatus;
  warnings?: string[];
  slices: TrainingSliceEvent[];
  allowListVersion?: number;
  requestId: string;
}

export interface TrainingHandle {
  requestId: string;
  /** The session the run rides — created by the SDK on the wallet path, adopted on the vault
   *  path. What a caller relays for reclaim (`triggerSessionTimeout(Number(jobId))`); set by
   *  `TrainingManager.submitTraining`, absent when `SessionManager.submitTraining` is called direct. */
  sessionId?: bigint;
  jobId?: bigint;
  /** Sends `train_cancel`; the run aborts at the NEXT SLICE BOUNDARY, completed slices still
   *  settle, and M0 has deliberately no "keep training after the client is gone" mode. */
  cancel(): Promise<void>;
  result: Promise<TrainingResult>;
    /** Live views — populated as frames land, and readable AFTER a rejection. */
  slices: TrainingSliceEvent[];
  pointers: TrainingPointerRecord[];
  /** Indices whose proof FORFEITED (`submitted: false`) — partial provenance, not failure. */
  forfeitedSlices: number[];
}

export interface TrainingWsOptions {
  wsClient: { sendWithoutResponse(data: any): Promise<void>; onMessage(handler: (data: any) => void): () => void };
  encryptionManager: {
    encryptMessage(key: Uint8Array, plaintext: string, index: number): { ciphertextHex: string; nonceHex: string; aadHex: string };
    decryptMessage(key: Uint8Array, payload: any): string;
  };
  sessionId: string;
  sessionKey: Uint8Array;
  messageIndex: { value: number };
  job: TrainingJob;
  requestId?: string;
  onProgress?: (progress: TrainProgressFrame) => void;
  onSlice?: (slice: TrainingSliceEvent) => void;
  /** CK-6 journal. Called BEFORE further processing: pointers arrive ONCE, no re-delivery. */
  persistPointer?: (record: TrainingPointerRecord) => void | Promise<void>;
  /** The VERIFIED on-chain session price (A.3). Omit to skip the price arm of the guard. */
  onChainPricePerToken?: string;
  /** The bundle's `minAllowListVersion` at pre-validation time. */
  minAllowListVersion?: number;
  /** The bundle's `perTemplate` slice size. Omit to skip the schedule arm of the guard. */
  sliceTokens?: number;
  livenessMs?: number;
  missedBeatsAllowed?: number;
  /** How long to keep listening after `train_cancel` for the node's terminal frame. Defaults to
   *  the node's own `TRAIN_WS_WRITE_TIMEOUT_SECS` (900 s): the run stops at the NEXT slice
   *  boundary, and a slice is ≤ ~15 min wall-clock at M0 bounds. */
  cancelGraceMs?: number;
}

/**
 * Unrecognised wire code ⇒ TRAIN_FAILED, with the ORIGINAL preserved in `detail.unknownCode`.
 *
 * The doc's forward-compatibility commitments cover REASON vocabularies, never the CODE set, so
 * a newer node's code reaches an older SDK unrecognised. The two ways to be wrong are not
 * symmetric: treating an unknown MODERATION-class code as re-shoppable launders a held job
 * around the network — which the interface forbids outright — while treating an unknown
 * capacity code as terminal merely costs the user a resubmit. Keeping the original code is what
 * lets `isReshoppable` refuse without pretending we understood it.
 */
function mapCode(raw: unknown): { code: TrainingErrorCode; unknownCode?: string } {
  return (TRAINING_WIRE_VISIBLE_CODES as readonly string[]).includes(raw as string)
    ? { code: raw as TrainingErrorCode }
    : { code: 'TRAIN_FAILED', unknownCode: String(raw) };
}

export async function submitTrainingWs(opts: TrainingWsOptions): Promise<TrainingHandle> {
  const {
    wsClient, encryptionManager, sessionId, sessionKey, messageIndex, job, requestId,
    onProgress, onSlice, persistPointer, onChainPricePerToken, minAllowListVersion,
    sliceTokens, livenessMs = 60_000, missedBeatsAllowed = 3, cancelGraceMs = 900_000,
  } = opts;

  const total = trainingTokens(job);
  const expected = sliceTokens ? trainingSliceSchedule(total, sliceTokens) : null;
  // Prefix sums ONCE: recomputing a running total per slice is O(n^2) for a constant answer.
  let running = 0;
  const expectedCumulative = expected ? expected.map((delta) => (running += delta)) : null;
  const slices: TrainingSliceEvent[] = [];
  const pointers: TrainingPointerRecord[] = [];
  const forfeitedSlices: number[] = [];
  let resolvedRequestId = requestId ?? '';
  let acceptedVersion: number | undefined;
  let isSettled = false;
  let cancelFn: () => Promise<void> = async () => {};

  const send = async (inner: TrainAction | TrainCancelAction): Promise<void> => {
    const encrypted = encryptionManager.encryptMessage(sessionKey, JSON.stringify(inner), messageIndex.value++);
    await wsClient.sendWithoutResponse({
      type: 'encrypted_message',
      session_id: sessionId,
      id: `train-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      payload: encrypted,
    });
  };

  /** In-memory FIRST, durable second. A journal failure must never cost the user the artifact. */
  const journal = (kind: 'checkpoint' | 'adapter', pointer: ManifestPointer, sliceIndex?: number): void => {
    const record: TrainingPointerRecord = { kind, pointer, persisted: false };
    if (sliceIndex !== undefined) record.sliceIndex = sliceIndex;
    pointers.push(record);
    if (!persistPointer) return;
    try {
      const maybe = persistPointer(record) as Promise<void> | void;
      if (maybe && typeof (maybe as Promise<void>).then === 'function') {
        (maybe as Promise<void>).then(() => { record.persisted = true; }, () => { record.persisted = false; });
      } else {
        record.persisted = true;
      }
    } catch {
      record.persisted = false; // recorded, surfaced by the caller — never rethrown into dispatch
    }
  };

  /** Constraint 5: recompute every number the node echoed. Returns a message, or null. */
  const checkAccepted = (msg: any): string | null => {
    if (msg.billing?.tokens !== total) {
      return `train_accepted claims ${msg.billing?.tokens} tokens; the pinned schedule totals ${total}`;
    }
    if (onChainPricePerToken !== undefined && msg.billing?.pricePerToken !== onChainPricePerToken) {
      return `train_accepted prices at ${msg.billing?.pricePerToken}; the verified on-chain price is ${onChainPricePerToken}`;
    }
    if (expected && (msg.schedule?.sliceTokens !== sliceTokens || msg.schedule?.slices !== expected.length)) {
      return `train_accepted schedule ${msg.schedule?.slices}x${msg.schedule?.sliceTokens} != the computed ${expected.length}x${sliceTokens}`;
    }
    return null;
  };

  /** The over-claim guard on a settled slice: order, delta and running total all pinned. */
  const checkSlice = (s: TrainingSliceEvent): string | null => {
    if (!expected) return null;
    if (s.index !== slices.length) return `slice index ${s.index} out of order; expected ${slices.length}`;
    if (s.index >= expected.length) return `slice index ${s.index} is beyond the ${expected.length}-slice schedule`;
    if (s.tokensDelta !== expected[s.index]) {
      return `slice ${s.index} claims ${s.tokensDelta} tokens; the schedule says ${expected[s.index]}`;
    }
    const cumulative = expectedCumulative![s.index];
    if (s.cumulativeTokens !== cumulative) {
      return `slice ${s.index} claims ${s.cumulativeTokens} cumulative; the schedule says ${cumulative}`;
    }
    return null;
  };

  const resultPromise = new Promise<TrainingResult>((resolve, reject) => {
    let missed = 0;
    let beat: ReturnType<typeof setInterval> | undefined;
    let cancelGrace: ReturnType<typeof setTimeout> | undefined;
    // A node can accept the SOCKET and never send `train_accepted`, leaving `result` pending
    // forever on a session that is already funded. The liveness watchdog only starts AT the
    // accept, so nothing covered the window before it. Same tolerance for silence as liveness.
    const acceptMs = livenessMs * missedBeatsAllowed;
    let acceptTimer: ReturnType<typeof setTimeout> | undefined;

    const settle = () => {
      isSettled = true;
      if (beat) clearInterval(beat);
      if (cancelGrace) clearTimeout(cancelGrace);
      if (acceptTimer) clearTimeout(acceptTimer);
      unsub();
    };
    const safeResolve = (r: TrainingResult) => { if (!isSettled) { settle(); resolve(r); } };
    const safeReject = (e: Error) => { if (!isSettled) { settle(); reject(e); } };
    const mismatch = (message: string, code: TrainingErrorCode = 'ESTIMATE_MISMATCH') =>
      safeReject(new TrainingError(message, code, { settledSlices: slices.length }));

    cancelFn = async () => {
      try {
        await send(buildTrainCancelAction());
      } catch (err: any) {
        // The cancel never reached the node, so the run CONTINUES and keeps billing. That is
        // the opposite of what the caller asked for and must not look like a successful stop.
        safeReject(new TrainingError(
          `failed to send train_cancel — the run may still be executing: ${err?.message}`,
          'SIDECAR_UNAVAILABLE', { settledSlices: slices.length },
        ));
        return;
      }
      // Deliberately NOT settled here. The run aborts at the NEXT SLICE BOUNDARY: that slice
      // still executes, settles and BILLS, and a terminal `CANCELLED` carries the settled
      // detail. Unsubscribing now would drop that slice's checkpoint pointer — delivered once,
      // with no reconnect re-delivery in M0 — leaving the user paying for an artifact whose
      // capability CID is unrecoverable. So we keep listening, bounded.
      if (cancelGrace) clearTimeout(cancelGrace);
      cancelGrace = setTimeout(() => {
        safeReject(new TrainingError(
          `no terminal frame within ${cancelGraceMs} ms of train_cancel`,
          'CANCELLED', { reason: 'noTerminalFrame', settledSlices: slices.length },
        ));
      }, cancelGraceMs);
    };

    // Liveness: the node promises a progress frame at least every 60 s in EVERY stage, which
    // is what keeps NATs and proxies from killing a multi-hour socket. Silence past the
    // allowance means the TRANSPORT died, not that the run failed — so `settledSlices` rides
    // along and the caller can tell a k = 0 death (re-shoppable) from a paid one.
    const startWatchdog = () => {
      if (beat) clearInterval(beat);
      missed = 0;
      beat = setInterval(() => {
        missed += 1;
        if (missed >= missedBeatsAllowed) {
          safeReject(new TrainingError(
            `no train_progress for ${missed} intervals of ${livenessMs} ms — transport lost`,
            'TIMEOUT',
            { reason: 'liveness', missedBeats: missed, settledSlices: slices.length },
          ));
        }
      }, livenessMs);
    };

    const unsub = wsClient.onMessage((data: any) => {
      if (isSettled) return;
      if (data.type === 'error') {
        safeReject(new TrainingError(data.message || 'training failed', 'TRAIN_FAILED'));
        return;
      }
      if (data.type !== 'encrypted_response' || !data.payload) return;
      try {
        const msg = JSON.parse(encryptionManager.decryptMessage(sessionKey, data.payload));
        if (msg.type === 'train_accepted') {
          if (msg.requestId) { resolvedRequestId = msg.requestId; handle.requestId = resolvedRequestId; }
          // `undefined < n` is FALSE, so a node that simply omits the field would sail past a
          // bare `<` comparison. Absence is not freshness — require the number.
          if (minAllowListVersion !== undefined
              && (typeof msg.allowListVersion !== 'number' || msg.allowListVersion < minAllowListVersion)) {
            mismatch(
              `host allowListVersion ${msg.allowListVersion} is older than the ${minAllowListVersion} validated against`,
              'TRAINING_BUNDLE_STALE',
            );
            return;
          }
          const bad = checkAccepted(msg);
          if (bad) { mismatch(bad); return; }
          acceptedVersion = msg.allowListVersion;
          if (acceptTimer) clearTimeout(acceptTimer);
          startWatchdog();
        } else if (msg.type === 'train_progress') {
          missed = 0;
          // CK-6: journal BEFORE onProgress. A caller's handler can throw or be slow, and the
          // pointer is delivered exactly once — persist it while we certainly hold it.
          if (msg.checkpoint) journal('checkpoint', msg.checkpoint);
          if (msg.adapter) journal('adapter', msg.adapter);
          if (msg.slice) {
            const bad = checkSlice(msg.slice);
            if (bad) { mismatch(bad); return; }
            journal('checkpoint', msg.slice.checkpoint, msg.slice.index);
            slices.push(msg.slice);
            if (msg.slice.proof && msg.slice.proof.submitted === false) forfeitedSlices.push(msg.slice.index);
            onSlice?.(msg.slice);
          }
          onProgress?.(msg as TrainProgressFrame);
        } else if (msg.type === 'train_complete') {
          // §C.1's [CK-2] guard, arm (3): the FINAL bill is re-derived too — REGARDLESS of
          // forfeits. Without it a host can echo honestly at accept, pass every slice, and
          // inflate the total at the end with nothing left to challenge it.
          if (msg.billing?.tokens !== total) {
            mismatch(`train_complete bills ${msg.billing?.tokens} tokens; the pinned schedule totals ${total}`);
            return;
          }
          // The protocol section makes proofCIDs required. `?? []` would let a malformed frame read as an
          // honest zero-proof run — and pre-MVP policy here is fail fast, never fall back.
          if (!Array.isArray(msg.proofCIDs)) {
            safeReject(new TrainingError(
              'train_complete carries no proofCIDs array; refusing to report it as a zero-proof run',
              'TRAIN_FAILED', { settledSlices: slices.length },
            ));
            return;
          }
          // §C.4 fail-closed: no dataset trains anywhere without a Cleared verdict, so an
          // ABSENT verdict is exactly the case that must not read as OK. The field is required
          // and typed non-optional — letting it through hands the first consumer a TypeError
          // from inside SDK code instead of a decision it can act on.
          if (!msg.moderation || typeof msg.moderation.status !== 'string') {
            safeReject(new TrainingError(
              'train_complete carries no moderation verdict; refusing to report the run as cleared',
              'TRAIN_FAILED', { settledSlices: slices.length },
            ));
            return;
          }
          journal('adapter', msg.adapter);
          safeResolve({
            adapter: msg.adapter, billing: msg.billing, proofCIDs: msg.proofCIDs,
            moderation: msg.moderation, warnings: msg.warnings, slices,
            allowListVersion: acceptedVersion, requestId: msg.requestId ?? resolvedRequestId,
          });
        } else if (msg.type === 'train_error') {
          const mapped = mapCode(msg.error?.code);
          safeReject(new TrainingError(
            msg.error?.message || 'training failed',
            mapped.code,
            mapped.unknownCode === undefined
              ? msg.error?.detail
              : { ...(msg.error?.detail ?? {}), unknownCode: mapped.unknownCode },
          ));
        }
      } catch (err: any) { if (!isSettled) safeReject(err); }
    });

    acceptTimer = setTimeout(() => {
      safeReject(new TrainingError(
        `no train_accepted within ${acceptMs} ms`, 'TIMEOUT',
        { reason: 'noAccept', settledSlices: 0 },
      ));
    }, acceptMs);

    try {
      send(buildTrainAction(job, requestId)).catch((err: any) => {
        safeReject(new TrainingError(`failed to send train: ${err.message}`, 'SIDECAR_UNAVAILABLE'));
      });
    } catch (err: any) {
      // `buildTrainAction` validates SYNCHRONOUSLY and can throw. A raw throw inside this
      // executor rejects the promise but never runs settle(), leaking the listener and the
      // timers on every malformed submit. Route it through safeReject so cleanup happens.
      safeReject(err);
    }
  });

  // Mark the ORIGINAL handled so a client-side cancel before anyone awaits `result` cannot
  // surface as an unhandled rejection; consumers still see the rejection on their own chain.
  resultPromise.catch(() => {});

  const handle: TrainingHandle = {
    requestId: resolvedRequestId, cancel: () => cancelFn(), result: resultPromise,
    slices, pointers, forfeitedSlices,
  };
  return handle;
}
