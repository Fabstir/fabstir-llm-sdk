// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

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
  CheckpointProof,
  Vector,
  UploadVectorsMessage,
  UploadVectorsResponse,
  UploadVectorsResult,
  SearchVectorsMessage,
  SearchVectorsResponse,
  SearchResult
} from '../types';
import { PaymentManager } from './PaymentManager';
import { StorageManager } from './StorageManager';
import { HostManager } from './HostManager';
import { EncryptionManager } from './EncryptionManager';
import { WebSocketClient } from '../websocket/WebSocketClient';
import { ChainRegistry } from '../config/ChainRegistry';
import { UnsupportedChainError } from '../errors/ChainErrors';
import { PricingValidationError } from '../errors/pricing-errors';
import { bytesToHex } from '../crypto/utilities';

/**
 * Convert model hash to short name that nodes expect in their .env MODEL_NAME
 * If not a known hash, return as-is (could be a short name already)
 */
function convertModelHashToName(modelHashOrName: string): string {
  const MODEL_HASH_TO_NAME: Record<string, string> = {
    '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced': 'tiny-vicuna',
    '0x14843424179fbcb9aeb7fd446fa97143300609757bd49ffb3ec7fb2f75aed1ca': 'tinyllama',
    '0x27c438a3cbc9e67878e65ca69db4fef2323743afbcd565317fea401ba8b2ae5d': 'gpt-oss-20b'
  };

  // If it's a hash we recognize, convert it
  if (MODEL_HASH_TO_NAME[modelHashOrName]) {
    return MODEL_HASH_TO_NAME[modelHashOrName];
  }

  // Otherwise return as-is (could already be a short name, or unknown model)
  return modelHashOrName;
}

export interface SessionState {
  sessionId: bigint;
  jobId: bigint;
  chainId: number; // Added for multi-chain support
  model: string;
  provider: string;
  endpoint?: string; // WebSocket endpoint URL
  status: 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'ended';
  prompts: string[];
  responses: string[];
  checkpoints: CheckpointProof[];
  totalTokens: number;
  startTime: number;
  endTime?: number;
  encryption?: boolean; // NEW: Track if session uses encryption
  groupId?: string; // NEW: Session Groups integration
}

// Extended SessionConfig with chainId
export interface ExtendedSessionConfig extends SessionConfig {
  chainId: number;
  host: string;
  modelId: string;
  paymentMethod: 'deposit' | 'direct';
  depositAmount?: ethers.BigNumberish;
  encryption?: boolean; // NEW: Enable E2EE
  groupId?: string; // NEW: Session Groups integration
}

export class SessionManager implements ISessionManager {
  private paymentManager: PaymentManager;
  private storageManager: StorageManager;
  private hostManager?: HostManager; // Optional until set after auth
  private encryptionManager?: EncryptionManager; // NEW: Optional until set after auth
  private sessionGroupManager?: any; // NEW: Session Groups integration (SessionGroupManager)
  private wsClient?: WebSocketClient;
  private sessions: Map<string, SessionState> = new Map();
  private initialized = false;
  private sessionKey?: Uint8Array; // NEW: Store session key for Phase 4.2
  private messageIndex: number = 0; // NEW: For Phase 4.2 replay protection
  private pendingRequests: Map<string, { resolve: (value: any) => void; reject: (error: any) => void; timeoutId: NodeJS.Timeout }> = new Map(); // Host-side RAG request tracking

  constructor(
    paymentManager: PaymentManager,
    storageManager: StorageManager,
    hostManager?: HostManager // NEW: Optional parameter
  ) {
    this.paymentManager = paymentManager;
    this.storageManager = storageManager;
    this.hostManager = hostManager; // NEW
  }

  /**
   * Set HostManager for price validation (called after authentication)
   */
  setHostManager(hostManager: HostManager): void {
    this.hostManager = hostManager;
  }

  /**
   * Set EncryptionManager for end-to-end encryption (called after authentication)
   */
  setEncryptionManager(encryptionManager: EncryptionManager): void {
    this.encryptionManager = encryptionManager;
  }

