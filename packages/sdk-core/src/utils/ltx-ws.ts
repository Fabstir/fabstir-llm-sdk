// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// WebSocket-based encrypted LTX submit. Mirrors utils/transcode-ws.ts (Constraint 2, 7).
import type { LtxJob, LtxHandle, LtxResult, LtxProgress } from '../types/ltx.types';
import { LtxError, LTX_WIRE_ERROR_CODES } from '../errors/ltx-errors';
import type { LtxErrorCode } from '../errors/ltx-errors';

/** Parameters for submitLtxWs. */
export interface LtxWsOptions {
  wsClient: { sendWithoutResponse(data: any): Promise<void>; onMessage(handler: (data: any) => void): () => void };
  encryptionManager: {
    encryptMessage(key: Uint8Array, plaintext: string, index: number): { ciphertextHex: string; nonceHex: string; aadHex: string };
    decryptMessage(key: Uint8Array, payload: any): string;
  };
  sessionId: string;
  sessionKey: Uint8Array;
  messageIndex: { value: number };
  job: LtxJob;
  requestId?: string;
  onProgress?: (progress: LtxProgress) => void;
  timeoutMs?: number;
}

/** Map a node ltx_error code to a typed LtxErrorCode; unknown codes → GENERATION_FAILED. */
function mapErrorCode(raw: unknown): LtxErrorCode {
  return (LTX_WIRE_ERROR_CODES as readonly string[]).includes(raw as string)
    ? (raw as LtxErrorCode)
    : 'GENERATION_FAILED';
}

/** Submit an LTX job via encrypted WebSocket. Returns an LtxHandle immediately. */
export async function submitLtxWs(opts: LtxWsOptions): Promise<LtxHandle> {
  const { wsClient, encryptionManager, sessionId, sessionKey, messageIndex, job, requestId, onProgress, timeoutMs = 600000 } = opts;

  const inner: Record<string, unknown> = {
    action: 'ltx_generate',
    templateId: job.templateId, templateHash: job.templateHash,
    prompt: job.prompt, seed: job.seed, frames: job.frames, fps: job.fps,
    resolution: job.resolution, lora: job.lora, output: job.output,
  };
  if (job.images?.length) inner.images = job.images; // M1a: capability CIDs, order = template imageSemantics
  if (requestId !== undefined) inner.requestId = requestId;

  const encrypted = encryptionManager.encryptMessage(sessionKey, JSON.stringify(inner), messageIndex.value++);
  const envelope = {
    type: 'encrypted_message', session_id: sessionId,
    id: `ltx-${Date.now()}-${Math.random().toString(36).substring(7)}`, payload: encrypted,
  };

  let resolvedRequestId = requestId ?? '';
  let acceptedVersion: number | undefined;
  let isSettled = false;
  let cancelFn: () => void = () => {};

  const resultPromise = new Promise<LtxResult>((resolve, reject) => {
    const settle = () => { isSettled = true; clearTimeout(timer); unsub(); };
    const safeResolve = (r: LtxResult) => { if (!isSettled) { settle(); resolve(r); } };
    const safeReject = (e: Error) => { if (!isSettled) { settle(); reject(e); } };
    // Client-side cancel: settle the local wait so callers don't hang. The frozen protocol has NO
    // node cancel action; on-chain reclaim of a reserved deposit is LtxManager.triggerSessionTimeout.
    cancelFn = () => safeReject(new LtxError('LTX generation cancelled by client', 'GENERATION_FAILED'));

    const timer = setTimeout(() => safeReject(new LtxError('LTX generation timed out', 'TIMEOUT')), timeoutMs);

    const unsub = wsClient.onMessage((data: any) => {
      if (isSettled) return;
      if (data.type === 'error') { safeReject(new LtxError(data.message || 'LTX failed', 'GENERATION_FAILED')); return; }
      if (data.type !== 'encrypted_response' || !data.payload) return;
      try {
        const msg = JSON.parse(encryptionManager.decryptMessage(sessionKey, data.payload));
        if (msg.type === 'ltx_accepted') {
          if (msg.requestId) { resolvedRequestId = msg.requestId; handle.requestId = resolvedRequestId; }
          acceptedVersion = msg.allowListVersion;
        } else if (msg.type === 'ltx_progress') {
          onProgress?.({ stage: msg.stage, pct: msg.pct });
        } else if (msg.type === 'ltx_complete') {
          safeResolve({
            outputCID: msg.outputCID, proofCID: msg.proofCID, manifest: msg.manifest,
            frames: msg.frames, billing: msg.billing,
            requestId: msg.requestId ?? resolvedRequestId, allowListVersion: acceptedVersion,
          });
        } else if (msg.type === 'ltx_error') {
          safeReject(new LtxError(msg.error?.message || 'LTX generation failed', mapErrorCode(msg.error?.code)));
        }
      } catch (err: any) { if (!isSettled) safeReject(err); }
    });

    wsClient.sendWithoutResponse(envelope).catch((err: any) => {
      safeReject(new LtxError(`Failed to send ltx_generate: ${err.message}`, 'SIDECAR_UNAVAILABLE'));
    });
  });

  const handle: LtxHandle = {
    requestId: resolvedRequestId,
    cancel: () => cancelFn(),
    result: resultPromise,
    onProgress,
  };
  return handle;
}
