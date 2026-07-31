/**
 * @fileoverview WebSocket-based encrypted transcode utility.
 * Standalone functions for submitting/cancelling transcode jobs via encrypted WebSocket.
 */
import type { VideoFormat, GOPInfo, TranscodeResult, TranscodeHandle, TranscodeModerationStatus } from '../types/transcode.types';
import { isTranscodeModerationStatus, cloneTranscodeModerationStatus } from '../types/transcode.types';
import { TranscodeError } from '../errors/transcode-errors';
import type { TranscodeErrorCode } from '../errors/transcode-errors';

/**
 * Node `transcode_error` codes that map to a distinct SDK code. Anything not listed here —
 * including a missing code — is a generic `TRANSCODE_FAILED`, which is the pre-existing
 * behaviour and is pinned by test.
 *
 * The three moderation codes mean the node HELD the job: it sent no completion, so there is
 * no result and nothing to publish.
 *
 * A Map, not an object literal: the key comes from the node, and a plain-object lookup answers
 * inherited names too — `error.code: "toString"` would yield a function as the SDK error code,
 * and a polluted prototype could name a RETRYABLE one, which is what makes the load balancer
 * try another host. `Map.get` is immune by construction.
 */
const NODE_ERROR_CODES = new Map<string, TranscodeErrorCode>([
  ['TRANSCODE_CAPACITY_FULL', 'CAPACITY_FULL'],
  ['CONTENT_BLOCKED', 'CONTENT_BLOCKED'],
  ['CONTENT_FLAGGED', 'CONTENT_FLAGGED'],
  ['MODERATION_UNAVAILABLE', 'MODERATION_UNAVAILABLE'],
]);

/**
 * Parse the node's `moderation` field off a `transcode_complete` frame.
 *
 * Preserves what arrived: a string `verdict` passes through UNCHANGED, including an
 * unrecognised future value such as `'quarantined'`. Erasing an unknown verdict here would
 * report it downstream as *absent* — hiding exactly the schema drift a publish gate's dark
 * mode exists to surface. Only `'cleared'` releases, and that call belongs to the gate.
 *
 * Absent ⇒ `undefined`, silently: that is the documented normal case, and the only case that
 * exists until the node ships verdicts. Present but structurally unusable ⇒ `undefined` plus
 * one warning, because a malformed payload IS schema drift worth seeing. Never throws, and
 * never coerces anything toward `cleared`.
 */
function parseModeration(raw: unknown): TranscodeModerationStatus | undefined {
  if (raw === undefined) return undefined;
  if (!isTranscodeModerationStatus(raw)) {
    // Shape only, never contents: this payload FAILED validation, so it is not covered by the
    // node's "reason is a category id, never content, never hashes" guarantee — and it arrived
    // encrypted. SDK console output is routinely forwarded to log aggregators.
    console.warn(`[transcode-ws] Ignoring unusable moderation payload on transcode_complete (${describeShape(raw)})`);
    return undefined;
  }
  return cloneTranscodeModerationStatus(raw);
}

/**
 * Describe a rejected payload's shape for logging, without echoing any of its values.
 *
 * Key NAMES are node-controlled strings too, so they are capped as well as counted — otherwise
 * "shape only" would still admit an unbounded string into the log.
 */
function describeShape(raw: unknown): string {
  if (raw === null) return 'null';
  if (Array.isArray(raw)) return `array[${raw.length}]`;
  if (typeof raw !== 'object') return typeof raw;
  const keys = Object.keys(raw as object);
  const shown = keys.slice(0, 5).map(k => (k.length > 32 ? `${k.slice(0, 32)}…` : k));
  return `object, keys=[${shown.join(',')}${keys.length > 5 ? ',…' : ''}]`;
}

/** Parameters for submitTranscodeWs */
export interface TranscodeWsOptions {
  wsClient: { sendWithoutResponse(data: any): Promise<void>; onMessage(handler: (data: any) => void): () => void };
  encryptionManager: {
    encryptMessage(key: Uint8Array, plaintext: string, index: number): { ciphertextHex: string; nonceHex: string; aadHex: string };
    decryptMessage(key: Uint8Array, payload: any): string;
  };
  sessionId: string;
  sessionKey: Uint8Array;
  messageIndex: { value: number };
  sourceCid: string;
  formats: VideoFormat[];
  isEncrypted?: boolean;
  isGpu?: boolean;
  jobId?: number;
  chainId?: number;
  onProgress?: (progress: number, gopInfo?: GOPInfo) => void;
  timeoutMs?: number;
  previewPercent?: number;
}