  /**
   * Initialize the session manager
   */
  async initialize(): Promise<void> {
    if (!this.paymentManager.isInitialized()) {
      throw new SDKError('PaymentManager not initialized', 'PAYMENT_NOT_INITIALIZED');
    }
    // StorageManager is required for session persistence (unless explicitly disabled for hosts)
    const skipS5Storage = process.env.SKIP_S5_STORAGE === 'true';
    if (!skipS5Storage && !this.storageManager.isInitialized()) {
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

    // NEW (Phase 6.2): Enable encryption by default (opt-out with encryption: false)
    const enableEncryption = config.encryption !== false;

    try {
      // NEW: Price validation against host minimum
      let validatedPrice = config.pricePerToken;

      if (this.hostManager && provider) {
        try {
          // Fetch host info to get minimum price (DUAL PRICING)
          const hostInfo = await this.hostManager.getHostInfo(provider);

          // Determine if this is native token (ETH/BNB) or stablecoin (USDC) payment
          const isNativePayment = !config.paymentToken ||
                                  config.paymentToken === '0x0000000000000000000000000000000000000000' ||
                                  config.paymentToken === ethers.ZeroAddress;

          // Select the appropriate pricing field
          const hostMinPrice = isNativePayment
            ? Number(hostInfo.minPricePerTokenNative || 0n)
            : Number(hostInfo.minPricePerTokenStable || 0n);

          const pricingType = isNativePayment ? 'native (ETH/BNB)' : 'stablecoin (USDC)';

          // Default to host minimum if not provided
          if (validatedPrice === undefined || validatedPrice === null) {
            validatedPrice = hostMinPrice;
            console.log(`Using host minimum ${pricingType} price: ${hostMinPrice}`);
          }

          // Validate client price >= host minimum
          if (validatedPrice < hostMinPrice) {
            throw new PricingValidationError(
              `Price ${validatedPrice} is below host minimum ${pricingType} price ${hostMinPrice}. ` +
              `Host "${provider}" requires at least ${hostMinPrice} per token for ${pricingType} payments.`,
              BigInt(validatedPrice)
            );
          }

          console.log(`✓ Pricing validated: ${validatedPrice} >= ${hostMinPrice} (${pricingType})`);
        } catch (error) {
          if (error instanceof PricingValidationError) {
            throw error; // Re-throw pricing errors
          }
          // Log but don't fail for other errors (host lookup failures)
          console.warn('Could not validate pricing against host:', error);
        }
      }

      // Create session job with payment
      // PaymentManagerMultiChain expects a SessionJobParams object with 'amount' field
      const sessionJobParams = {
        host: provider,
        model: model,
        amount: config.depositAmount,  // PaymentManagerMultiChain expects 'amount', not 'depositAmount'
        pricePerToken: validatedPrice, // NEW: Use validated price
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

      // Validate and merge RAG config if provided
      let ragConfig: RAGSessionConfig | undefined;
      if (config.ragConfig) {
        validateRAGConfig(config.ragConfig);
        ragConfig = mergeRAGConfig(config.ragConfig);
      }

      // NEW: Session Groups integration - Validate groupId if provided
      if (config.groupId !== undefined) {
        // Validate groupId format (must not be empty if provided)
        if (config.groupId.trim() === '') {
          throw new SDKError('Invalid group ID', 'INVALID_GROUP_ID');
        }

        // Verify group exists and user has permission (only if manager available)
        if (this.sessionGroupManager) {
          const userAddress = await this.storageManager.getUserAddress();
          if (!userAddress) {
            throw new SDKError('User not authenticated', 'USER_NOT_AUTHENTICATED');
          }

          // Will throw if group doesn't exist or user lacks permission
          await this.sessionGroupManager.getSessionGroup(config.groupId, userAddress);
        }
      }

      // Create session state
      const sessionState: SessionState = {
        sessionId: sessionId,
        jobId: jobId,
        chainId: config.chainId,
        model: convertModelHashToName(model),  // Convert hash to short name for node compatibility
        provider,
        endpoint,
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        encryption: enableEncryption,  // NEW (Phase 6.2): Store encryption preference
        groupId: config.groupId,  // NEW: Session Groups integration
        ragConfig: ragConfig,  // NEW (Phase 5.1): Store RAG config
        ragMetrics: ragConfig?.enabled ? {
          totalRetrievals: 0,
          averageSimilarity: 0,
          averageLatencyMs: 0,
          emptyRetrievals: 0,
          totalContextTokens: 0
        } : undefined
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
          endpoint,  // Store endpoint for session restoration
          jobId: jobId.toString(),
          status: 'active',  // Store status for restoration
          totalTokens: 0,  // Initialize token count
          startTime: sessionState.startTime,  // Store start time
          encryption: sessionState.encryption,  // NEW (Phase 6.2): Store encryption preference
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

      // NEW: Session Groups integration - Link session to group if groupId provided
      if (config.groupId && this.sessionGroupManager) {
        const userAddress = await this.storageManager.getUserAddress();
        if (userAddress) {
          await this.sessionGroupManager.addChatSession(
            config.groupId,
            userAddress,
            sessionId.toString()
          );
        }
      }

      return {
        sessionId: sessionId,
        jobId: jobId
      };
    } catch (error: any) {
      // Re-throw pricing validation errors without wrapping
      if (error instanceof PricingValidationError) {
        throw error;
      }

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
      // Inject RAG context if enabled
      const augmentedPrompt = await this.injectRAGContext(sessionId.toString(), prompt);

      // Add original prompt to session (not augmented)
      session.prompts.push(prompt);

      // Use REST API instead of WebSocket (as per node implementation)
      console.log('Session endpoint from storage:', session.endpoint);
      const endpoint = session.endpoint || 'http://localhost:8080';
      const httpUrl = endpoint.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '');

      // Call REST API for inference with augmented prompt
      const inferenceUrl = `${httpUrl}/v1/inference`;
      const requestBody = {
        model: session.model,
        prompt: augmentedPrompt,  // Use RAG-augmented prompt
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

      // Store in conversation memory if enabled
      const conversationMemory = this.conversationMemories?.get(sessionId.toString());
      if (conversationMemory) {
        try {
          await conversationMemory.addMessage('user', prompt);
          await conversationMemory.addMessage('assistant', response);
        } catch (memError: any) {
          console.warn(`Failed to store messages in conversation memory: ${memError.message}`);
        }
      }

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

    const sessionIdStr = sessionId.toString();
    let session = this.sessions.get(sessionIdStr);

    // If session not in memory, try to load from storage (handles SessionManager recreation)
    if (!session && this.storageManager) {
      console.log(`Session ${sessionIdStr} not in memory, attempting to load from storage...`);
      try {
        const conversation = await this.storageManager.loadConversation(sessionIdStr);
        if (conversation && conversation.metadata) {
          // Reconstruct minimal session state from storage
          session = {
            sessionId: sessionId,
            jobId: BigInt(conversation.metadata.jobId || sessionId),
            chainId: conversation.metadata.chainId || 84532,
            model: conversation.metadata.model || '',
            provider: conversation.metadata.provider || '',
            endpoint: conversation.metadata.endpoint,
            status: (conversation.metadata.status as any) || 'active',
            prompts: [],
            responses: [],
            checkpoints: [],
            totalTokens: conversation.metadata.totalTokens || 0,
            startTime: conversation.metadata.startTime || conversation.createdAt,
            encryption: conversation.metadata.encryption !== false  // NEW (Phase 6.2): Restore encryption preference
          } as SessionState;

          // Add to memory for subsequent calls
          this.sessions.set(sessionIdStr, session);
          console.log(`Session ${sessionIdStr} restored from storage`);
        }
      } catch (err) {
        console.warn(`Could not load session ${sessionIdStr} from storage:`, err);
      }
    }

    // If still no session after trying storage, throw error
    if (!session) {
      throw new SDKError('Session not found in memory or storage', 'SESSION_NOT_FOUND');
    }

    if (session.status !== 'active') {
      throw new SDKError(`Session is ${session.status}`, 'SESSION_NOT_ACTIVE');
    }

    try {
      // Inject RAG context if enabled
      const augmentedPrompt = await this.injectRAGContext(sessionIdStr, prompt);

      // Add original prompt to session (not augmented)
      session.prompts.push(prompt);

      // Get WebSocket URL from endpoint
      const endpoint = session.endpoint || 'http://localhost:8080';
      const wsUrl = endpoint.includes('ws://') || endpoint.includes('wss://')
        ? endpoint 
        : endpoint.replace('http://', 'ws://').replace('https://', 'wss://') + '/v1/ws';

      // Initialize WebSocket client if not already connected
      console.log('[SessionManager] 🔌 Checking WebSocket connection...');
      console.log('[SessionManager] wsClient exists:', !!this.wsClient);
      console.log('[SessionManager] wsClient connected:', this.wsClient?.isConnected());
      console.log('[SessionManager] sessionKey exists BEFORE init:', !!this.sessionKey);
      console.log('[SessionManager] sessionKey length BEFORE init:', this.sessionKey?.length);

      if (!this.wsClient || !this.wsClient.isConnected()) {
        console.log('[SessionManager] 🆕 Creating NEW WebSocket connection to:', wsUrl);
        this.wsClient = new WebSocketClient(wsUrl, { chainId: session.chainId });
        await this.wsClient.connect();
        console.log('[SessionManager] ✅ WebSocket connected successfully');

        // Set up global RAG message handlers
        this._setupRAGMessageHandlers();

        // NEW (Phase 6.2): Use encryption by default
        if (session.encryption && this.encryptionManager) {
          console.log('[SessionManager] 🔐 Session encryption ENABLED - calling sendEncryptedInit...');
          console.log('[SessionManager] sessionKey BEFORE sendEncryptedInit:', !!this.sessionKey);

          // Send encrypted session init
          const config: ExtendedSessionConfig = {
            chainId: session.chainId,
            host: session.provider,
            modelId: session.model,
            endpoint: session.endpoint,
            paymentMethod: 'deposit',
            encryption: true
          };
          await this.sendEncryptedInit(this.wsClient, config, sessionId, session.jobId);

          console.log('[SessionManager] sessionKey AFTER sendEncryptedInit:', !!this.sessionKey);
          console.log('[SessionManager] sessionKey length AFTER sendEncryptedInit:', this.sessionKey?.length);
          if (this.sessionKey) {
            console.log('[SessionManager] sessionKey (first 16 hex chars):', Array.from(this.sessionKey.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(''));
          }
        } else {
          console.log('[SessionManager] ⚠️ Session encryption DISABLED - calling sendPlaintextInit...');
          // Send plaintext session init (opt-out or no encryption manager)
          const signer = (this.paymentManager as any).signer;
          if (!signer) {
            throw new Error('PaymentManager signer not available. Cannot initialize session without authenticated signer.');
          }
          const userAddress = await signer.getAddress();
          if (!userAddress) {
            throw new Error('Failed to get user address from signer. Cannot initialize session.');
          }

          const config: ExtendedSessionConfig = {
            chainId: session.chainId,
            host: session.provider,
            modelId: session.model,
            endpoint: session.endpoint,
            paymentMethod: 'deposit',
            encryption: false
          };
          await this.sendPlaintextInit(this.wsClient, config, sessionId, session.jobId, userAddress);
        }
      } else {
        console.log('[SessionManager] ♻️ REUSING existing WebSocket connection');
        console.log('[SessionManager] sessionKey exists (reused connection):', !!this.sessionKey);
        console.log('[SessionManager] sessionKey length (reused connection):', this.sessionKey?.length);
      }

      // Collect full response
      let fullResponse = '';

      // Set up streaming handler
      if (onToken) {
        // NEW (Phase 6.2): Send encrypted or plaintext message based on session settings
        let response;
        if (session.encryption) {
          // SECURITY: Session requires encryption - fail if session key not available
          if (!this.sessionKey) {
            throw new SDKError(
              'Session configured for encryption but session key not available. Encrypted init may have failed.',
              'ENCRYPTION_KEY_MISSING'
            );
          }

          // Send encrypted message and wait for complete response
          console.log('[SessionManager] ===== STARTING ENCRYPTED STREAMING =====');
          console.log('[SessionManager] Initial fullResponse:', `"${fullResponse}"`);
          console.log('[SessionManager] 🔑 Session key status BEFORE registering handler:');
          console.log('[SessionManager]   - this.sessionKey exists:', !!this.sessionKey);
          console.log('[SessionManager]   - this.sessionKey length:', this.sessionKey?.length);
          console.log('[SessionManager]   - this.sessionKey type:', typeof this.sessionKey);
          console.log('[SessionManager]   - this.sessionKey is Uint8Array:', this.sessionKey instanceof Uint8Array);
          if (this.sessionKey) {
            console.log('[SessionManager]   - sessionKey (first 8 bytes hex):', Array.from(this.sessionKey.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(''));
          }

          response = await new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => {
              console.log('[SessionManager] ⏰ TIMEOUT - fullResponse at timeout:', `"${fullResponse}"`);
              console.log('[SessionManager] ⏰ TIMEOUT - this.sessionKey still exists:', !!this.sessionKey);
              reject(new SDKError('Encrypted response timeout', 'RESPONSE_TIMEOUT'));
            }, 30000);

            console.log('[SessionManager] 📋 BEFORE registering handler:');
            console.log('[SessionManager]   - Current handlers count:', (this.wsClient as any).messageHandlers?.size);
            console.log('[SessionManager]   - this.sessionKey exists:', !!this.sessionKey);
            console.log('[SessionManager]   - this.sessionKey length:', this.sessionKey?.length);

            const unsubscribe = this.wsClient!.onMessage(async (data: any) => {
              console.log(`[SessionManager] ⚡⚡⚡ ========== HANDLER CALLED ========== ⚡⚡⚡`);
              console.log(`[SessionManager] ⚡ Message type: "${data.type}"`);
              console.log(`[SessionManager] ⚡ Message keys:`, Object.keys(data));
              console.log(`[SessionManager] ⚡ Full message:`, JSON.stringify(data));

              console.log(`[SessionManager] 🔑 Session key status AT HANDLER EXECUTION:`);
              console.log(`[SessionManager]   - this.sessionKey exists:`, !!this.sessionKey);
              console.log(`[SessionManager]   - this.sessionKey === undefined:`, this.sessionKey === undefined);
              console.log(`[SessionManager]   - this.sessionKey === null:`, this.sessionKey === null);
              console.log(`[SessionManager]   - this.sessionKey length:`, this.sessionKey?.length);
              console.log(`[SessionManager]   - this.sessionKey type:`, typeof this.sessionKey);
              console.log(`[SessionManager]   - this.sessionKey is Uint8Array:`, this.sessionKey instanceof Uint8Array);
              if (this.sessionKey) {
                console.log(`[SessionManager]   - sessionKey (first 8 bytes hex):`, Array.from(this.sessionKey.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(''));
              }

              // Check encrypted_chunk condition
              console.log(`[SessionManager] 🔍 Checking encrypted_chunk condition:`);
              console.log(`[SessionManager]   - data.type === 'encrypted_chunk': ${data.type === 'encrypted_chunk'}`);
              console.log(`[SessionManager]   - this.sessionKey (truthy): ${!!this.sessionKey}`);
              console.log(`[SessionManager]   - FULL CONDITION: ${data.type === 'encrypted_chunk' && this.sessionKey}`);

              if (data.type === 'encrypted_chunk' && this.sessionKey) {
                console.log('[SessionManager] ✅ CONDITION TRUE - Processing encrypted_chunk...');
                try {
                  console.log('[SessionManager] 🔓 About to decrypt chunk...');
                  const decrypted = await this.decryptIncomingMessage(data);
                  console.log('[SessionManager] ✅ Chunk decrypted successfully:', `"${decrypted}"`);
                  onToken(decrypted);
                  fullResponse += decrypted;
                  console.log('[SessionManager] fullResponse is now:', `"${fullResponse}"`);
                } catch (err) {
                  console.error('[SessionManager] ❌ Failed to decrypt chunk:', err);
                  console.error('[SessionManager] Error stack:', (err as Error).stack);
                }
              } else if (data.type === 'encrypted_chunk' && !this.sessionKey) {
                console.error('[SessionManager] ❌❌❌ ENCRYPTED CHUNK RECEIVED BUT NO SESSION KEY! ❌❌❌');
                console.error('[SessionManager] This is the BUG! Session key should have been set in sendEncryptedInit!');
                console.error('[SessionManager] Message type:', data.type);
                console.error('[SessionManager] Session key exists:', !!this.sessionKey);
              } else if (data.type === 'encrypted_response' && this.sessionKey) {
                console.log('[SessionManager] ✅ Got encrypted_response, fullResponse before resolve:', `"${fullResponse}"`);
                clearTimeout(timeout);
                unsubscribe();
                try {
                  // Decrypt final message if not empty
                  if (data.payload && data.payload.ciphertextHex) {
                    console.log('[SessionManager] 🔓 Decrypting final encrypted response...');
                    const finalMsg = await this.decryptIncomingMessage(data);
                    console.log('[SessionManager] ✅ Final encrypted message:', finalMsg);
                  }
                  console.log('[SessionManager] RESOLVING with fullResponse:', `"${fullResponse}"`);
                  resolve(fullResponse);
                } catch (err) {
                  console.error('[SessionManager] ❌ Error in encrypted_response handler:', err);
                  reject(err);
                }
              } else if (data.type === 'error') {
                console.error('[SessionManager] ❌ Error message received:', data.message);
                clearTimeout(timeout);
                unsubscribe();
                reject(new SDKError(data.message || 'Request failed', 'REQUEST_ERROR'));
              } else if (data.type === 'proof_submitted' || data.type === 'checkpoint_submitted') {
                console.log(`[SessionManager] 📜 PROOF SUBMITTED by host:`, data);
              } else if (data.type === 'session_completed') {
                console.log(`[SessionManager] ✅ SESSION COMPLETED by host:`, data);
              } else {
                console.log(`[SessionManager] ⚠️ Message type "${data.type}" not handled by any condition`);
                console.log(`[SessionManager] Available conditions checked:`);
                console.log(`[SessionManager]   - encrypted_chunk && sessionKey: ${data.type === 'encrypted_chunk' && this.sessionKey}`);
                console.log(`[SessionManager]   - encrypted_response && sessionKey: ${data.type === 'encrypted_response' && this.sessionKey}`);
                console.log(`[SessionManager]   - error: ${data.type === 'error'}`);
                console.log(`[SessionManager]   - proof_submitted/checkpoint_submitted: ${data.type === 'proof_submitted' || data.type === 'checkpoint_submitted'}`);
                console.log(`[SessionManager]   - session_completed: ${data.type === 'session_completed'}`);
              }
              console.log(`[SessionManager] ⚡⚡⚡ ========== HANDLER END ========== ⚡⚡⚡`);
            });

            console.log('[SessionManager] 📋 AFTER registering handler:');
            console.log('[SessionManager]   - Current handlers count:', (this.wsClient as any).messageHandlers?.size);
            console.log('[SessionManager]   - Handler registered successfully');
            console.log('[SessionManager]   - this.sessionKey still exists:', !!this.sessionKey);
            console.log('[SessionManager]   - this.sessionKey length:', this.sessionKey?.length);

            // Send encrypted message after handler is set up
            console.log('[SessionManager] 📤 About to send encrypted message...');
            console.log('[SessionManager] this.sessionKey exists before sending:', !!this.sessionKey);
            this.sendEncryptedMessage(prompt).catch((err) => {
              console.error('[SessionManager] ❌ Failed to send encrypted message:', err);
              reject(err);
            });
          });

          console.log('[SessionManager] Promise resolved, response:', `"${response}"`);
          console.log('[SessionManager] fullResponse after Promise:', `"${fullResponse}"`);
        } else {
          // Plaintext streaming mode
          const unsubscribe = this.wsClient.onMessage(async (data: any) => {
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

          // Send plaintext message (only if session explicitly opted out of encryption)
          response = await this.wsClient.sendMessage({
            type: 'prompt',
            chain_id: session.chainId,
            jobId: session.jobId.toString(),  // Include jobId for settlement tracking
            prompt: augmentedPrompt,  // Use RAG-augmented prompt
            request: {
              model: session.model,
              prompt: augmentedPrompt,  // Use RAG-augmented prompt
              max_tokens: 50,
              temperature: 0.7,
              stream: true
            }
          });

          // Clean up handler for plaintext
          unsubscribe();
        }
        
        // Use collected response or fallback to returned response
        console.log('[SessionManager] ===== FINAL RESPONSE ASSEMBLY =====');
        console.log('[SessionManager] fullResponse:', `"${fullResponse}"`);
        console.log('[SessionManager] response:', `"${response}"`);
        const finalResponse = fullResponse || response;
        console.log('[SessionManager] finalResponse (return value):', `"${finalResponse}"`);

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

        // Store in conversation memory if enabled
        const conversationMemory = this.conversationMemories?.get(sessionIdStr);
        if (conversationMemory) {
          try {
            await conversationMemory.addMessage('user', prompt);
            await conversationMemory.addMessage('assistant', finalResponse);
          } catch (memError: any) {
            console.warn(`Failed to store messages in conversation memory: ${memError.message}`);
          }
        }

        return finalResponse;
      } else {
        // Non-streaming mode - MUST support encryption too!
        let response;

        if (session.encryption) {
          // SECURITY: Session requires encryption - fail if session key not available
          if (!this.sessionKey) {
            throw new SDKError(
              'Session configured for encryption but session key not available. Encrypted init may have failed.',
              'ENCRYPTION_KEY_MISSING'
            );
          }

          console.log('[SessionManager] 📝 NON-STREAMING MODE - Encryption enabled');
          console.log('[SessionManager] Session key available:', !!this.sessionKey);

          // Send encrypted message
          await this.sendEncryptedMessage(prompt);

          // Wait for encrypted response (non-streaming) - MUST accumulate chunks!
          let accumulatedResponse = '';  // Accumulate chunks even in non-streaming mode
          response = await new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => {
              console.log('[SessionManager] ⏰ NON-STREAMING TIMEOUT - accumulated response:', `"${accumulatedResponse}"`);
              reject(new SDKError('Encrypted response timeout', 'RESPONSE_TIMEOUT'));
            }, 30000);

            console.log('[SessionManager] 📋 Registering NON-STREAMING handler...');
            const unsubscribe = this.wsClient!.onMessage(async (data: any) => {
              console.log('[SessionManager] 📨 NON-STREAMING handler received message type:', data.type);

              // MUST handle encrypted_chunk messages!
              if (data.type === 'encrypted_chunk' && this.sessionKey) {
                console.log('[SessionManager] 🔓 Decrypting encrypted chunk in NON-STREAMING mode...');
                try {
                  const decrypted = await this.decryptIncomingMessage(data);
                  console.log('[SessionManager] ✅ Chunk decrypted:', `"${decrypted}"`);
                  accumulatedResponse += decrypted;
                  console.log('[SessionManager] Accumulated so far:', `"${accumulatedResponse}"`);
                } catch (err) {
                  console.error('[SessionManager] ❌ Failed to decrypt chunk:', err);
                }
              } else if (data.type === 'encrypted_response' && this.sessionKey) {
                console.log('[SessionManager] ✅ Got encrypted_response in NON-STREAMING mode');
                console.log('[SessionManager] Final accumulated response:', `"${accumulatedResponse}"`);
                clearTimeout(timeout);
                unsubscribe();
                try {
                  // Decrypt final message if present
                  if (data.payload && data.payload.ciphertextHex) {
                    console.log('[SessionManager] 🔓 Decrypting final encrypted response...');
                    const finalMsg = await this.decryptIncomingMessage(data);
                    console.log('[SessionManager] Final message:', finalMsg);
                  }
                  // Return accumulated chunks, not just the final "stop" message
                  console.log('[SessionManager] RESOLVING with accumulated response:', `"${accumulatedResponse}"`);
                  resolve(accumulatedResponse);
                } catch (err) {
                  console.error('[SessionManager] ❌ Error in encrypted_response handler:', err);
                  reject(err);
                }
              } else if (data.type === 'error') {
                console.error('[SessionManager] ❌ Error received:', data.message);
                clearTimeout(timeout);
                unsubscribe();
                reject(new SDKError(data.message || 'Request failed', 'REQUEST_ERROR'));
              } else if (data.type === 'proof_submitted' || data.type === 'checkpoint_submitted') {
                console.log(`[SessionManager] 📜 PROOF SUBMITTED:`, data);
              } else if (data.type === 'session_completed') {
                console.log(`[SessionManager] ✅ SESSION COMPLETED:`, data);
              } else {
                console.log('[SessionManager] ⚠️ Unhandled message type in NON-STREAMING mode:', data.type);
              }
            });
            console.log('[SessionManager] 📋 NON-STREAMING handler registered');
          });
        } else {
          // Send plaintext message (only if session explicitly opted out of encryption)
          response = await this.wsClient.sendMessage({
            type: 'prompt',
            chain_id: session.chainId,
            jobId: session.jobId.toString(),  // Include jobId for settlement tracking
            prompt: augmentedPrompt,  // Use RAG-augmented prompt
            request: {
              model: session.model,
              prompt: augmentedPrompt,  // Use RAG-augmented prompt
              max_tokens: 50,
              temperature: 0.7,
              stream: false
            }
          });
        }

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

        // Store in conversation memory if enabled
        const conversationMemory = this.conversationMemories?.get(sessionIdStr);
        if (conversationMemory) {
          try {
            await conversationMemory.addMessage('user', prompt);
            await conversationMemory.addMessage('assistant', response);
          } catch (memError: any) {
            console.warn(`Failed to store messages in conversation memory: ${memError.message}`);
          }
        }

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
   * Send encrypted session initialization (Phase 4.1)
   * @private
   */
  private async sendEncryptedInit(
    ws: WebSocketClient,
    config: ExtendedSessionConfig,
    sessionId: bigint,
    jobId: bigint
  ): Promise<void> {
    console.log('[SessionManager] 🔐 === ENTERING sendEncryptedInit ===');
    console.log('[SessionManager] sessionId:', sessionId.toString());
    console.log('[SessionManager] jobId:', jobId.toString());
    console.log('[SessionManager] config.host:', config.host);

    if (!this.encryptionManager) {
      console.error('[SessionManager] ❌ EncryptionManager NOT available!');
      throw new SDKError(
        'EncryptionManager not available for encrypted session',
        'ENCRYPTION_NOT_AVAILABLE'
      );
    }
    console.log('[SessionManager] ✅ EncryptionManager available');

    if (!this.hostManager) {
      console.error('[SessionManager] ❌ HostManager NOT available!');
      throw new SDKError(
        'HostManager required for host public key retrieval',
        'HOST_MANAGER_NOT_AVAILABLE'
      );
    }
    console.log('[SessionManager] ✅ HostManager available');

    // 1. Generate random session key (32 bytes)
    console.log('[SessionManager] 🔑 STEP 1: Generating session key...');
    console.log('[SessionManager] this.sessionKey BEFORE generation:', !!this.sessionKey);
    this.sessionKey = crypto.getRandomValues(new Uint8Array(32));
    console.log('[SessionManager] ✅ Session key GENERATED');
    console.log('[SessionManager] this.sessionKey AFTER generation:', !!this.sessionKey);
    console.log('[SessionManager] this.sessionKey length:', this.sessionKey?.length);
    console.log('[SessionManager] this.sessionKey type:', typeof this.sessionKey);
    console.log('[SessionManager] this.sessionKey is Uint8Array:', this.sessionKey instanceof Uint8Array);

    const sessionKeyHex = bytesToHex(this.sessionKey);
    console.log('[SessionManager] sessionKeyHex length:', sessionKeyHex.length, '(should be 64 hex chars for 32 bytes)');
    console.log('[SessionManager] sessionKeyHex (first 16 chars):', sessionKeyHex.substring(0, 16));

    this.messageIndex = 0;
    console.log('[SessionManager] messageIndex reset to:', this.messageIndex);

    // 2. Get host public key (uses cache, metadata, or signature recovery)
    console.log('[SessionManager] 🔑 STEP 2: Retrieving host public key...');
    console.log('[SessionManager] config.host:', config.host);
    console.log('[SessionManager] config.endpoint:', config.endpoint);
    const hostPubKey = await this.hostManager.getHostPublicKey(
      config.host,
      config.endpoint  // API URL for fallback
    );
    console.log('[SessionManager] ✅ Host public key retrieved:', hostPubKey.substring(0, 20) + '...');

    // 3. Prepare session init payload (per docs lines 469-477)
    console.log('[SessionManager] 📦 STEP 3: Preparing init payload...');
    const initPayload = {
      sessionKey: sessionKeyHex,
      jobId: jobId.toString(),  // MUST be string per docs
      modelName: config.modelId,
      pricePerToken: config.pricePerToken || 0  // MUST be number in wei/smallest units
    };
    console.log('[SessionManager] initPayload:', JSON.stringify(initPayload, null, 2));

    // 4. Encrypt with EncryptionManager
    console.log('[SessionManager] 🔐 STEP 4: Encrypting init payload...');
    const encrypted = await this.encryptionManager.encryptSessionInit(
      hostPubKey,
      initPayload
    );
    console.log('[SessionManager] ✅ Init payload encrypted');
    console.log('[SessionManager] encrypted.type:', encrypted.type);

    // 5. Send encrypted init message
    console.log('[SessionManager] 📤 STEP 5: Sending encrypted init message...');
    const messageToSend = {
      ...encrypted,  // { type: 'encrypted_session_init', payload: {...} }
      chain_id: config.chainId,
      session_id: sessionId.toString(),
      job_id: jobId.toString()
    };
    console.log('[SessionManager] Message to send:', JSON.stringify({
      type: messageToSend.type,
      chain_id: messageToSend.chain_id,
      session_id: messageToSend.session_id,
      job_id: messageToSend.job_id,
      payload_keys: Object.keys(messageToSend.payload || {})
    }, null, 2));

    await ws.sendMessage(messageToSend);
    console.log('[SessionManager] ✅ Encrypted init message sent');

    console.log('[SessionManager] 🔐 === EXITING sendEncryptedInit ===');
    console.log('[SessionManager] FINAL CHECK - this.sessionKey exists:', !!this.sessionKey);
    console.log('[SessionManager] FINAL CHECK - this.sessionKey length:', this.sessionKey?.length);
  }

  /**
   * Send plaintext session initialization (backward compatible)
   * @private
   */
  private async sendPlaintextInit(
    ws: WebSocketClient,
    config: ExtendedSessionConfig,
    sessionId: bigint,
    jobId: bigint,
    userAddress: string
  ): Promise<void> {
    // Existing plaintext logic (lines 467-473 from sendPromptStreaming)
    await ws.sendMessage({
      type: 'session_init',
      chain_id: config.chainId,
      session_id: sessionId.toString(),
      jobId: jobId.toString(),
      user_address: userAddress
    });

    console.log('[SessionManager] Plaintext session init sent');
  }

  /**
   * Send encrypted message with session key (Phase 4.2)
   * @private
   */
  private async sendEncryptedMessage(message: string): Promise<void> {
    console.log('[SessionManager] 📤 === ENTERING sendEncryptedMessage ===');
    console.log('[SessionManager] Message to encrypt:', message.substring(0, 50) + (message.length > 50 ? '...' : ''));
    console.log('[SessionManager] Message length:', message.length);

    console.log('[SessionManager] 🔑 Session key status at sendEncryptedMessage:');
    console.log('[SessionManager]   - this.sessionKey exists:', !!this.sessionKey);
    console.log('[SessionManager]   - this.sessionKey === undefined:', this.sessionKey === undefined);
    console.log('[SessionManager]   - this.sessionKey === null:', this.sessionKey === null);
    console.log('[SessionManager]   - this.sessionKey length:', this.sessionKey?.length);
    console.log('[SessionManager]   - this.sessionKey type:', typeof this.sessionKey);

    if (!this.sessionKey) {
      console.error('[SessionManager] ❌ Session key NOT available!');
      throw new SDKError(
        'Session key not available for encrypted messaging',
        'SESSION_KEY_NOT_AVAILABLE'
      );
    }
    console.log('[SessionManager] ✅ Session key IS available');

    if (!this.encryptionManager) {
      console.error('[SessionManager] ❌ EncryptionManager NOT available!');
      throw new SDKError(
        'EncryptionManager not available for encrypted messaging',
        'ENCRYPTION_NOT_AVAILABLE'
      );
    }
    console.log('[SessionManager] ✅ EncryptionManager IS available');

    if (!this.wsClient) {
      console.error('[SessionManager] ❌ WebSocket client NOT available!');
      throw new SDKError(
        'WebSocket client not available',
        'WEBSOCKET_NOT_AVAILABLE'
      );
    }
    console.log('[SessionManager] ✅ WebSocket client IS available');

    // Get current session for session_id
    console.log('[SessionManager] 🔍 Finding active session...');
    const sessions = Array.from(this.sessions.values());
    console.log('[SessionManager] Total sessions in memory:', sessions.length);
    const currentSession = sessions.find(s => s.status === 'active');
    if (!currentSession) {
      console.error('[SessionManager] ❌ No active session found!');
      console.error('[SessionManager] Available sessions:', sessions.map(s => ({ id: s.sessionId.toString(), status: s.status })));
      throw new SDKError(
        'No active session found for encrypted messaging',
        'NO_ACTIVE_SESSION'
      );
    }
    console.log('[SessionManager] ✅ Active session found:', currentSession.sessionId.toString());
    console.log('[SessionManager] Session details:', {
      sessionId: currentSession.sessionId.toString(),
      jobId: currentSession.jobId.toString(),
      status: currentSession.status,
      encryption: currentSession.encryption
    });

    try {
      // Encrypt message with session key (returns payload only)
      console.log('[SessionManager] 🔐 Encrypting message...');
      console.log('[SessionManager] Current messageIndex:', this.messageIndex);
      const payload = this.encryptionManager.encryptMessage(
        this.sessionKey,
        message,
        this.messageIndex++
      );
      console.log('[SessionManager] ✅ Message encrypted successfully');
      console.log('[SessionManager] Payload keys:', Object.keys(payload));
      console.log('[SessionManager] New messageIndex:', this.messageIndex);

      // Wrap payload with message structure (per docs lines 498-508)
      // Use sendWithoutResponse to avoid conflicting handlers (v1.3.28 fix)
      const messageToSend = {
        type: 'encrypted_message',
        session_id: currentSession.sessionId.toString(),
        id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
        payload: payload
      };
      console.log('[SessionManager] 📨 Message structure prepared:', {
        type: messageToSend.type,
        session_id: messageToSend.session_id,
        id: messageToSend.id,
        payload_keys: Object.keys(messageToSend.payload)
      });

      console.log('[SessionManager] 📤 Sending encrypted message via WebSocket...');
      await this.wsClient.sendWithoutResponse(messageToSend);
      console.log('[SessionManager] ✅ Encrypted message sent successfully');

      console.log(`[SessionManager] 📤 === EXITING sendEncryptedMessage (index: ${this.messageIndex - 1}) ===`);
    } catch (error: any) {
      console.error('[SessionManager] ❌ Failed to encrypt/send message:', error);
      console.error('[SessionManager] Error stack:', error.stack);
      // Wrap encryption errors in SDKError for consistent error handling
      throw new SDKError(
        `Failed to encrypt message: ${error.message}`,
        'ENCRYPTION_FAILED',
        { originalError: error }
      );
    }
  }

  /**
   * Send plaintext message (backward compatible)
   * @private
   */
  private async sendPlaintextMessage(message: string): Promise<void> {
    if (!this.wsClient) {
      throw new SDKError(
        'WebSocket client not available',
        'WEBSOCKET_NOT_AVAILABLE'
      );
    }

    // Send plaintext prompt message
    await this.wsClient.sendMessage({
      type: 'prompt',
      prompt: message
    });

    console.log('[SessionManager] Plaintext message sent');
  }

  /**
   * Decrypt incoming encrypted message (Phase 4.2)
   * @private
   */
  private async decryptIncomingMessage(encryptedMessage: any): Promise<string> {
    console.log('[SessionManager] 🔓 === ENTERING decryptIncomingMessage ===');
    console.log('[SessionManager] Message type:', encryptedMessage.type);
    console.log('[SessionManager] Message keys:', Object.keys(encryptedMessage));

    console.log('[SessionManager] 🔑 Session key status at decryptIncomingMessage:');
    console.log('[SessionManager]   - this.sessionKey exists:', !!this.sessionKey);
    console.log('[SessionManager]   - this.sessionKey === undefined:', this.sessionKey === undefined);
    console.log('[SessionManager]   - this.sessionKey === null:', this.sessionKey === null);
    console.log('[SessionManager]   - this.sessionKey length:', this.sessionKey?.length);

    if (!this.sessionKey) {
      console.error('[SessionManager] ❌ Session key NOT available for decryption!');
      throw new SDKError(
        'Session key not available for decryption',
        'SESSION_KEY_NOT_AVAILABLE'
      );
    }
    console.log('[SessionManager] ✅ Session key IS available for decryption');

    if (!this.encryptionManager) {
      console.error('[SessionManager] ❌ EncryptionManager NOT available!');
      throw new SDKError(
        'EncryptionManager not available for decryption',
        'ENCRYPTION_NOT_AVAILABLE'
      );
    }
    console.log('[SessionManager] ✅ EncryptionManager IS available');

    try {
      // Extract payload from message (per docs lines 514-527 for encrypted_chunk)
      // Message structure: { type, session_id, id, payload: { ciphertextHex, nonceHex, aadHex } }
      console.log('[SessionManager] 📦 Extracting payload from message...');
      const payload = encryptedMessage.payload || encryptedMessage;
      console.log('[SessionManager] Payload keys:', Object.keys(payload));
      console.log('[SessionManager] Payload structure:', {
        hasCiphertextHex: !!payload.ciphertextHex,
        hasNonceHex: !!payload.nonceHex,
        hasAadHex: !!payload.aadHex,
        ciphertextLength: payload.ciphertextHex?.length || 0,
        nonceLength: payload.nonceHex?.length || 0,
        aadLength: payload.aadHex?.length || 0
      });

      // Decrypt message with session key
      console.log('[SessionManager] 🔐 Calling EncryptionManager.decryptMessage...');
      const plaintext = this.encryptionManager.decryptMessage(
        this.sessionKey,
        payload
      );
      console.log('[SessionManager] ✅ Decryption successful');
      console.log('[SessionManager] Plaintext length:', plaintext.length);
      console.log('[SessionManager] Plaintext:', `"${plaintext}"`);

      console.log('[SessionManager] 🔓 === EXITING decryptIncomingMessage ===');
      return plaintext;
    } catch (error: any) {
      console.error('[SessionManager] ❌ Decryption FAILED:', error);
      console.error('[SessionManager] Error message:', error.message);
      console.error('[SessionManager] Error stack:', error.stack);
      console.error('[SessionManager] Message that failed to decrypt:', JSON.stringify(encryptedMessage));

      // Wrap decryption errors in SDKError for consistent error handling
      throw new SDKError(
        `Failed to decrypt message: ${error.message}`,
        'DECRYPTION_FAILED',
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
        model: session.model,
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


  /**
   * Upload vectors to host for RAG search (Phase 2, Sub-phase 2.2)
   *
   * Sends document embedding vectors to the host node for storage in session memory.
   * Automatically splits large uploads into 1000-vector batches.
   * Vectors are automatically cleaned up when the WebSocket session ends.
   *
   * @param sessionId - Active session ID
   * @param vectors - Array of Vector objects with id, vector (384d), and metadata
   * @param replace - If true, replace all existing vectors; if false, append
   * @returns Promise with upload statistics (uploaded count, rejected count, errors)
   * @throws SDKError if session invalid, WebSocket not connected, or dimension validation fails
   */
  async uploadVectors(
    sessionId: string,
    vectors: Vector[],
    replace: boolean = false
  ): Promise<UploadVectorsResult> {
    // 1. Validate session exists and is active
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SDKError(
        `Session ${sessionId} not found`,
        'SESSION_NOT_FOUND'
      );
    }

    if (session.status !== 'active') {
      throw new SDKError(
        `Session ${sessionId} is not active (status: ${session.status})`,
        'SESSION_NOT_ACTIVE'
      );
    }

    // 2. Ensure WebSocket is connected (initialize if needed)
    if (!this.wsClient || !this.wsClient.isConnected()) {
      console.log('[SessionManager] 🔌 Initializing WebSocket for vector upload...');

      // Get WebSocket URL from endpoint
      const endpoint = session.endpoint || 'http://localhost:8080';
      const wsUrl = endpoint.includes('ws://') || endpoint.includes('wss://')
        ? endpoint
        : endpoint.replace('http://', 'ws://').replace('https://', 'wss://') + '/v1/ws';

      console.log('[SessionManager] Connecting to:', wsUrl);
      this.wsClient = new WebSocketClient(wsUrl, { chainId: session.chainId });
      await this.wsClient.connect();
      console.log('[SessionManager] ✅ WebSocket connected');

      // Set up global RAG message handlers
      this._setupRAGMessageHandlers();

      // Send session init (encryption support)
      if (session.encryption && this.encryptionManager) {
        console.log('[SessionManager] 🔐 Sending encrypted session init...');
        const config: ExtendedSessionConfig = {
          chainId: session.chainId,
          host: session.provider,
          modelId: session.model,
          endpoint: session.endpoint,
          paymentMethod: 'deposit',
          encryption: true
        };
        await this.sendEncryptedInit(this.wsClient, config, session.sessionId, session.jobId);
      } else {
        console.log('[SessionManager] 📤 Sending plaintext session init...');
        const signer = (this.paymentManager as any).signer;
        if (!signer) {
          throw new Error('PaymentManager signer not available');
        }
        const userAddress = await signer.getAddress();
        if (!userAddress) {
          throw new Error('Failed to get user address from signer');
        }

        const config: ExtendedSessionConfig = {
          chainId: session.chainId,
          host: session.provider,
          modelId: session.model,
          endpoint: session.endpoint,
          paymentMethod: 'deposit',
          encryption: false
        };
        await this.sendPlaintextInit(this.wsClient, config, session.sessionId, session.jobId, userAddress);
      }

      console.log('[SessionManager] ✅ Session initialized, ready for vector upload');
    }

    // 3. Handle empty vectors array
    if (vectors.length === 0) {
      return {
        uploaded: 0,
        rejected: 0,
        errors: []
      };
    }

    // 4. Validate vector dimensions (384 for all-MiniLM-L6-v2)
    const EXPECTED_DIMENSION = 384;
    for (const vector of vectors) {
      if (vector.vector.length !== EXPECTED_DIMENSION) {
        throw new SDKError(
          `Vector ${vector.id}: Invalid dimensions: expected ${EXPECTED_DIMENSION}, got ${vector.vector.length}`,
          'INVALID_VECTOR_DIMENSION'
        );
      }
    }

    // 5. Split into batches (max 1000 vectors per batch)
    const BATCH_SIZE = 1000;
    const batches: Vector[][] = [];
    for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
      batches.push(vectors.slice(i, i + BATCH_SIZE));
    }

    // 6. Upload each batch and accumulate results
    let totalUploaded = 0;
    let totalRejected = 0;
    const allErrors: string[] = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const isFirstBatch = batchIndex === 0;

      // First batch uses caller's replace value, subsequent batches always append
      const batchReplace = isFirstBatch ? replace : false;

      // Generate unique request ID
      const requestId = crypto.randomUUID();

      // Create upload message
      const message: UploadVectorsMessage = {
        type: 'uploadVectors',
        session_id: sessionId, // Required for SessionStore (v8.3.4+)
        requestId,
        vectors: batch,
        replace: batchReplace
      };

      try {
        // Send message and wait for response (with 30s timeout)
        const response = await this._sendRAGRequest(requestId, message, 30000);

        // Accumulate results
        totalUploaded += response.uploaded || 0;
        totalRejected += response.rejected || 0;
        if (response.errors && response.errors.length > 0) {
          allErrors.push(...response.errors);
        }
      } catch (error: any) {
        // If batch fails, add error and continue (best effort)
        allErrors.push(`Batch ${batchIndex + 1} failed: ${error.message}`);
        totalRejected += batch.length;
      }
    }

    return {
      uploaded: totalUploaded,
      rejected: totalRejected,
      errors: allErrors
    };
  }

  /**
   * Search for similar vectors in session memory (host-side RAG)
   *
   * Performs cosine similarity search against vectors stored in the host's session memory.
   * Returns top-K most similar vectors sorted by descending similarity score.
   *
   * @param sessionId - Session identifier (string format)
   * @param queryVector - Query embedding vector (384 dimensions for all-MiniLM-L6-v2)
   * @param k - Number of top results to return (1-20, default: 5)
   * @param threshold - Minimum similarity score (0.0-1.0, default: 0.7)
   * @returns Promise<SearchResult[]> - Array of search results sorted by score (descending)
   * @throws {SDKError} If session not found, not active, or WebSocket not connected
   * @throws {SDKError} If query vector has invalid dimensions or parameters out of range
   * @throws {SDKError} If search times out after 10 seconds
   */
  async searchVectors(
    sessionId: string,
    queryVector: number[],
    k: number = 5,
    threshold: number = 0.2
  ): Promise<SearchResult[]> {
    // Validate session exists and is active
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SDKError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND');
    }
    if (session.status !== 'active') {
      throw new SDKError(
        `Session ${sessionId} is not active (status: ${session.status})`,
        'SESSION_NOT_ACTIVE'
      );
    }

    // Validate WebSocket connection
    if (!this.wsClient) {
      throw new SDKError(
        'WebSocket not connected - call startSession() first',
        'WEBSOCKET_NOT_CONNECTED'
      );
    }

    // Validate query vector dimensions (384 for all-MiniLM-L6-v2)
    if (queryVector.length !== 384) {
      throw new SDKError(
        `Invalid query vector dimensions: expected 384, got ${queryVector.length}`,
        'INVALID_VECTOR_DIMENSIONS'
      );
    }

    // Validate k parameter (1-20)
    if (k < 1 || k > 20) {
      throw new SDKError(
        `Parameter k must be between 1 and 20, got ${k}`,
        'INVALID_PARAMETER'
      );
    }

    // Validate threshold parameter (0.0-1.0)
    if (threshold < 0.0 || threshold > 1.0) {
      throw new SDKError(
        `Parameter threshold must be between 0.0 and 1.0, got ${threshold}`,
        'INVALID_PARAMETER'
      );
    }

    // Generate request ID
    const requestId = `search_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Build searchVectors message (camelCase JSON format)
    const message: SearchVectorsMessage = {
      type: 'searchVectors',
      session_id: sessionId, // Required for SessionStore (v8.3.4+)
      requestId,
      queryVector,
      k,
      threshold
    };

    // Send request and wait for response (10-second timeout)
    const response = await this._sendRAGRequest(requestId, message, 10000);

    // Handle error response
    if (response.error) {
      throw new SDKError(
        `Search failed: ${response.error}`,
        'SEARCH_ERROR'
      );
    }

    // Return results (already sorted by score descending from host)
    return response.results || [];
  }

  /**
   * Convenience helper: Generate embedding + search + inject context
   * Returns enhanced prompt with RAG context or original question on error
   *
   * @param sessionId - Session identifier
   * @param question - User's question to enhance with context
   * @param topK - Number of results to retrieve (default: 5)
   * @returns Enhanced prompt with context or original question
   */
  async askWithContext(
    sessionId: string,
    question: string,
    topK: number = 5
  ): Promise<string> {
    try {
      // Get session to retrieve host endpoint and chainId
      const session = this.sessions.get(sessionId);
      if (!session || session.status !== 'active') {
        return question; // Graceful degradation
      }

      // Create HostAdapter to generate embedding
      const { HostAdapter } = await import('../embeddings/adapters/HostAdapter');
      const hostAdapter = new HostAdapter({
        hostUrl: session.endpoint || 'http://localhost:8080',
        chainId: session.chainId || 84532,
        model: 'all-MiniLM-L6-v2'
      });

      // Generate embedding for question
      const embeddingResult = await hostAdapter.embedText(question, 'query');
      const queryVector = embeddingResult.embedding;

      // Search for similar vectors (threshold=0.7)
      const results = await this.searchVectors(sessionId, queryVector, topK, 0.7);

      // Inject context into prompt
      return this.injectRAGContext(question, results);
    } catch (error) {
      // Graceful degradation: return original question on any error
      console.warn('askWithContext failed, returning original question:', error);
      return question;
    }
  }

  /**
   * Format search results into RAG context and inject into prompt
   * Returns original question if no valid results
   *
   * @private
   * @param question - User's question
   * @param results - Search results from vector store
   * @returns Enhanced prompt with context or original question
   */
  private injectRAGContext(question: string, results: SearchResult[]): string {
    // If no results or results lack text metadata, return original question
    if (!results || results.length === 0) {
      return question;
    }

    // Extract text from metadata (graceful handling of missing text field)
    const contextChunks: string[] = [];
    for (const result of results) {
      if (result.metadata && typeof result.metadata.text === 'string') {
        contextChunks.push(result.metadata.text);
      }
    }

    // If no valid text chunks found, return original question
    if (contextChunks.length === 0) {
      return question;
    }

    // Format: Context:\n{chunk1}\n\n{chunk2}\n\n...\n\nQuestion: {question}
    const context = contextChunks.join('\n\n');
    return `Context:\n${context}\n\nQuestion: ${question}`;
  }

  /**
   * Send RAG request and wait for response with timeout
   * @private
   */
  private async _sendRAGRequest(
    requestId: string,
    message: any,
    timeoutMs: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new SDKError(
          `Request ${requestId} timed out after ${timeoutMs}ms`,
          'REQUEST_TIMEOUT'
        ));
      }, timeoutMs);

      // Track pending request
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId
      });

      // Send WebSocket message
      this.wsClient!.sendWithoutResponse(message).catch((error) => {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(requestId);
        reject(error);
      });
    });
  }

  /**
   * Handle uploadVectorsResponse from host
   * @private
   */
  private _handleUploadVectorsResponse(response: UploadVectorsResponse): void {
    const pending = this.pendingRequests.get(response.requestId);
    if (!pending) {
      console.warn(`Received uploadVectorsResponse for unknown request: ${response.requestId}`);
      return;
    }

    // Clear timeout
    clearTimeout(pending.timeoutId);
    this.pendingRequests.delete(response.requestId);

    // Resolve with response data
    if (response.status === 'success') {
      pending.resolve({
        uploaded: response.uploaded,
        rejected: 0,
        errors: []
      });
    } else {
      pending.resolve({
        uploaded: response.uploaded || 0,
        rejected: 1,
        errors: response.error ? [response.error] : []
      });
    }
  }

  /**
   * Handle searchVectorsResponse from host
   * @private
   */
  private _handleSearchVectorsResponse(response: SearchVectorsResponse): void {
    const pending = this.pendingRequests.get(response.requestId);
    if (!pending) {
      console.warn(`Received searchVectorsResponse for unknown request: ${response.requestId}`);
      return;
    }

    // Clear timeout
    clearTimeout(pending.timeoutId);
    this.pendingRequests.delete(response.requestId);

    // Resolve with response data (results or error)
    pending.resolve({
      results: response.results || [],
      error: response.error
    });
  }

  /**
   * Set up global message handlers for RAG operations
   * @private
   */
  private _setupRAGMessageHandlers(): void {
    if (!this.wsClient) {
      return;
    }

    // Register handler for RAG-related messages
    this.wsClient.onMessage((data: any) => {
      if (data.type === 'uploadVectorsResponse') {
        this._handleUploadVectorsResponse(data as UploadVectorsResponse);
      } else if (data.type === 'searchVectorsResponse') {
        this._handleSearchVectorsResponse(data as SearchVectorsResponse);
      }
    });
  }

  /**
   * Get session history for a session group
   *
   * NEW: Session Groups integration - Returns all sessions in a group with metadata.
   * Sessions are sorted by startTime descending (newest first).
   *
   * @param groupId - Session group ID
   * @returns Array of session metadata objects sorted by start time (newest first)
   * @throws {SDKError} If session group manager not available or group not found
   */
  async getSessionHistory(groupId: string): Promise<Array<{
    sessionId: string;
    model?: string;
    totalTokens: number;
    chainId: number;
    startTime: number;
    endTime?: number;
    status: string;
  }>> {
    if (!this.sessionGroupManager) {
      throw new SDKError(
        'Session group manager not available',
        'SESSION_GROUP_MANAGER_NOT_AVAILABLE'
      );
    }

    // Get user address
    const userAddress = await this.storageManager.getUserAddress();
    if (!userAddress) {
      throw new SDKError('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    // Get group to verify it exists and user has permission
    const group = await this.sessionGroupManager.getSessionGroup(groupId, userAddress);

    // Build session history from all sessions in group
    const history = [];

    for (const sessionIdStr of group.chatSessions) {
      // Try to get from in-memory sessions first
      let session = this.sessions.get(sessionIdStr);

      // If not in memory, try loading from storage
      if (!session) {
        try {
          const conversation = await this.storageManager.loadConversation(sessionIdStr);
          if (conversation && conversation.metadata) {
            // Reconstruct session metadata from storage
            session = {
              sessionId: BigInt(sessionIdStr),
              jobId: BigInt(conversation.metadata.jobId || '0'),
              chainId: conversation.metadata.chainId,
              model: conversation.metadata.model,
              provider: conversation.metadata.provider || '',
              status: conversation.metadata.status || 'unknown',
              prompts: [],
              responses: [],
              checkpoints: [],
              totalTokens: conversation.metadata.totalTokens || 0,
              startTime: conversation.metadata.startTime || conversation.createdAt,
              endTime: conversation.metadata.endTime,
              encryption: conversation.metadata.encryption,
              groupId: groupId
            } as SessionState;
          }
        } catch (error) {
          // Skip sessions that can't be loaded
          console.warn(`Failed to load session ${sessionIdStr}:`, error);
          continue;
        }
      }

      if (session) {
        history.push({
          sessionId: sessionIdStr,
          model: session.model,
          totalTokens: session.totalTokens,
          chainId: session.chainId,
          startTime: session.startTime,
          endTime: session.endTime,
          status: session.status
        });
      }
    }

    // Sort by startTime descending (newest first)
    history.sort((a, b) => b.startTime - a.startTime);

    return history;
  }
}