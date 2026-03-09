/**
 * @fileoverview Type compilation tests for session health types
 * Sub-phase 14.1: HostHealthInfo, SessionStatusInfo, PromptOptions extension
 */

import { describe, it, expect } from 'vitest';
import type {
  HostHealthStatus,
  HostHealthInfo,
  BackgroundOpStatus,
  ProofStatus,
  CheckpointStatus,
  SessionStatusInfo,
  PromptOptions,
} from '../../src/types/index';

describe('Session Health Types', () => {
  describe('HostHealthInfo', () => {
    it('accepts all valid HostHealthStatus values', () => {
      const statuses: HostHealthStatus[] = ['healthy', 'degraded', 'unhealthy', 'unreachable'];
      for (const status of statuses) {
        const info: HostHealthInfo = { status, issues: [], checkedAt: Date.now() };
        expect(info.status).toBe(status);
      }
    });
  });

  describe('SessionStatusInfo', () => {
    it('accepts proof and checkpoint status', () => {
      const proof: ProofStatus = { status: 'success', proofId: 'abc', sizeBytes: 1024 };
      const checkpoint: CheckpointStatus = { status: 'failed', error: 'S5 down', checkpointIndex: 3 };
      const info: SessionStatusInfo = {
        sessionId: 'sess-1',
        proof,
        checkpoint,
        timestamp: Date.now(),
      };
      expect(info.proof?.status).toBe('success');
      expect(info.checkpoint?.status).toBe('failed');
      expect(info.checkpoint?.error).toBe('S5 down');
    });
  });

  describe('PromptOptions callbacks', () => {
    it('accepts onHostHealthWarning callback', () => {
      const opts: PromptOptions = {
        onHostHealthWarning: (health: HostHealthInfo) => {
          expect(health.status).toBeDefined();
        },
      };
      expect(opts.onHostHealthWarning).toBeDefined();
    });

    it('accepts onSessionStatus callback', () => {
      const opts: PromptOptions = {
        onSessionStatus: (status: SessionStatusInfo) => {
          expect(status.sessionId).toBeDefined();
        },
      };
      expect(opts.onSessionStatus).toBeDefined();
    });
  });
});
