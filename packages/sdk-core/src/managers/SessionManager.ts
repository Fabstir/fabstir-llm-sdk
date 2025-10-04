/**
 * Browser-compatible Session Manager
 * 
 * Manages LLM session lifecycle including creation, checkpoint proofs,
 * and completion. Works with WebSocket for real-time streaming.
 */

import { ethers } from 'ethers';
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
import { ChainRegistry } from '../config/ChainRegistry';
import { UnsupportedChainError } from '../errors/ChainErrors';

export interface SessionState {
  sessionId: bigint;
  jobId: bigint;
  chainId: number; // Added for multi-chain support
  model: string;
  provider: string;
  endpoint?: string; // WebSocket endpoint URL
  status: 'pending' | 'active' | 'paused' | 'completed' | 'failed';
  prompts: string[];
  responses: string[];
  checkpoints: CheckpointProof[];
  totalTokens: number;
  startTime: number;
  endTime?: number;
}

// Extended SessionConfig with chainId
export interface ExtendedSessionConfig extends SessionConfig {
  chainId: number;
  host: string;
  modelId: string;
  paymentMethod: 'deposit' | 'direct';
  depositAmount?: ethers.BigNumberish;
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
    // StorageManager is required for session persistence
    if (!this.storageManager.isInitialized()) {
      throw new SDKError('StorageManager not initialized - S5 storage is required', 'STORAGE_NOT_INITIALIZED');
    }
    this.initialized = true;
  }

  /**
   * Start a new session with chain awareness
   */
  async startSession(
    config: ExtendedSessionConfig | any
  ): Promise<{
    sessionId: bigint;
    jobId: bigint;
  }> {
    if (!this.initialized) {
      throw new SDKError('SessionManager not initialized', 'SESSION_NOT_INITIALIZED');
    }

    // Validate chainId
    if (!config.chainId) {
      throw new SDKError('Chain ID is required', 'MISSING_CHAIN_ID');
    }

    if (!ChainRegistry.isChainSupported(config.chainId)) {
      throw new UnsupportedChainError(config.chainId, ChainRegistry.getSupportedChains());
    }

    // Extract parameters for backward compatibility
    const model = config.modelId || config.model;
    const provider = config.host || config.provider;
    const endpoint = config.endpoint;

    try {
      // Create session job with payment
      // PaymentManagerMultiChain expects a SessionJobParams object with 'amount' field
      const sessionJobParams = {
        host: provider,
        model: model,
        amount: config.depositAmount,  // PaymentManagerMultiChain expects 'amount', not 'depositAmount'
        pricePerToken: config.pricePerToken,
        proofInterval: config.proofInterval,
        duration: config.duration,
        chainId: config.chainId,
        paymentToken: config.paymentToken,
        useDeposit: config.useDeposit
      };

      const result = await this.paymentManager.createSessionJob(sessionJobParams);

      // PaymentManagerMultiChain returns just the job ID as a number
      // We'll use the job ID as both session ID and job ID for now
      const jobId = typeof result === 'number' ? BigInt(result) : result.jobId || result;
      const sessionId = typeof result === 'number' ? BigInt(result) : result.sessionId || jobId;

      // Create session state
      const sessionState: SessionState = {
        sessionId: sessionId,
        jobId: jobId,
        chainId: config.chainId,
        model,
        provider,
        endpoint,
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
      };

      // Store in memory
      this.sessions.set(sessionId.toString(), sessionState);

      // Persist to storage (convert BigInt values to strings for JSON serialization)
      await this.storageManager.storeConversation({
        id: sessionId.toString(),
        messages: [],
        metadata: {
          chainId: config.chainId,
          model,
          provider,
          jobId: jobId.toString(),
          config: {
            depositAmount: config.depositAmount?.toString() || '',
            pricePerToken: config.pricePerToken?.toString() || '',
            proofInterval: config.proofInterval?.toString() || '',
            duration: config.duration?.toString() || ''
          }
        },
        createdAt: sessionState.startTime,
        updatedAt: sessionState.startTime
      });

      return {
        sessionId: sessionId,
        jobId: jobId
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
   * Get session by ID
   */
  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Resume a paused session with chain validation
   */
  async resumeSessionWithChain(sessionId: string, chainId: number): Promise<SessionState> {
    // Try to get from storage if available
    let session = null;
    if (this.storageManager.getSession) {
      session = await this.storageManager.getSession(sessionId);
    }

    if (!session) {
      throw new SDKError('Session not found', 'SESSION_NOT_FOUND');
    }

    if (session.chainId && session.chainId !== chainId) {
      throw new SDKError(
        `Session chain mismatch: expected ${session.chainId}, got ${chainId}`,
        'CHAIN_MISMATCH'
      );
    }

    // Restore session to memory
    this.sessions.set(sessionId, session as SessionState);

    return session as SessionState;
  }

  /**
   * Send prompt in session with chain awareness
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

      // Use REST API instead of WebSocket (as per node implementation)
      console.log('Session endpoint from storage:', session.endpoint);
      const endpoint = session.endpoint || 'http://localhost:8080';
      const httpUrl = endpoint.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '');
      
      // Call REST API for inference
      const inferenceUrl = `${httpUrl}/v1/inference`;
      const requestBody = {
        model: session.model || 'tiny-vicuna-1b',
        prompt: prompt,
        max_tokens: 200,  // Allow longer responses for poems, stories, etc.
        temperature: 0.7,  // Add temperature for better responses
        sessionId: sessionId.toString(),
        jobId: session.jobId.toString()
      };
      
      console.log('Sending inference request to:', inferenceUrl);
      console.log('Request body:', requestBody);
      
      let fetchResponse;
      try {
        fetchResponse = await fetch(inferenceUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });
      } catch (fetchError: any) {
        console.error('Fetch error:', fetchError);
        throw new Error(`Network error calling inference API: ${fetchError.message}`);
      }
      
      if (!fetchResponse.ok) {
        const errorText = await fetchResponse.text();
        throw new Error(`Inference failed: ${fetchResponse.status} - ${errorText}`);
      }
      
      const result = await fetchResponse.json();
      console.log('Inference API response:', result);
      
      // Try different possible response fields
      let response = result.response || result.text || result.content || result.generated_text;
      
      if (!response) {
        console.error('Unexpected response format:', result);
        throw new Error('No response received from inference endpoint. Response: ' + JSON.stringify(result));
      }

      // Clean up repetitive responses (common issue with small models)
      response = this.cleanupRepetitiveText(response);

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
   * Send prompt with WebSocket streaming support
   */
  async sendPromptStreaming(
    sessionId: bigint,
    prompt: string,
    onToken?: (token: string) => void
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

      // Get WebSocket URL from endpoint
      const endpoint = session.endpoint || 'http://localhost:8080';
      const wsUrl = endpoint.includes('ws://') || endpoint.includes('wss://') 
        ? endpoint 
        : endpoint.replace('http://', 'ws://').replace('https://', 'wss://') + '/v1/ws';

      // Initialize WebSocket client if not already connected
      if (!this.wsClient || !this.wsClient.isConnected()) {
        this.wsClient = new WebSocketClient(wsUrl, { chainId: session.chainId });
        await this.wsClient.connect();

        // Send session_init with chain_id
        // Get user address from payment manager's signer
        const signer = (this.paymentManager as any).signer;
        if (!signer) {
          throw new Error('PaymentManager signer not available. Cannot initialize session without authenticated signer.');
        }
        const userAddress = await signer.getAddress();
        if (!userAddress) {
          throw new Error('Failed to get user address from signer. Cannot initialize session.');
        }

        await this.wsClient.sendMessage({
          type: 'session_init',
          chain_id: session.chainId,
          session_id: sessionId.toString(),
          jobId: session.jobId.toString(),
          user_address: userAddress
        });
      }

      // Collect full response
      let fullResponse = '';

      // Set up streaming handler
      if (onToken) {
        const unsubscribe = this.wsClient.onMessage((data: any) => {
          // Log ALL messages to see what the host is sending
          console.log(`[SessionManager] WebSocket message received:`, JSON.stringify(data));

          if (data.type === 'stream_chunk' && data.content) {
            onToken(data.content);
            fullResponse += data.content;
          } else if (data.type === 'response') {
            fullResponse = data.content || fullResponse;
          } else if (data.type === 'proof_submitted' || data.type === 'checkpoint_submitted') {
            console.log(`[SessionManager] PROOF SUBMITTED by host:`, data);
          } else if (data.type === 'session_completed') {
            console.log(`[SessionManager] SESSION COMPLETED by host:`, data);
          }
        });

        // Send message and wait for response
        // Try simpler inference format that the node might support
        const response = await this.wsClient.sendMessage({
          type: 'prompt',
          chain_id: session.chainId,
          jobId: session.jobId.toString(),  // Include jobId for settlement tracking
          prompt: prompt,
          request: {
            model: 'tiny-vicuna',  // Use tiny-vicuna as confirmed by node developer
            prompt: prompt,
            max_tokens: 50,
            temperature: 0.7,
            stream: true
          }
        });

        // Clean up handler
        unsubscribe();
        
        // Use collected response or fallback to returned response
        const finalResponse = fullResponse || response;
        
        // Add response to session
        session.responses.push(finalResponse);
        
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
            content: finalResponse,
            timestamp: Date.now()
          }
        );

        return finalResponse;
      } else {
        // Non-streaming mode
        const response = await this.wsClient.sendMessage({
          type: 'prompt',
          chain_id: session.chainId,
          jobId: session.jobId.toString(),  // Include jobId for settlement tracking
          prompt: prompt,
          request: {
            model: 'tiny-vicuna',  // Use tiny-vicuna as confirmed by node developer
            prompt: prompt,
            max_tokens: 50,
            temperature: 0.7,
            stream: false
          }
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
      }
    } catch (error: any) {
      throw new SDKError(
        `Failed to send prompt via WebSocket: ${error.message}`,
        'WS_PROMPT_ERROR',
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
      // For session jobs, use sessionId not jobId
      const txHash = await this.paymentManager.submitCheckpoint(
        sessionId,
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

    const sessionIdStr = sessionId.toString();
    let session = this.sessions.get(sessionIdStr);

    // If session not in memory, try to load from storage (handles page refresh case)
    if (!session && this.storageManager) {
      console.log(`Session ${sessionIdStr} not in memory, attempting to load from storage...`);
      try {
        const conversation = await this.storageManager.loadConversation(sessionIdStr);
        if (conversation && conversation.metadata) {
          // Reconstruct minimal session state from storage
          session = {
            sessionId: sessionId,
            jobId: BigInt(conversation.metadata.jobId || sessionId),
            model: conversation.metadata.model || '',
            provider: conversation.metadata.provider || '',
            status: conversation.metadata.status || 'active',
            prompts: [],
            responses: [],
            checkpoints: [],
            totalTokens: conversation.metadata.totalTokens || 0,
            startTime: conversation.metadata.startTime || Date.now()
          } as SessionState;

          // Add to memory for this session
          this.sessions.set(sessionIdStr, session);
          console.log(`Session ${sessionIdStr} restored from storage`);
        }
      } catch (err) {
        console.warn(`Could not load session ${sessionIdStr} from storage:`, err);
      }
    }

    // If still no session, it might already be completed by host
    if (!session) {
      console.log(`Session ${sessionIdStr} not found - may already be completed by host`);
      // Don't throw error - just try to complete it anyway
      // The contract will handle if it's already completed
    }

    try {
      // Submit final completion to contract
      // For session jobs, use sessionId not jobId
      const txHash = await this.paymentManager.completeSession(
        sessionId,
        totalTokens,
        finalProof
      );

      // Update session state if we have it
      const sessionAfterTx = this.sessions.get(sessionIdStr);
      if (sessionAfterTx) {
        sessionAfterTx.status = 'completed';
        sessionAfterTx.totalTokens = totalTokens;
        sessionAfterTx.endTime = Date.now();
      } else {
        console.log(`Session ${sessionIdStr} not in memory after transaction - likely completed by host`);
      }
      
      // Clean up WebSocket connection if active
      if (this.wsClient && this.wsClient.isConnected()) {
        await this.wsClient.disconnect();
        this.wsClient = undefined;
      }

      // Update storage
      const conversation = await this.storageManager.loadConversation(sessionIdStr);
      if (conversation) {
        conversation.metadata['status'] = 'completed';
        conversation.metadata['totalTokens'] = totalTokens;
        conversation.metadata['endTime'] = sessionAfterTx?.endTime || Date.now();
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
   * End session cleanly (user-initiated)
   * Just closes WebSocket - host will handle contract completion
   */
  async endSession(sessionId: bigint): Promise<void> {
    const sessionIdStr = sessionId.toString();

    try {
      // Close WebSocket connection if active
      if (this.wsClient && this.wsClient.isConnected()) {
        console.log(`Closing WebSocket connection for session ${sessionIdStr}`);
        await this.wsClient.disconnect();
        this.wsClient = undefined;
      }

      // Update session state in memory
      const session = this.sessions.get(sessionIdStr);
      if (session) {
        session.status = 'ended';
        session.endTime = Date.now();
      }

      // Update storage to mark session as ended
      const conversation = await this.storageManager.loadConversation(sessionIdStr);
      if (conversation) {
        conversation.metadata['status'] = 'ended';
        conversation.metadata['endTime'] = Date.now();
        conversation.updatedAt = Date.now();
        await this.storageManager.saveConversation(conversation);
      }

      console.log(`Session ${sessionIdStr} ended by user - host will complete contract`);
    } catch (error: any) {
      throw new SDKError(
        `Failed to end session: ${error.message}`,
        'SESSION_END_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Clean up repetitive text (common issue with small models)
   */
  private cleanupRepetitiveText(text: string): string {
    // Split into sentences
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    
    if (sentences.length <= 1) return text;
    
    // Check for exact repetitions
    const uniqueSentences = new Set<string>();
    const result: string[] = [];
    
    for (const sentence of sentences) {
      const cleaned = sentence.trim().toLowerCase();
      if (cleaned && !uniqueSentences.has(cleaned)) {
        uniqueSentences.add(cleaned);
        result.push(sentence.trim());
      }
    }
    
    // If we removed a lot of repetitions, add a note
    const finalText = result.join('. ') + '.';
    if (sentences.length > result.length * 2) {
      console.log(`Cleaned up repetitive response: ${sentences.length} sentences -> ${result.length} unique`);
    }
    
    return finalText;
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

      // For now, use REST API and simulate streaming
      const endpoint = session.endpoint || 'http://localhost:8080';
      const httpUrl = endpoint.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '');
      
      // Call REST API for inference
      const inferenceUrl = `${httpUrl}/v1/inference`;
      const requestBody = {
        model: session.model || 'tiny-vicuna-1b',
        prompt: prompt,
        max_tokens: 200,  // Allow longer responses for poems, stories, etc.
        temperature: 0.7,  // Add temperature for better responses
        sessionId: sessionId.toString(),
        jobId: session.jobId.toString()
      };
      
      const fetchResponse = await fetch(inferenceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!fetchResponse.ok) {
        const errorText = await fetchResponse.text();
        throw new Error(`Inference failed: ${fetchResponse.status} - ${errorText}`);
      }
      
      const result = await fetchResponse.json();
      const fullResponse = result.response || result.text;
      
      if (!fullResponse) {
        throw new Error('No response received from inference endpoint');
      }
      
      // Simulate streaming by chunking the response
      const words = fullResponse.split(' ');
      for (const word of words) {
        onChunk(word + ' ');
        await new Promise(resolve => setTimeout(resolve, 50)); // Small delay to simulate streaming
      }

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