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
  SearchResult,
  SearchIntentConfig,
  WebSearchMetadata,
  RecoveredConversation,
  ImageAttachment,
  PromptOptions,
  TokenUsageInfo,
  ContextInfo
} from '../types';
import { validateImageAttachments } from '../utils/image-validation';
import { HostSelectionMode } from '../types/settings.types';
import { PaymentManager } from './PaymentManager';
import { StorageManager } from './StorageManager';
import { HostManager, PRICE_PRECISION } from './HostManager';
import { EncryptionManager } from './EncryptionManager';
import { WebSocketClient } from '../websocket/WebSocketClient';
import { ChainRegistry } from '../config/ChainRegistry';
import { UnsupportedChainError } from '../errors/ChainErrors';
import { PricingValidationError } from '../errors/pricing-errors';
import { WebSearchError } from '../errors/web-search-errors';
import { ContextLimitError } from '../errors/context-errors';
import { bytesToHex } from '../crypto/utilities';
import { analyzePromptForSearchIntent } from '../utils/search-intent-analyzer';
import { resolveSearchQueries } from '../utils/search-query-resolver';
import { analyzePromptForImageIntent } from '../utils/image-intent-analyzer';
import { recoverFromCheckpointsFlow, recoverFromCheckpointsFlowWithHttp } from '../utils/checkpoint-recovery';
import { recoverFromBlockchain, type BlockchainRecoveredConversation, type CheckpointQueryOptions } from '../utils/checkpoint-blockchain';
import JobMarketplaceABI from '../contracts/abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json';
import type { SearchApiResponse, WebSearchStarted, WebSearchResults, WebSearchError as WebSearchErrorMsg } from '../types/web-search.types';
import { RAGSessionConfig, RAGMetrics, validateRAGConfig, mergeRAGConfig } from '../session/rag-config';
import type { ImageGenerationOptions, ImageGenerationResult } from '../types/image-generation.types';
import { ImageGenerationError } from '../errors/image-generation-errors';
import { ImageGenerationRateLimiter } from '../utils/image-generation-rate-limiter';
import { generateImageWs } from '../utils/image-generation-ws';
import { generateImageHttp } from '../utils/image-generation-http';

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
  webSearchMetadata?: WebSearchMetadata; // NEW: Web search metadata from response
  webSearch?: SearchIntentConfig; // NEW: Web search configuration (Phase 5.1)
  lastTokenUsage?: TokenUsageInfo; // NEW: Last prompt's token usage (Phase 5)
  lastPromptTokens?: number;
  contextWindowSize?: number;
  lastFinishReason?: 'stop' | 'length' | 'cancelled' | null;
  ragContext?: { vectorDbId: string }; // Set by uploadVectors() or startSession(ragConfig)
  ragConfig?: RAGSessionConfig; // RAG configuration from startSession
  ragMetrics?: RAGMetrics; // RAG metrics tracking
}

// Extended SessionConfig with chainId
export interface ExtendedSessionConfig extends SessionConfig {
  chainId: number;
  host: string;
  modelId: string;
  paymentMethod: 'deposit' | 'direct';
  depositAmount?: ethers.BigNumberish;
  /** AUDIT-F3: Timeout window in seconds (60-3600, default 300) */
  proofTimeoutWindow?: number;
  encryption?: boolean; // NEW: Enable E2EE
  groupId?: string; // NEW: Session Groups integration
  vectorDatabase?: {
    // NEW: S5 vector database for RAG (Sub-phase 5.1.3)
    manifestPath: string; // S5 path to manifest.json (e.g., "home/vector-databases/{user}/{db}/manifest.json")
    userAddress: string; // Owner address for verification
  };
  webSearch?: SearchIntentConfig; // NEW: Web search configuration (Phase 2.2)
}

export class SessionManager implements ISessionManager {
  private paymentManager: PaymentManager;
  private storageManager: StorageManager;
  private hostManager?: HostManager; // Optional until set after auth
  private encryptionManager?: EncryptionManager; // NEW: Optional until set after auth
  private sessionGroupManager?: any; // NEW: Session Groups integration (SessionGroupManager)
  private hostSelectionService?: IHostSelectionService; // NEW: Host selection (Phase 5.1)
  private endpointTransform?: (url: string) => string; // NEW: Transform discovered host URLs (e.g. Docker localhost rewrite)
  private wsClient?: WebSocketClient;
  private wsSessionId?: string; // Track which session owns the WebSocket
  private sessions: Map<string, SessionState> = new Map();
  private initialized = false;
  private sessionKey?: Uint8Array; // NEW: Store session key for Phase 4.2
  private messageIndex: number = 0; // NEW: For Phase 4.2 replay protection
  private imageGenRateLimiter = new ImageGenerationRateLimiter();
  private pendingRequests: Map<string, { resolve: (value: any) => void; reject: (error: any) => void; timeoutId: NodeJS.Timeout }> = new Map(); // Host-side RAG request tracking
  private ragHandlerUnsubscribe?: () => void; // NEW: Store RAG handler unsubscribe function to prevent duplicate handlers
  // Web Search (Phase 5.2-5.3): Pending search tracking and handler cleanup
  private pendingSearches: Map<string, { resolve: (result: SearchApiResponse) => void; reject: (error: Error) => void; timeoutId: NodeJS.Timeout }> = new Map();
  private searchHandlerUnsubscribe?: () => void;

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
   * Set a transform function for discovered host endpoint URLs.
   * Used to rewrite URLs when running in Docker (e.g. localhost → host.docker.internal).
   */
  setEndpointTransform(transform: (url: string) => string): void {
    this.endpointTransform = transform;
  }

