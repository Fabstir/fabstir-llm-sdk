/**
 * @fileoverview Transcode error class with retry support
 */

import type { ModerationHoldCode } from '../types/moderation.types';

export type TranscodeErrorCode =
  | 'CAPACITY_FULL'
  | 'SIDECAR_DISCONNECTED'
  | 'TRANSCODE_FAILED'
  | 'TRANSCODE_TIMEOUT'
  | 'NO_AVAILABLE_HOSTS'
  // An encrypted transcode for a host not on confidentialHosts, or with none configured (1.39.18; renamed 1.39.19).
  | 'CONFIDENTIAL_HOST_NOT_ALLOWED'
  // Moderation holds (ModerationHoldCode): the node refused to complete the job and sent
  // no completion frame. Every hold code is deliberately absent from RETRYABLE_CODES — there is
  // no automatic retry anywhere in the stack, so a load balancer never re-hosts a held job.
  // A user-initiated resubmission is a new job and is legal; publishing a held job never is.
  | ModerationHoldCode;

// Not TRANSCODE_TIMEOUT (1.39.18): the node keeps running and billing the job, so a retry would pay for it twice; on a
// `session-job-completion` node fetch the result instead (SessionManager.fetchTranscodeResult).
const RETRYABLE_CODES: TranscodeErrorCode[] = ['CAPACITY_FULL'];

export class TranscodeError extends Error {
  public readonly code: TranscodeErrorCode;
  public readonly hostAddress?: string;
  public readonly details?: unknown;

  constructor(message: string, code: TranscodeErrorCode, hostAddress?: string, details?: unknown) {
    super(message);
    this.name = 'TranscodeError';
    this.code = code;
    this.hostAddress = hostAddress;
    this.details = details;
    Object.setPrototypeOf(this, TranscodeError.prototype);
  }

  get isRetryable(): boolean {
    return RETRYABLE_CODES.includes(this.code);
  }
}
