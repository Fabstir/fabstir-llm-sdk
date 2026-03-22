/**
 * @fileoverview Transcode error class with retry support
 */

export type TranscodeErrorCode =
  | 'CAPACITY_FULL'
  | 'SIDECAR_DISCONNECTED'
  | 'TRANSCODE_FAILED'
  | 'TRANSCODE_TIMEOUT'
  | 'NO_AVAILABLE_HOSTS';

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
