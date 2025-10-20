// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { EventEmitter } from 'events';

export interface CheckpointConfig {
  threshold: number;
  autoSubmit: boolean;
  maxQueueSize: number;
}

export interface CheckpointData {
  sessionId: string;
  checkpoint: number;
  tokenCount: number;
  timestamp: number;
}

export interface SessionStatistics {
  totalTokens: number;
  checkpoints: number;
  processedCheckpoints: number;
  pendingCheckpoints: number;
  remainingTokens: number;
}

export interface GlobalStatistics {
  totalSessions: number;
  totalTokens: number;
  totalCheckpoints: number;
  processedCheckpoints: number;
  pendingCheckpoints: number;
  averageTokensPerCheckpoint: number;
}

interface SessionState {
  tokenCount: number;
  checkpoints: number;
  processedCheckpoints: Set<number>;
  lastCheckpoint: number;
}

export class CheckpointTracker extends EventEmitter {
  private sessions: Map<string, SessionState> = new Map();
  private pendingCheckpoints: CheckpointData[] = [];
  private config: CheckpointConfig = {
    threshold: 100,
    autoSubmit: false,
    maxQueueSize: 100
  };

  constructor(config?: Partial<CheckpointConfig>) {
    super();
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Add tokens to a session
   */
  addTokens(sessionId: string, tokens: number): void {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        tokenCount: 0,
        checkpoints: 0,
        processedCheckpoints: new Set(),
        lastCheckpoint: 0
      });
    }

    const session = this.sessions.get(sessionId)!;
    const previousTokens = session.tokenCount;
    session.tokenCount += tokens;

    // Check for checkpoint threshold
    const previousCheckpoints = Math.floor(previousTokens / this.config.threshold);
    const currentCheckpoints = Math.floor(session.tokenCount / this.config.threshold);

    if (currentCheckpoints > previousCheckpoints) {
      // New checkpoint(s) reached
      for (let i = previousCheckpoints + 1; i <= currentCheckpoints; i++) {
        session.checkpoints = i;

        const checkpointData: CheckpointData = {
          sessionId,
          checkpoint: i,
          tokenCount: i * this.config.threshold,
          timestamp: Date.now()
        };

        this.pendingCheckpoints.push(checkpointData);
        this.enforceQueueSize();

        this.emit('checkpoint-reached', {
          sessionId,
          tokenCount: session.tokenCount,
          checkpoint: i
        });

        if (this.config.autoSubmit) {
          this.emit('auto-submit', {
            sessionId,
            checkpoint: i,
            tokenCount: i * this.config.threshold
          });
        }
      }
    }

    // Emit progress event
    const progress = (session.tokenCount % this.config.threshold) / this.config.threshold;
    this.emit('token-progress', {
      sessionId,
      currentTokens: session.tokenCount,
      progress,
      nextCheckpoint: (Math.floor(session.tokenCount / this.config.threshold) + 1) * this.config.threshold
    });

    // Emit warning when approaching checkpoint
    const remaining = this.config.threshold - (session.tokenCount % this.config.threshold);
    if (remaining <= 10 && remaining > 0) {
      this.emit('checkpoint-approaching', {
        sessionId,
        currentTokens: session.tokenCount,
        tokensUntilCheckpoint: remaining
      });
    }
  }

  /**
   * Get token count for a session
   */
  getTokenCount(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    return session ? session.tokenCount : 0;
  }

  /**
   * Get all token counts
   */
  getAllTokenCounts(): { [sessionId: string]: number } {
    const counts: { [sessionId: string]: number } = {};
    this.sessions.forEach((session, sessionId) => {
      counts[sessionId] = session.tokenCount;
    });
    return counts;
  }

  /**
   * Reset a specific session
   */
  resetSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.pendingCheckpoints = this.pendingCheckpoints.filter(
      cp => cp.sessionId !== sessionId
    );
  }

  /**
   * Reset all sessions
   */
  reset(): void {
    this.sessions.clear();
    this.pendingCheckpoints = [];
    this.emit('reset');
  }

  /**
   * Get remaining tokens until next checkpoint
   */
  getRemainingTokens(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    if (!session) return this.config.threshold;
    return session.tokenCount % this.config.threshold;
  }

  /**
   * Get checkpoint count for a session
   */
  getCheckpointCount(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    return session ? session.checkpoints : 0;
  }

  /**
   * Get pending checkpoints
   */
  getPendingCheckpoints(): CheckpointData[] {
    return [...this.pendingCheckpoints];
  }

  /**
   * Mark checkpoint as processed
   */
  markCheckpointProcessed(sessionId: string, checkpoint: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.processedCheckpoints.add(checkpoint);
    }

    this.pendingCheckpoints = this.pendingCheckpoints.filter(
      cp => !(cp.sessionId === sessionId && cp.checkpoint === checkpoint)
    );

    this.emit('checkpoint-processed', { sessionId, checkpoint });
  }

  /**
   * Set threshold
   */
  setThreshold(threshold: number): void {
    this.config.threshold = threshold;
  }

  /**
   * Set auto-submit
   */
  setAutoSubmit(autoSubmit: boolean): void {
    this.config.autoSubmit = autoSubmit;
  }

  /**
   * Set max queue size
   */
  setMaxQueueSize(maxSize: number): void {
    this.config.maxQueueSize = maxSize;
    this.enforceQueueSize();
  }

  /**
   * Get configuration
   */
  getConfig(): CheckpointConfig {
    return { ...this.config };
  }

  /**
   * Set configuration
   */
  setConfig(config: Partial<CheckpointConfig>): void {
    this.config = { ...this.config, ...config };
    this.enforceQueueSize();
  }

  /**
   * Get global statistics
   */
  getStatistics(): GlobalStatistics {
    let totalTokens = 0;
    let totalCheckpoints = 0;
    let processedCheckpoints = 0;

    this.sessions.forEach(session => {
      totalTokens += session.tokenCount;
      totalCheckpoints += session.checkpoints;
      processedCheckpoints += session.processedCheckpoints.size;
    });

    const pendingCheckpoints = this.pendingCheckpoints.length;
    const averageTokensPerCheckpoint = totalCheckpoints > 0
      ? Number((totalTokens / totalCheckpoints).toFixed(2))
      : 0;

    return {
      totalSessions: this.sessions.size,
      totalTokens,
      totalCheckpoints,
      processedCheckpoints,
      pendingCheckpoints,
      averageTokensPerCheckpoint
    };
  }

  /**
   * Get session-specific statistics
   */
  getSessionStatistics(sessionId: string): SessionStatistics | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const pendingCheckpoints = this.pendingCheckpoints.filter(
      cp => cp.sessionId === sessionId
    ).length;

    return {
      totalTokens: session.tokenCount,
      checkpoints: session.checkpoints,
      processedCheckpoints: session.processedCheckpoints.size,
      pendingCheckpoints,
      remainingTokens: session.tokenCount % this.config.threshold
    };
  }

  /**
   * Serialize state for persistence
   */
  serialize(): string {
    const state = {
      sessions: Array.from(this.sessions.entries()).map(([id, session]) => ({
        id,
        tokenCount: session.tokenCount,
        checkpoints: session.checkpoints,
        processedCheckpoints: Array.from(session.processedCheckpoints),
        lastCheckpoint: session.lastCheckpoint
      })),
      pendingCheckpoints: this.pendingCheckpoints,
      config: this.config
    };

    return JSON.stringify(state);
  }

  /**
   * Deserialize state from persistence
   */
  deserialize(data: string): void {
    try {
      const state = JSON.parse(data);

      this.sessions.clear();
      state.sessions.forEach((session: any) => {
        this.sessions.set(session.id, {
          tokenCount: session.tokenCount,
          checkpoints: session.checkpoints,
          processedCheckpoints: new Set(session.processedCheckpoints),
          lastCheckpoint: session.lastCheckpoint
        });
      });

      this.pendingCheckpoints = state.pendingCheckpoints || [];
      this.config = { ...this.config, ...state.config };

    } catch (error) {
      console.error('Failed to deserialize checkpoint tracker state:', error);
    }
  }

  /**
   * Enforce max queue size
   */
  private enforceQueueSize(): void {
    while (this.pendingCheckpoints.length > this.config.maxQueueSize) {
      const removed = this.pendingCheckpoints.shift();
      if (removed) {
        this.emit('checkpoint-dropped', removed);
      }
    }
  }
}