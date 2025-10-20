// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CheckpointTracker } from '../../src/proof/checkpoint';

describe('Checkpoint Tracking', () => {
  let tracker: CheckpointTracker;

  beforeEach(() => {
    tracker = new CheckpointTracker();
  });

  afterEach(() => {
    tracker.reset();
  });

  describe('Token Accumulation', () => {
    it('should track token accumulation for sessions', () => {
      tracker.addTokens('session-1', 50);
      tracker.addTokens('session-1', 30);
      tracker.addTokens('session-2', 60);

      expect(tracker.getTokenCount('session-1')).toBe(80);
      expect(tracker.getTokenCount('session-2')).toBe(60);
    });

    it('should handle multiple sessions independently', () => {
      tracker.addTokens('session-1', 50);
      tracker.addTokens('session-2', 75);
      tracker.addTokens('session-3', 25);

      const totals = tracker.getAllTokenCounts();
      expect(totals).toEqual({
        'session-1': 50,
        'session-2': 75,
        'session-3': 25
      });
    });

    it('should reset token count for a session', () => {
      tracker.addTokens('session-1', 50);
      tracker.addTokens('session-1', 30);

      tracker.resetSession('session-1');
      expect(tracker.getTokenCount('session-1')).toBe(0);
    });

    it('should reset all sessions', () => {
      tracker.addTokens('session-1', 50);
      tracker.addTokens('session-2', 75);

      tracker.reset();
      expect(tracker.getTokenCount('session-1')).toBe(0);
      expect(tracker.getTokenCount('session-2')).toBe(0);
    });
  });

  describe('Checkpoint Threshold', () => {
    it('should trigger checkpoint at default threshold (100 tokens)', () => {
      const handler = vi.fn();
      tracker.on('checkpoint-reached', handler);

      tracker.addTokens('session-1', 50);
      expect(handler).not.toHaveBeenCalled();

      tracker.addTokens('session-1', 50);
      expect(handler).toHaveBeenCalledWith({
        sessionId: 'session-1',
        tokenCount: 100,
        checkpoint: 1
      });
    });

    it('should trigger multiple checkpoints', () => {
      const handler = vi.fn();
      tracker.on('checkpoint-reached', handler);

      tracker.addTokens('session-1', 150);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        sessionId: 'session-1',
        tokenCount: 150,
        checkpoint: 1
      });

      tracker.addTokens('session-1', 100);
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenLastCalledWith({
        sessionId: 'session-1',
        tokenCount: 250,
        checkpoint: 2
      });
    });

    it('should support custom threshold', () => {
      tracker.setThreshold(50);
      const handler = vi.fn();
      tracker.on('checkpoint-reached', handler);

      tracker.addTokens('session-1', 25);
      expect(handler).not.toHaveBeenCalled();

      tracker.addTokens('session-1', 25);
      expect(handler).toHaveBeenCalledWith({
        sessionId: 'session-1',
        tokenCount: 50,
        checkpoint: 1
      });
    });

    it('should calculate remaining tokens after checkpoint', () => {
      tracker.addTokens('session-1', 150);

      const remaining = tracker.getRemainingTokens('session-1');
      expect(remaining).toBe(50); // 150 - 100 = 50
    });

    it('should track checkpoint count per session', () => {
      tracker.addTokens('session-1', 250);
      tracker.addTokens('session-2', 150);

      expect(tracker.getCheckpointCount('session-1')).toBe(2);
      expect(tracker.getCheckpointCount('session-2')).toBe(1);
    });
  });

  describe('Checkpoint Queue', () => {
    it('should queue checkpoints for processing', () => {
      tracker.addTokens('session-1', 100);
      tracker.addTokens('session-2', 100);

      const queue = tracker.getPendingCheckpoints();
      expect(queue).toHaveLength(2);
      expect(queue[0]).toEqual({
        sessionId: 'session-1',
        checkpoint: 1,
        tokenCount: 100,
        timestamp: expect.any(Number)
      });
      expect(queue[1]).toEqual({
        sessionId: 'session-2',
        checkpoint: 1,
        tokenCount: 100,
        timestamp: expect.any(Number)
      });
    });

    it('should mark checkpoint as processed', () => {
      tracker.addTokens('session-1', 100);

      const queue = tracker.getPendingCheckpoints();
      expect(queue).toHaveLength(1);

      tracker.markCheckpointProcessed('session-1', 1);

      const updatedQueue = tracker.getPendingCheckpoints();
      expect(updatedQueue).toHaveLength(0);
    });

    it('should handle multiple pending checkpoints', () => {
      tracker.addTokens('session-1', 250); // 2 checkpoints

      const queue = tracker.getPendingCheckpoints();
      expect(queue).toHaveLength(2);
      expect(queue[0].checkpoint).toBe(1);
      expect(queue[1].checkpoint).toBe(2);

      tracker.markCheckpointProcessed('session-1', 1);

      const updatedQueue = tracker.getPendingCheckpoints();
      expect(updatedQueue).toHaveLength(1);
      expect(updatedQueue[0].checkpoint).toBe(2);
    });
  });

  describe('Configuration', () => {
    it('should support auto-submit configuration', () => {
      tracker.setAutoSubmit(true);
      const handler = vi.fn();
      tracker.on('auto-submit', handler);

      tracker.addTokens('session-1', 100);
      expect(handler).toHaveBeenCalledWith({
        sessionId: 'session-1',
        checkpoint: 1,
        tokenCount: 100
      });
    });

    it('should support max queue size', () => {
      tracker.setMaxQueueSize(2);

      tracker.addTokens('session-1', 100);
      tracker.addTokens('session-2', 100);
      tracker.addTokens('session-3', 100);

      const queue = tracker.getPendingCheckpoints();
      expect(queue).toHaveLength(2); // Max size enforced
      expect(queue[0].sessionId).toBe('session-2'); // Oldest removed
      expect(queue[1].sessionId).toBe('session-3');
    });

    it('should get/set configuration', () => {
      const config = {
        threshold: 75,
        autoSubmit: true,
        maxQueueSize: 5
      };

      tracker.setConfig(config);
      expect(tracker.getConfig()).toEqual(config);
    });
  });

  describe('Statistics', () => {
    it('should track checkpoint statistics', () => {
      tracker.addTokens('session-1', 250);
      tracker.addTokens('session-2', 150);
      tracker.markCheckpointProcessed('session-1', 1);

      const stats = tracker.getStatistics();
      expect(stats).toEqual({
        totalSessions: 2,
        totalTokens: 400,
        totalCheckpoints: 3,
        processedCheckpoints: 1,
        pendingCheckpoints: 2,
        averageTokensPerCheckpoint: 133.33
      });
    });

    it('should get session-specific statistics', () => {
      tracker.addTokens('session-1', 250);
      tracker.markCheckpointProcessed('session-1', 1);

      const sessionStats = tracker.getSessionStatistics('session-1');
      expect(sessionStats).toEqual({
        totalTokens: 250,
        checkpoints: 2,
        processedCheckpoints: 1,
        pendingCheckpoints: 1,
        remainingTokens: 50
      });
    });
  });

  describe('Event Handling', () => {
    it('should emit progress events', () => {
      const handler = vi.fn();
      tracker.on('token-progress', handler);

      tracker.addTokens('session-1', 50);
      expect(handler).toHaveBeenCalledWith({
        sessionId: 'session-1',
        currentTokens: 50,
        progress: 0.5, // 50/100
        nextCheckpoint: 100
      });

      tracker.addTokens('session-1', 25);
      expect(handler).toHaveBeenLastCalledWith({
        sessionId: 'session-1',
        currentTokens: 75,
        progress: 0.75,
        nextCheckpoint: 100
      });
    });

    it('should emit warning near checkpoint', () => {
      const handler = vi.fn();
      tracker.on('checkpoint-approaching', handler);

      tracker.addTokens('session-1', 90);
      expect(handler).toHaveBeenCalledWith({
        sessionId: 'session-1',
        currentTokens: 90,
        tokensUntilCheckpoint: 10
      });
    });
  });

  describe('Persistence', () => {
    it('should serialize state for persistence', () => {
      tracker.addTokens('session-1', 150);
      tracker.addTokens('session-2', 75);

      const state = tracker.serialize();
      expect(state).toContain('session-1');
      expect(state).toContain('150');
      expect(state).toContain('session-2');
      expect(state).toContain('75');
    });

    it('should restore from serialized state', () => {
      tracker.addTokens('session-1', 150);
      tracker.addTokens('session-2', 75);
      const state = tracker.serialize();

      const newTracker = new CheckpointTracker();
      newTracker.deserialize(state);

      expect(newTracker.getTokenCount('session-1')).toBe(150);
      expect(newTracker.getTokenCount('session-2')).toBe(75);
      expect(newTracker.getCheckpointCount('session-1')).toBe(1);
    });
  });
});