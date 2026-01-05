// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Session Manager Interface
 * Browser-compatible session management
 */

import { SessionConfig, SessionJob, CheckpointProof } from '../types';
import type { SearchApiResponse } from '../types/web-search.types';

export interface ISessionManager {
  /**
   * Start a new session
   */
  startSession(
    config: any
  ): Promise<{
    sessionId: bigint;
    jobId: bigint;
  }>;
  
  /**
   * Send prompt in session
   */
  sendPrompt(
    sessionId: bigint,
    prompt: string
  ): Promise<string>;

  /**
   * Send prompt with streaming support
   */
  sendPromptStreaming(
    sessionId: bigint,
    prompt: string,
    onToken?: (token: string) => void
  ): Promise<string>;
  
  /**
   * Submit checkpoint proof
   */
  submitCheckpoint(
    sessionId: bigint,
    proof: CheckpointProof
  ): Promise<string>;
  
  /**
   * Complete a session
   */
  completeSession(
    sessionId: bigint,
    totalTokens: number,
    finalProof: string
  ): Promise<string>;
  
  /**
   * Get session details
   */
  getSessionDetails(sessionId: bigint): Promise<SessionJob>;
  
  /**
   * Get active sessions for user
   */
  getActiveSessions(userAddress: string): Promise<SessionJob[]>;
  
  /**
   * Resume a session
   */
  resumeSession(sessionId: bigint): Promise<void>;
  
  /**
   * Pause a session
   */
  pauseSession(sessionId: bigint): Promise<void>;
  
  /**
   * Get session history
   */
  getSessionHistory(
    sessionId: bigint
  ): Promise<{
    prompts: string[];
    responses: string[];
    checkpoints: CheckpointProof[];
  }>;
  
  /**
   * Stream response (for real-time streaming)
   */
  streamResponse(
    sessionId: bigint,
    prompt: string,
    onChunk: (chunk: string) => void
  ): Promise<void>;
  
  /**
   * Calculate session cost
   */
  calculateCost(
    tokensUsed: number,
    pricePerToken: number
  ): bigint;

  /**
   * End a session cleanly (user-initiated)
   */
  endSession(sessionId: bigint): Promise<void>;

  // =============================================================================
  // Web Search Methods (Phase 4.2, 4.4)
  // =============================================================================

  /**
   * Perform a web search via WebSocket (Path C).
   *
   * @param sessionId - Active session ID
   * @param query - Search query (1-500 characters)
   * @param numResults - Number of results to return (1-20, default 10)
   * @returns Search results from the host's configured provider
   */
  webSearch(
    sessionId: bigint,
    query: string,
    numResults?: number
  ): Promise<SearchApiResponse>;

  /**
   * Perform a web search via direct HTTP API (Path A).
   *
   * @param hostUrl - Host API base URL
   * @param query - Search query (1-500 characters)
   * @param options - Optional numResults and chainId
   * @returns Search results from the host's configured provider
   */
  searchDirect(
    hostUrl: string,
    query: string,
    options?: { numResults?: number; chainId?: number }
  ): Promise<SearchApiResponse>;
}