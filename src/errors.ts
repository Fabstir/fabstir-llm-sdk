// src/errors.ts
export enum ErrorCode {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  WRONG_NETWORK = 'WRONG_NETWORK',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  JOB_NOT_FOUND = 'JOB_NOT_FOUND',
  TIMEOUT = 'TIMEOUT',
  INVALID_INPUT = 'INVALID_INPUT'
}

export class FabstirError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public cause?: any
  ) {
    super(message);
    this.name = 'FabstirError';
  }
}
