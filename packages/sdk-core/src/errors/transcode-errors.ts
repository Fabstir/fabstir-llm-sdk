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
  // Moderation holds (ModerationHoldCode): the node refused to complete the job and sent
  // no completion frame. Every hold code is deliberately absent from RETRYABLE_CODES — there is
  // no automatic retry anywhere in the stack, so a load balancer never re-hosts a held job.
  // A user-initiated resubmission is a new job and is legal; publishing a held job never is.
  | ModerationHoldCode;

const RETRYABLE_CODES: TranscodeErrorCode[] = ['CAPACITY_FULL', 'TRANSCODE_TIMEOUT'];

export class TranscodeError extends Error {
  public readonly code: TranscodeErrorCode;
  public readonly hostAddress?: string;

  constructor(message: string, code: TranscodeErrorCode, hostAddress?: string) {
    super(message);
    this.name = 'TranscodeError';
    this.code = code;
    this.hostAddress = hostAddress;
    Object.setPrototypeOf(this, TranscodeError.prototype);
  }

  get isRetryable(): boolean {
    return RETRYABLE_CODES.includes(this.code);
  }
}
