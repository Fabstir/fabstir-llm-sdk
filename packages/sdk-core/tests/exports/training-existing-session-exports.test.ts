// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * The existingSession surface must be reachable from the PACKAGE ROOT — the consumer imports
 * `@fabstir/sdk-core`, not our internal module paths. Round 4 found that every existing-session
 * test imported from `../../src/managers/...`, so deleting the index.ts export lines left
 * 117/117 green while the symbols vanished from the tarball. Predicted profile: GREEN; RED when
 * any of the index.ts lines is removed (the mutation gate proves it).
 */
import { describe, it, expect } from 'vitest';
import {
  ADOPTED_SESSION_PARAMS_REASON, EXISTING_SESSION_CONFIG_REASON, SESSION_DECODE_REASON,
  TRAIN_JOB_TIMEOUT_SECS, A3_SETTLE_MARGIN_SECS, A3_MIN_PROOF_TIMEOUT_WINDOW_SECS,
  decodeSessionJobWords, TrainingError, TRANSPORT_SDK_CODES, RPC_TRANSIENT_CODES,
} from '../../src/index';
import type { TrainingExistingSession, SubmitTrainingOptions, A3CheckFailure, OnChainSessionJob } from '../../src/index';

describe('existingSession exports from the package root', () => {
  it('the reason constants are the documented strings', () => {
    expect(ADOPTED_SESSION_PARAMS_REASON).toBe('adoptedSessionParams');
    expect(EXISTING_SESSION_CONFIG_REASON).toBe('existingSessionConfig');
    expect(SESSION_DECODE_REASON).toBe('sessionDecode');
  });

  it('the A.3 constants are the frozen numbers', () => {
    expect(TRAIN_JOB_TIMEOUT_SECS).toBe(12600);
    expect(A3_SETTLE_MARGIN_SECS).toBe(600);
    expect(A3_MIN_PROOF_TIMEOUT_WINDOW_SECS).toBe(3600);
  });

  it('the decoder and the classifiers are functions, and the types are usable', () => {
    expect(typeof decodeSessionJobWords).toBe('function');
    expect(TRANSPORT_SDK_CODES.has('WS_TIMEOUT')).toBe(true);                                   // the UI can pre-classify with it
    expect([...RPC_TRANSIENT_CODES].sort()).toEqual(['NETWORK_ERROR', 'SERVER_ERROR', 'TIMEOUT']);
    const existing: TrainingExistingSession = { sessionId: 1n, jobId: 2n, endpoint: 'https://host.example', hostAddress: `0x${'a1'.repeat(20)}` };
    const opts: SubmitTrainingOptions = { job: {} as any, hostAddress: existing.hostAddress, endpoint: existing.endpoint, existingSession: existing };
    const failure: A3CheckFailure = { check: 'exists', expected: 'a session', actual: 'none' };
    const session: Partial<OnChainSessionJob> = { status: 1 };
    expect(opts.existingSession?.jobId).toBe(2n);
    expect(failure.check).toBe('exists');
    expect(session.status).toBe(1);
    // The classifiers are getters on the error, reachable from the root: adoptedSessionParams is NOT
    // terminal (re-shop), and a transport failure that consumed nothing keeps the same session.
    expect(new TrainingError('x', 'VALIDATION_FAILED', { reason: ADOPTED_SESSION_PARAMS_REASON }).isReshoppable(0)).toBe(true);
    expect(new TrainingError('x', 'VALIDATION_FAILED', { reason: EXISTING_SESSION_CONFIG_REASON }).isReshoppable(0)).toBe(false);
    const transport = new TrainingError('x', 'SIDECAR_UNAVAILABLE', { reason: 'transport', consumed: false });
    expect(transport.isRetryable).toBe(true);
    expect(transport.requiresFreshSession).toBe(false);
  });
});
