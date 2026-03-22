import { describe, it, expect } from 'vitest';
import { TranscodeError } from '../../src/errors/transcode-errors';

describe('TranscodeError', () => {
  it('CAPACITY_FULL is retryable', () => {
    const err = new TranscodeError('full', 'CAPACITY_FULL');
    expect(err.isRetryable).toBe(true);
  });

  it('TRANSCODE_TIMEOUT is retryable', () => {
    const err = new TranscodeError('timeout', 'TRANSCODE_TIMEOUT');
    expect(err.isRetryable).toBe(true);
  });

  it('SIDECAR_DISCONNECTED is not retryable', () => {
    const err = new TranscodeError('disc', 'SIDECAR_DISCONNECTED');
    expect(err.isRetryable).toBe(false);
  });

  it('TRANSCODE_FAILED is not retryable', () => {
    const err = new TranscodeError('fail', 'TRANSCODE_FAILED');
    expect(err.isRetryable).toBe(false);
  });

  it('NO_AVAILABLE_HOSTS is not retryable', () => {
    const err = new TranscodeError('none', 'NO_AVAILABLE_HOSTS');
    expect(err.isRetryable).toBe(false);
  });

  it('stores hostAddress when provided', () => {
    const err = new TranscodeError('full', 'CAPACITY_FULL', '0xabc');
    expect(err.hostAddress).toBe('0xabc');
  });

  it('has name TranscodeError', () => {
    const err = new TranscodeError('test', 'TRANSCODE_FAILED');
    expect(err.name).toBe('TranscodeError');
    expect(err).toBeInstanceOf(Error);
  });
});
