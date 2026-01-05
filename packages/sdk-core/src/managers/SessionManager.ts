// Copyright (c) 2025 Fabstir
import { LLM_MAX_TOKENS } from '../config/llm-config';
// SPDX-License-Identifier: BUSL-1.1

/**
 * Browser-compatible Session Manager
 *
 * Manages LLM session lifecycle including creation, checkpoint proofs,
 * and completion. Works with WebSocket for real-time streaming.
 */

import { ethers } from 'ethers';
import { ISessionManager, IHostSelectionService } from '../interfaces';
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
import { HostSelectionMode } from '../types/settings.types';
import { PaymentManager } from './PaymentManager';
import { StorageManager } from './StorageManager';
import { HostManager, PRICE_PRECISION } from './HostManager';
import { EncryptionManager } from './EncryptionManager';
import { WebSocketClient } from '../websocket/WebSocketClient';
import { ChainRegistry } from '../config/ChainRegistry';
import { UnsupportedChainError } from '../errors/ChainErrors';
import { PricingValidationError } from '../errors/pricing-errors';
import { bytesToHex } from '../crypto/utilities';

/**
 * Check if a string is a bytes32 hash (0x + 64 hex chars)
 */
function isBytes32Hash(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

/**
 * Convert model string (repo:file format) to bytes32 hash
 * If already a bytes32 hash, returns as-is
 * Format: "repo:file" -> keccak256("repo/file")
 */
function convertModelToBytes32(modelString: string): string {
  // Already a hash
  if (isBytes32Hash(modelString)) {
    return modelString;
  }

  // Parse "repo:file" format (colon-separated)
  const colonIndex = modelString.indexOf(':');
  if (colonIndex === -1) {
    throw new Error(
      `Invalid model format: "${modelString}". ` +
      `Expected either bytes32 hash (0x...) or "repo:filename" format.`
    );
  }

  const repo = modelString.substring(0, colonIndex);
  const filename = modelString.substring(colonIndex + 1);

  if (!repo || !filename) {
    throw new Error(
      `Invalid model format: "${modelString}". ` +
      `Both repo and filename are required in "repo:filename" format.`
    );
  }

  // Hash is calculated as keccak256("repo/filename") - note slash, not colon
  const input = `${repo}/${filename}`;
  return ethers.keccak256(ethers.toUtf8Bytes(input));
}

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
  vectorDatabase?: {
    // NEW: S5 vector database for RAG (Sub-phase 5.1.3)
    manifestPath: string; // S5 path to manifest.json (e.g., "home/vector-databases/{user}/{db}/manifest.json")
    userAddress: string; // Owner address for verification
  };
}

