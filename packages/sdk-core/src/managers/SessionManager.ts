/**
 * Browser-compatible Session Manager
 * 
 * Manages LLM session lifecycle including creation, checkpoint proofs,
 * and completion. Works with WebSocket for real-time streaming.
 */

import { ISessionManager } from '../interfaces';
import {
  SDKError,
  SessionConfig,
  SessionJob,
  CheckpointProof
} from '../types';
import { PaymentManager } from './PaymentManager';
import { StorageManager } from './StorageManager';
import { WebSocketClient } from '../websocket/WebSocketClient';

export interface SessionState {
  sessionId: bigint;
  jobId: bigint;
  model: string;
  provider: string;
  status: 'pending' | 'active' | 'paused' | 'completed' | 'failed';
  prompts: string[];
  responses: string[];
  checkpoints: CheckpointProof[];
  totalTokens: number;
  startTime: number;
  endTime?: number;
}

export class SessionManager implements ISessionManager {
  private paymentManager: PaymentManager;
  private storageManager: StorageManager;
  private wsClient?: WebSocketClient;
  private sessions: Map<string, SessionState> = new Map();
  private initialized = false;

  constructor(
    paymentManager: PaymentManager,
    storageManager: StorageManager
  ) {
    this.paymentManager = paymentManager;
    this.storageManager = storageManager;
  }

