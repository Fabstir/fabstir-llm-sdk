// src/errors.ts
export enum ErrorCode {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  WRONG_NETWORK = 'WRONG_NETWORK',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  JOB_NOT_FOUND = 'JOB_NOT_FOUND',
  TIMEOUT = 'TIMEOUT',
  INVALID_INPUT = 'INVALID_INPUT',
  P2P_ERROR = 'P2P_ERROR'
}

export class FabstirError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public cause?: any
  ) {
    super(message);
    this.name = 'FabstirError';
  }
}
