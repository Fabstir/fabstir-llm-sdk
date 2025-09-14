/**
 * Base SDK error class
 */
export class SDKError extends Error {
  constructor(
    message: string,
    public code?: string,
    public cause?: any
  ) {
    super(message);
    this.name = 'SDKError';
  }
}