  /**
   * Initialize the session manager
   */
  async initialize(): Promise<void> {
    if (!this.paymentManager.isInitialized()) {
      throw new SDKError('PaymentManager not initialized', 'PAYMENT_NOT_INITIALIZED');
    }
    if (!this.storageManager.isInitialized()) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }
    this.initialized = true;
  }

  /**
   * Start a new session
   */
  async startSession(
    model: string,
    provider: string,
    config: SessionConfig
  ): Promise<{
    sessionId: bigint;
    jobId: bigint;
  }> {
    if (!this.initialized) {
      throw new SDKError('SessionManager not initialized', 'SESSION_NOT_INITIALIZED');
    }

    try {
      // Create session job with payment
      const result = await this.paymentManager.createSessionJob(
        model,
        provider,
        config.depositAmount,
        config.pricePerToken,
        config.proofInterval,
        config.duration
      );

      // Create session state
      const sessionState: SessionState = {
        sessionId: result.sessionId,
        jobId: result.jobId,
        model,
        provider,
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
      };

      // Store in memory
      this.sessions.set(result.sessionId.toString(), sessionState);

      // Persist to storage
      await this.storageManager.storeConversation({
        id: result.sessionId.toString(),
        messages: [],
        metadata: {
          model,
          provider,
          jobId: result.jobId.toString(),
          config
        },
        createdAt: sessionState.startTime,
        updatedAt: sessionState.startTime
      });

      return {
        sessionId: result.sessionId,
        jobId: result.jobId
      };
    } catch (error: any) {
      throw new SDKError(
        `Failed to start session: ${error.message}`,
        'SESSION_START_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Send prompt in session
   */
  async sendPrompt(
    sessionId: bigint,
    prompt: string
  ): Promise<string> {
    if (!this.initialized) {
      throw new SDKError('SessionManager not initialized', 'SESSION_NOT_INITIALIZED');
    }

    const session = this.sessions.get(sessionId.toString());
    if (!session) {
      throw new SDKError('Session not found', 'SESSION_NOT_FOUND');
    }

    if (session.status !== 'active') {
      throw new SDKError(`Session is ${session.status}`, 'SESSION_NOT_ACTIVE');
    }

    try {
      // Add prompt to session
      session.prompts.push(prompt);

      // Initialize WebSocket if needed
      if (!this.wsClient) {
        this.wsClient = new WebSocketClient(`wss://${session.provider}/ws`);
        await this.wsClient.connect();
      }

      // Send prompt and get response
      const response = await this.wsClient.sendMessage({
        type: 'prompt',
        sessionId: sessionId.toString(),
        prompt,
        model: session.model
      });

      // Add response to session
      session.responses.push(response);

      // Update storage
      await this.storageManager.appendMessage(
        sessionId.toString(),
        {
          role: 'user',
          content: prompt,
          timestamp: Date.now()
        }
      );

      await this.storageManager.appendMessage(
        sessionId.toString(),
        {
          role: 'assistant',
          content: response,
          timestamp: Date.now()
        }
      );

      return response;
    } catch (error: any) {
      throw new SDKError(
        `Failed to send prompt: ${error.message}`,
        'PROMPT_SEND_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Submit checkpoint proof
   */
  async submitCheckpoint(
    sessionId: bigint,
    proof: CheckpointProof
  ): Promise<string> {
    if (!this.initialized) {
      throw new SDKError('SessionManager not initialized', 'SESSION_NOT_INITIALIZED');
    }

    const session = this.sessions.get(sessionId.toString());
    if (!session) {
      throw new SDKError('Session not found', 'SESSION_NOT_FOUND');
    }

    try {
      // Submit checkpoint to contract
      const txHash = await this.paymentManager.submitCheckpoint(
        session.jobId,
        proof.tokensGenerated,
        proof.proofData
      );

      // Update session state
      session.checkpoints.push(proof);
      session.totalTokens += proof.tokensGenerated;

      // Store checkpoint in storage
      await this.storageManager.store(
        {
          sessionId: sessionId.toString(),
          checkpoint: proof.checkpoint,
          proof
        },
        {
          metadata: { type: 'checkpoint' }
        }
      );

      return txHash;
    } catch (error: any) {
      throw new SDKError(
        `Failed to submit checkpoint: ${error.message}`,
        'CHECKPOINT_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Complete a session
   */
  async completeSession(
    sessionId: bigint,
    totalTokens: number,
    finalProof: string
  ): Promise<string> {
    if (!this.initialized) {
      throw new SDKError('SessionManager not initialized', 'SESSION_NOT_INITIALIZED');
    }

    const session = this.sessions.get(sessionId.toString());
    if (!session) {
      throw new SDKError('Session not found', 'SESSION_NOT_FOUND');
    }

    try {
      // Submit final completion to contract
      const txHash = await this.paymentManager.completeSession(
        session.jobId,
        totalTokens,
        finalProof
      );

      // Update session state
      session.status = 'completed';
      session.totalTokens = totalTokens;
      session.endTime = Date.now();

      // Update storage
      const conversation = await this.storageManager.loadConversation(sessionId.toString());
      if (conversation) {
        conversation.metadata['status'] = 'completed';
        conversation.metadata['totalTokens'] = totalTokens;
        conversation.metadata['endTime'] = session.endTime;
        conversation.updatedAt = Date.now();
        await this.storageManager.saveConversation(conversation);
      }

      // Close WebSocket if open
      if (this.wsClient?.isConnected()) {
        await this.wsClient.disconnect();
      }

      return txHash;
    } catch (error: any) {
      throw new SDKError(
        `Failed to complete session: ${error.message}`,
        'SESSION_COMPLETE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Get session details
   */
  async getSessionDetails(sessionId: bigint): Promise<SessionJob> {
    if (!this.initialized) {
      throw new SDKError('SessionManager not initialized', 'SESSION_NOT_INITIALIZED');
    }

    const session = this.sessions.get(sessionId.toString());
    if (!session) {
      // Try to load from storage
      const conversation = await this.storageManager.loadConversation(sessionId.toString());
      if (!conversation) {
        throw new SDKError('Session not found', 'SESSION_NOT_FOUND');
      }

      // Reconstruct session from storage
      return {
        sessionId,
        jobId: BigInt(conversation.metadata['jobId'] || '0'),
        user: '',
        provider: conversation.metadata['provider'] || '',
        model: conversation.metadata['model'] || '',
        deposit: 0n,
        tokensUsed: conversation.metadata['totalTokens'] || 0,
        isActive: conversation.metadata['status'] === 'active',
        startTime: conversation.createdAt,
        endTime: conversation.metadata['endTime'] || 0
      };
    }

    return {
      sessionId,
      jobId: session.jobId,
      user: '',
      provider: session.provider,
      model: session.model,
      deposit: 0n,
      tokensUsed: session.totalTokens,
      isActive: session.status === 'active',
      startTime: session.startTime,
      endTime: session.endTime || 0
    };
  }

  /**
   * Get active sessions for user
   */
  async getActiveSessions(userAddress: string): Promise<SessionJob[]> {
    if (!this.initialized) {
      throw new SDKError('SessionManager not initialized', 'SESSION_NOT_INITIALIZED');
    }

    const activeSessions: SessionJob[] = [];

    // Get from memory cache
    for (const session of this.sessions.values()) {
      if (session.status === 'active') {
        activeSessions.push({
          sessionId: session.sessionId,
          jobId: session.jobId,
          user: userAddress,
          provider: session.provider,
          model: session.model,
          deposit: 0n,
          tokensUsed: session.totalTokens,
          isActive: true,
          startTime: session.startTime,
          endTime: 0
        });
      }
    }

    return activeSessions;
  }

  /**
   * Resume a session
   */
  async resumeSession(sessionId: bigint): Promise<void> {
    if (!this.initialized) {
      throw new SDKError('SessionManager not initialized', 'SESSION_NOT_INITIALIZED');
    }

    const session = this.sessions.get(sessionId.toString());
    if (!session) {
      throw new SDKError('Session not found', 'SESSION_NOT_FOUND');
    }

    if (session.status !== 'paused') {
      throw new SDKError(`Cannot resume session in ${session.status} state`, 'INVALID_STATE');
    }

    session.status = 'active';

    // Reconnect WebSocket if needed
    if (!this.wsClient?.isConnected()) {
      this.wsClient = new WebSocketClient(`wss://${session.provider}/ws`);
      await this.wsClient.connect();
    }
  }

  /**
   * Pause a session
   */
  async pauseSession(sessionId: bigint): Promise<void> {
    if (!this.initialized) {
      throw new SDKError('SessionManager not initialized', 'SESSION_NOT_INITIALIZED');
    }

    const session = this.sessions.get(sessionId.toString());
    if (!session) {
      throw new SDKError('Session not found', 'SESSION_NOT_FOUND');
    }

    if (session.status !== 'active') {
      throw new SDKError(`Cannot pause session in ${session.status} state`, 'INVALID_STATE');
    }

    session.status = 'paused';

    // Disconnect WebSocket to save resources
    if (this.wsClient?.isConnected()) {
      await this.wsClient.disconnect();
    }
  }

  /**
   * Get session history
   */
  async getSessionHistory(
    sessionId: bigint
  ): Promise<{
    prompts: string[];
    responses: string[];
    checkpoints: CheckpointProof[];
  }> {
    if (!this.initialized) {
      throw new SDKError('SessionManager not initialized', 'SESSION_NOT_INITIALIZED');
    }

    const session = this.sessions.get(sessionId.toString());
    if (session) {
      return {
        prompts: session.prompts,
        responses: session.responses,
        checkpoints: session.checkpoints
      };
    }

    // Try to load from storage
    const conversation = await this.storageManager.loadConversation(sessionId.toString());
    if (!conversation) {
      throw new SDKError('Session not found', 'SESSION_NOT_FOUND');
    }

    const prompts: string[] = [];
    const responses: string[] = [];

    for (const message of conversation.messages) {
      if (message.role === 'user') {
        prompts.push(message.content);
      } else if (message.role === 'assistant') {
        responses.push(message.content);
      }
    }

    return {
      prompts,
      responses,
      checkpoints: [] // Would need to load from separate storage
    };
  }

  /**
   * Stream response (for real-time streaming)
   */
  async streamResponse(
    sessionId: bigint,
    prompt: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    if (!this.initialized) {
      throw new SDKError('SessionManager not initialized', 'SESSION_NOT_INITIALIZED');
    }

    const session = this.sessions.get(sessionId.toString());
    if (!session) {
      throw new SDKError('Session not found', 'SESSION_NOT_FOUND');
    }

    if (session.status !== 'active') {
      throw new SDKError(`Session is ${session.status}`, 'SESSION_NOT_ACTIVE');
    }

    try {
      // Add prompt to session
      session.prompts.push(prompt);

      // Initialize WebSocket if needed
      if (!this.wsClient) {
        this.wsClient = new WebSocketClient(`wss://${session.provider}/ws`);
        await this.wsClient.connect();
      }

      // Set up streaming handler
      let fullResponse = '';
      this.wsClient.onMessage((data) => {
        if (data.type === 'chunk') {
          onChunk(data.content);
          fullResponse += data.content;
        }
      });

      // Send prompt with streaming flag
      await this.wsClient.sendMessage({
        type: 'prompt',
        sessionId: sessionId.toString(),
        prompt,
        model: session.model,
        stream: true
      });

      // Wait for streaming to complete
      await new Promise<void>((resolve) => {
        this.wsClient!.onMessage((data) => {
          if (data.type === 'stream_end') {
            resolve();
          }
        });
      });

      // Add complete response to session
      session.responses.push(fullResponse);

      // Update storage
      await this.storageManager.appendMessage(
        sessionId.toString(),
        {
          role: 'user',
          content: prompt,
          timestamp: Date.now()
        }
      );

      await this.storageManager.appendMessage(
        sessionId.toString(),
        {
          role: 'assistant',
          content: fullResponse,
          timestamp: Date.now()
        }
      );
    } catch (error: any) {
      throw new SDKError(
        `Failed to stream response: ${error.message}`,
        'STREAM_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Calculate session cost
   */
  calculateCost(
    tokensUsed: number,
    pricePerToken: number
  ): bigint {
    // Price per token is in smallest unit (e.g., wei or nano-USDC)
    return BigInt(tokensUsed) * BigInt(pricePerToken);
  }

  /**
   * Check if SessionManager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Clear all sessions from memory
   */
  clearSessions(): void {
    this.sessions.clear();
    if (this.wsClient?.isConnected()) {
      this.wsClient.disconnect();
    }
  }
}