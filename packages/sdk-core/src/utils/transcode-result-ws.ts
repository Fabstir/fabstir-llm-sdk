// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
/**
 * The result fetch for a dropped transcode, on a node that reports `session-job-completion` (1.39.15).
 *
 * One encrypted `{"action":"transcode_result","taskId"}` on a freshly inited connection. The node answers with an
 * `encrypted_response` echoing the message id, carrying the stored `transcode_complete` byte for byte, a
 * `transcode_result_pending`, or a `transcode_error` (RESULT_NOT_FOUND / RESULT_EXPIRED / NOT_OWNER / the job's own
 * failure). The fetch never bills, never re-runs the job and never settles the session.
 */
import { TranscodeError } from '../errors/transcode-errors';
import type { TranscodeResultAnswer } from '../types/transcode.types';
import { parseTranscodeComplete, transcodeErrorFrom } from './transcode-ws';

export interface TranscodeResultWsOptions {
  wsClient: {
    sendWithoutResponse(data: any): Promise<void>;
    onMessage(handler: (data: any) => void): () => void;
    onClose(handler: (event: { code?: number }) => void): () => void;
  };
  encryptionManager: {
    encryptMessage(key: Uint8Array, plaintext: string, index: number): { ciphertextHex: string; nonceHex: string; aadHex: string };
    decryptMessage(key: Uint8Array, payload: any): string;
  };
  sessionId: string;
  sessionKey: Uint8Array;
  messageIndex: { value: number };
  taskId: string;
  /** How long to wait for the node's answer. */
  timeoutMs: number;
}

export type { TranscodeResultAnswer };

/** Ask once. Resolves complete or pending; a node `transcode_error` rejects TRANSCODE_FAILED with `details.nodeCode`. */
export function fetchTranscodeResultWs(opts: TranscodeResultWsOptions): Promise<TranscodeResultAnswer> {
  const { wsClient, encryptionManager, sessionId, sessionKey, messageIndex, taskId, timeoutMs } = opts;
  const id = `tr-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const payload = encryptionManager.encryptMessage(
    sessionKey, JSON.stringify({ action: 'transcode_result', taskId }), messageIndex.value++,
  );
  return new Promise<TranscodeResultAnswer>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); unsub(); unsubClose(); fn(); };
    const timer = setTimeout(() => finish(() => reject(new TranscodeError(
      `No answer to the result fetch for task ${taskId} within ${timeoutMs} ms`, 'TRANSCODE_TIMEOUT', undefined,
      { reason: 'FETCH_TIMEOUT', taskId },
    ))), timeoutMs);
    const unsubClose = wsClient.onClose((event) => finish(() => reject(new TranscodeError(
      `Connection to the host closed before it answered the result fetch for task ${taskId}`, 'TRANSCODE_FAILED', undefined,
      { reason: 'WS_CLOSED', closeCode: event?.code, taskId },
    ))));
    const unsub = wsClient.onMessage((data: any) => {
      if (settled) return;
      // A plaintext node error (e.g. SESSION_AUTH_DENIED on a vault host) is this connection's answer: it carries only
      // this flow, so an error without an id is ours too.
      if (data?.type === 'error' && (data.id === undefined || data.id === id)) {
        finish(() => reject(new TranscodeError(data.message || `The node refused the result fetch for task ${taskId}`,
          'TRANSCODE_FAILED', undefined, { nodeCode: data.code ?? 'NODE_ERROR', taskId })));
        return;
      }
      if (data?.type !== 'encrypted_response' || data.id !== id || !data.payload) return;
      let msg: any;
      try { msg = JSON.parse(encryptionManager.decryptMessage(sessionKey, data.payload)); }
      catch (err) { finish(() => reject(err)); return; }
      if (msg.type === 'transcode_complete') {
        finish(() => resolve({ status: 'complete', result: parseTranscodeComplete(msg) }));
      } else if (msg.type === 'transcode_result_pending') {
        finish(() => resolve({ status: 'pending' }));
      } else if (msg.type === 'transcode_error') {
        // RESULT_NOT_FOUND / RESULT_EXPIRED / NOT_OWNER, or the job's own failure — mapped exactly as on the live path.
        finish(() => reject(transcodeErrorFrom(msg, taskId)));
      }
    });
    wsClient.sendWithoutResponse({ type: 'encrypted_message', session_id: sessionId, id, payload }).catch((err: any) =>
      finish(() => reject(new TranscodeError(`Failed to send the result fetch: ${err?.message}`, 'TRANSCODE_FAILED', undefined,
        { reason: 'SEND_FAILED', taskId }))));
  });
}