  /**
   * Initialize the session manager
   */
  async initialize(): Promise<void> {
    console.debug('[SessionManager] SDK v1.13.4 initialized');
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
    let endpoint = config.endpoint;

    // NEW (Phase 5.1): Automatic host selection when no host is provided
    if (!provider && this.hostSelectionService) {
      // Get user's preferred host selection mode
      const mode = await this.storageManager.getHostSelectionMode();
      const settings = await this.storageManager.getUserSettings();
      const preferredHostAddress = settings?.preferredHostAddress ?? undefined;

      // Convert model to bytes32 for host lookup
      const modelIdForSelection = convertModelToBytes32(model);
      console.log(`[SessionManager] Auto-discovery: model="${model}" -> bytes32=${modelIdForSelection}, mode=${mode}`);

      // Select host using user's preferences
      const selectedHost = await this.hostSelectionService.selectHostForModel(
        modelIdForSelection,
        mode,
        preferredHostAddress
      );

      if (!selectedHost) {
        throw new SDKError(`No hosts available for model "${model}" (hash: ${modelIdForSelection})`, 'NO_HOSTS_AVAILABLE');
      }

      provider = selectedHost.address;
      // Set endpoint from discovered host's apiUrl
      if (selectedHost.apiUrl && !endpoint) {
        endpoint = selectedHost.apiUrl;
      }

      // Apply endpoint transform (e.g. Docker localhost → host.docker.internal)
      if (endpoint && this.endpointTransform) {
        const original = endpoint;
        endpoint = this.endpointTransform(endpoint);
        if (endpoint !== original) {
          console.log(`[SessionManager] Endpoint transformed: ${original} -> ${endpoint}`);
        }
      }

      // Store selected host for next time
      await this.storageManager.updateUserSettings({
        lastHostAddress: selectedHost.address,
      });

      console.log(`[SessionManager] Auto-selected host: ${selectedHost.address}, apiUrl: ${selectedHost.apiUrl} (mode: ${mode})`);
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
        proofTimeoutWindow: config.proofTimeoutWindow,  // AUDIT-F3
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
        webSearch: config.webSearch,  // NEW (Phase 5.1): Web search configuration
        ragContext: ragConfig?.enabled
          ? { vectorDbId: ragConfig.vectorDbSessionId || `rag-${sessionId}` }
          : undefined,
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
   * Register a session that was created externally (e.g., via delegated session creation).
   * This allows the SDK to track and use sessions created outside the normal startSession flow.
   */
  async registerDelegatedSession(config: {
    sessionId: bigint;
    jobId: bigint;
    hostUrl: string;
    hostAddress: string;
    model: string;
    chainId: number;
    depositAmount: string;
    pricePerToken: number;
    proofInterval: number;
    duration: number;
    ragConfig?: RAGSessionConfig;
  }): Promise<void> {
    const sessionId = config.sessionId;
    const sessionIdStr = sessionId.toString();

    console.log(`[SessionManager] Registering delegated session ${sessionIdStr}`);

    const sessionState: SessionState = {
      sessionId,
      jobId: config.jobId,
      endpoint: config.hostUrl,  // FIXED: Use 'endpoint' not 'hostUrl' to match SessionState interface
      provider: config.hostAddress,
      model: config.model,
      chainId: config.chainId,
      status: 'active',
      prompts: [],
      responses: [],
      checkpoints: [],
      totalTokens: 0,
      startTime: Date.now(),
      encryption: true, // Match normal session behavior - use encryption by default (Phase 6.2)
      ragContext: config.ragConfig?.enabled
        ? { vectorDbId: config.ragConfig.vectorDbSessionId || `rag-${sessionIdStr}` }
        : undefined,
    };

    // Store in memory
    this.sessions.set(sessionIdStr, sessionState);

    // Persist to storage
    await this.storageManager.storeConversation({
      id: sessionIdStr,
      messages: [],
      metadata: {
        chainId: config.chainId,
        model: config.model,
        provider: config.hostAddress,
        endpoint: config.hostUrl,
        jobId: config.jobId.toString(),
        status: 'active',
        totalTokens: 0,
        startTime: sessionState.startTime,
        encryption: sessionState.encryption,
        config: {
          depositAmount: config.depositAmount,
          pricePerToken: config.pricePerToken.toString(),
          proofInterval: config.proofInterval.toString(),
          duration: config.duration.toString()
        }
      },
      createdAt: sessionState.startTime,
      updatedAt: sessionState.startTime
    });

    console.log(`[SessionManager] Delegated session ${sessionIdStr} registered successfully`);
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
    onToken?: (token: string) => void,
    options?: PromptOptions
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

    // Auto-detect image generation intent (like search intent auto-detection)
    const imageIntent = analyzePromptForImageIntent(prompt);
    if (imageIntent.isImageIntent) {
      console.warn(`[SDK:sendPromptStreaming] Image intent detected, routing to generateImage()`);
      try {
        const imgResult = await this.generateImage(
          sessionIdStr,
          imageIntent.cleanPrompt || prompt,
          imageIntent.extractedOptions
        );
        if (options?.onImageGenerated) {
          options.onImageGenerated(imgResult);
        }
        return `Image generated successfully`;
      } catch (imgErr) {
        console.warn(`[SDK:sendPromptStreaming] Image generation failed, falling back to LLM:`, imgErr);
      }
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

      // Force new WebSocket if session changed (old connection belongs to previous session)
      if (this.wsClient && this.wsSessionId && this.wsSessionId !== sessionIdStr) {
        try { await this.wsClient.disconnect(); } catch (_) { /* ignore */ }
        this.wsClient = undefined;
        this.wsSessionId = undefined;
        this.sessionKey = undefined;
        this.messageIndex = 0;
      }

      // Initialize WebSocket client if not already connected
      if (!this.wsClient || !this.wsClient.isConnected()) {
        this.wsClient = new WebSocketClient(wsUrl, { chainId: session.chainId });
        await this.wsClient.connect();
        this.wsSessionId = sessionIdStr;

        // Set up global RAG message handlers
        this._setupRAGMessageHandlers();

        // Set up global web search message handlers (Phase 5.2-5.3)
        this._setupWebSearchMessageHandlers();
      }

      // CRITICAL FIX: Always send session_init before each prompt
      // The node clears sessions from SessionStore after "Encrypted session complete"
      // so we must re-initialize the session for each prompt to ensure RAG operations work
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
            // Initial timeout is longer (180s) for cold start scenarios (model loading into GPU)
            // Once streaming starts, the sliding window uses 60s between chunks
            let timeout = setTimeout(() => {
              reject(new SDKError('Encrypted response timeout', 'RESPONSE_TIMEOUT'));
            }, 180000); // 180 seconds initial timeout for cold start (model loading)

            // Guard against double resolution (mobile browser race condition fix)
            let isResolved = false;
            let safetyTimeout: ReturnType<typeof setTimeout> | undefined;
            const safeResolve = (value: string) => {
              if (!isResolved) {
                isResolved = true;
                clearTimeout(timeout);
                if (safetyTimeout) clearTimeout(safetyTimeout);
                unsubscribe();
                resolve(value);
              }
            };
            const safeReject = (err: Error) => {
              if (!isResolved) {
                isResolved = true;
                clearTimeout(timeout);
                if (safetyTimeout) clearTimeout(safetyTimeout);
                unsubscribe();
                reject(err);
              }
            };

            let encChunkCount = 0;
            // v1.13.4: deferred resolution — wait for stream_end after encrypted_response

            const unsubscribe = this.wsClient!.onMessage(async (data: any) => {
              // Skip processing if already resolved
              if (isResolved) return;


              if (data.type === 'encrypted_chunk' && this.sessionKey) {
                encChunkCount++;
                // Reset timeout on each chunk (sliding window)
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                  safeReject(new SDKError('Encrypted response timeout', 'RESPONSE_TIMEOUT'));
                }, 60000);

                try {
                  const decrypted = await this.decryptIncomingMessage(data);
                  onToken(decrypted);
                  fullResponse += decrypted;
                } catch (err) {
                  console.error('[SessionManager] Failed to decrypt chunk:', err);
                }

                // Check for final chunk — content complete, but defer resolution
                // until stream_end arrives with token data (3s safety for older nodes)
                if (data.final === true || data.final) {
                  safetyTimeout = setTimeout(() => {
                    if (!isResolved) safeResolve(fullResponse);
                  }, 3000);
                  return;
                }
              } else if (data.type === 'encrypted_chunk' && !this.sessionKey) {
                console.error('[SessionManager] Received encrypted chunk without session key');
              } else if (data.type === 'encrypted_response') {
                // encrypted_response carries finish_reason — DO NOT resolve here.
                // stream_end follows with vlm_tokens. Keep waiting.
                try {
                  if (this.sessionKey && data.payload && data.payload.ciphertextHex) {
                    await this.decryptIncomingMessage(data);
                  }
                } catch (err) {
                  console.error('[SessionManager] Error decrypting encrypted_response:', err);
                }
                // Ensure safety timeout is set in case stream_end never arrives
                if (!safetyTimeout) {
                  safetyTimeout = setTimeout(() => {
                    if (!isResolved) safeResolve(fullResponse);
                  }, 3000);
                }
              } else if (data.type === 'stream_end') {
                if (safetyTimeout) clearTimeout(safetyTimeout);
                this._processStreamEnd(data, encChunkCount, session, options);
                safeResolve(fullResponse);
              } else if (data.type === 'error') {
                console.error('[SessionManager] Error:', data.message);
                if (data.code === 'TOKEN_LIMIT_EXCEEDED') {
                  safeReject(new ContextLimitError(
                    data.message || 'Prompt exceeds context window',
                    data.prompt_tokens ?? 0,
                    data.context_window_size ?? 0
                  ));
                } else {
                  safeReject(new SDKError(data.message || 'Request failed', 'REQUEST_ERROR'));
                }
              }
            });

            // Abort signal handling: resolve with partial response on abort
            if (options?.signal) {
              if (options.signal.aborted) { safeResolve(fullResponse); return; }
              options.signal.addEventListener('abort', () => {
                if (this.wsClient) {
                  this.wsClient.sendWithoutResponse({
                    type: 'stream_cancel', session_id: sessionIdStr, reason: 'user_cancelled'
                  }).catch(() => {});
                }
                safeResolve(fullResponse);
              }, { once: true });
            }

            // AUTOMATIC WEB SEARCH INTENT DETECTION for encrypted path (Phase 5.1)
            const searchConfigEncrypted = session.webSearch || {};
            let enableWebSearchEncrypted = false;

            // Disable web search when images are attached — VLM handles images locally
            const hasImagesEncrypted = options?.images && options.images.length > 0;
            if (hasImagesEncrypted) {
              enableWebSearchEncrypted = false;
            } else if (searchConfigEncrypted.forceDisabled) {
              enableWebSearchEncrypted = false;
            } else if (searchConfigEncrypted.forceEnabled) {
              enableWebSearchEncrypted = true;
            } else if (searchConfigEncrypted.autoDetect !== false) {
              // Default: auto-detect search intent from prompt
              enableWebSearchEncrypted = analyzePromptForSearchIntent(prompt);
            }

            // Send encrypted message with web search options, images, and thinking
            this.sendEncryptedMessage(prompt, {
              webSearch: enableWebSearchEncrypted,
              maxSearches: enableWebSearchEncrypted ? (searchConfigEncrypted.maxSearches ?? 5) : 0,
              searchQueries: resolveSearchQueries(enableWebSearchEncrypted, prompt, searchConfigEncrypted.queries, options?.rawQuery)
            }, options?.images, options?.thinking).catch((err) => {
              console.error('[SessionManager] Failed to send encrypted message:', err);
              reject(err);
            });
          });

        } else {
          // Plaintext streaming mode
          let ptChunkCount = 0;

          const unsubscribe = this.wsClient.onMessage(async (data: any) => {

            if (data.type === 'stream_chunk' && data.content) {
              ptChunkCount++;
              onToken(data.content);
              fullResponse += data.content;
            } else if (data.type === 'response') {
              fullResponse = data.content || fullResponse;
            } else if (data.type === 'stream_end') {
              this._processStreamEnd(data, ptChunkCount, session, options);
            } else if (data.type === 'proof_submitted' || data.type === 'checkpoint_submitted') {
            } else if (data.type === 'session_completed') {
            }
          });

          // AUTOMATIC WEB SEARCH INTENT DETECTION (Phase 5.1)
          const searchConfig = session.webSearch || {};
          let enableWebSearch = false;

          // Disable web search when images are attached — VLM handles images locally
          const hasImagesPlaintext = options?.images && options.images.length > 0;
          if (hasImagesPlaintext) {
            enableWebSearch = false;
          } else if (searchConfig.forceDisabled) {
            enableWebSearch = false;
          } else if (searchConfig.forceEnabled) {
            enableWebSearch = true;
          } else if (searchConfig.autoDetect !== false) {
            // Default: auto-detect search intent from prompt
            enableWebSearch = analyzePromptForSearchIntent(prompt);
          }

          // Send plaintext message (only if session explicitly opted out of encryption)
          const plaintextRequest: any = {
            model: session.model,
            prompt: augmentedPrompt,  // Use RAG-augmented prompt
            max_tokens: LLM_MAX_TOKENS,  // Support comprehensive responses from large models
            temperature: 0.7,
            stream: true
          };

          // Include images in plaintext request when present
          if (options?.images && options.images.length > 0) {
            validateImageAttachments(options.images);
            plaintextRequest.images = options.images.map(img => ({ data: img.data, format: img.format }));
          }

          // Include thinking mode when set
          if (options?.thinking) {
            plaintextRequest.thinking = options.thinking;
          }

          const sendMessagePromise = this.wsClient.sendMessage({
            type: 'prompt',
            chain_id: session.chainId,
            jobId: session.jobId.toString(),  // Include jobId for settlement tracking
            prompt: augmentedPrompt,  // Use RAG-augmented prompt
            // Web search fields (v8.7.0+) - AUTOMATICALLY ENABLED based on intent
            web_search: enableWebSearch,
            max_searches: enableWebSearch ? (searchConfig.maxSearches ?? 5) : 0,
            search_queries: resolveSearchQueries(enableWebSearch, prompt, searchConfig.queries, options?.rawQuery),
            request: plaintextRequest
          });

          // Abort signal handling for plaintext path
          if (options?.signal) {
            if (options.signal.aborted) {
              unsubscribe();
              response = fullResponse;
            } else {
              response = await new Promise<string>((res, rej) => {
                const onAbort = () => {
                  if (this.wsClient) {
                    this.wsClient.sendWithoutResponse({
                      type: 'stream_cancel', session_id: sessionIdStr, reason: 'user_cancelled'
                    }).catch(() => {});
                  }
                  unsubscribe();
                  res(fullResponse);
                };
                options.signal!.addEventListener('abort', onAbort, { once: true });
                sendMessagePromise.then(result => {
                  options.signal!.removeEventListener('abort', onAbort);
                  unsubscribe();
                  res(result);
                }).catch(err => {
                  options.signal!.removeEventListener('abort', onAbort);
                  unsubscribe();
                  rej(err);
                });
              });
            }
          } else {
            response = await sendMessagePromise;
            // Clean up handler for plaintext
            unsubscribe();
          }
        }
        
        // Use collected response or fallback to returned response
        const finalResponse = fullResponse || response;

        // Capture web search metadata if present (Phase 5.2)
        const searchMetadata = this._parseSearchMetadata(response);
        if (searchMetadata) {
          session.webSearchMetadata = searchMetadata;
          console.log(`[SessionManager] Web search metadata captured: performed=${searchMetadata.performed}, queries=${searchMetadata.queriesCount}`);
        }

        // Add response to session
        session.responses.push(finalResponse);

        // Build user message metadata (store imageCount, not raw image data)
        const userMsgMeta1: Record<string, any> = {};
        if (options?.images && options.images.length > 0) {
          userMsgMeta1.imageCount = options.images.length;
        }

        // Update storage (non-blocking to prevent S5 connection issues from freezing UI)
        this.storageManager.appendMessage(
          sessionId.toString(),
          {
            role: 'user',
            content: prompt,
            timestamp: Date.now(),
            ...(Object.keys(userMsgMeta1).length > 0 ? { metadata: userMsgMeta1 } : {})
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

          // AUTOMATIC WEB SEARCH INTENT DETECTION for non-streaming encrypted path
          const searchConfigNonStreamEnc = session.webSearch || {};
          let enableWebSearchNonStreamEnc = false;

          // Disable web search when images are attached — VLM handles images locally
          const hasImagesNonStreamEnc = options?.images && options.images.length > 0;
          if (hasImagesNonStreamEnc) {
            enableWebSearchNonStreamEnc = false;
          } else if (searchConfigNonStreamEnc.forceDisabled) {
            enableWebSearchNonStreamEnc = false;
          } else if (searchConfigNonStreamEnc.forceEnabled) {
            enableWebSearchNonStreamEnc = true;
          } else if (searchConfigNonStreamEnc.autoDetect !== false) {
            // Default: auto-detect search intent from prompt
            enableWebSearchNonStreamEnc = analyzePromptForSearchIntent(prompt);
          }

          // Send encrypted message with web search options, images, and thinking
          await this.sendEncryptedMessage(prompt, {
            webSearch: enableWebSearchNonStreamEnc,
            maxSearches: enableWebSearchNonStreamEnc ? (searchConfigNonStreamEnc.maxSearches ?? 5) : 0,
            searchQueries: resolveSearchQueries(enableWebSearchNonStreamEnc, prompt, searchConfigNonStreamEnc.queries, options?.rawQuery)
          }, options?.images, options?.thinking);

          // Wait for encrypted response (non-streaming) - MUST accumulate chunks!
          let accumulatedResponse = '';  // Accumulate chunks even in non-streaming mode
          response = await new Promise<string>((resolve, reject) => {
            // Use sliding timeout window - resets on each chunk received
            // Initial timeout is longer (180s) for cold start scenarios (model loading into GPU)
            // Once streaming starts, the sliding window uses 60s between chunks
            let timeout = setTimeout(() => {
              reject(new SDKError('Encrypted response timeout', 'RESPONSE_TIMEOUT'));
            }, 180000); // 180 seconds initial timeout for cold start (model loading)

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

            let encNsChunkCount = 0;
            let safetyTimeoutNs: ReturnType<typeof setTimeout> | undefined;

            const unsubscribe = this.wsClient!.onMessage(async (data: any) => {
              // Skip processing if already resolved
              if (isResolved) return;

              // MUST handle encrypted_chunk messages!
              if (data.type === 'encrypted_chunk' && this.sessionKey) {
                encNsChunkCount++;
                // Reset timeout on each chunk (sliding window)
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                  safeReject(new SDKError('Encrypted response timeout', 'RESPONSE_TIMEOUT'));
                }, 60000);

                try {
                  const decrypted = await this.decryptIncomingMessage(data);
                  accumulatedResponse += decrypted;
                } catch (err) {
                  console.error('[SessionManager] Failed to decrypt chunk:', err);
                }

                // Check for final chunk — content complete, but defer resolution
                // until stream_end arrives with token data (3s safety for older nodes)
                if (data.final === true || data.final) {
                  safetyTimeoutNs = setTimeout(() => {
                    if (!isResolved) safeResolve(accumulatedResponse);
                  }, 3000);
                  return;
                }
              } else if (data.type === 'encrypted_response') {
                // encrypted_response carries finish_reason — DO NOT resolve here.
                // stream_end follows with vlm_tokens. Keep waiting.
                try {
                  if (this.sessionKey && data.payload && data.payload.ciphertextHex) {
                    await this.decryptIncomingMessage(data);
                  }
                } catch (err) {
                  console.error('[SessionManager] Error decrypting encrypted_response:', err);
                }
                // Ensure safety timeout is set in case stream_end never arrives
                if (!safetyTimeoutNs) {
                  safetyTimeoutNs = setTimeout(() => {
                    if (!isResolved) safeResolve(accumulatedResponse);
                  }, 3000);
                }
              } else if (data.type === 'stream_end') {
                if (safetyTimeoutNs) clearTimeout(safetyTimeoutNs);
                this._processStreamEnd(data, encNsChunkCount, session, options);
                safeResolve(accumulatedResponse);
              } else if (data.type === 'error') {
                console.error('[SessionManager] Error:', data.message);
                if (data.code === 'TOKEN_LIMIT_EXCEEDED') {
                  safeReject(new ContextLimitError(
                    data.message || 'Prompt exceeds context window',
                    data.prompt_tokens ?? 0,
                    data.context_window_size ?? 0
                  ));
                } else {
                  safeReject(new SDKError(data.message || 'Request failed', 'REQUEST_ERROR'));
                }
              }
            });
          });
        } else {
          // AUTOMATIC WEB SEARCH INTENT DETECTION (Phase 5.1) - Non-streaming path
          const searchConfigNonStream = session.webSearch || {};
          let enableWebSearchNonStream = false;

          // Disable web search when images are attached — VLM handles images locally
          const hasImagesPlaintextNonStream = options?.images && options.images.length > 0;
          if (hasImagesPlaintextNonStream) {
            enableWebSearchNonStream = false;
          } else if (searchConfigNonStream.forceDisabled) {
            enableWebSearchNonStream = false;
          } else if (searchConfigNonStream.forceEnabled) {
            enableWebSearchNonStream = true;
          } else if (searchConfigNonStream.autoDetect !== false) {
            // Default: auto-detect search intent from prompt
            enableWebSearchNonStream = analyzePromptForSearchIntent(prompt);
          }

          // Send plaintext message (only if session explicitly opted out of encryption)
          const plaintextRequestNonStream: any = {
            model: session.model,
            prompt: augmentedPrompt,  // Use RAG-augmented prompt
            max_tokens: LLM_MAX_TOKENS,  // Support comprehensive responses from large models
            temperature: 0.7,
            stream: false
          };

          // Include images in plaintext request when present
          if (options?.images && options.images.length > 0) {
            validateImageAttachments(options.images);
            plaintextRequestNonStream.images = options.images.map(img => ({ data: img.data, format: img.format }));
          }

          // Include thinking mode when set
          if (options?.thinking) {
            plaintextRequestNonStream.thinking = options.thinking;
          }

          // VLM token tracking (Phase 5): capture tokens from response/stream_end
          let ptNsUsage: TokenUsageInfo | undefined;
          const tokenUnsub = this.wsClient.onMessage((data: any) => {
            if (data.type === 'response' || data.type === 'stream_end') {
              ptNsUsage = this._processStreamEnd(data, 0, session, options);
            }
          });

          response = await this.wsClient.sendMessage({
            type: 'prompt',
            chain_id: session.chainId,
            jobId: session.jobId.toString(),  // Include jobId for settlement tracking
            prompt: augmentedPrompt,  // Use RAG-augmented prompt
            // Web search fields (v8.7.0+) - AUTOMATICALLY ENABLED based on intent
            web_search: enableWebSearchNonStream,
            max_searches: enableWebSearchNonStream ? (searchConfigNonStream.maxSearches ?? 5) : 0,
            search_queries: resolveSearchQueries(enableWebSearchNonStream, prompt, searchConfigNonStream.queries, options?.rawQuery),
            request: plaintextRequestNonStream
          });

          tokenUnsub();
        }

        // Add response to session
        session.responses.push(response);

        // Build user message metadata (store imageCount, not raw image data)
        const userMsgMeta2: Record<string, any> = {};
        if (options?.images && options.images.length > 0) {
          userMsgMeta2.imageCount = options.images.length;
        }

        // Update storage (non-blocking to prevent S5 connection issues from freezing UI)
        this.storageManager.appendMessage(
          sessionId.toString(),
          {
            role: 'user',
            content: prompt,
            timestamp: Date.now(),
            ...(Object.keys(userMsgMeta2).length > 0 ? { metadata: userMsgMeta2 } : {})
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
      if (error instanceof ContextLimitError) throw error;
      throw new SDKError(
        `Failed to send prompt via WebSocket: ${error.message}`,
        'WS_PROMPT_ERROR',
        { originalError: error }
      );
    }
  }

  // =============================================================================
  // Web Search Methods (Phase 4.2, 4.4)
  // =============================================================================

  /**
   * Perform a web search via WebSocket (Path C).
   *
   * Sends a search request through the existing WebSocket connection and
   * waits for results. Requires an active session with WebSocket connection.
   *
   * @param sessionId - Active session ID
   * @param query - Search query (1-500 characters)
   * @param numResults - Number of results to return (1-20, default 10)
   * @returns Search results from the host's configured provider
   * @throws WebSearchError on invalid query, timeout, or provider error
   *
   * @example
   * ```typescript
   * const results = await sessionManager.webSearch(
   *   sessionId,
   *   'latest NVIDIA GPU specs',
   *   5
   * );
   * console.log(`Found ${results.resultCount} results via ${results.provider}`);
   * ```
   */
  async webSearch(
    sessionId: bigint,
    query: string,
    numResults: number = 10
  ): Promise<SearchApiResponse> {
    const session = this.getSession(sessionId.toString());
    if (!session) {
      throw new SDKError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND');
    }

    if (!this.wsClient || !this.wsClient.isConnected()) {
      throw new SDKError('WebSocket not connected', 'WS_NOT_CONNECTED');
    }

    // Validate query
    if (!query || query.trim().length === 0) {
      throw new WebSearchError('Query cannot be empty', 'invalid_query');
    }
    if (query.length > 500) {
      throw new WebSearchError('Query must be 1-500 characters', 'invalid_query');
    }

    const requestId = `search-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new WebSearchError('Search timeout', 'timeout'));
      }, 30000);

      this.pendingRequests.set(requestId, {
        resolve: (result) => {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(requestId);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(requestId);
          reject(error);
        },
        timeoutId
      });

      // Send search request via WebSocket
      this.wsClient!.sendWithoutResponse({
        type: 'searchRequest',
        query,
        num_results: Math.min(Math.max(numResults, 1), 20),
        request_id: requestId,
        chain_id: session.chainId
      });
    });
  }

  /**
   * Perform a web search via direct HTTP API (Path A).
   *
   * Calls the host's /v1/search endpoint directly, without requiring
   * an active session or WebSocket connection.
   *
   * @param hostUrl - Host API base URL (e.g., 'http://host:8080')
   * @param query - Search query (1-500 characters)
   * @param options - Optional numResults (1-20) and chainId
   * @returns Search results from the host's configured provider
   * @throws WebSearchError on invalid query, rate limiting, or provider error
   *
   * @example
   * ```typescript
   * const results = await sessionManager.searchDirect(
   *   'http://host:8080',
   *   'AI developments 2026',
   *   { numResults: 5, chainId: 84532 }
   * );
   * ```
   */
  async searchDirect(
    hostUrl: string,
    query: string,
    options: { numResults?: number; chainId?: number } = {}
  ): Promise<SearchApiResponse> {
    // Validate query
    if (!query || query.length > 500) {
      throw new WebSearchError('Query must be 1-500 characters', 'invalid_query');
    }

    const requestId = `search-${Date.now()}`;
    const chainId = options.chainId || this.chainId;

    try {
      const response = await fetch(`${hostUrl}/v1/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          numResults: Math.min(Math.max(options.numResults || 10, 1), 20),
          chainId,
          requestId
        })
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        throw new WebSearchError(
          `Rate limited. Retry after ${retryAfter}s`,
          'rate_limited',
          retryAfter ? parseInt(retryAfter, 10) : undefined
        );
      }

      if (response.status === 503) {
        throw new WebSearchError('Web search disabled on host', 'search_disabled');
      }

      if (!response.ok) {
        throw new WebSearchError(`Search failed: ${response.statusText}`, 'provider_error');
      }

      return await response.json();
    } catch (error) {
      if (error instanceof WebSearchError) {
        throw error;
      }
      throw new WebSearchError(
        `Search request failed: ${(error as Error).message}`,
        'provider_error'
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

      // Clean up web search handler
      if (this.searchHandlerUnsubscribe) {
        this.searchHandlerUnsubscribe();
        this.searchHandlerUnsubscribe = undefined;
      }

      // Reject any pending RAG/search requests (WebSocket is closing)
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timeoutId);
        pending.reject(new SDKError('Session ended', 'SESSION_ENDED'));
      }
      this.pendingRequests.clear();

      for (const [id, pending] of this.pendingSearches) {
        clearTimeout(pending.timeoutId);
        pending.reject(new SDKError('Session ended', 'SESSION_ENDED'));
      }
      this.pendingSearches.clear();

      // Fully tear down WebSocket connection (must be fresh for next session)
      if (this.wsClient) {
        try {
          await this.wsClient.disconnect();
        } catch (_) { /* ignore disconnect errors */ }
        this.wsClient = undefined;
      }
      this.wsSessionId = undefined;

      // Clear encryption state so next session sends fresh session_init + ECDH
      this.sessionKey = undefined;
      this.messageIndex = 0;

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
    console.warn(`[SDK:encryptedInit:1] ENTER sessionId=${sessionId} jobId=${jobId} host=${config.host} endpoint=${config.endpoint}`);

    if (!this.encryptionManager) {
      console.error(`[SDK:encryptedInit:2] ENCRYPTION_NOT_AVAILABLE`);
      throw new SDKError(
        'EncryptionManager not available for encrypted session',
        'ENCRYPTION_NOT_AVAILABLE'
      );
    }

    if (!this.hostManager) {
      console.error(`[SDK:encryptedInit:3] HOST_MANAGER_NOT_AVAILABLE`);
      throw new SDKError(
        'HostManager required for host public key retrieval',
        'HOST_MANAGER_NOT_AVAILABLE'
      );
    }

    // 1. Generate random session key (32 bytes)
    this.sessionKey = crypto.getRandomValues(new Uint8Array(32));
    const sessionKeyHex = bytesToHex(this.sessionKey);
    this.messageIndex = 0;
    console.warn(`[SDK:encryptedInit:4] Generated session key, messageIndex reset to 0`);

    // 2. Get host public key (uses cache, metadata, or signature recovery)
    console.warn(`[SDK:encryptedInit:5] Getting host public key for ${config.host}...`);
    const hostPubKey = await this.hostManager.getHostPublicKey(
      config.host,
      config.endpoint  // API URL for fallback
    );
    console.warn(`[SDK:encryptedInit:6] Got host public key (${hostPubKey.length} chars)`);

    // 3. Prepare session init payload (per docs lines 469-477)
    const recoveryPubKey = this.encryptionManager.getRecoveryPublicKey();

    const initPayload: any = {
      sessionKey: sessionKeyHex,
      jobId: jobId.toString(),  // MUST be string per docs
      modelName: config.modelId,
      pricePerToken: config.pricePerToken || 0,  // MUST be number in wei/smallest units
      // Phase 8.1: Include recovery public key for checkpoint encryption
      recoveryPublicKey: recoveryPubKey
    };

    // NEW (Sub-phase 5.1.3): Include vector database info if provided
    if (config.vectorDatabase) {
      initPayload.vectorDatabase = {
        manifestPath: config.vectorDatabase.manifestPath,
        userAddress: config.vectorDatabase.userAddress
      };
    }

    // 4. Encrypt with EncryptionManager
    console.warn(`[SDK:encryptedInit:7] Encrypting session init payload...`);
    const encrypted = await this.encryptionManager.encryptSessionInit(
      hostPubKey,
      initPayload
    );
    console.warn(`[SDK:encryptedInit:8] Encrypted OK, type=${encrypted.type}`);

    // 5. Send encrypted init message via sendWithoutResponse + targeted ack handler.
    const messageToSend = {
      ...encrypted,  // { type: 'encrypted_session_init', payload: {...} }
      chain_id: config.chainId,
      session_id: sessionId.toString(),
      job_id: jobId.toString()
    };
    console.warn(`[SDK:encryptedInit:9] Sending encrypted_session_init via sendWithoutResponse (session_id=${sessionId}, job_id=${jobId}, chain_id=${config.chainId})`);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error(`[SDK:encryptedInit:12] TIMEOUT waiting for session_init_ack (30s)`);
        unsubscribe();
        reject(new SDKError('Session init timeout waiting for ack', 'WS_TIMEOUT'));
      }, 30000);

      const unsubscribe = ws.onMessage((data: any) => {
        console.warn(`[SDK:encryptedInit:10] Received message type=${data.type} while waiting for ack`);
        if (data.type === 'session_init_ack') {
          console.warn(`[SDK:encryptedInit:11] Got session_init_ack - init complete`);
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        } else if (data.type === 'error') {
          console.error(`[SDK:encryptedInit:11b] Got error: ${data.message}`);
          clearTimeout(timeout);
          unsubscribe();
          reject(new SDKError(data.message || 'Session init failed', 'SESSION_INIT_ERROR'));
        }
        // Ignore ALL other message types (encrypted_response, encrypted_chunk, etc.)
      });

      ws.sendWithoutResponse(messageToSend).then(() => {
        console.warn(`[SDK:encryptedInit:9b] sendWithoutResponse completed (message sent to WebSocket)`);
      }).catch((err: any) => {
        console.error(`[SDK:encryptedInit:9c] sendWithoutResponse FAILED: ${err.message}`);
        clearTimeout(timeout);
        unsubscribe();
        reject(err);
      });
    });

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
   * Payload is a JSON object: { prompt, model, max_tokens, temperature, stream, images? }
   * @param message - The plaintext prompt to encrypt and send
   * @param webSearchOptions - Optional web search configuration (v8.7.5+)
   * @param images - Optional image attachments to include in payload
   * @private
   */
  private async sendEncryptedMessage(
    message: string,
    webSearchOptions?: {
      webSearch: boolean;
      maxSearches: number;
      searchQueries: string[] | null;
    },
    images?: ImageAttachment[],
    thinking?: import('../types').ThinkingMode
  ): Promise<void> {

    // Validate images before encryption (fail fast)
    if (images && images.length > 0) {
      validateImageAttachments(images);
    }

    if (!this.sessionKey) {
      throw new SDKError(
        'Session key not available for encrypted messaging',
        'SESSION_KEY_NOT_AVAILABLE'
      );
    }

    if (!this.encryptionManager) {
      throw new SDKError(
        'EncryptionManager not available for encrypted messaging',
        'ENCRYPTION_NOT_AVAILABLE'
      );
    }

    if (!this.wsClient) {
      throw new SDKError(
        'WebSocket client not available',
        'WEBSOCKET_NOT_AVAILABLE'
      );
    }

    // Get current session for session_id
    const sessions = Array.from(this.sessions.values());
    const currentSession = sessions.find(s => s.status === 'active');
    if (!currentSession) {
      throw new SDKError(
        'No active session found for encrypted messaging',
        'NO_ACTIVE_SESSION'
      );
    }

    try {
      // Build structured JSON payload (node v8.15.3+)
      const structuredPayload: any = {
        prompt: message,
        model: currentSession.model,
        max_tokens: LLM_MAX_TOKENS,
        temperature: 0.7,
        stream: true,
      };

      // Only include thinking when set
      if (thinking) {
        structuredPayload.thinking = thinking;
      }

      // Only include images when present
      if (images && images.length > 0) {
        structuredPayload.images = images.map(img => ({ data: img.data, format: img.format }));
      }

      // Include search_queries in encrypted payload (node reads from both outer and inner)
      if (webSearchOptions?.searchQueries) {
        structuredPayload.search_queries = webSearchOptions.searchQueries;
      }

      // Encrypt JSON payload with session key
      const payload = this.encryptionManager.encryptMessage(
        this.sessionKey,
        JSON.stringify(structuredPayload),
        this.messageIndex++
      );

      // Wrap payload with message structure (per docs lines 498-508)
      // Use sendWithoutResponse to avoid conflicting handlers (v1.3.28 fix)
      const messageToSend: any = {
        type: 'encrypted_message',
        session_id: currentSession.sessionId.toString(),
        id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
        payload: payload
      };

      // Add web search fields if provided (v8.7.5+ - works with WebSocket streaming)
      if (webSearchOptions) {
        messageToSend.web_search = webSearchOptions.webSearch;
        messageToSend.max_searches = webSearchOptions.maxSearches;
        messageToSend.search_queries = webSearchOptions.searchQueries;
      }

      await this.wsClient.sendWithoutResponse(messageToSend);

    } catch (error: any) {
      // Re-throw SDKErrors (validation, encryption) without wrapping
      if (error instanceof SDKError) throw error;
      console.error('[SessionManager] Failed to encrypt/send message:', error.message);
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
      throw new SDKError(
        'Session key not available for decryption',
        'SESSION_KEY_NOT_AVAILABLE'
      );
    }

    if (!this.encryptionManager) {
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
      console.error('[SessionManager] Decryption failed:', error.message);
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
    onChunk: (chunk: string) => void,
    options?: PromptOptions
  ): Promise<void> {
    if (options?.images && options.images.length > 0) {
      throw new SDKError(
        'Image attachments are not supported by streamResponse(). Use sendPromptStreaming() with options.images instead.',
        'IMAGES_NOT_SUPPORTED'
      );
    }

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
        jobId: session.jobId.toString(),
        ...(options?.thinking ? { thinking: options.thinking } : {})
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
   * Process stream_end data: extract token usage, compute context utilization, fire callbacks.
   * Shared by all 4 stream_end handler sites (encrypted/plaintext, streaming/non-streaming).
   */
  private _processStreamEnd(
    data: any,
    fallbackChunkCount: number,
    session: SessionState,
    options: PromptOptions | undefined
  ): TokenUsageInfo {
    const llmTokens = data.tokens_used || fallbackChunkCount;
    const vlmTokens = data.vlm_tokens || 0;
    const totalTokens = llmTokens + vlmTokens;

    const usageObj = data.usage;
    const promptTokens = usageObj?.prompt_tokens;
    const completionTokens = usageObj?.completion_tokens;
    const contextWindowSize = usageObj?.context_window_size;
    const finishReason = data.finish_reason ?? undefined;

    let contextUtilization: number | undefined;
    if (promptTokens != null && contextWindowSize && contextWindowSize > 0) {
      contextUtilization = (promptTokens + (completionTokens ?? 0)) / contextWindowSize;
    }

    const usage: TokenUsageInfo = {
      llmTokens, vlmTokens, imageGenTokens: 0, totalTokens,
      promptTokens, contextWindowSize, contextUtilization, finishReason
    };

    session.totalTokens += totalTokens;
    session.lastTokenUsage = usage;
    if (promptTokens != null) session.lastPromptTokens = promptTokens;
    if (contextWindowSize != null) session.contextWindowSize = contextWindowSize;
    session.lastFinishReason = finishReason ?? null;

    options?.onTokenUsage?.(usage);

    if (contextUtilization != null && options?.onContextWarning) {
      const threshold = options.contextWarningThreshold ?? 0.8;
      if (contextUtilization >= threshold) {
        options.onContextWarning(usage);
      }
    }

    return usage;
  }

  /**
   * Get the token usage info from the last completed prompt for a session.
   * Returns undefined if no prompt has been completed yet.
   */
  getLastTokenUsage(sessionId: bigint): TokenUsageInfo | undefined {
    const session = this.sessions.get(sessionId.toString());
    return session?.lastTokenUsage;
  }

  /**
   * Get context window utilization info for a session.
   * Returns null if no prompt has been sent yet.
   */
  getContextInfo(sessionId: bigint): ContextInfo | null {
    const session = this.sessions.get(sessionId.toString());
    if (!session || session.lastPromptTokens === undefined) return null;

    const promptTokens = session.lastPromptTokens ?? 0;
    const contextWindowSize = session.contextWindowSize ?? 0;
    const completionTokens = session.lastTokenUsage?.llmTokens ?? 0;
    const utilization = contextWindowSize > 0
      ? (promptTokens + completionTokens) / contextWindowSize
      : 0;

    return {
      promptTokens,
      completionTokens,
      contextWindowSize,
      utilization,
      finishReason: session.lastFinishReason ?? null
    };
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

    // 2. Force new WebSocket if session changed (old connection belongs to previous session)
    const endpoint = session.endpoint || 'http://localhost:8080';
    const wsUrl = endpoint.includes('ws://') || endpoint.includes('wss://')
      ? endpoint
      : endpoint.replace('http://', 'ws://').replace('https://', 'wss://') + '/v1/ws';

    if (this.wsClient && this.wsSessionId && this.wsSessionId !== sessionId) {
      try { await this.wsClient.disconnect(); } catch (_) { /* ignore */ }
      this.wsClient = undefined;
      this.wsSessionId = undefined;
      this.sessionKey = undefined;
      this.messageIndex = 0;
    }

    if (!this.wsClient || !this.wsClient.isConnected()) {
      this.wsClient = new WebSocketClient(wsUrl, { chainId: session.chainId });
      await this.wsClient.connect();
      this.wsSessionId = sessionId;

      // Set up global RAG message handlers
      this._setupRAGMessageHandlers();

      // Set up global web search message handlers (Phase 5.2-5.3)
      this._setupWebSearchMessageHandlers();
    }

    // CRITICAL FIX: Always send session_init before RAG operations
    // The node clears sessions from SessionStore after "Encrypted session complete"
    // so we must re-initialize the session to ensure RAG operations work
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

    // After successful upload, mark session as RAG-enabled
    if (totalUploaded > 0) {
      session.ragContext = session.ragContext || { vectorDbId: `vectors-${sessionId}` };
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

    // Validate RAG context is configured for this session
    if (!session.ragContext?.vectorDbId) {
      throw new SDKError(
        'No vector database attached to this session. Configure ragContext when starting the session.',
        'RAG_NOT_CONFIGURED'
      );
    }

    // CRITICAL FIX: Always send session_init before RAG operations
    // The node clears sessions from SessionStore after "Encrypted session complete"
    // so we must re-initialize the session to ensure RAG operations work
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
      if (signer) {
        const userAddress = await signer.getAddress();
        if (userAddress) {
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

      // Check if RAG context is configured - if not, return original question
      // (no point generating embeddings without a vector database)
      if (!session.ragContext?.vectorDbId) {
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

  // =============================================================================
  // Web Search Message Handlers (Phase 5.2-5.3)
  // =============================================================================

  /**
   * Parse search metadata from response data.
   * @private
   */
  private _parseSearchMetadata(response: any): WebSearchMetadata | null {
    if (response.web_search_performed === undefined) {
      return null;
    }
    return {
      performed: response.web_search_performed === true,
      queriesCount: response.search_queries_count || 0,
      provider: response.search_provider || null,
    };
  }

  /**
   * Set up global message handlers for web search operations.
   * @private
   */
  private _setupWebSearchMessageHandlers(): void {
    if (!this.wsClient) {
      return;
    }

    // Clean up existing handler if present to prevent duplicate handlers
    if (this.searchHandlerUnsubscribe) {
      this.searchHandlerUnsubscribe();
      this.searchHandlerUnsubscribe = undefined;
    }

    // Register handler for web search messages
    this.searchHandlerUnsubscribe = this.wsClient.onMessage((data: any) => {
      // Only handle search-specific message types
      if (data.type === 'searchStarted') {
        this._handleSearchStarted(data as WebSearchStarted);
      } else if (data.type === 'searchResults') {
        this._handleSearchResults(data as WebSearchResults);
      } else if (data.type === 'searchError') {
        this._handleSearchError(data as WebSearchErrorMsg);
      }
      // Ignore other message types
    });
  }

  /**
   * Handle searchStarted WebSocket message.
   * @private
   */
  private _handleSearchStarted(data: WebSearchStarted): void {
    console.log(`[SessionManager] Search started: query="${data.query}" provider=${data.provider}`);
    // This is informational - no pending request resolution needed
    // Could emit event here for UI progress indication if needed
  }

  /**
   * Handle searchResults WebSocket message.
   * @private
   */
  private _handleSearchResults(data: WebSearchResults): void {
    const requestId = data.request_id || '';
    const pending = this.pendingSearches.get(requestId);

    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingSearches.delete(requestId);

      // Convert to SearchApiResponse
      const response: SearchApiResponse = {
        query: data.query,
        results: data.results,
        resultCount: data.result_count,
        searchTimeMs: data.search_time_ms,
        provider: data.provider as 'brave' | 'duckduckgo' | 'bing',
        cached: data.cached,
        chainId: 0, // Will be filled by caller if needed
        chainName: 'Unknown'
      };

      pending.resolve(response);
    }
  }

  /**
   * Handle searchError WebSocket message.
   * @private
   */
  private _handleSearchError(data: WebSearchErrorMsg): void {
    const requestId = data.request_id || '';
    const pending = this.pendingSearches.get(requestId);

    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingSearches.delete(requestId);
      pending.reject(new WebSearchError(data.error, data.error_code));
    }
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
      console.error('[SessionManager] Fetch error:', fetchError.message);
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

  // =============================================================================
  // Checkpoint Recovery Methods (Delta-Based Checkpointing)
  // =============================================================================

  /**
   * Recover conversation state from node-published checkpoints (HTTP-based).
   *
   * @deprecated Use {@link recoverFromBlockchainEvents} instead for decentralized recovery
   * that doesn't require the host to be online. This HTTP-based method is kept for
   * backward compatibility with pre-Phase 9 sessions.
   *
   * This method orchestrates the full recovery flow:
   * 1. Gets session info to obtain host address
   * 2. Fetches checkpoint index from node's HTTP API
   * 3. Verifies signatures and on-chain proofs
   * 4. Fetches and decrypts all deltas (Phase 8 - encrypted checkpoints)
   * 5. Merges deltas into a single conversation
   *
   * Encrypted deltas (node v8.12.0+) are automatically decrypted using the
   * user's recovery private key from EncryptionManager. Plaintext deltas
   * from older nodes are handled transparently (backward compatible).
   *
   * @param sessionId - The session ID to recover
   * @returns Recovered conversation with messages, token count, and checkpoint metadata
   * @throws SDKError with code 'SESSION_NOT_FOUND' if session doesn't exist
   * @throws SDKError with code 'INVALID_INDEX_SIGNATURE' if signature verification fails
   * @throws SDKError with code 'PROOF_HASH_MISMATCH' if on-chain proof doesn't match
   * @throws SDKError with code 'DELTA_FETCH_FAILED' if delta fetch fails
   * @throws SDKError with code 'DECRYPTION_KEY_REQUIRED' if encrypted delta and no EncryptionManager
   * @throws SDKError with code 'DECRYPTION_FAILED' if decryption fails (wrong key or tampered data)
   */
  async recoverFromCheckpoints(sessionId: bigint): Promise<RecoveredConversation> {
    // Create session info getter that returns hostUrl for HTTP-based recovery
    const getSessionInfo = async (id: bigint): Promise<{
      hostAddress: string;
      hostUrl: string;
      status: string;
    } | null> => {
      const session = this.sessions.get(id.toString());
      if (!session) {
        return null;
      }
      // Get HTTP URL from endpoint (convert ws:// to http:// if needed)
      const endpoint = session.endpoint || 'http://localhost:8080';
      const hostUrl = endpoint.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '');

      return {
        hostAddress: session.provider, // provider contains host address
        hostUrl: hostUrl,
        status: session.status,
      };
    };

    // Create proof query contract adapter using PaymentManager
    const proofContract = {
      getProofSubmission: async (sid: bigint, proofIndex: number) => {
        return this.paymentManager.getProofSubmission(sid, proofIndex);
      },
    };

    // Get user's recovery private key for encrypted checkpoint decryption (Phase 8)
    // If EncryptionManager is not available, recovery will still work for plaintext deltas
    const userPrivateKey = this.encryptionManager?.getRecoveryPrivateKey();

    try {
      // Use HTTP-based recovery flow (fetches checkpoint index from node's HTTP API)
      return await recoverFromCheckpointsFlowWithHttp(
        this.storageManager,
        proofContract,
        getSessionInfo,
        sessionId,
        userPrivateKey
      );
    } catch (error: any) {
      // Convert to SDKError if not already
      if (error.message?.startsWith('SESSION_NOT_FOUND')) {
        throw new SDKError(error.message, 'SESSION_NOT_FOUND');
      }
      if (error.message?.startsWith('HOST_URL_MISSING')) {
        throw new SDKError(error.message, 'HOST_URL_MISSING');
      }
      if (error.message?.startsWith('CHECKPOINT_FETCH_FAILED')) {
        throw new SDKError(error.message, 'CHECKPOINT_FETCH_FAILED');
      }
      if (error.message?.startsWith('INVALID_CHECKPOINT_INDEX')) {
        throw new SDKError(error.message, 'INVALID_CHECKPOINT_INDEX');
      }
      if (error.message?.startsWith('NODE_UNREACHABLE')) {
        throw new SDKError(error.message, 'NODE_UNREACHABLE');
      }
      if (error.message?.startsWith('INVALID_INDEX_SIGNATURE')) {
        throw new SDKError(error.message, 'INVALID_INDEX_SIGNATURE');
      }
      if (error.message?.startsWith('PROOF_HASH_MISMATCH')) {
        throw new SDKError(error.message, 'PROOF_HASH_MISMATCH');
      }
      if (error.message?.startsWith('DELTA_FETCH_FAILED')) {
        throw new SDKError(error.message, 'DELTA_FETCH_FAILED');
      }
      if (error.message?.startsWith('INVALID_DELTA')) {
        throw new SDKError(error.message, 'INVALID_DELTA_STRUCTURE');
      }
      if (error.message?.startsWith('DECRYPTION_KEY_REQUIRED')) {
        throw new SDKError(error.message, 'DECRYPTION_KEY_REQUIRED');
      }
      if (error.message?.startsWith('DECRYPTION_FAILED')) {
        throw new SDKError(error.message, 'DECRYPTION_FAILED');
      }
      throw new SDKError(
        `Checkpoint recovery failed: ${error.message}`,
        'RECOVERY_FAILED',
        { originalError: error }
      );
    }
  }

  /**
   * Recover conversation from blockchain ProofSubmitted events (decentralized).
   *
   * This method does NOT require the host to be online. It queries blockchain
   * events to discover deltaCIDs, then fetches deltas from S5. This enables
   * fully decentralized checkpoint recovery.
   *
   * @param jobId - The job/session ID to recover
   * @param options - Query options (block range)
   * @returns Recovered conversation with messages, token count, and blockchain checkpoint entries
   * @throws SDKError with code 'DELTA_FETCH_FAILED' if S5 fetch fails
   * @throws SDKError with code 'DECRYPTION_FAILED' if decryption fails
   */
  async recoverFromBlockchainEvents(
    jobId: bigint,
    options?: CheckpointQueryOptions
  ): Promise<BlockchainRecoveredConversation> {
    // Get signer and chain ID from PaymentManager to create JobMarketplace contract
    const signer = (this.paymentManager as any).signer as ethers.Signer;
    const chainId = (this.paymentManager as any).currentChainId as number;

    if (!signer) {
      throw new SDKError('Signer not available for blockchain recovery', 'SIGNER_NOT_AVAILABLE');
    }

    // Get contract address from ChainRegistry
    const chain = ChainRegistry.getChain(chainId);
    const contractAddress = chain.contracts.jobMarketplace;

    // Create JobMarketplace contract instance for event querying
    const contract = new ethers.Contract(contractAddress, JobMarketplaceABI, signer);

    // Get user's recovery private key for encrypted delta decryption
    // If EncryptionManager is not available, recovery will still work for plaintext deltas
    const userPrivateKey = this.encryptionManager?.getRecoveryPrivateKey();

    try {
      // Use blockchain-based recovery (no HTTP API needed)
      return await recoverFromBlockchain(
        contract,
        this.storageManager,
        jobId,
        userPrivateKey,
        options
      );
    } catch (error: any) {
      // Convert to SDKError if not already
      if (error.message?.startsWith('DELTA_FETCH_FAILED')) {
        throw new SDKError(error.message, 'DELTA_FETCH_FAILED');
      }
      if (error.message?.startsWith('DECRYPTION_KEY_REQUIRED')) {
        throw new SDKError(error.message, 'DECRYPTION_KEY_REQUIRED');
      }
      if (error.message?.startsWith('DECRYPTION_FAILED')) {
        throw new SDKError(error.message, 'DECRYPTION_FAILED');
      }
      throw new SDKError(
        `Blockchain recovery failed: ${error.message}`,
        'RECOVERY_FAILED',
        { originalError: error }
      );
    }
  }

  // ============= Image Generation =============

  /**
   * Generate an image via encrypted WebSocket (production path).
   *
   * @param sessionId - Active session ID
   * @param prompt - Text prompt for image generation
   * @param options - Image generation options (size, steps, etc.)
   * @returns Promise resolving to ImageGenerationResult
   */
  async generateImage(
    sessionId: string,
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<ImageGenerationResult> {
    console.warn(`[SDK:generateImage:1] ENTER v1.14.6 sessionId=${sessionId} wsSessionId=${this.wsSessionId} hasWs=${!!this.wsClient} wsConnected=${this.wsClient?.isConnected()} hasKey=${!!this.sessionKey} msgIdx=${this.messageIndex}`);

    // Validate session exists and is active
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`[SDK:generateImage:2] SESSION_NOT_FOUND sessionId=${sessionId} available=[${Array.from(this.sessions.keys()).join(',')}]`);
      throw new SDKError('Session not found', 'SESSION_NOT_FOUND');
    }
    console.warn(`[SDK:generateImage:3] Session found: status=${session.status} endpoint=${session.endpoint} provider=${session.provider} model=${session.model} chainId=${session.chainId} jobId=${session.jobId} sessionId=${session.sessionId}`);

    if (session.status !== 'active') {
      console.error(`[SDK:generateImage:4] SESSION_NOT_ACTIVE status=${session.status}`);
      throw new SDKError('Session is not active', 'SESSION_NOT_ACTIVE');
    }

    // Require encryption manager
    if (!this.encryptionManager) {
      console.error(`[SDK:generateImage:5] ENCRYPTION_NOT_AVAILABLE`);
      throw new SDKError('EncryptionManager not available', 'ENCRYPTION_NOT_AVAILABLE');
    }
    console.warn(`[SDK:generateImage:6] EncryptionManager OK`);

    // Lazily initialize WebSocket if not connected
    const endpoint = session.endpoint || 'http://localhost:8080';
    const wsUrl = endpoint.includes('ws://') || endpoint.includes('wss://')
      ? endpoint
      : endpoint.replace('http://', 'ws://').replace('https://', 'wss://') + '/v1/ws';
    console.warn(`[SDK:generateImage:7] endpoint=${endpoint} wsUrl=${wsUrl}`);

    // Force new WebSocket if session changed (old connection belongs to previous session)
    if (this.wsClient && this.wsSessionId && this.wsSessionId !== sessionId) {
      console.warn(`[SDK:generateImage:8] Session changed ${this.wsSessionId} -> ${sessionId}, tearing down old WebSocket`);
      try { await this.wsClient.disconnect(); } catch (_) { /* ignore */ }
      this.wsClient = undefined;
      this.wsSessionId = undefined;
      this.sessionKey = undefined;
      this.messageIndex = 0;
    }

    if (!this.wsClient || !this.wsClient.isConnected()) {
      console.warn(`[SDK:generateImage:9] Creating fresh WebSocket to ${wsUrl}`);
      try {
        this.wsClient = new WebSocketClient(wsUrl, { chainId: session.chainId });
        console.warn(`[SDK:generateImage:10] WebSocket created, calling connect()...`);
        await this.wsClient.connect();
        console.warn(`[SDK:generateImage:11] WebSocket connected OK`);
        this.wsSessionId = sessionId;
      } catch (err: any) {
        console.error(`[SDK:generateImage:12] WebSocket connect FAILED: ${err.message}`, err);
        throw err;
      }
    } else {
      console.warn(`[SDK:generateImage:9b] Reusing existing WebSocket (connected=${this.wsClient.isConnected()})`);
    }

    // Always send session_init with fresh ECDH key exchange
    console.warn(`[SDK:generateImage:13] Sending sendEncryptedInit for session ${sessionId} job ${session.jobId}`);
    const initConfig: ExtendedSessionConfig = {
      chainId: session.chainId,
      host: session.provider,
      modelId: session.model,
      endpoint: session.endpoint,
      paymentMethod: 'deposit',
      encryption: true
    };
    try {
      await this.sendEncryptedInit(this.wsClient, initConfig, session.sessionId, session.jobId);
      console.warn(`[SDK:generateImage:14] sendEncryptedInit completed OK, hasKey=${!!this.sessionKey}`);
    } catch (err: any) {
      console.error(`[SDK:generateImage:15] sendEncryptedInit FAILED: ${err.message}`, err);
      throw err;
    }

    if (!this.sessionKey) {
      console.error(`[SDK:generateImage:16] SESSION_KEY_NOT_AVAILABLE after init`);
      throw new SDKError('Session key not available after init', 'SESSION_KEY_NOT_AVAILABLE');
    }

    // Delegate to standalone utility
    console.warn(`[SDK:generateImage:17] Calling generateImageWs prompt="${prompt.substring(0, 50)}..." msgIdx=${this.messageIndex}`);
    const messageIndexRef = { value: this.messageIndex };
    try {
      const result = await generateImageWs({
        wsClient: this.wsClient,
        encryptionManager: {
          encryptMessage: (key: Uint8Array, plaintext: string, index: number) =>
            this.encryptionManager!.encryptMessage(key, plaintext, index),
          decryptMessage: (key: Uint8Array, payload: any) => {
            const p = payload.payload || payload;
            return this.encryptionManager!.decryptMessage(key, p);
          },
        },
        rateLimiter: this.imageGenRateLimiter,
        sessionId,
        sessionKey: this.sessionKey,
        messageIndex: messageIndexRef,
        prompt,
        options,
      });
      this.messageIndex = messageIndexRef.value;
      console.warn(`[SDK:generateImage:18] generateImageWs completed OK, size=${result.size} processingTime=${result.processingTimeMs}ms`);

      // Track image generation billing as token usage
      // Convert generationUnits to token equivalent (1 unit = 1000 tokens)
      const genUnits = result.billing?.generationUnits || 0;
      const imageGenTokens = Math.ceil(genUnits * 1000);
      if (imageGenTokens > 0) {
        const usage: TokenUsageInfo = {
          llmTokens: 0,
          vlmTokens: 0,
          imageGenTokens,
          totalTokens: imageGenTokens,
        };
        session.totalTokens += imageGenTokens;
        session.lastTokenUsage = usage;
        console.warn(`[SDK:generateImage:18b] Billing: ${genUnits} genUnits = ${imageGenTokens} imageGenTokens, session totalTokens=${session.totalTokens}`);
      }

      return result;
    } catch (err: any) {
      console.error(`[SDK:generateImage:19] generateImageWs FAILED: ${err.message}`, err);
      throw err;
    }
  }

  /**
   * Generate an image via HTTP POST (testing/CI path, no encryption).
   *
   * @param hostUrl - Base URL of the host
   * @param prompt - Text prompt for image generation
   * @param options - Image generation options (size, steps, etc.)
   * @returns Promise resolving to ImageGenerationResult
   */
  async generateImageHttpRequest(
    hostUrl: string,
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<ImageGenerationResult> {
    return generateImageHttp(hostUrl, prompt, options);
  }
}