/** Submit a transcode job via encrypted WebSocket. Returns a TranscodeHandle immediately. */
export async function submitTranscodeWs(opts: TranscodeWsOptions): Promise<TranscodeHandle> {
  const { wsClient, encryptionManager, sessionId, sessionKey, messageIndex,
    sourceCid, formats, isEncrypted = true, isGpu, jobId, chainId, onProgress, timeoutMs = 300000, previewPercent } = opts;

  const inner: Record<string, unknown> = { action: 'transcode', sourceCid, mediaFormats: formats, isEncrypted };
  if (isGpu !== undefined) inner.isGpu = isGpu;
  if (jobId !== undefined) inner.jobId = jobId;
  if (chainId !== undefined) inner.chainId = chainId;
  if (previewPercent !== undefined) inner.previewPercent = previewPercent;

  const encrypted = encryptionManager.encryptMessage(sessionKey, JSON.stringify(inner), messageIndex.value++);
  const envelope = {
    type: 'encrypted_message', session_id: sessionId,
    id: `tc-${Date.now()}-${Math.random().toString(36).substring(7)}`, payload: encrypted,
  };

  let resolvedTaskId = '';
  let isSettled = false;

  const resultPromise = new Promise<TranscodeResult>((resolve, reject) => {
    const settle = () => { isSettled = true; clearTimeout(timer); unsub(); };
    const safeResolve = (r: TranscodeResult) => { if (!isSettled) { settle(); resolve(r); } };
    const safeReject = (e: Error) => { if (!isSettled) { settle(); reject(e); } };

    const timer = setTimeout(() => safeReject(new TranscodeError('Transcode timed out', 'TRANSCODE_TIMEOUT')), timeoutMs);

    const unsub = wsClient.onMessage((data: any) => {
      if (isSettled) return;
      if (data.type === 'error') {
        safeReject(new TranscodeError(data.message || 'Transcode failed', 'TRANSCODE_FAILED'));
        return;
      }
      if (data.type !== 'encrypted_response' || !data.payload) return;
      try {
        const msg = JSON.parse(encryptionManager.decryptMessage(sessionKey, data.payload));
        if (msg.type === 'transcode_accepted') {
          resolvedTaskId = msg.taskId;
          handle.taskId = resolvedTaskId;
        } else if (msg.type === 'transcode_progress' && onProgress) {
          const g = msg.gopInfo;
          onProgress(msg.progress, g ? { currentGop: g.currentGop, totalGops: g.totalGops, elapsedSeconds: g.elapsedSeconds } : undefined);
        } else if (msg.type === 'transcode_complete') {
          const qm = msg.qualityMetrics;
          const moderation = parseModeration(msg.moderation);
          safeResolve({
            taskId: msg.taskId, outputs: msg.outputs, billing: msg.billing, duration: msg.duration,
            qualityMetrics: qm ? { psnrDB: qm.psnr_db, ssim: qm.ssim ?? undefined, actualBitrate: qm.actual_bitrate, averageGOPSize: qm.average_gop_size ?? undefined } : null,
            proofTreeCID: msg.proofTreeCID ?? null, proofTreeRootHash: msg.proofTreeRootHash ?? null,
            // Conditional spread: an absent verdict adds no key at all, so absence survives
            // JSON serialisation as absence rather than as an explicit `undefined`.
            ...(moderation !== undefined && { moderation }),
          });
        } else if (msg.type === 'transcode_error') {
          const nodeCode = typeof msg.error === 'object' ? msg.error?.code
                         : typeof msg.error === 'string' ? msg.error : undefined;
          const sdkCode: TranscodeErrorCode = NODE_ERROR_CODES.get(nodeCode) ?? 'TRANSCODE_FAILED';
          const errMsg = typeof msg.error === 'object' ? msg.error?.message || 'Transcode failed'
                       : typeof msg.error === 'string' ? msg.error : 'Transcode failed';
          safeReject(new TranscodeError(errMsg, sdkCode));
        }
      } catch (err: any) { if (!isSettled) safeReject(err); }
    });

    wsClient.sendWithoutResponse(envelope).catch((err: any) => {
      safeReject(new TranscodeError(`Failed to send transcode request: ${err.message}`, 'TRANSCODE_FAILED'));
    });
  });

  const handle: TranscodeHandle = { taskId: resolvedTaskId, cancel: () => cancelTranscodeWs(wsClient, sessionId), result: resultPromise };
  return handle;
}

/** Send a plaintext cancel message for a transcode job. */
export function cancelTranscodeWs(wsClient: { sendWithoutResponse(data: any): Promise<void> }, sessionId: string): void {
  wsClient.sendWithoutResponse({ type: 'transcode_cancel', session_id: sessionId }).catch(() => {});
}
