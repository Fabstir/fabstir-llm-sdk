/**
 * @fileoverview WebSocket-based encrypted transcode utility.
 * Standalone functions for submitting/cancelling transcode jobs via encrypted WebSocket.
 */
import type { VideoFormat, GOPInfo, TranscodeResult, TranscodeHandle } from '../types/transcode.types';

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
}

/** Submit a transcode job via encrypted WebSocket. Returns a TranscodeHandle immediately. */
export async function submitTranscodeWs(opts: TranscodeWsOptions): Promise<TranscodeHandle> {
  const { wsClient, encryptionManager, sessionId, sessionKey, messageIndex,
    sourceCid, formats, isEncrypted = true, isGpu, jobId, chainId, onProgress, timeoutMs = 300000 } = opts;

  const inner: Record<string, unknown> = { action: 'transcode', sourceCid, mediaFormats: formats, isEncrypted };
  if (isGpu !== undefined) inner.isGpu = isGpu;
  if (jobId !== undefined) inner.jobId = jobId;
  if (chainId !== undefined) inner.chainId = chainId;

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

    const timer = setTimeout(() => safeReject(new Error('Transcode timed out')), timeoutMs);

    const unsub = wsClient.onMessage((data: any) => {
      if (isSettled) return;
      if (data.type === 'error') {
        safeReject(new Error(data.message || 'Transcode failed'));
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
          safeResolve({
            taskId: msg.taskId, outputs: msg.outputs, billing: msg.billing, duration: msg.duration,
            qualityMetrics: qm ? { psnrDB: qm.psnr_db, ssim: qm.ssim ?? undefined, actualBitrate: qm.actual_bitrate, averageGOPSize: qm.average_gop_size ?? undefined } : null,
            proofTreeCID: msg.proofTreeCID ?? null, proofTreeRootHash: msg.proofTreeRootHash ?? null,
          });
        } else if (msg.type === 'transcode_error') {
          const errMsg = typeof msg.error === 'string' ? msg.error : msg.error?.message || 'Transcode failed';
          safeReject(new Error(errMsg));
        }
      } catch (err: any) { if (!isSettled) safeReject(err); }
    });

    wsClient.sendWithoutResponse(envelope).catch((err: any) => {
      safeReject(new Error(`Failed to send transcode request: ${err.message}`));
    });
  });

  const handle: TranscodeHandle = { taskId: resolvedTaskId, cancel: () => cancelTranscodeWs(wsClient, sessionId), result: resultPromise };
  return handle;
}

/** Send a plaintext cancel message for a transcode job. */
export function cancelTranscodeWs(wsClient: { sendWithoutResponse(data: any): Promise<void> }, sessionId: string): void {
  wsClient.sendWithoutResponse({ type: 'transcode_cancel', session_id: sessionId }).catch(() => {});
}