export class SessionManager implements ISessionManager {
  private paymentManager: PaymentManager;
  private storageManager: StorageManager;
  private hostManager?: HostManager; // Optional until set after auth
  private encryptionManager?: EncryptionManager; // NEW: Optional until set after auth
  private sessionGroupManager?: any; // NEW: Session Groups integration (SessionGroupManager)
  private hostSelectionService?: IHostSelectionService; // NEW: Host selection (Phase 5.1)
  private wsClient?: WebSocketClient;
  private sessions: Map<string, SessionState> = new Map();
  private initialized = false;
  private sessionKey?: Uint8Array; // NEW: Store session key for Phase 4.2
  private messageIndex: number = 0; // NEW: For Phase 4.2 replay protection
  private pendingRequests: Map<string, { resolve: (value: any) => void; reject: (error: any) => void; timeoutId: NodeJS.Timeout }> = new Map(); // Host-side RAG request tracking
  private ragHandlerUnsubscribe?: () => void; // NEW: Store RAG handler unsubscribe function to prevent duplicate handlers

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
   * Set HostSelectionService for automatic host selection (Phase 5.1)
   */
  setHostSelectionService(hostSelectionService: IHostSelectionService): void {
    this.hostSelectionService = hostSelectionService;
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
    let provider = config.host || config.provider;
    const endpoint = config.endpoint;

    // NEW (Phase 5.1): Automatic host selection when no host is provided
    if (!provider && this.hostSelectionService) {
      // Get user's preferred host selection mode
      const mode = await this.storageManager.getHostSelectionMode();
      const settings = await this.storageManager.getUserSettings();
      const preferredHostAddress = settings?.preferredHostAddress ?? undefined;

      // Convert model to bytes32 for host lookup
      const modelIdForSelection = convertModelToBytes32(model);

      // Select host using user's preferences
      const selectedHost = await this.hostSelectionService.selectHostForModel(
        modelIdForSelection,
        mode,
        preferredHostAddress
      );

      if (!selectedHost) {
        throw new SDKError('No hosts available for the selected model', 'NO_HOSTS_AVAILABLE');
      }

      provider = selectedHost.address;

      // Store selected host for next time
      await this.storageManager.updateUserSettings({
        lastHostAddress: selectedHost.address,
      });

      console.log(`[SessionManager] Auto-selected host: ${selectedHost.address} (mode: ${mode})`);
    }

    // NEW (Phase 6.2): Enable encryption by default (opt-out with encryption: false)
    const enableEncryption = config.encryption !== false;

    try {
      // NEW: Price validation against host minimum
      let validatedPrice = config.pricePerToken;
      let modelIdBytes32: string | undefined;

      if (this.hostManager && provider && model) {
        try {
          // Determine if this is native token (ETH/BNB) or stablecoin payment
          const isNativePayment = !config.paymentToken ||
                                  config.paymentToken === '0x0000000000000000000000000000000000000000' ||
                                  config.paymentToken === ethers.ZeroAddress;

          const pricingType = isNativePayment ? 'native (ETH/BNB)' : 'stablecoin';

          // For stablecoin payments, paymentToken MUST be provided - no fallbacks
          if (!isNativePayment && !config.paymentToken) {
            throw new Error('paymentToken address required for stablecoin payments');
          }

          const tokenAddress = isNativePayment ? ethers.ZeroAddress : config.paymentToken!;

          // Convert model string to bytes32 hash if needed (Bug 3 fix)
          // Model can be "repo:file" format or already a bytes32 hash
          modelIdBytes32 = convertModelToBytes32(model);
          console.log(`[SessionManager] Model "${model}" -> bytes32: ${modelIdBytes32}`);

          // Fetch per-model pricing - contract returns effective price (custom if set, otherwise host default)
          const modelPrice = await this.hostManager.getModelPricing(provider, modelIdBytes32, tokenAddress);
          const hostModelPrice = Number(modelPrice);

          // Use the model price directly - model-specific contract functions validate correctly
          validatedPrice = hostModelPrice;
          console.log(`[SessionManager] Using model price for ${model} (${pricingType}): ${validatedPrice}`);

        } catch (error) {
          // All pricing errors should fail the session - no silent fallbacks
          if (error instanceof PricingValidationError) {
            throw error;
          }
          // Wrap other errors (host lookup failures, etc.) in a clear error message
          throw new Error(
            `Failed to fetch model pricing for ${model} from host ${provider}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Bug 4 fix: Validate that we have a valid price
      if (validatedPrice === undefined || validatedPrice === null || validatedPrice <= 0) {
        throw new Error(
          `Invalid price for session: ${validatedPrice}. ` +
          `Price must be a positive number. Ensure host has pricing configured for this model.`
        );
      }

      // Create session job with payment
      // PaymentManagerMultiChain expects a SessionJobParams object with 'amount' field
      const sessionJobParams = {
        host: provider,
        model: model,
        amount: config.depositAmount,  // PaymentManagerMultiChain expects 'amount', not 'depositAmount'
        pricePerToken: validatedPrice, // Use model price from contract
        proofInterval: config.proofInterval,
        duration: config.duration,
        chainId: config.chainId,
        paymentToken: config.paymentToken,
        useDeposit: config.useDeposit,
        modelId: modelIdBytes32  // Pass model ID for model-specific contract function
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
      const endpoint = session.endpoint || 'http://localhost:8080';
      const httpUrl = endpoint.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '');

      // Call REST API for inference with augmented prompt
      const inferenceUrl = `${httpUrl}/v1/inference`;
      const requestBody = {
        model: session.model,
        prompt: augmentedPrompt,  // Use RAG-augmented prompt
        max_tokens: LLM_MAX_TOKENS,  // Allow longer responses for poems, stories, etc.
        temperature: 0.7,  // Add temperature for better responses
        sessionId: sessionId.toString(),
        jobId: session.jobId.toString()
      };
      
      
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

      if (!this.wsClient || !this.wsClient.isConnected()) {
        this.wsClient = new WebSocketClient(wsUrl, { chainId: session.chainId });
        await this.wsClient.connect();

        // Set up global RAG message handlers
        this._setupRAGMessageHandlers();

        // NEW (Phase 6.2): Use encryption by default
        if (session.encryption && this.encryptionManager) {

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

          if (this.sessionKey) {
          }
        } else {
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
          if (this.sessionKey) {
          }

          response = await new Promise<string>((resolve, reject) => {
            // Use sliding timeout window - resets on each chunk received
            let timeout = setTimeout(() => {
              reject(new SDKError('Encrypted response timeout', 'RESPONSE_TIMEOUT'));
            }, 60000); // 60 seconds for complex queries (sliding window)

            // Guard against double resolution (mobile browser race condition fix)
            let isResolved = false;
            const safeResolve = (value: string) => {
              if (!isResolved) {
                isResolved = true;
                clearTimeout(timeout);
                unsubscribe();
                resolve(value);
              }
            };
            const safeReject = (err: Error) => {
              if (!isResolved) {
                isResolved = true;
                clearTimeout(timeout);
                unsubscribe();
                reject(err);
              }
            };

            let chunkCount = 0;
            const unsubscribe = this.wsClient!.onMessage(async (data: any) => {
              // Log EVERY message with full details
              console.log('[SessionManager] 📨 RAW MESSAGE:', JSON.stringify({
                type: data.type,
                final: data.final,
                finalType: typeof data.final,
                hasPayload: !!data.payload,
                keys: Object.keys(data)
              }));

              // Skip processing if already resolved
              if (isResolved) {
                console.log('[SessionManager] ⏭️ Skipping - already resolved');
                return;
              }

              if (data.type === 'encrypted_chunk' && this.sessionKey) {
                chunkCount++;
                console.log('[SessionManager] 📦 Chunk #' + chunkCount + ', final=' + data.final + ' (type: ' + typeof data.final + ')');

                // Reset timeout on each chunk (sliding window)
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                  console.log('[SessionManager] ⏰ TIMEOUT after ' + chunkCount + ' chunks');
                  safeReject(new SDKError('Encrypted response timeout', 'RESPONSE_TIMEOUT'));
                }, 60000);

                try {
                  const decrypted = await this.decryptIncomingMessage(data);
                  onToken(decrypted);
                  fullResponse += decrypted;
                  console.log('[SessionManager] ✓ Decrypted chunk #' + chunkCount + ', total length: ' + fullResponse.length);
                } catch (err) {
                  console.error('[SessionManager] ❌ Failed to decrypt chunk #' + chunkCount + ':', err);
                }

                // Check for final chunk OUTSIDE try/catch (primary mobile completion signal)
                if (data.final === true) {
                  console.log('[SessionManager] ✅ FINAL CHUNK (===true), resolving with ' + fullResponse.length + ' chars');
                  safeResolve(fullResponse);
                  return;
                } else if (data.final) {
                  console.log('[SessionManager] ⚠️ final is truthy but not ===true:', data.final, typeof data.final);
                  safeResolve(fullResponse);
                  return;
                }
              } else if (data.type === 'encrypted_chunk' && !this.sessionKey) {
                console.error('[SessionManager] ❌ CHUNK WITHOUT SESSION KEY');
              } else if (data.type === 'encrypted_response') {
                console.log('[SessionManager] 📬 encrypted_response received, resolving with ' + fullResponse.length + ' chars');
                try {
                  if (this.sessionKey && data.payload && data.payload.ciphertextHex) {
                    await this.decryptIncomingMessage(data);
                  }
                  safeResolve(fullResponse);
                } catch (err) {
                  console.error('[SessionManager] ❌ Error in encrypted_response:', err);
                  safeResolve(fullResponse);
                }
              } else if (data.type === 'stream_end') {
                console.log('[SessionManager] 🏁 stream_end received, resolving with ' + fullResponse.length + ' chars');
                safeResolve(fullResponse);
              } else if (data.type === 'error') {
                console.error('[SessionManager] ❌ Error:', data.message);
                safeReject(new SDKError(data.message || 'Request failed', 'REQUEST_ERROR'));
              } else if (data.type === 'proof_submitted' || data.type === 'checkpoint_submitted') {
                console.log('[SessionManager] 📝 ' + data.type);
              } else if (data.type === 'session_completed') {
                console.log('[SessionManager] 🎉 session_completed');
              } else {
              }
            });


            // Send encrypted message after handler is set up
            this.sendEncryptedMessage(prompt).catch((err) => {
              console.error('[SessionManager] ❌ Failed to send encrypted message:', err);
              reject(err);
            });
          });

        } else {
          // Plaintext streaming mode
          const unsubscribe = this.wsClient.onMessage(async (data: any) => {

            if (data.type === 'stream_chunk' && data.content) {
              onToken(data.content);
              fullResponse += data.content;
            } else if (data.type === 'response') {
              fullResponse = data.content || fullResponse;
            } else if (data.type === 'proof_submitted' || data.type === 'checkpoint_submitted') {
            } else if (data.type === 'session_completed') {
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
              max_tokens: LLM_MAX_TOKENS,  // Support comprehensive responses from large models
              temperature: 0.7,
              stream: true
            }
          });

          // Clean up handler for plaintext
          unsubscribe();
        }
        
        // Use collected response or fallback to returned response
        const finalResponse = fullResponse || response;

        // Add response to session
        session.responses.push(finalResponse);

        // Update storage (non-blocking to prevent S5 connection issues from freezing UI)
        this.storageManager.appendMessage(
          sessionId.toString(),
          {
            role: 'user',
            content: prompt,
            timestamp: Date.now()
          }
        ).catch(err => console.warn('[SessionManager] Failed to store user message:', err));

        this.storageManager.appendMessage(
          sessionId.toString(),
          {
            role: 'assistant',
            content: finalResponse,
            timestamp: Date.now()
          }
        ).catch(err => console.warn('[SessionManager] Failed to store assistant message:', err));

        // Store in conversation memory if enabled (non-blocking)
        const conversationMemory = this.conversationMemories?.get(sessionIdStr);
        if (conversationMemory) {
          Promise.all([
            conversationMemory.addMessage('user', prompt),
            conversationMemory.addMessage('assistant', finalResponse)
          ]).catch(memError => console.warn('[SessionManager] Failed to store in conversation memory:', memError));
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


          // Send encrypted message
          await this.sendEncryptedMessage(prompt);

          // Wait for encrypted response (non-streaming) - MUST accumulate chunks!
          let accumulatedResponse = '';  // Accumulate chunks even in non-streaming mode
          response = await new Promise<string>((resolve, reject) => {
            // Use sliding timeout window - resets on each chunk received
            let timeout = setTimeout(() => {
              reject(new SDKError('Encrypted response timeout', 'RESPONSE_TIMEOUT'));
            }, 60000); // 60 seconds for complex queries (sliding window)

            // Guard against double resolution (mobile browser race condition fix)
            let isResolved = false;
            const safeResolve = (value: string) => {
              if (!isResolved) {
                isResolved = true;
                clearTimeout(timeout);
                unsubscribe();
                resolve(value);
              }
            };
            const safeReject = (err: Error) => {
              if (!isResolved) {
                isResolved = true;
                clearTimeout(timeout);
                unsubscribe();
                reject(err);
              }
            };

            const unsubscribe = this.wsClient!.onMessage(async (data: any) => {
              // Skip processing if already resolved
              if (isResolved) return;

              // MUST handle encrypted_chunk messages!
              if (data.type === 'encrypted_chunk' && this.sessionKey) {
                // Reset timeout on each chunk (sliding window)
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                  safeReject(new SDKError('Encrypted response timeout', 'RESPONSE_TIMEOUT'));
                }, 60000);

                try {
                  const decrypted = await this.decryptIncomingMessage(data);
                  accumulatedResponse += decrypted;
                } catch (err) {
                  console.error('[SessionManager] ❌ Failed to decrypt chunk:', err);
                }

                // Check for final chunk OUTSIDE try/catch (primary mobile completion signal)
                if (data.final === true) {
                  safeResolve(accumulatedResponse);
                  return;
                }
              } else if (data.type === 'encrypted_response') {
                // Handle encrypted_response (primary completion signal)
                try {
                  // Decrypt final message if we have the key and payload
                  if (this.sessionKey && data.payload && data.payload.ciphertextHex) {
                    await this.decryptIncomingMessage(data);
                  }
                  // Return accumulated chunks, not just the final "stop" message
                  safeResolve(accumulatedResponse);
                } catch (err) {
                  console.error('[SessionManager] ❌ Error in encrypted_response handler:', err);
                  // Still resolve with accumulated content on decryption error
                  safeResolve(accumulatedResponse);
                }
              } else if (data.type === 'stream_end') {
                // Fallback completion signal (mobile browser compatibility)
                console.log('[SessionManager] 📱 stream_end received (fallback completion)');
                safeResolve(accumulatedResponse);
              } else if (data.type === 'error') {
                console.error('[SessionManager] ❌ Error received:', data.message);
                safeReject(new SDKError(data.message || 'Request failed', 'REQUEST_ERROR'));
              } else if (data.type === 'proof_submitted' || data.type === 'checkpoint_submitted') {
              } else if (data.type === 'session_completed') {
              } else {
              }
            });
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
              max_tokens: LLM_MAX_TOKENS,  // Support comprehensive responses from large models
              temperature: 0.7,
              stream: false
            }
          });
        }

        // Add response to session
        session.responses.push(response);

        // Update storage (non-blocking to prevent S5 connection issues from freezing UI)
        this.storageManager.appendMessage(
          sessionId.toString(),
          {
            role: 'user',
            content: prompt,
            timestamp: Date.now()
          }
        ).catch(err => console.warn('[SessionManager] Failed to store user message:', err));

        this.storageManager.appendMessage(
          sessionId.toString(),
          {
            role: 'assistant',
            content: response,
            timestamp: Date.now()
          }
        ).catch(err => console.warn('[SessionManager] Failed to store assistant message:', err));

        // Store in conversation memory if enabled (non-blocking)
        const conversationMemory = this.conversationMemories?.get(sessionIdStr);
        if (conversationMemory) {
          Promise.all([
            conversationMemory.addMessage('user', prompt),
            conversationMemory.addMessage('assistant', response)
          ]).catch(memError => console.warn('[SessionManager] Failed to store in conversation memory:', memError));
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
        }
      } catch (err) {
        console.warn(`Could not load session ${sessionIdStr} from storage:`, err);
      }
    }

    // If still no session, it might already be completed by host
    if (!session) {
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
      // Clean up RAG handler before closing WebSocket
      if (this.ragHandlerUnsubscribe) {
        this.ragHandlerUnsubscribe();
        this.ragHandlerUnsubscribe = undefined;
      }

      // Close WebSocket connection if active
      if (this.wsClient && this.wsClient.isConnected()) {
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

    if (!this.encryptionManager) {
      console.error('[SessionManager] ❌ EncryptionManager NOT available!');
      throw new SDKError(
        'EncryptionManager not available for encrypted session',
        'ENCRYPTION_NOT_AVAILABLE'
      );
    }

    if (!this.hostManager) {
      console.error('[SessionManager] ❌ HostManager NOT available!');
      throw new SDKError(
        'HostManager required for host public key retrieval',
        'HOST_MANAGER_NOT_AVAILABLE'
      );
    }

    // 1. Generate random session key (32 bytes)
    this.sessionKey = crypto.getRandomValues(new Uint8Array(32));

    const sessionKeyHex = bytesToHex(this.sessionKey);

    this.messageIndex = 0;

    // 2. Get host public key (uses cache, metadata, or signature recovery)
    const hostPubKey = await this.hostManager.getHostPublicKey(
      config.host,
      config.endpoint  // API URL for fallback
    );

    // 3. Prepare session init payload (per docs lines 469-477)
    const initPayload: any = {
      sessionKey: sessionKeyHex,
      jobId: jobId.toString(),  // MUST be string per docs
      modelName: config.modelId,
      pricePerToken: config.pricePerToken || 0  // MUST be number in wei/smallest units
    };

    // NEW (Sub-phase 5.1.3): Include vector database info if provided
    if (config.vectorDatabase) {
      initPayload.vectorDatabase = {
        manifestPath: config.vectorDatabase.manifestPath,
        userAddress: config.vectorDatabase.userAddress
      };
    }


    // 4. Encrypt with EncryptionManager
    const encrypted = await this.encryptionManager.encryptSessionInit(
      hostPubKey,
      initPayload
    );

    // 5. Send encrypted init message
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
    const initMessage: any = {
      type: 'session_init',
      chain_id: config.chainId,
      session_id: sessionId.toString(),
      jobId: jobId.toString(),
      user_address: userAddress
    };

    // NEW (Sub-phase 5.1.3): Include vector database info if provided
    if (config.vectorDatabase) {
      initMessage.vector_database = {
        manifest_path: config.vectorDatabase.manifestPath,
        user_address: config.vectorDatabase.userAddress
      };
    }

    await ws.sendMessage(initMessage);

  }

  /**
   * Send encrypted message with session key (Phase 4.2)
   * @private
   */
  private async sendEncryptedMessage(message: string): Promise<void> {


    if (!this.sessionKey) {
      console.error('[SessionManager] ❌ Session key NOT available!');
      throw new SDKError(
        'Session key not available for encrypted messaging',
        'SESSION_KEY_NOT_AVAILABLE'
      );
    }

    if (!this.encryptionManager) {
      console.error('[SessionManager] ❌ EncryptionManager NOT available!');
      throw new SDKError(
        'EncryptionManager not available for encrypted messaging',
        'ENCRYPTION_NOT_AVAILABLE'
      );
    }

    if (!this.wsClient) {
      console.error('[SessionManager] ❌ WebSocket client NOT available!');
      throw new SDKError(
        'WebSocket client not available',
        'WEBSOCKET_NOT_AVAILABLE'
      );
    }

    // Get current session for session_id
    const sessions = Array.from(this.sessions.values());
    const currentSession = sessions.find(s => s.status === 'active');
    if (!currentSession) {
      console.error('[SessionManager] ❌ No active session found!');
      console.error('[SessionManager] Available sessions:', sessions.map(s => ({ id: s.sessionId.toString(), status: s.status })));
      throw new SDKError(
        'No active session found for encrypted messaging',
        'NO_ACTIVE_SESSION'
      );
    }
    console.log('[SessionManager] Session details:', {
      sessionId: currentSession.sessionId.toString(),
      jobId: currentSession.jobId.toString(),
      status: currentSession.status,
      encryption: currentSession.encryption
    });

    try {
      // Encrypt message with session key (returns payload only)
      const payload = this.encryptionManager.encryptMessage(
        this.sessionKey,
        message,
        this.messageIndex++
      );

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

      await this.wsClient.sendWithoutResponse(messageToSend);

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

  }

  /**
   * Decrypt incoming encrypted message (Phase 4.2)
   * @private
   */
  private async decryptIncomingMessage(encryptedMessage: any): Promise<string> {


    if (!this.sessionKey) {
      console.error('[SessionManager] ❌ Session key NOT available for decryption!');
      throw new SDKError(
        'Session key not available for decryption',
        'SESSION_KEY_NOT_AVAILABLE'
      );
    }

    if (!this.encryptionManager) {
      console.error('[SessionManager] ❌ EncryptionManager NOT available!');
      throw new SDKError(
        'EncryptionManager not available for decryption',
        'ENCRYPTION_NOT_AVAILABLE'
      );
    }

    try {
      // Extract payload from message (per docs lines 514-527 for encrypted_chunk)
      // Message structure: { type, session_id, id, payload: { ciphertextHex, nonceHex, aadHex } }
      const payload = encryptedMessage.payload || encryptedMessage;

      // Decrypt message with session key
      const plaintext = this.encryptionManager.decryptMessage(
        this.sessionKey,
        payload
      );

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
        max_tokens: LLM_MAX_TOKENS,  // Allow longer responses for poems, stories, etc.
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
   * Calculate session cost with PRICE_PRECISION
   *
   * Formula: cost = (tokensUsed * pricePerToken) / PRICE_PRECISION
   *
   * With PRICE_PRECISION=1000, prices are stored with 1000x multiplier.
   * Example: $5/million = pricePerToken 5000
   *   1,000,000 tokens at 5000 = (1,000,000 * 5000) / 1000 = 5,000,000 USDC units
   */
  calculateCost(
    tokensUsed: number,
    pricePerToken: number
  ): bigint {
    // Price includes PRICE_PRECISION multiplier, divide to get actual cost
    return (BigInt(tokensUsed) * BigInt(pricePerToken)) / PRICE_PRECISION;
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

      // Get WebSocket URL from endpoint
      const endpoint = session.endpoint || 'http://localhost:8080';
      const wsUrl = endpoint.includes('ws://') || endpoint.includes('wss://')
        ? endpoint
        : endpoint.replace('http://', 'ws://').replace('https://', 'wss://') + '/v1/ws';

      this.wsClient = new WebSocketClient(wsUrl, { chainId: session.chainId });
      await this.wsClient.connect();

      // Set up global RAG message handlers
      this._setupRAGMessageHandlers();

      // Send session init (encryption support)
      if (session.encryption && this.encryptionManager) {
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

    // Clean up existing handler if present to prevent duplicate handlers
    if (this.ragHandlerUnsubscribe) {
      this.ragHandlerUnsubscribe();
      this.ragHandlerUnsubscribe = undefined;
    }

    // Register handler for RAG-related messages and store unsubscribe function
    this.ragHandlerUnsubscribe = this.wsClient.onMessage((data: any) => {
      // ONLY handle RAG-specific message types - don't process other messages
      if (data.type === 'uploadVectorsResponse') {
        this._handleUploadVectorsResponse(data as UploadVectorsResponse);
      } else if (data.type === 'searchVectorsResponse') {
        this._handleSearchVectorsResponse(data as SearchVectorsResponse);
      }
      // Explicitly ignore all other message types (encrypted_chunk, etc.)
      // Those will be handled by dedicated handlers in sendPromptStreaming()
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

  /**
   * Generate embeddings for document chunks
   *
   * Sends text to host's /v1/embed endpoint to generate 384-dimensional embeddings
   * using the all-MiniLM-L6-v2 model. Automatically chunks large documents.
   *
   * @param sessionId - Active session ID (for host endpoint)
   * @param fileContent - Document content to embed
   * @param options - Optional configuration
   * @param options.chunkSize - Characters per chunk (default: 512)
   * @param options.chunkOverlap - Overlap between chunks (default: 50)
   * @param options.chainId - Blockchain chain ID (default: from session)
   * @returns Promise<Vector[]> Array of vectors with embeddings and metadata
   *
   * @throws Error if session not found or not active
   * @throws Error if embedding generation fails
   * @throws Error if timeout (120 seconds)
   */
  async generateEmbeddings(
    sessionId: bigint,
    fileContent: string,
    options?: {
      chunkSize?: number;
      chunkOverlap?: number;
      chainId?: number;
    }
  ): Promise<Vector[]> {
    const session = this.sessions.get(sessionId.toString());
    if (!session) {
      throw new SDKError('Session not found', 'SESSION_NOT_FOUND');
    }

    if (session.status !== 'active') {
      throw new SDKError('Session must be active to generate embeddings', 'SESSION_INACTIVE');
    }

    // Chunk configuration
    const chunkSize = options?.chunkSize || 512;
    const chunkOverlap = options?.chunkOverlap || 50;
    const chainId = options?.chainId || session.chainId;

    // Split file content into chunks with overlap
    const chunks: string[] = [];
    for (let i = 0; i < fileContent.length; i += chunkSize - chunkOverlap) {
      const chunk = fileContent.slice(i, i + chunkSize).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
    }

    if (chunks.length === 0) {
      throw new SDKError('No valid chunks generated from file content', 'INVALID_CONTENT');
    }


    // Get HTTP endpoint from session
    const endpoint = session.endpoint || 'http://localhost:8080';
    const httpUrl = endpoint.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '');
    const embedUrl = `${httpUrl}/v1/embed`;


    // Send request to /v1/embed endpoint
    const requestBody = {
      texts: chunks,
      model: 'all-MiniLM-L6-v2',
      chainId: chainId
    };

    let fetchResponse;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second timeout

      fetchResponse = await fetch(embedUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      if (fetchError.name === 'AbortError') {
        throw new SDKError('Embedding generation timeout (120s)', 'EMBEDDING_TIMEOUT');
      }
      console.error('[SessionManager] ❌ Fetch error:', fetchError);
      throw new SDKError(`Network error calling embedding API: ${fetchError.message}`, 'NETWORK_ERROR');
    }

    if (!fetchResponse.ok) {
      const errorText = await fetchResponse.text();
      throw new SDKError(`Embedding generation failed: ${fetchResponse.status} - ${errorText}`, 'EMBEDDING_FAILED');
    }

    const result = await fetchResponse.json();

    if (!result.embeddings || !Array.isArray(result.embeddings)) {
      throw new SDKError('Invalid response format from embedding endpoint', 'INVALID_RESPONSE');
    }

    // Convert to Vector[] format
    const vectors: Vector[] = result.embeddings.map((item: any, index: number) => ({
      id: `chunk-${Date.now()}-${index}`,
      values: item.embedding,
      metadata: {
        text: item.text,
        tokenCount: item.tokenCount,
        chunkIndex: index,
        totalChunks: chunks.length,
        model: result.model,
        chainId: result.chainId
      }
    }));


    return vectors;
  }
}