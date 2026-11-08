// Copyright (c) 2025 Fabstir
import { LLM_MAX_TOKENS } from '../config/llm-config';
import { normalizeNodeHttpUrl } from '../utils/validation';
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
  ContextInfo,
  HostHealthInfo,
  SessionStatusInfo,
  Message
} from '../types';
import { validateImageAttachments } from '../utils/image-validation';
import { HostSelectionMode } from '../types/settings.types';
import { PaymentManager } from './PaymentManager';
import { StorageManager } from './StorageManager';
import { HostManager, PRICE_PRECISION } from './HostManager';
import { EncryptionManager } from './EncryptionManager';
import { WebSocketClient } from '../websocket/WebSocketClient';
import { ChainRegistry } from '../config/ChainRegistry';
import { UnsupportedChainError, ChainMismatchError } from '../errors/ChainErrors';
import { withTimeout } from '../utils/with-timeout';
import { NETWORK_TIMEOUT_MS } from '../utils/rpc-provider';
import { PricingValidationError } from '../errors/pricing-errors';
import { WebSearchError } from '../errors/web-search-errors';
import { ContextLimitError } from '../errors/context-errors';
import { bytesToHex } from '../crypto/utilities';
import { resolveWebSearch } from '../utils/search-query-resolver';
import { RAG_CONTEXT_START_MARKER, RAG_CONTEXT_END_MARKER } from '../utils/rag-prompt';
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
import { submitTranscodeWs, TRANSCODE_DEFAULT_TIMEOUT_MS } from '../utils/transcode-ws';
import { fetchTranscodeResultWs, type TranscodeResultAnswer } from '../utils/transcode-result-ws';
import { TranscodeError } from '../errors/transcode-errors';
import { isEncryptedTranscode } from '../utils/transcode-utils';
import type { VideoFormat, TranscodeHandle, TranscodeSubmitOptions, TranscodeResult } from '../types/transcode.types';
import { submitLtxWs } from '../utils/ltx-ws';
import type { LtxJob, LtxHandle, LtxSubmitOptions, LtxResult } from '../types/ltx.types';
import type { LoraSessionField } from '../types/training.types';
import { buildLoraSessionField } from '../types/training.types';
import type { TrainingError } from '../errors/training-errors';
import { toServeBackError, firstResponseTimeoutMs } from '../utils/training-serve-back';
import { submitTrainingWs } from '../utils/training-ws';
import type { TrainingHandle, TrainingWsOptions } from '../utils/training-ws';
import type { TrainingJob } from '../types/training.types';

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

/**
 * Money has moved: a failure in a setup step after funding says so, with the ids the caller needs to use or
 * release the session. `registered` — the in-memory session exists (every stage after the registry write).
 */
// The ids are whatever the funding call returned (PaymentManager's result type is a loose union).
/**
 * Failures worth another result-fetch attempt: the wire, not a verdict (1.39.15). The transport codes of TrainingManager's
 * TRANSPORT_SDK_CODES except SESSION_INIT_ERROR (the node refusing the init will refuse the next one too), plus the fetch's
 * own timeout, close and send failures.
 */
const TRANSIENT_FETCH_CODES = new Set([
  'WS_CONNECTION_ERROR', 'WS_CREATE_ERROR', 'WS_TIMEOUT', 'WS_NOT_CONNECTED', 'WS_SEND_ERROR', 'WS_RECONNECT_FAILED',
  'SESSION_AUTH_UNREACHABLE', 'RESPONSE_TIMEOUT', 'HOST_PUBKEY_UNAVAILABLE', 'NO_API_URL',
]);
function isTransientFetchFailure(err: any): boolean {
  if (err instanceof TranscodeError) {
    const reason = (err.details as any)?.reason;
    return !(err.details as any)?.nodeCode && ['FETCH_TIMEOUT', 'WS_CLOSED', 'SEND_FAILED'].includes(reason);
  }
  return TRANSIENT_FETCH_CODES.has(err?.code);
}

/** A job that rides `submitOverTransport`; one per session at a time (1.39.14). */
type SessionJobKind = 'transcode' | 'ltx' | 'training';

function fundedSetupFailed(sessionId: unknown, jobId: unknown, stage: 'registry' | 'conversation-log' | 'session-group-link', cause: any): SDKError {
  // A step that landed, only its head not recorded (§34 OO4), completed the setup: said at the top — use the session
  // (§35 PP6).
  const committed = cause?.details?.committed === true;
  return new SDKError(
    committed
      ? `Session ${sessionId} is set up; its ${stage} step landed but this tab could not record its head: ${cause.message}`
      : `Session ${sessionId} was funded but its ${stage} step failed: ${cause?.message ?? cause}`,
    'SESSION_FUNDED_SETUP_FAILED',
    // Not retryable: the session is funded — use or release it by its ids (§20 AA8).
    { sessionId, jobId, stage, cause, registered: stage !== 'registry', ...(committed ? { committed } : {}), retryable: false }
  );
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
  /** false → nothing of this session is written to the S5 conversation log (1.39.0). */
  conversationLog?: boolean;
  groupId?: string; // NEW: Session Groups integration
  webSearchMetadata?: WebSearchMetadata; // NEW: Web search metadata from response
  webSearch?: SearchIntentConfig; // NEW: Web search configuration (Phase 5.1)
  /** Training M0 serve-back adapter (E.2), persisted the same way `webSearch` is. EVERY
   *  `sendEncryptedInit` call site rebuilds its config from this state, so an adapter that
   *  lives only in the caller's original config is dropped by the first re-init — and E.3 is
   *  explicit that a re-init MUST re-send `lora` or the node keeps refusing. */
  lora?: LoraSessionField;
  /** §4b's serve-back callback, persisted for the same reason as `lora`: a callback that
   *  cannot survive a re-init is silent, and silence here means the session answers from the
   *  BASE MODEL on a run the customer is paying to fine-tune. */
  onServeBackError?: (error: TrainingError) => void;
  lastTokenUsage?: TokenUsageInfo; // NEW: Last prompt's token usage (Phase 5)
  lastPromptTokens?: number;
  contextWindowSize?: number;
  lastFinishReason?: 'stop' | 'length' | 'cancelled' | null;
  ragContext?: { vectorDbId: string }; // Set by uploadVectors() or startSession(ragConfig)
  ragConfig?: RAGSessionConfig; // RAG configuration from startSession
  ragMetrics?: RAGMetrics; // RAG metrics tracking
  lastHostHealth?: HostHealthInfo; // Last host health check result (Phase 14.2)
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
  /** false → no S5 conversation log for this session: no initial write, no appends, no re-saves (1.39.0). */
  conversationLog?: boolean;
  groupId?: string; // NEW: Session Groups integration
  /**
   * Host-side loading of a vector database from S5 (Sub-phase 5.1.3). Incompatible with sealed RAG storage
   * (1.39.0): a host cannot open a sealed manifest, and the plaintext path it named no longer exists. Kept
   * only so existing configs type-check; use `ragConfig` (the client searches and sends context) instead.
   */
  vectorDatabase?: {
    manifestPath: string; // S5 path to a plaintext manifest.json (legacy layout)
    userAddress: string; // Owner address for verification
  };
  webSearch?: SearchIntentConfig; // NEW: Web search configuration (Phase 2.2)
  /** Training M0 serve-back (E.2): load this session's own fine-tuned adapter. Session-scoped,
   *  scale 1.0, never visible to concurrent sessions on the same base model. */
  lora?: LoraSessionField;
  /** Fires on a post-ack `LORA_STAGING_FAILED` (E.3). Without it a staging failure is silent
   *  and the session serves BASE-MODEL output on a paid fine-tune. */
  onServeBackError?: (error: TrainingError) => void;
}

/**
 * FC1.6 session-auth authorisation object, as returned verbatim by the fiat
 * service's `POST /fiat/session`. The SDK only relays it to the node — it never
 * computes or signs the `FC1-SESSION-AUTH:` digest (that is the fiat service's
 * backend-auth key's job). Shape is LOCKED to the /fiat/session wire response so
 * consumers pass it straight through with no mapping.
 */
export interface SessionAuthorisation {
  /** Scheme identifier, e.g. 'fc1-session-auth-v1'. */
  scheme: string;
  /** 0x-prefixed 65-byte recoverable secp256k1 signature (r||s||v). */
  signature: string;
  /** The burner address the WebSocket will connect with (lowercased). */
  clientAddress: string;
}

/**
 * Config for {@link SessionManager.registerDelegatedSession} — a session created
 * externally (e.g. via a vault/delegated flow) that the SDK adopts, WITH S5 chat
 * persistence. The optional `authorisation` + `nodeHttpUrl` pair opts into FC1.6
 * session-auth delivery. For registry seeding alone (no S5 write, no network —
 * what the LTX vault path needs) use {@link ExternalSessionConfig} instead.
 */
export interface DelegatedSessionConfig {
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
  /** false → no S5 conversation log for this session (e.g. a tier-2 extraction run). */
  conversationLog?: boolean;
  /** FC1.6: the `{ scheme, signature, clientAddress }` from /fiat/session. */
  authorisation?: SessionAuthorisation;
  /** FC1.6: node http(s) base URL — REQUIRED when `authorisation` is present. */
  nodeHttpUrl?: string;
  /** Training M0 serve-back (E.2). Without a home on the adopted session the adapter
   *  cannot survive the first re-init, and this is the popup-free path most chats use. */
  lora?: LoraSessionField;
  /** Fires on a post-ack `LORA_STAGING_FAILED` (E.3). Silent without it. */
  onServeBackError?: (error: TrainingError) => void;
  /** Web search for this session's prompts, as on a started session (Milestone B D30). `{ forceDisabled: true }` for an
   *  extraction session; a prompt's own `PromptOptions.webSearch` still wins. */
  webSearch?: SearchIntentConfig;
}

/**
 * Config for {@link SessionManager.registerExternalSession} — the minimum a WS
 * submit path needs about a session the SDK did not create. These six fields are
 * exactly what `submitLtx`/`submitTranscode` read off the registry entry.
 * `endpoint` must be the node's http(s) base (see `LtxSubmitOptions.existingSession`).
 */
export interface ExternalSessionConfig {
  sessionId: bigint;
  jobId: bigint;
  /** Node http(s) base URL — the WS URL is derived from it at submit time. Validated and normalised
   *  by `registerExternalSession` (`SESSION_ENDPOINT_INVALID` for a ws(s)://, query-bearing or
   *  mis-cased value the derivation would use verbatim or mangle). */
  endpoint: string;
  /** Host operator address (the session's `provider`). */
  hostAddress: string;
  model: string;
  chainId: number;
  /** Training M0 serve-back (E.2). Without a home on the adopted session the adapter
   *  cannot survive the first re-init, and this is the popup-free path most chats use. */
  lora?: LoraSessionField;
  /** Fires on a post-ack `LORA_STAGING_FAILED` (E.3). Silent without it. */
  onServeBackError?: (error: TrainingError) => void;
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
  /**
   * The WebSocket connection generation `sessionKey` was minted on.
   *
   * The node registers the key against the connection that carried the init, so
   * the key is only meaningful while the connection identity is unchanged. A
   * silent reconnect leaves `isConnected()` true on a connection the node has no
   * session for; comparing this instead is what distinguishes the two.
   */
  private sessionKeyGeneration?: number;
  /** The client `sessionKeyGeneration` was read from: generations are per client (Milestone B review M1). */
  private sessionKeyClient?: WebSocketClient;
  private connectionChangeUnsubscribe?: () => void;
  private settledFrameUnsubscribe?: () => void;
  /** Opens of any shared client, counted here: each WebSocketClient restarts its own count at 1 (Milestone B round 2). */
  private sharedConnectionOpens = 0;
  /** The client whose latest open `sharedConnectionOpens` counted. */
  private sharedConnectionCounted?: WebSocketClient;
  /** Rejectors for encrypted work awaiting a response on the current connection. */
  private encryptedWaiters: Set<(error: Error) => void> = new Set();
  /**
   * Per-session crypto state, keyed by session id.
   *
   * The node keeps one key PER session; a single shared `sessionKey` field
   * cannot represent that — every init on any path (each prompt, each RAG op,
   * each image/transcode flow) overwrote it, so two sessions interleaving on
   * one manager decrypted and encrypted with each other's keys: aead::Error
   * immediately after a clean init, with the node correctly reporting one key
   * and no re-init per session. The legacy shared fields remain as "most
   * recently inited session" for existing readers; this map is authoritative
   * wherever a frame names its session.
   */
  private sessionCrypto: Map<string, { key: Uint8Array; messageIndex: number }> = new Map();
  /** Reads a session job through the dedicated read provider (FabstirSDKCore wires it), never the wallet (1.39.18 K2). */
  private sessionJobReader?: (chainId: number) => { getSessionJobOnChain(jobId: bigint): Promise<{ startTime: bigint | number; maxDuration: bigint | number; status?: number | bigint }> };
  /** Sessions the node may have settled since the SDK last read them (1.39.21 S1): the mark's epoch, when it was set, and
   *  whether it is sticky (a job that ended without its result, which the node may still be running). */
  private maySettle: Map<string, { epoch: number; at: number; sticky: boolean }> = new Map();
  private maySettleEpoch = 0;
  /**
   * How long after an event the node may still settle (review rounds 1–2, `checkpoint_manager.rs`
   * `complete_session_job_latched`, the disconnect path in `server.rs`): up to 120 s waiting for a pending proof, a forced
   * final checkpoint (a proof, its tx and up to 60 s confirmation), the contract's dispute window (30 s,
   * `disputeWindow()`) + 5 s from that proof, the completion tx behind the node's tx queue, a "Dispute wait" revert
   * retried at 10/20/40/80/160 s (310 s), and one full second attempt 35 s after a failure. 20 minutes covers that with
   * margin. An Active read inside it does not clear the mark.
   */
  static SETTLE_HORIZON_MS = 20 * 60_000;
  /** Sessions the guard found settled on chain, so a later refusal names the reason (review round 2). */
  private settledOnChain: Set<string> = new Set();
  /** Sessions the node told us it settled (1.39.22 N1/N2): the node's reason, or 'refused' for a SESSION_SETTLED refusal. */
  private settledByNode: Map<string, string> = new Map();
  /** Whether the session's node reports `session-settled-notice` (1.39.22 N3); set on a 2xx /v1/version only. */
  private settledNoticeNodes: Map<string, boolean> = new Map();
  /** Whether it also refuses REST inference on a settled session (`session-settled-rest`, 8.63.1; 1.39.23 R1). */
  private settledRestNodes: Map<string, boolean> = new Map();
  /** When each session last passed the gate, for the idle mark on notice nodes (1.39.22 N3). */
  private lastGatedAt: Map<string, number> = new Map();
  /** Idle time after which a notice node's session is read again: the node cannot see a settlement made on chain by
   *  someone else (the depositor, triggerSessionTimeout) (owner, 2026-11-08). */
  static SETTLED_NOTICE_IDLE_MS = 10 * 60_000;
  /** Bound once, so the same function can be attached to and detached from every socket. */
  private readonly settledFrameListener = (data: any) => this.onSettledFrame(data, true);
  /** The same, on a dedicated job socket: its refusal is not about the shared socket's waiters. */
  private readonly dedicatedSettledFrameListener = (data: any) => this.onSettledFrame(data, false);
  /** Hosts trusted with confidential jobs, lower-cased; undefined = none configured, so none allowed (1.39.19). */
  private confidentialHosts?: Set<string>;
  /** Per session id: whether its node reports `session-job-completion` (1.39.15 H1). Only definitive answers are kept. */
  private jobCompletionNodes: Map<string, boolean> = new Map();
  /** When sharedConnectionHoldsKey's probe last failed, per session (round 3 m3). */
  private holdsKeyProbeFailedAt: Map<string, number> = new Map();
  /** How long a failed probe makes sharedConnectionHoldsKey re-init without asking again. */
  static HOLDS_KEY_PROBE_RETRY_MS = 60_000;
  /** The one job in flight per session id (1.39.14, IMPLEMENTATION-SESSION-JOB-EXCLUSIVE G1). */
  private jobsInFlight: Map<string, SessionJobKind> = new Map();
  /** Serializes init handshakes so two mint->send->ack sequences cannot interleave. */
  private initChain: Promise<void> = Promise.resolve();
  /** Key fingerprints already wire-logged on a successful decrypt (one ok-line per key; failures always log). */
  private wireOkLogged: Set<string> = new Set();
  private imageGenRateLimiter = new ImageGenerationRateLimiter();
  private pendingRequests: Map<string, { resolve: (value: any) => void; reject: (error: any) => void; timeoutId: NodeJS.Timeout }> = new Map(); // Host-side RAG request tracking
  private ragHandlerUnsubscribe?: () => void; // NEW: Store RAG handler unsubscribe function to prevent duplicate handlers
  // Web Search (Phase 5.2-5.3): Pending search tracking and handler cleanup
  private pendingSearches: Map<string, { resolve: (result: SearchApiResponse) => void; reject: (error: Error) => void; timeoutId: NodeJS.Timeout }> = new Map();
  private searchHandlerUnsubscribe?: () => void;
  private sessionStatusCallback?: (status: SessionStatusInfo) => void;
  private sessionStatusUnsubscribe?: () => void;

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
   * Whether a frame belongs to the given session. Frames that carry a
   * session_id (session_init_ack, encrypted_chunk, encrypted_response — node
   * API.md:2059/:2087) are matched on it; frames that carry none (stream_end,
   * connected) cannot be attributed and pass through.
   */
  private frameTargetsSession(frame: any, sessionId: string | bigint): boolean {
    if (frame?.session_id === undefined || frame.session_id === null) {
      return true;
    }
    return String(frame.session_id) === String(sessionId);
  }

  /**
   * Short fingerprint of a key for wire logs: identifies which key was used
   * without revealing it. Two logs with the same fp used the same key.
   */
  private wireFp(key: Uint8Array | undefined): string {
    if (!key) return 'none';
    return ethers.sha256(key).slice(2, 10);
  }

  /**
   * Register a rejector for encrypted work awaiting a response, so it can be
   * failed fast if the connection identity changes underneath it.
   *
   * @returns a function to unregister once the work settles normally
   */
  private registerEncryptedWaiter(reject: (error: Error) => void): () => void {
    this.encryptedWaiters.add(reject);
    return () => {
      this.encryptedWaiters.delete(reject);
    };
  }

  /**
   * React to a WebSocket connection identity change.
   *
   * The key minted on the previous connection cannot be used on this one — the
   * node has no session registered for it, so every frame would fail to decrypt.
   * Drop the key so the next send re-inits, and fail in-flight encrypted work
   * immediately rather than leaving it to the first-response timeout (480 s for
   * a lora session) on an outcome already known.
   */
  private handleConnectionChange(generation: number): void {
    // Same generation on the SAME client is the open that carried the init; on a replacement client it is a new
    // connection that merely restarted the count (Milestone B round 2).
    if (this.sessionKeyGeneration === undefined ||
        (generation === this.sessionKeyGeneration && this.sessionKeyClient === this.wsClient)) {
      return;
    }

    console.warn(
      `[SessionManager] WebSocket connection changed (generation ` +
      `${this.sessionKeyGeneration} -> ${generation}); the session key minted on the ` +
      'previous connection is no longer valid. Re-initialising on next send.'
    );

    this.sessionKey = undefined;
    this.messageIndex = 0;
    this.sessionKeyGeneration = undefined;
    this.sessionKeyClient = undefined;
    // Every entry was registered node-side on the connection that just died.
    this.sessionCrypto.clear();
    this.wireOkLogged.clear();
    // wsSessionId is deliberately preserved: it records which session owns the
    // client, which a change of connection identity does not alter. Clearing it
    // would make the reuse guards treat the socket as belonging to no session.

    // DELIBERATE: an interrupted prompt is NOT resent automatically here.
    //
    // The prompt was never answered, so nothing was billed and a resend would be
    // safe on that count. It is still the caller's call: only the caller knows
    // whether the user has since navigated away or cancelled, and a silent retry
    // inside sendPrompt turns a repeatedly unstable connection into a loop that
    // is invisible from outside. The error carries `retryable: true` and a
    // distinct code so the caller can resend deliberately and say why.
    const waiters = [...this.encryptedWaiters];
    this.encryptedWaiters.clear();
    for (const reject of waiters) {
      const error: any = new SDKError(
        'The WebSocket connection was replaced while this request was in flight, so the ' +
        'session key it was encrypted under is no longer valid. The request was not ' +
        'answered and can be sent again.',
        'SESSION_KEY_INVALIDATED'
      );
      error.retryable = true;
      try {
        reject(error);
      } catch (err) {
        console.error('[SessionManager] Failed to reject in-flight request:', err);
      }
    }
  }

  /**
   * 1.39.22 N1/N2, on every SDK socket: the node's `session_settled` notice and its `SESSION_SETTLED` refusal settle the
   * named session locally; on a notice node any other error naming a session marks it for a read (N3).
   */
  private onSettledFrame(data: any, fromShared: boolean): void {
    const sid = data?.session_id === undefined || data?.session_id === null ? undefined : String(data.session_id);
    if (!sid || !this.sessions.has(sid)) return;
    // A notice names its job too: a record re-seeded for another job under the id is not the one settled (review)
    if (data.type === 'session_settled' && data.job_id !== undefined && String(data.job_id) !== String(this.sessions.get(sid)!.jobId)) return;
    if (data.type === 'session_settled') {
      this.markSettledByNode(sid, typeof data.reason === 'string' ? data.reason : 'completion');
    } else if (data.type === 'error' && data.code === 'SESSION_SETTLED') {
      this.markSettledByNode(sid, 'refused');
      // A vector request carries `requestId`, not `id`, so its refusal names only the session: fail that session's
      // waiters on its shared socket now instead of at their timeout.
      // Only the shared socket's own refusal, and only vector waiters: the node does not refuse a searchRequest (review).
      // 8.63.1 echoes the frame's requestId: then only that request is refused (1.39.23 R3); 8.63.0 names only the session.
      if (fromShared && this.wsSessionId === sid) {
        const only = typeof data.requestId === 'string' ? data.requestId : undefined;
        for (const [id, pending] of this.pendingRequests) {
          if (only !== undefined && id !== only) continue;
          clearTimeout(pending.timeoutId);
          this.pendingRequests.delete(id);
          pending.reject(this.settledByNodeError(sid, data));
        }
      }
    } else if (data.type === 'error' && this.settledNoticeNodes.get(sid) === true) {
      this.markMaySettle(sid);   // the node errored on this session: read it before more work (N3)
    }
  }

  /** The node settled `sessionId` (1.39.22): completed locally, its mark dropped, later work refused SETTLED_BY_NODE. */
  private markSettledByNode(sessionId: string, nodeReason: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (!this.settledByNode.has(sessionId)) this.settledByNode.set(sessionId, nodeReason);
    this.maySettle.delete(sessionId);
    if (session.status === 'active' || session.status === 'paused') {   // a paused one cannot be resumed (review)
      session.status = 'completed';
      session.endTime = Date.now();
      if (session.conversationLog !== false) {
        this.storageManager.updateConversationMetadata(sessionId, { status: 'completed', endTime: session.endTime })
          .catch(err => console.warn('[SessionManager] Failed to persist the settled status:', err));
      }
    }
  }

  /**
   * 1.39.23 R2: an HTTP refusal of REST inference. 409 `SESSION_SETTLED` (8.63.1): the node settled the session. 403
   * `SESSION_AUTH_DENIED`: a card-serving host refuses REST inference outright; the code reaches the caller as on the
   * WebSocket paths. Anything else returns, for the caller's own error.
   */
  private refuseOnRestRefusal(sessionId: string, httpStatus: number, body: string): void {
    let parsed: any;
    try { parsed = JSON.parse(body); } catch { return; }
    const code = parsed?.code ?? parsed?.error;
    if (httpStatus === 409 && code === 'SESSION_SETTLED') {
      // It names the job it refused: a record re-seeded for another job meanwhile is not the one settled (review)
      const job = this.sessions.get(sessionId)?.jobId;
      if (parsed?.job_id !== undefined && job !== undefined && String(parsed.job_id) !== String(job)) return;
      this.markSettledByNode(sessionId, 'refused');
      const err = this.settledByNodeError(sessionId, parsed);
      (err.details as Record<string, unknown>).httpStatus = httpStatus;
      throw err;
    }
    if (httpStatus === 403 && code === 'SESSION_AUTH_DENIED') {
      throw new SDKError(parsed?.message || 'session authorisation denied', 'SESSION_AUTH_DENIED',
        { nodeCode: code, sessionId, httpStatus });
    }
  }

  /** A refusal for work on a session the node settled (1.39.22). */
  private settledByNodeError(sessionId: string, frame?: any): SDKError {
    return new SDKError(frame?.message || `Session ${sessionId} was settled by its node; open a new session`, 'SESSION_NOT_ACTIVE',
      { reason: 'SETTLED_BY_NODE', nodeReason: this.settledByNode.get(sessionId), nodeCode: 'SESSION_SETTLED', sessionId, retryable: false });
  }

  /** A node's REST base (http(s), no trailing /v1/ws) from any endpoint form a session holds (1.39.23 review). */
  private static nodeRestBase(endpoint: string): string {
    return endpoint.trim()
      .replace(/^(wss?|https?):\/\//i, (_m, scheme: string) => `${{ ws: 'http', wss: 'https' }[scheme.toLowerCase()] ?? scheme.toLowerCase()}://`)
      .replace(/\/+$/, '').replace(/\/v1\/ws$/i, '').replace(/\/+$/, '');
  }

  /** Whether an error is the node's settled refusal, in any of the shapes the paths deliver it (1.39.22 N2). */
  private static isSettledRefusal(err: any): boolean {
    return err?.code === 'SESSION_SETTLED' || err?.details?.nodeCode === 'SESSION_SETTLED'
      || err?.details?.originalError?.code === 'SESSION_SETTLED' || err?.detail?.sdkCode === 'SESSION_SETTLED'
      || (err?.code === 'SESSION_NOT_ACTIVE' && err?.details?.reason === 'SETTLED_BY_NODE');
  }

  /**
   * 1.39.22 N3: whether the session's node reports `session-settled-notice`. One /v1/version read, shared with the
   * job-completion probe; a failed probe answers no (1.39.21's rules) and is not asked again for a minute.
   */
  private async isSettledNoticeNode(sessionId: string): Promise<boolean> {
    const known = this.settledNoticeNodes.get(sessionId);
    if (known !== undefined) return known;
    const failedAt = this.holdsKeyProbeFailedAt.get(sessionId);
    if (failedAt !== undefined && Date.now() - failedAt < SessionManager.HOLDS_KEY_PROBE_RETRY_MS) return false;
    if (!this.jobCompletionNodes.has(sessionId)) {
      await this.isJobCompletionNode(sessionId);
      if (!this.jobCompletionNodes.has(sessionId)) this.holdsKeyProbeFailedAt.set(sessionId, Date.now());
    }
    return this.settledNoticeNodes.get(sessionId) === true;
  }

  /**
   * 1.39.21 S1: after an event at which the node may settle `sessionId` without telling the client (its last connection
   * closed, a job ended, a session adopted from elsewhere), the next new work on it reads its status on chain first.
   */
  private markMaySettle(sessionId: string | undefined, sticky = false): void {
    if (sessionId === undefined) return;
    const prev = this.maySettle.get(sessionId);
    this.maySettle.set(sessionId, { epoch: ++this.maySettleEpoch, at: Date.now(), sticky: sticky || !!prev?.sticky });
  }

  /**
   * 1.39.21 S2/S3: refuse new work on a marked session the chain reports settled; the node would answer it unbilled. One
   * read per mark. Active clears the mark (unless a newer one arrived during the read). Unreadable refuses, retryable,
   * and keeps the mark (owner, 2026-11-07).
   */
  private async refuseIfSettledOnChain(sessionId: string, session: SessionState, opts: { rest?: boolean } = {}): Promise<void> {
    // Whether the node refuses this work on a settled session: every WebSocket kind does on a notice node (1.39.22); REST
    // inference (sendPrompt, streamResponse) only on a node reporting `session-settled-rest` (8.63.1, 1.39.23 R1).
    // Every gate re-checks the status: a caller that passed its own check before an await may meet a session another
    // call (or an earlier gate in this one) has since found settled (review round 2).
    this.refuseIfNoLongerActive(sessionId, session);
    // 1.39.22 N3: on a notice node, a session idle for 10 minutes is read: a settlement on chain by someone else is
    // invisible to the node
    const last = this.lastGatedAt.get(sessionId);
    if (this.settledNoticeNodes.get(sessionId) === true && last !== undefined
        && Date.now() - last > SessionManager.SETTLED_NOTICE_IDLE_MS) {
      this.markMaySettle(sessionId);
    }
    const mark = this.maySettle.get(sessionId);
    if (mark === undefined) { this.lastGatedAt.set(sessionId, Date.now()); return; }
    let status: number;
    try {
      if (!this.sessionJobReader) throw new Error('no session reader is wired (FabstirSDKCore sets one)');
      const job = await withTimeout(this.sessionJobReader(session.chainId).getSessionJobOnChain(BigInt(session.jobId)),
        NETWORK_TIMEOUT_MS, () => new Error(`no answer within ${NETWORK_TIMEOUT_MS} ms`));
      const raw = job?.status;
      status = typeof raw === 'number' || typeof raw === 'bigint' ? Number(raw) : NaN;
      if (!Number.isInteger(status)) throw new Error(`no session status on chain (got ${String(raw)})`);
    } catch (err: any) {
      // A session on another chain than the reader's is not a passing outage (review round 1)
      const wrongChain = err instanceof ChainMismatchError || err?.code === 'CHAIN_MISMATCH';
      throw new SDKError(`Could not read session ${sessionId}'s status on chain: ${err?.message ?? err}`,
        'SESSION_STATUS_UNREADABLE', { sessionId, retryable: !wrongChain, ...(wrongChain ? { reason: 'CHAIN_MISMATCH' } : {}) });
    }
    if (status !== 0) {
      this.maySettle.delete(sessionId);
      this.settledOnChain.add(sessionId);
      const live = this.sessions.get(sessionId) ?? session;   // a record re-seeded during the read is the same session
      for (const s of new Set([session, live])) { s.status = 'completed'; s.endTime = Date.now(); }
      // The shared socket is left open: a reply still streaming on it would otherwise be cut off (settled-guard review
      // round 6). Every later call on this session is refused by its status; the socket goes when another replaces it.
      if (session.conversationLog !== false) {
        this.storageManager.updateConversationMetadata(sessionId, { status: 'completed', endTime: session.endTime })
          .catch(err => console.warn('[SessionManager] Failed to persist the settled status:', err));
      }
      throw new SDKError(`Session ${sessionId} was settled on chain; open a new session`, 'SESSION_NOT_ACTIVE',
        { reason: 'SETTLED_ON_CHAIN', sessionId, status, retryable: false });
    }
    // The read awaited: another gate may have found it settled meanwhile, or it was ended, completed or re-registered
    // (settled-guard review round 3).
    this.refuseIfNoLongerActive(sessionId, session);
    // Active: the mark ends only once the node can no longer be settling from it, and never while it is sticky. On a
    // notice node (1.39.22 N3) the node announces and refuses every settlement it decides, so one read clears it.
    const notice = await this.isSettledNoticeNode(sessionId);   // one probe answers both markers
    const nodeRefuses = opts.rest ? this.settledRestNodes.get(sessionId) === true : true;
    this.refuseIfNoLongerActive(sessionId, session);
    const current = this.maySettle.get(sessionId);
    if (current?.epoch === mark.epoch
        && ((notice && nodeRefuses) || (!mark.sticky && Date.now() - mark.at >= SessionManager.SETTLE_HORIZON_MS))) {
      this.maySettle.delete(sessionId);
    }
    this.lastGatedAt.set(sessionId, Date.now());
  }

  /**
   * The gate's status check: at its start, after its read, and right before each send. It reads the CURRENT record: a
   * re-registration (an identical re-seed, a concurrent restore) is not a refusal, and the new record carries its own
   * mark (settled-guard review round 4).
   */
  private refuseIfNoLongerActive(sessionId: string, session: SessionState): void {
    const current = this.sessions.get(sessionId) ?? session;
    // Both: a call holding a record that was ended stops, even if the id was re-adopted since (the new record's mark is
    // for its own calls); an identical re-seed of a live record leaves both active (settled-guard review round 5).
    if (current.status !== 'active' || session.status !== 'active') {
      throw this.settledByNode.has(sessionId) ? this.settledByNodeError(sessionId)
        : this.settledOnChain.has(sessionId)
        ? new SDKError(`Session ${sessionId} was settled on chain; open a new session`, 'SESSION_NOT_ACTIVE',
          { reason: 'SETTLED_ON_CHAIN', sessionId, retryable: false })
        : (() => {
          // The held record first: it is what this call was using (settled-guard review round 6)
          const status = session.status !== 'active' ? session.status : current.status;
          return new SDKError(`Session ${sessionId} is not active (status: ${status})`, 'SESSION_NOT_ACTIVE', { sessionId, status });
        })();
    }
  }

  /**
   * A re-registered session may name another node, model, job or lora: forget what its node reported, and unbind its key
   * from the shared connection it owns, so the next operation inits with the new record (Milestone B round 5).
   */
  private forgetSessionTransportFacts(sessionId: string): void {
    // Adopted from elsewhere (a card service, a reload): it may already be settled (1.39.21 S1)
    this.markMaySettle(sessionId);
    this.settledOnChain.delete(sessionId);   // a new record for this id (settled-guard review round 3)
    this.settledByNode.delete(sessionId);
    this.settledNoticeNodes.delete(sessionId);
    this.settledRestNodes.delete(sessionId);
    this.jobCompletionNodes.delete(sessionId);
    this.holdsKeyProbeFailedAt.delete(sessionId);
    if (this.wsSessionId === sessionId) {
      this.sessionKeyGeneration = undefined;
      this.sessionKeyClient = undefined;
    }
  }

  /**
   * Milestone B D38: whether the shared connection already holds this session's key on a node that keeps keys per
   * connection, so the re-init before a prompt, upload or search can be skipped. Node 8.62 (which reports
   * `session-job-completion`) registers the key for the connection (`store_key_for(conn_id, sid)`) until it closes, and
   * at "Encrypted session complete" appends the exchange instead of clearing the session. Older nodes, and a failed
   * probe, keep the re-init. So does a failed LoRA staging: only a re-init carrying the adapter stages it again.
   */
  private async sharedConnectionHoldsKey(sessionId: string): Promise<boolean> {
    // A shared init in flight has already put its new key in the shared fields, before the node has it (review m1).
    // Settle every shared init queued so far. One queued later has already written its new key into the shared fields
    // before the node has it, so `holds` also requires that none was queued since (round 3).
    let chain: Promise<void>;
    do { chain = this.initChain; await chain; } while (chain !== this.initChain);
    const holds = () => {
      const shared = this.sessionCrypto.get(sessionId);
      return this.initChain === chain
        && !this.needsSessionInit() && this.wsSessionId === sessionId && !!this.sessionKey && shared?.key === this.sessionKey
        && this.serveBackError === null;   // a failed LoRA staging needs the re-init that stages it again (review M2)
    };
    // Checked before the probe (no probe when a re-init is due anyway; a failed probe is not cached) and again after it,
    // since the probe awaits: nothing may await between the last check and the caller's send (round 2).
    if (!holds()) return false;
    // A failed probe is not cached for jobs (they ask again each submit); here it is, briefly, so an old or unreachable
    // node does not cost every prompt a probe. Its answer is the safe one: re-init (round 3 m3).
    const failedAt = this.holdsKeyProbeFailedAt.get(sessionId);
    if (failedAt !== undefined && Date.now() - failedAt < SessionManager.HOLDS_KEY_PROBE_RETRY_MS) return false;
    if (!(await this.isJobCompletionNode(sessionId))) {
      if (!this.jobCompletionNodes.has(sessionId)) this.holdsKeyProbeFailedAt.set(sessionId, Date.now());
      return false;
    }
    return holds();
  }

  /**
   * The shared connection's identity (Milestone B D37): it increases on every open of the shared connection, a reconnect
   * or a replacement socket alike, and the node drops a connection's keys and vectors when it closes. `undefined` with no
   * shared connection, or one not open (not yet, or closed and awaiting a reconnect). Counted by the SessionManager, since each socket restarts its own count.
   */
  getConnectionGeneration(): number | undefined {
    return this.wsClient && this.sharedConnectionCounted === this.wsClient && this.wsClient.isConnected()
      ? this.sharedConnectionOpens : undefined;   // a closed socket awaiting reconnect has no node connection (round 3)
  }

  /**
   * Whether an `encrypted_session_init` must be sent before the next encrypted
   * frame. Connection identity, not transport liveness — a silent reconnect
   * leaves `isConnected()` true on a connection that was never inited. The client
   * counts too: every WebSocketClient starts its generations at 1, so a
   * replacement client repeats the old one's number (Milestone B review M1).
   */
  private needsSessionInit(): boolean {
    if (!this.wsClient || !this.wsClient.isConnected()) {
      return true;
    }
    if (this.sessionKeyGeneration === undefined || this.sessionKeyClient !== this.wsClient) {
      return true;
    }
    return this.wsClient.getConnectionGeneration() !== this.sessionKeyGeneration;
  }

  /**
   * Subscribe to connection identity changes on the active client.
   */
  private watchConnectionIdentity(client: WebSocketClient): void {
    // 1.39.22: the node's settled notice and refusal, on every shared client; on a notice node a new connection is read
    this.settledFrameUnsubscribe?.();
    this.settledFrameUnsubscribe = client.onMessage(this.settledFrameListener);
    if (this.wsSessionId !== undefined && this.settledNoticeNodes.get(this.wsSessionId) === true) this.markMaySettle(this.wsSessionId);
    this.connectionChangeUnsubscribe?.();
    this.connectionChangeUnsubscribe = client.onConnectionChange((generation: number) => {
      this.sharedConnectionOpens++;
      this.sharedConnectionCounted = client;
      // A reconnect: the node saw the previous connection close and may have settled its session (1.39.21 S1)
      if (generation > 1) this.markMaySettle(this.wsSessionId);
      this.handleConnectionChange(generation);
    });
  }

  /**
   * Set HostManager for price validation (called after authentication)
   */
  setHostManager(hostManager: HostManager): void {
    this.hostManager = hostManager;
  }

  /**
   * Resolve the on-chain pricePerToken for a model, mirroring startSession's lookup
   * (convertModelToBytes32 + hostManager.getModelPricing). Returns the RAW price;
   * the caller owns any zero/validity guard and the payment-token choice (no native default).
   */
  async resolveModelPricePerToken(hostAddress: string, modelId: string, paymentToken: string): Promise<bigint> {
    if (!this.hostManager) {
      throw new Error('HostManager not set; cannot resolve model price');
    }
    return this.hostManager.getModelPricing(hostAddress, convertModelToBytes32(modelId), paymentToken);
  }

  /** The model's on-chain rate cap in tokens per second, the same route as its price (1.39.17). */
  async resolveModelRateLimit(modelId: string): Promise<number> {
    if (!this.hostManager) {
      throw new Error('HostManager not set; cannot resolve model rate limit');
    }
    return this.hostManager.getModelRateLimit(convertModelToBytes32(modelId));
  }

  /** Last post-ack serve-back failure (E.3), or null. Cleared on each (re-)init, because a
   *  re-init carrying `lora` RE-TRIGGERS staging: the previous attempt is evicted. */
  private serveBackError: TrainingError | null = null;

  /** Disposer for the post-ack serve-back listener. Five call sites re-init on the SHARED
   *  `this.wsClient`, so without this each re-init would stack another listener and one
   *  staging failure would fire the caller's handler once per init. */
  private serveBackUnsubscribe?: () => void;

  /** True while this session carries a `lora` adapter, so the first-response timeout can clear
   *  the node's 300 s staging budget. Non-lora sessions keep the existing allowance exactly. */
  private loraSessionActive = false;

  /** The staging failure this session hit, if any. Non-null means the adapter is NOT loaded
   *  and any answer since would have come from the BASE MODEL. */
  getServeBackError(): TrainingError | null {
    return this.serveBackError;
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
   * Set callback for session status updates (proof/checkpoint outcomes).
   * The callback persists across prompts and fires whenever the host
   * sends a session_status, proof_submitted, or checkpoint_submitted message.
   */
  setSessionStatusCallback(callback: (status: SessionStatusInfo) => void): void {
    this.sessionStatusCallback = callback;
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

    // Host and endpoint are settled BEFORE any funding (1.39.10). A host the SDK chose (AUTO) or whose endpoint it looked
    // up (an explicit host with no endpoint) must answer GET /v1/health first; an endpoint the caller supplied is theirs.
    if (provider && !endpoint) {
      endpoint = await this.registryEndpoint(provider, convertModelToBytes32(model));
      if ((await this._checkHostHealth(endpoint)).status === 'unreachable') {
        throw new SDKError(`Host ${provider} did not answer at ${endpoint}/v1/health — no session opened`, 'HOST_UNREACHABLE', { host: provider, endpoint });
      }
    } else if (!provider && this.hostSelectionService) {
      // Get user's preferred host selection mode
      const mode = await this.storageManager.getHostSelectionMode();
      const settings = await this.storageManager.getUserSettings();
      const preferredHostAddress = settings?.preferredHostAddress ?? undefined;

      // Convert model to bytes32 for host lookup
      const modelIdForSelection = convertModelToBytes32(model);
      console.log(`[SessionManager] Auto-discovery: model="${model}" -> bytes32=${modelIdForSelection}, mode=${mode}`);

      // Select a host that answers: one that does not is excluded and selection runs again over the rest.
      const unreachable: { host: string; endpoint: string }[] = [];
      for (;;) {
        const excluded = unreachable.map((u) => u.host);
        const selectedHost = await this.hostSelectionService.selectHostForModel(modelIdForSelection, mode, preferredHostAddress, excluded);
        if (!selectedHost || excluded.some((a) => a.toLowerCase() === selectedHost.address.toLowerCase())) {
          const skipped = unreachable.length ? `; did not answer: ${excluded.join(', ')}` : '';
          throw new SDKError(`No hosts available for model "${model}" (hash: ${modelIdForSelection})${skipped}`, 'NO_HOSTS_AVAILABLE', { unreachable });
        }
        if (endpoint) { // an endpoint the caller passed is used as given (transformed, as before) — not probed
          provider = selectedHost.address;
          endpoint = this.transformEndpoint(endpoint);
          break;
        }
        if (!selectedHost.apiUrl) {
          console.warn(`[SessionManager] Host ${selectedHost.address} has no apiUrl — skipped`);
          unreachable.push({ host: selectedHost.address, endpoint: '' });
          continue;
        }
        const candidate = this.transformEndpoint(selectedHost.apiUrl);
        if ((await this._checkHostHealth(candidate)).status === 'unreachable') {
          console.warn(`[SessionManager] Host ${selectedHost.address} did not answer at ${candidate}/v1/health — skipped`);
          unreachable.push({ host: selectedHost.address, endpoint: candidate });
          continue;
        }
        provider = selectedHost.address;
        endpoint = candidate;
        break;
      }

      // Store selected host for next time
      await this.storageManager.updateUserSettings({
        lastHostAddress: provider,
      });

      console.log(`[SessionManager] Auto-selected host: ${provider}, endpoint: ${endpoint} (mode: ${mode})`);
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

      // Everything that can fail without the job fails HERE, before any money moves.
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

      // The log's environment (sealer, cross-tab lock) is a precondition too: an insecure origin must fail
      // here, not after the deposit (R2).
      if (config.conversationLog !== false) await this.storageManager.assertConversationLogWritable();

      const result = await this.paymentManager.createSessionJob(sessionJobParams);

      // PaymentManagerMultiChain returns just the job ID as a number
      // We'll use the job ID as both session ID and job ID for now
      const jobId = typeof result === 'number' ? BigInt(result) : result.jobId || result;
      const sessionId = typeof result === 'number' ? BigInt(result) : result.sessionId || jobId;

      // Money has moved: from here every failure carries the ids, or the deposit cannot be released.
      let stage: 'registry' | 'conversation-log' | 'session-group-link' = 'registry';
      // A log step that landed, only its head not recorded (§34 OO4), does not stop the setup: the remaining steps run,
      // and it is reported after them — a setup that completed (§35 PP6, §36 QQ5).
      let logLanded: unknown;
      try {
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
          conversationLog: config.conversationLog,
          groupId: config.groupId,  // NEW: Session Groups integration
          webSearch: config.webSearch,  // NEW (Phase 5.1): Web search configuration
          // Seeded the same way, and for the same reason: every init site rebuilds its config
          // from this state, so a field that lives only in the caller's config is lost at the
          // first re-init. `ExtendedSessionConfig` accepted `lora` while this literal dropped it,
          // which left the whole serve-back path unreachable from outside the class.
          lora: config.lora,
          onServeBackError: config.onServeBackError,
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
        stage = 'conversation-log';
        if (config.conversationLog !== false) await this.storageManager.storeConversation({
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
        }).catch((error: any) => {
          if (error?.details?.committed !== true) throw error;
          logLanded = error;
        });

        // NEW: Session Groups integration - Link session to group if groupId provided
        stage = 'session-group-link';
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
      } catch (cause: any) {
        throw fundedSetupFailed(sessionId, jobId, stage, cause);
      }
      if (logLanded) throw fundedSetupFailed(sessionId, jobId, 'conversation-log', logLanded);

      return {
        sessionId: sessionId,
        jobId: jobId
      };
    } catch (error: any) {
      // Re-throw pricing validation errors without wrapping
      if (error instanceof PricingValidationError) {
        throw error;
      }
      // The funding outcomes carry the ids / tx hash the caller needs, or say the send may have gone out: never
      // re-wrap them (S4, §34 OO3). Anything else failed before funding: SESSION_START_ERROR means nothing was funded;
      // the cause is in originalError.
      if (['SESSION_FUNDED_SETUP_FAILED', 'SESSION_ID_UNRESOLVED', 'SESSION_NOT_FUNDED', 'SESSION_FUNDING_UNCERTAIN'].includes(error?.code)) {
        throw error;
      }

      // Whether retrying may help is the cause's own verdict, when it gives one — nothing was funded, but an
      // unclassified failure is not assumed to pass (§19 Z14).
      const verdict = typeof error?.details?.retryable === 'boolean' ? error.details.retryable
        : typeof error?.retryable === 'boolean' ? error.retryable : undefined;
      throw new SDKError(
        `Failed to start session: ${error.message}`,
        'SESSION_START_ERROR',
        { originalError: error, ...(verdict !== undefined ? { retryable: verdict } : {}) }
      );
    }
  }

  /**
   * The one gate every prompt path appends its exchange through, so the opt-outs cannot be bypassed:
   * nothing is written when the session (`conversationLog: false`) or this prompt opted out.
   */
  private logExchange(sessionId: string, session: SessionState, options: PromptOptions | undefined, messages: Message[]): Promise<void> {
    if (session.conversationLog === false || options?.conversationLog === false) return Promise.resolve();
    // One write for the whole exchange, asked for at once (§27 HH1): the store appends a conversation's exchanges in
    // call order (§15 T4), never one's question without its answer — and one asked for before a sign-out lands.
    // Even a store that throws instead of rejecting only rejects here: a log failure never costs a paid reply (R2).
    try {
      return this.storageManager.appendMessages(sessionId, messages);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Register a session created OUTSIDE the SDK (vault / fiat flow: the service's
   * `POST /fiat/session` mints sessionId+jobId against vault deposits) in the
   * in-memory registry, so the WS submit paths (`submitLtx`, `submitTranscode`)
   * get past their `sessions.get(sessionId)` guard.
   *
   * In-memory ONLY — no S5 persistence and no network call, unlike
   * `registerDelegatedSession` (which also writes a chat-shaped conversation and
   * carries the FC1.6 delivery opt-in).
   *
   * Re-registration overwrites (plain `Map.set`), which makes re-seeding the same
   * session idempotent — but note it REPLACES any existing entry under that id,
   * discarding its `prompts`/`responses`/`checkpoints`/`totalTokens`. Session ids
   * come from a per-chain on-chain counter, so a collision means either a genuine
   * re-seed or two chains sharing an id.
   */
  registerExternalSession(config: ExternalSessionConfig): void {
    // Re-seeding replaces the record (prompts, tokens, lora); never under a running job (1.39.14, G8).
    this.refuseIfJobInFlight(String(config.sessionId));
    // The record may now name another node, so what its old node reported no longer applies (1.39.15).
    this.forgetSessionTransportFacts(String(config.sessionId));
    // The rule lives at the seam, not only in the two manager callers: this is a public
    // ISessionManager method. The WS derivation in acquireSessionTransport uses a ws(s):// value
    // VERBATIM — a bare `wss://host` opens at the node root, and a full `wss://host/v1/ws` works
    // only until the http base it must pair with (postSessionAuth) drifts — and it never converts
    // 'HTTPS://'. One http(s) base, normalised here, serves both. ⚠️ Breaking (1.38.6) for callers
    // that registered a full WS URL; declared on ISessionManager and in the consumer docs.
    const endpoint = normalizeNodeHttpUrl(config.endpoint);
    if (!endpoint) {
      throw new SDKError(
        `registerExternalSession: endpoint must be the node's plain http(s):// base (the nodeHttpUrl used for postSessionAuth), got: ${config.endpoint}`,
        'SESSION_ENDPOINT_INVALID',
      );
    }
    this.sessions.set(config.sessionId.toString(), {
      sessionId: config.sessionId,
      jobId: config.jobId,
      chainId: config.chainId,
      model: config.model,
      provider: config.hostAddress,
      endpoint,
      status: 'active',
      prompts: [],
      responses: [],
      checkpoints: [],
      totalTokens: 0,
      startTime: Date.now(),
      encryption: true,
      lora: config.lora,
      onServeBackError: config.onServeBackError,
    });
  }

  /**
   * FC1.6 session-auth delivery — POST the fiat service's authorisation object to
   * the node's `<nodeHttpUrl>/v1/session-auth` gate so the node will serve the
   * WebSocket to the authorised clientAddress.
   *
   * The SDK relays the authorisation verbatim; it never signs or validates the
   * `scheme`/`signature` contents (the node is the authority). Status handling:
   * 200 → delivered; 404 → tolerated (pre-FC1.6 node) as `{delivered:false}`;
   * 401 → throw (backend-auth key mismatch); 400/5xx/other → throw.
   *
   * @param nodeHttpUrl - The node's http(s) base URL (explicit; no wss→https derivation)
   * @param sessionId - Session id; a string must be decimal (validated client-side)
   * @param authorisation - The `{ scheme, signature, clientAddress }` from /fiat/session
   * @returns `{ delivered }` — true on 200, false on a tolerated 404
   * @throws SDKError SESSION_AUTH_BAD_URL / SESSION_AUTH_BAD_SESSION_ID / SESSION_AUTH_UNREACHABLE / SESSION_AUTH_REJECTED / SESSION_AUTH_FAILED
   */
  async postSessionAuth(
    nodeHttpUrl: string,
    sessionId: bigint | string,
    authorisation: SessionAuthorisation
  ): Promise<{ delivered: boolean }> {
    if (!/^https?:\/\//i.test(nodeHttpUrl)) {
      throw new SDKError(
        `Invalid nodeHttpUrl for session-auth (must be http(s)): ${nodeHttpUrl}`,
        'SESSION_AUTH_BAD_URL'
      );
    }

    // Normalise to a decimal string and validate uniformly — a negative bigint
    // (-5n → "-5") is rejected here, same as a non-decimal string, so the
    // fail-fast guard the node relies on is symmetric across both input types.
    const sessionIdStr = typeof sessionId === 'bigint' ? sessionId.toString() : sessionId;
    if (!/^\d+$/.test(sessionIdStr)) {
      throw new SDKError(
        `session-auth sessionId must be a non-negative decimal, got: ${String(sessionId)}`,
        'SESSION_AUTH_BAD_SESSION_ID'
      );
    }

    const url = `${nodeHttpUrl.replace(/\/+$/, '')}/v1/session-auth`;
    const body = JSON.stringify({
      sessionId: sessionIdStr,
      clientAddress: authorisation.clientAddress,
      scheme: authorisation.scheme,
      signature: authorisation.signature,
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch (cause) {
      throw new SDKError(
        `session-auth POST to ${url} failed — node unreachable`,
        'SESSION_AUTH_UNREACHABLE',
        { cause }
      );
    }

    if (response.status === 200) return { delivered: true };
    if (response.status === 404) return { delivered: false }; // tolerated: pre-FC1.6 node
    if (response.status === 401) {
      throw new SDKError(
        'session-auth rejected (401): signature did not recover to the node\'s configured backend-auth key',
        'SESSION_AUTH_REJECTED'
      );
    }
    throw new SDKError(
      `session-auth POST to ${url} returned unexpected status ${response.status}`,
      'SESSION_AUTH_FAILED',
      { status: response.status }
    );
  }

  /**
   * Register a session that was created externally (e.g., via delegated session creation).
   * This allows the SDK to track and use sessions created outside the normal startSession flow.
   *
   * FC1.6 opt-in: pass `authorisation` (+ required `nodeHttpUrl`) to deliver the
   * session-auth object to the node BEFORE any local state is written. When an
   * EncryptionManager is set, `authorisation.clientAddress` is cross-checked
   * (case-insensitive) against `getWsClientAddress()` first; a mismatch throws
   * before the POST. On 401 the session is NOT registered.
   *
   * The caller funded this session, so the SDK cannot refuse before money moves: call
   * `storageManager.assertConversationLogWritable()` BEFORE funding (it refuses an insecure origin, a browser
   * without Web Locks, a disconnected S5, or storage that failed to start — STORAGE_UNAVAILABLE), or pass
   * `conversationLog: false`. A log write that fails here
   * throws SESSION_FUNDED_SETUP_FAILED with the ids and `registered: true` (plan §14 S6).
   */
  async registerDelegatedSession(config: DelegatedSessionConfig): Promise<void> {
    const sessionId = config.sessionId;
    const sessionIdStr = sessionId.toString();

    // FC1.6 session-auth: deliver the authorisation to the node before any local
    // state is written (D5). This awaits the POST and throws on 401 so a rejected
    // session is never registered.
    if (config.authorisation) {
      if (!config.nodeHttpUrl) {
        throw new SDKError(
          'registerDelegatedSession: nodeHttpUrl is required when authorisation is provided',
          'SESSION_AUTH_BAD_URL'
        );
      }

      // Q6 cross-check: the authorised clientAddress must equal the address the
      // node will recover on the WS. Compare case-insensitively; surface BOTH
      // addresses (lowercased) — they are public identifiers a debugger needs first.
      if (this.encryptionManager) {
        const expected = this.encryptionManager.getWsClientAddress().toLowerCase();
        const received = config.authorisation.clientAddress.toLowerCase();
        if (expected !== received) {
          throw new SDKError(
            `session-auth clientAddress mismatch: expected ${expected} (WS client address) but authorisation carries ${received}`,
            'SESSION_AUTH_CLIENT_MISMATCH'
          );
        }
      }

      await this.postSessionAuth(config.nodeHttpUrl, sessionId, config.authorisation);
    }

    console.log(`[SessionManager] Registering delegated session ${sessionIdStr}`);
    this.forgetSessionTransportFacts(sessionIdStr);

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
      conversationLog: config.conversationLog,
      webSearch: config.webSearch,
      ragContext: config.ragConfig?.enabled
        ? { vectorDbId: config.ragConfig.vectorDbSessionId || `rag-${sessionIdStr}` }
        : undefined,
      // Seeded here too: this is the popup-free delegated path, which is how the UI opens
      // every chat. Threading only the external path would leave the primary one
      // silently adapter-less at the first re-init.
      lora: config.lora,
      onServeBackError: config.onServeBackError,
    };

    // Store in memory
    this.sessions.set(sessionIdStr, sessionState);

    // Persist to storage. The caller funded this session: a failure says so, with the ids (it stays registered).
    try {
      if (config.conversationLog !== false) await this.storageManager.storeConversation({
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
    } catch (cause: any) {
      throw fundedSetupFailed(sessionId, config.jobId, 'conversation-log', cause);
    }

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
    this.markMaySettle(sessionId);   // restored from storage: the node may have settled it (1.39.21)

    return session as SessionState;
  }

  /**
   * Send prompt in session with chain awareness
   */
  async sendPrompt(
    sessionId: bigint,
    prompt: string,
    options?: PromptOptions
  ): Promise<string> {
    if (!this.initialized) {
      throw new SDKError('SessionManager not initialized', 'SESSION_NOT_INITIALIZED');
    }

    const session = this.sessions.get(sessionId.toString());
    if (!session) {
      throw new SDKError('Session not found', 'SESSION_NOT_FOUND');
    }

    this.refuseIfNoLongerActive(sessionId.toString(), session);   // names a settled session's reason (1.39.22)
    const endpoint = this.requireEndpoint(session, sessionId);
    await this.refuseIfSettledOnChain(sessionId.toString(), session, { rest: true });   // 1.39.21 S2; REST: refused by the node only with session-settled-rest (1.39.23 R1)

    try {
      // The caller's prompt as given; the caller adds any RAG context (Milestone B D39: this sent the session id).
      const augmentedPrompt = prompt;

      // Add original prompt to session (not augmented)
      session.prompts.push(prompt);

      // Use REST API instead of WebSocket (as per node implementation)
      const httpUrl = SessionManager.nodeRestBase(endpoint);   // any endpoint form (1.39.23 review)

      // Call REST API for inference with augmented prompt
      const inferenceUrl = `${httpUrl}/v1/inference`;
      const requestBody = {
        model: session.model,
        prompt: augmentedPrompt,  // Use RAG-augmented prompt
        max_tokens: options?.maxTokens ?? LLM_MAX_TOKENS,  // Allow longer responses for poems, stories, etc.
        temperature: options?.temperature ?? 0.7,  // Add temperature for better responses
        // The node's InferenceRequest (handlers.rs): job_id is a u64 (a string fails to parse, 422) and session_id has no
        // camelCase alias; the settled refusal (409) and billing key on them (1.39.23 review)
        session_id: sessionId.toString(),
        job_id: Number(session.jobId),
        chain_id: session.chainId,
        ...(options?.thinking ? { thinking: options.thinking } : {}),   // as streamResponse sends it (1.39.23 review)
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
        this.refuseOnRestRefusal(sessionId.toString(), fetchResponse.status, errorText);   // 1.39.23 R2
        throw new Error(`Inference failed: ${fetchResponse.status} - ${errorText}`);
      }
      
      const result = await fetchResponse.json();
      
      // Try different possible response fields
      // The node's InferenceResponse carries the reply as `content` (handlers.rs); an empty reply is a reply (1.39.23 review)
      let response = result?.content;

      if (typeof response !== 'string') {
        console.error('Unexpected response format:', result);
        throw new Error('No response received from inference endpoint. Response: ' + JSON.stringify(result));
      }

      // Clean up repetitive responses (common issue with small models)
      response = this.cleanupRepetitiveText(response);

      // Add response to session
      session.responses.push(response);

      // Update storage without waiting: neither a failed nor a slow log write holds back the paid reply (R2, S6);
      // the conversation lock keeps concurrent appends in order.
      this.logExchange(sessionId.toString(), session, options, [
        { role: 'user', content: prompt, timestamp: Date.now() },
        { role: 'assistant', content: response, timestamp: Date.now() },
      ]).catch(err => console.warn('[SessionManager] Failed to store the exchange:', err));

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
      // The node's REST refusals reach the caller as themselves (1.39.23 R2)
      if (error?.code === 'SESSION_NOT_ACTIVE' || error?.code === 'SESSION_AUTH_DENIED') throw error;
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
    // rawQuery decides web search (1.39.2): refuse a non-string before anything is sent
    if (options?.rawQuery !== undefined && typeof options.rawQuery !== 'string') {
      throw new SDKError('options.rawQuery must be a string', 'INVALID_PARAMETER', { field: 'rawQuery' });
    }

    const sessionIdStr = sessionId.toString();
    let session = this.sessions.get(sessionIdStr);

    // If session not in memory, try to load from storage (handles SessionManager recreation). A read that fails
    // throws its own code (STORAGE_UNAVAILABLE, STORAGE_LOAD_ERROR with its verdict): a funded session is never
    // reported "not found" because its log could not be read (I2 — §21 BB12).
    if (!session && this.storageManager) {
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
        // Restored from its log: its earlier connections are gone, so the node may have settled it (1.39.21 S1)
        this.markMaySettle(sessionIdStr);
      }
    }

    // No log (none was kept, or none was written): the session cannot be resumed here
    if (!session) {
      throw new SDKError('Session not found in memory or storage', 'SESSION_NOT_FOUND');
    }

    this.refuseIfNoLongerActive(sessionIdStr, session);   // names a settled session's reason (1.39.22)
    // Before image routing, which swallows generateImage's errors into the LLM path.
    const endpoint = this.requireEndpoint(session, sessionId);
    await this.refuseIfSettledOnChain(sessionIdStr, session);   // 1.39.21 S2

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
        // The settled-session refusals are not an image failure: never fall back to the LLM on them (review round 2)
        const code = (imgErr as any)?.code;
        if (code === 'SESSION_NOT_ACTIVE' || code === 'SESSION_STATUS_UNREADABLE') throw imgErr;
        console.warn(`[SDK:sendPromptStreaming] Image generation failed, falling back to LLM:`, imgErr);
      }
    }

    try {
      // The caller's prompt as given; the caller adds any RAG context (Milestone B D39: this sent the session id).
      const augmentedPrompt = prompt;

      // Get WebSocket URL from endpoint
      const wsUrl = endpoint.includes('ws://') || endpoint.includes('wss://')
        ? endpoint 
        : endpoint.replace('http://', 'ws://').replace('https://', 'wss://') + '/v1/ws';

      // Force new WebSocket if session changed (old connection belongs to previous session)
      if (this.wsClient && this.wsSessionId && this.wsSessionId !== sessionIdStr) {
        this.markMaySettle(this.wsSessionId);   // its connection closes: the node may settle it (1.39.21 S1)
        try { await this.wsClient.disconnect(); } catch (_) { /* ignore */ }
        this.wsClient = undefined;
        this.wsSessionId = undefined;
        this.sessionKey = undefined;
        this.messageIndex = 0;
      }

      // Initialize WebSocket client if not already connected
      if (!this.wsClient || !this.wsClient.isConnected()) {
        // A dead shared client being replaced: its session's connection closed (1.39.21 S1)
        if (this.wsClient) this.markMaySettle(this.wsSessionId);
        this.wsClient = new WebSocketClient(wsUrl, { chainId: session.chainId });
        // Owned from creation, so ending another session never closes it while it connects (Milestone B review M3)
        this.wsSessionId = sessionIdStr;
        this.watchConnectionIdentity(this.wsClient);
        await this.wsClient.connect();

        // Set up global RAG message handlers
        this._setupRAGMessageHandlers();

        // Set up global web search message handlers (Phase 5.2-5.3)
        this._setupWebSearchMessageHandlers();

        // Set up global session status handler (Phase 14.3)
        this._setupSessionStatusHandler();
      }

      // Again after the socket setup, which may have replaced a dropped connection (1.39.21 S1/S2)
      await this.refuseIfSettledOnChain(sessionIdStr, session);

      // Add original prompt to session (not augmented) — only once it will be sent (settled-guard review round 7)
      session.prompts.push(prompt);

      // Non-blocking host health check (fires callback asynchronously)
      if (options?.onHostHealthWarning && session.endpoint) {
        this._checkHostHealth(session.endpoint).then(health => {
          session.lastHostHealth = health;
          if (health.status !== 'healthy') {
            options.onHostHealthWarning!(health);
          }
        }).catch(() => {});
      }

      // Re-init before each prompt, except where the node keeps the key for the connection (Milestone B D38): a
      // re-init mid-stream replaces the key a reply on this session is still decrypted with.
      if (session.encryption && this.encryptionManager) {
        if (!(await this.sharedConnectionHoldsKey(sessionIdStr))) {
          // Send encrypted session init
          const config: ExtendedSessionConfig = {
            chainId: session.chainId,
            host: session.provider,
            modelId: session.model,
            endpoint: session.endpoint,
            paymentMethod: 'deposit',
            encryption: true,
            lora: session.lora,          // E.3: a re-init MUST re-send it
            onServeBackError: session.onServeBackError,
          };
          await this.sendEncryptedInit(this.wsClient, config, sessionId, session.jobId);
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

      // Collect full response
      let fullResponse = '';

      // Web search, decided on the user's text — never on the RAG documents (1.39.2)
      const search = resolveWebSearch(session.webSearch, prompt, options);

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

          this.refuseIfNoLongerActive(sessionIdStr, session);   // 1.39.21: the session may have been found settled since the gate (review round 4)
          response = await new Promise<string>((resolve, reject) => {
            // Use sliding timeout window - resets on each chunk received
            // Initial timeout is longer (180s) for cold start scenarios (model loading into GPU)
            // Once streaming starts, the sliding window uses 60s between chunks
            let timeout = setTimeout(() => {
              reject(new SDKError('Encrypted response timeout', 'RESPONSE_TIMEOUT'));
              // A lora session's first prompt can queue behind a 300 s stage (E.3), so the
              // allowance clears the staging budget as well as the cold start. Unchanged at
              // 180 s for every non-lora session.
            }, firstResponseTimeoutMs(180000, this.loraSessionActive));

            // Guard against double resolution (mobile browser race condition fix)
            let isResolved = false;
            let safetyTimeout: ReturnType<typeof setTimeout> | undefined;
            const safeResolve = (value: string) => {
              if (!isResolved) {
                isResolved = true;
                clearTimeout(timeout);
                if (safetyTimeout) clearTimeout(safetyTimeout);
                unsubscribe();
                unregisterWaiter();
                resolve(value);
              }
            };
            const safeReject = (err: Error) => {
              if (!isResolved) {
                isResolved = true;
                clearTimeout(timeout);
                if (safetyTimeout) clearTimeout(safetyTimeout);
                unsubscribe();
                unregisterWaiter();
                reject(err);
              }
            };

            // Fail fast if the connection is replaced while this response is
            // outstanding. Without this the request waits out the full
            // first-response budget (480 s with a lora attached) on an outcome
            // already known the moment the socket changed identity.
            const unregisterWaiter = this.registerEncryptedWaiter(safeReject);

            let encChunkCount = 0;
            // v1.13.4: deferred resolution — wait for stream_end after encrypted_response

            const unsubscribe = this.wsClient!.onMessage(async (data: any) => {
              // Skip processing if already resolved
              if (isResolved) return;

              // Another flow's frames on this shared socket are not ours to
              // decrypt or to fail on: a foreign encrypted frame decrypted
              // with this session's key is a guaranteed aead failure landing
              // in this prompt's promise.
              if (!this.frameTargetsSession(data, sessionIdStr)) return;

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
                } else if (data.code === 'SESSION_AUTH_DENIED') {
                  // Node 8.54.0 vault hosts: the connection's init did not pass the vault gate; nothing billed.
                  // The code must reach the caller unwrapped so it can post the authorisation and retry.
                  safeReject(new SDKError(data.message || 'session authorisation denied', 'SESSION_AUTH_DENIED', { nodeCode: data.code, sessionId: data.session_id }));
                } else {
                  safeReject(new SDKError(data.message || 'Request failed', 'REQUEST_ERROR', { nodeCode: data.code }));
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

            // Send encrypted message with web search options, images, and thinking
            this.sendEncryptedMessage(sessionIdStr, prompt, {
              webSearch: search.enabled,
              maxSearches: search.maxSearches,
              searchQueries: search.queries
            }, options?.images, options?.thinking, { temperature: options?.temperature, maxTokens: options?.maxTokens }).catch((err) => {
              console.error('[SessionManager] Failed to send encrypted message:', err);
              reject(err);
            });
          });

        } else {
          // Plaintext streaming mode
          let ptChunkCount = 0;

          this.refuseIfNoLongerActive(sessionIdStr, session);   // before the listener, so a refusal leaves none (round 5)
          const unsubscribe = this.wsClient.onMessage(async (data: any) => {

            if (data.type === 'stream_chunk' && data.content) {
              ptChunkCount++;
              onToken(data.content);
              fullResponse += data.content;
            } else if (data.type === 'response') {
              fullResponse = data.content || fullResponse;
            } else if (data.type === 'stream_end') {
              this._processStreamEnd(data, ptChunkCount, session, options);
            } else if (data.type === 'session_completed') {
            }
          });

          // Send plaintext message (only if session explicitly opted out of encryption)
          const plaintextRequest: any = {
            model: session.model,
            prompt: augmentedPrompt,  // Use RAG-augmented prompt
            max_tokens: options?.maxTokens ?? LLM_MAX_TOKENS,  // Support comprehensive responses from large models
            temperature: options?.temperature ?? 0.7,
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
            web_search: search.enabled,
            max_searches: search.maxSearches,
            search_queries: search.queries,
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
        this.logExchange(sessionIdStr, session, options, [
          { role: 'user', content: prompt, timestamp: Date.now(), ...(Object.keys(userMsgMeta1).length > 0 ? { metadata: userMsgMeta1 } : {}) },
          { role: 'assistant', content: finalResponse, timestamp: Date.now() },
        ]).catch(err => console.warn('[SessionManager] Failed to store the exchange:', err));

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

          // Send encrypted message with web search options, images, and thinking
          this.refuseIfNoLongerActive(sessionIdStr, session);   // 1.39.21: the session may have been found settled since the gate (review round 4)
          await this.sendEncryptedMessage(sessionIdStr, prompt, {
            webSearch: search.enabled,
            maxSearches: search.maxSearches,
            searchQueries: search.queries
          }, options?.images, options?.thinking, { temperature: options?.temperature, maxTokens: options?.maxTokens });

          // Wait for encrypted response (non-streaming) - MUST accumulate chunks!
          let accumulatedResponse = '';  // Accumulate chunks even in non-streaming mode
          response = await new Promise<string>((resolve, reject) => {
            // Use sliding timeout window - resets on each chunk received
            // Initial timeout is longer (180s) for cold start scenarios (model loading into GPU)
            // Once streaming starts, the sliding window uses 60s between chunks
            let timeout = setTimeout(() => {
              reject(new SDKError('Encrypted response timeout', 'RESPONSE_TIMEOUT'));
              // A lora session's first prompt can queue behind a 300 s stage (E.3), so the
              // allowance clears the staging budget as well as the cold start. Unchanged at
              // 180 s for every non-lora session.
            }, firstResponseTimeoutMs(180000, this.loraSessionActive));

            // Guard against double resolution (mobile browser race condition fix)
            let isResolved = false;
            const safeResolve = (value: string) => {
              if (!isResolved) {
                isResolved = true;
                clearTimeout(timeout);
                unsubscribe();
                unregisterWaiterNs();
                resolve(value);
              }
            };
            const safeReject = (err: Error) => {
              if (!isResolved) {
                isResolved = true;
                clearTimeout(timeout);
                unsubscribe();
                unregisterWaiterNs();
                reject(err);
              }
            };

            // Fail fast if the connection is replaced while this response is
            // outstanding — same contract as the streaming path.
            const unregisterWaiterNs = this.registerEncryptedWaiter(safeReject);

            let encNsChunkCount = 0;
            let safetyTimeoutNs: ReturnType<typeof setTimeout> | undefined;

            const unsubscribe = this.wsClient!.onMessage(async (data: any) => {
              // Skip processing if already resolved
              if (isResolved) return;

              // Foreign frames are not ours to decrypt or to fail on.
              if (!this.frameTargetsSession(data, sessionIdStr)) return;

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
                } else if (data.code === 'SESSION_AUTH_DENIED') {
                  // Node 8.54.0 vault hosts: the connection's init did not pass the vault gate; nothing billed.
                  // The code must reach the caller unwrapped so it can post the authorisation and retry.
                  safeReject(new SDKError(data.message || 'session authorisation denied', 'SESSION_AUTH_DENIED', { nodeCode: data.code, sessionId: data.session_id }));
                } else {
                  safeReject(new SDKError(data.message || 'Request failed', 'REQUEST_ERROR', { nodeCode: data.code }));
                }
              }
            });
          });
        } else {
          // Send plaintext message (only if session explicitly opted out of encryption)
          const plaintextRequestNonStream: any = {
            model: session.model,
            prompt: augmentedPrompt,  // Use RAG-augmented prompt
            max_tokens: options?.maxTokens ?? LLM_MAX_TOKENS,  // Support comprehensive responses from large models
            temperature: options?.temperature ?? 0.7,
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
          this.refuseIfNoLongerActive(sessionIdStr, session);   // 1.39.21: the session may have been found settled since the gate (review round 4)
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
            web_search: search.enabled,
            max_searches: search.maxSearches,
            search_queries: search.queries,
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
        this.logExchange(sessionIdStr, session, options, [
          { role: 'user', content: prompt, timestamp: Date.now(), ...(Object.keys(userMsgMeta2).length > 0 ? { metadata: userMsgMeta2 } : {}) },
          { role: 'assistant', content: response, timestamp: Date.now() },
        ]).catch(err => console.warn('[SessionManager] Failed to store the exchange:', err));

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
      if (error?.code === 'SESSION_AUTH_DENIED') throw error;   // 8.54.0 vault gate: the caller branches on this code
      // 1.39.21: the settled-session refusals reach the caller as themselves (open a new session / retry the read)
      if (error?.code === 'SESSION_NOT_ACTIVE' || error?.code === 'SESSION_STATUS_UNREADABLE') throw error;
      // The node's SESSION_SETTLED refusal (1.39.22 N2): the encrypted paths reject REQUEST_ERROR with its nodeCode, the
      // plaintext path WS_REQUEST_ERROR carrying the node frame
      if (SessionManager.isSettledRefusal(error)) {
        this.markSettledByNode(sessionIdStr, 'refused');
        throw this.settledByNodeError(sessionIdStr, error?.details?.originalError);
      }
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
   * Search the web through the session's host: REST `POST /v1/search` on its endpoint, with the session's chain (1.39.23,
   * owner 2026-11-08: the node has no WebSocket `searchRequest` handler and will not get one). It bills no session, so it
   * is not gated on the session's settled state; the session only names the host. Same answer as `searchDirect`.
   *
   * @param sessionId - A session this manager knows (its endpoint is the host searched)
   * @param query - Search query (1-500 characters)
   * @param numResults - Number of results to return (1-20, default 10)
   * @throws SDKError SESSION_NOT_FOUND / SESSION_ENDPOINT_MISSING; WebSearchError as `searchDirect`
   *
   * @example
   * ```typescript
   * const results = await sessionManager.webSearch(sessionId, 'latest NVIDIA GPU specs', 5);
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
    // Any form a session's endpoint takes (http(s), ws(s), a trailing /v1/ws)
    const httpBase = SessionManager.nodeRestBase(this.requireEndpoint(session, sessionId));
    return this.searchDirect(httpBase, query, { numResults, chainId: session.chainId });
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
    if (!query || query.trim().length === 0 || query.length > 500) {
      throw new WebSearchError('Query must be 1-500 characters', 'invalid_query');
    }

    const requestId = `search-${Date.now()}`;
    const chainId = options.chainId || this.chainId;

    try {
      const response = await fetch(`${SessionManager.nodeRestBase(hostUrl)}/v1/search`, {
        signal: AbortSignal.timeout(30_000),   // the WebSocket path's 30 s, kept (1.39.23)
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
          retryAfter ? `Rate limited. Retry after ${retryAfter}s` : 'Rate limited',
          'rate_limited',
          retryAfter ? parseInt(retryAfter, 10) : undefined
        );
      }

      if (response.status === 503) {
        throw new WebSearchError('Web search disabled on host', 'search_disabled');
      }

      if (response.status === 400) {   // the node's own query validation (1.39.23 review)
        throw new WebSearchError(`Search refused: ${response.statusText}`, 'invalid_query');
      }

      if (!response.ok) {
        throw new WebSearchError(`Search failed: ${response.statusText}`, 'provider_error');
      }

      return await response.json();
    } catch (error) {
      if (error instanceof WebSearchError) {
        throw error;
      }
      if ((error as Error)?.name === 'TimeoutError') {   // the 30 s signal (1.39.23 review)
        throw new WebSearchError('Search timeout', 'timeout');
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

    // If session not in memory, try to load from storage (handles page refresh case). Completing never depends on
    // the log (§21 BB12): a read that fails is logged and the completion goes to the contract regardless.
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
            // A failed completion leaves this entry active in memory, and later calls skip the restore that
            // would supply the endpoint — so carry it here too (1.39.13 review; no localhost fallback after it).
            endpoint: conversation.metadata.endpoint,
            status: conversation.metadata.status || 'active',
            prompts: [],
            responses: [],
            checkpoints: [],
            totalTokens: conversation.metadata.totalTokens || 0,
            startTime: conversation.metadata.startTime || Date.now()
          } as SessionState;

          // Add to memory for this session
          this.sessions.set(sessionIdStr, session);
          // (A completion that then fails marks it below: the node may have settled it first.)
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
      
      // Only this session's shared-socket state (Milestone B D32)
      await this.releaseSharedSocketFor(sessionIdStr);

      // Update storage (one locked load-patch-save, so an append still in flight is not overwritten).
      // Non-blocking like endSession's: the session has settled on-chain; the log must not turn that into a throw.
      if (sessionAfterTx?.conversationLog !== false) {
        this.storageManager.updateConversationMetadata(sessionIdStr, {
          status: 'completed',
          totalTokens,
          endTime: sessionAfterTx?.endTime || Date.now(),
        }).catch(err => console.warn('[SessionManager] Failed to persist session completion:', err));
      }

      return txHash;
    } catch (error: any) {
      // A completion that failed may have failed because the node settled the session first (1.39.21 review round 1)
      this.markMaySettle(sessionIdStr);
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
      // Ended first, so a prompt racing the close below is refused instead of opening a socket on an ended session
      const session = this.sessions.get(sessionIdStr);
      if (session) {
        session.status = 'ended';
        session.endTime = Date.now();
      }

      // Only this session's shared-socket state (Milestone B D32)
      await this.releaseSharedSocketFor(sessionIdStr);

      // Update storage to mark session as ended (non-blocking for fast session teardown)
      if (session?.conversationLog !== false) {
        this.storageManager.updateConversationMetadata(sessionIdStr, { status: 'ended', endTime: Date.now() })
          .catch(err => console.warn('[SessionManager] Failed to persist session end status:', err));
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
   * What ending or completing `sessionId` releases (Milestone B D32): only what is its own. Its key entry always goes.
   * The shared socket, with its handlers and waiters (they belong to the socket), is closed only when this session owns
   * it. After the awaited close the shared fields are cleared only if they still describe the socket
   * that was closed: another session may have installed its own meanwhile.
   */
  private async releaseSharedSocketFor(sessionId: string): Promise<void> {
    this.sessionCrypto.delete(sessionId);
    this.holdsKeyProbeFailedAt.delete(sessionId);
    this.maySettle.delete(sessionId);   // ended or completed: refused by its status from now on
    this.lastGatedAt.delete(sessionId);
    const socket = this.wsClient;
    // Only the owner: every creation site assigns the owner with the client, so a socket another session is still
    // connecting is never closed here (review M3).
    if (this.wsSessionId !== sessionId) return;
    if (!socket) {
      this.wsSessionId = undefined;
      this.sessionKey = undefined;
      this.messageIndex = 0;
      this.sessionKeyGeneration = undefined;
      this.sessionKeyClient = undefined;
      return;
    }

    this.ragHandlerUnsubscribe?.();
    this.ragHandlerUnsubscribe = undefined;
    this.searchHandlerUnsubscribe?.();
    this.searchHandlerUnsubscribe = undefined;
    this.sessionStatusUnsubscribe?.();
    this.sessionStatusUnsubscribe = undefined;
    for (const waiters of [this.pendingRequests, this.pendingSearches] as Map<string, any>[]) {
      for (const pending of waiters.values()) {
        clearTimeout(pending.timeoutId);
        pending.reject(new SDKError('Session ended', 'SESSION_ENDED'));
      }
      waiters.clear();
    }

    try {
      await socket.disconnect();
    } catch (_) { /* ignore disconnect errors */ }

    if (this.wsClient === socket) {
      this.wsClient = undefined;
      this.wsSessionId = undefined;
      // The next session sends a fresh session_init + ECDH
      this.sessionKey = undefined;
      this.messageIndex = 0;
      this.sessionKeyGeneration = undefined;
      this.sessionKeyClient = undefined;
      // The serve-back listener and its state belong to this socket's init (review m4)
      this.serveBackUnsubscribe?.();
      this.serveBackUnsubscribe = undefined;
      this.serveBackError = null;
      this.loraSessionActive = false;
    }
  }

  /**
   * Send encrypted session initialization (Phase 4.1)
   * @private
   */
  private sendEncryptedInit(
    ws: WebSocketClient,
    config: ExtendedSessionConfig,
    sessionId: bigint,
    jobId: bigint,
    scope: 'shared' | 'dedicated' = 'shared'
  ): Promise<Uint8Array> {
    // A dedicated socket carries only its own ack and its init touches no shared state (E1), so
    // there is nothing to serialise — and queuing would make every creator wait behind the others' acks.
    if (scope === 'dedicated') return this.sendEncryptedInitInner(ws, config, sessionId, jobId, scope);
    // Serialize handshakes: two concurrent inits interleaving their
    // mint->send->ack sequences is how one flow's key ends up attributed to
    // another flow's ack. The chain never rejects (each link swallows), while
    // the caller still sees its own link's outcome.
    const run = this.initChain.then(() =>
      this.sendEncryptedInitInner(ws, config, sessionId, jobId, scope)
    ).catch((err) => {
      // A failed shared init has already put its key in the shared fields, a key the node never acked. Unbind it from
      // the connection so the next operation inits again instead of encrypting under it (Milestone B round 4).
      if (ws === this.wsClient) {
        this.sessionKeyGeneration = undefined;
        this.sessionKeyClient = undefined;
      }
      throw err;
    });
    this.initChain = run.then(() => undefined, () => undefined);
    return run;
  }

  /**
   * `scope: 'dedicated'` (a per-job socket) reads and writes only this call's state: the key is
   * returned, never stored in the shared fields or `sessionCrypto`, and the shared serve-back
   * listener and lora flag are left alone (IMPLEMENTATION-TRANSPORT-ISOLATION E1).
   */
  private async sendEncryptedInitInner(
    ws: WebSocketClient,
    config: ExtendedSessionConfig,
    sessionId: bigint,
    jobId: bigint,
    scope: 'shared' | 'dedicated'
  ): Promise<Uint8Array> {
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
    const sessionKey = crypto.getRandomValues(new Uint8Array(32));
    const sessionKeyHex = bytesToHex(sessionKey);
    if (scope === 'shared') {
      this.sessionKey = sessionKey;
      this.messageIndex = 0;
      // Authoritative per-session entry: frames stamped with this session id are
      // encrypted/decrypted with THIS key, whatever later inits do to the legacy
      // shared fields.
      this.sessionCrypto.set(sessionId.toString(), { key: sessionKey, messageIndex: 0 });
    }
    console.warn(`[SDK:encryptedInit:4] Generated ${scope} session key, messageIndex reset to 0`);
    console.warn(`[SDK:wire] mint session=${sessionId} fp=${this.wireFp(sessionKey)} gen=${ws.getConnectionGeneration?.() ?? '-'}`);

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

    // Training M0 serve-back (E.2). Built field-by-field so no serialiser can touch the key
    // strings: a camelCase pass turns `manifestCID` into `manifestCid`, which fails the WHOLE
    // init parse as DECRYPTION_FAILED — deliberately, since silently dropping the field would
    // serve base-model output on a session the customer is paying to run their fine-tune.
    // Record the adapter on the SESSION, not just in this call's config. Every other init site
    // reconstructs its config from SessionState, so this is the one place that makes a re-init
    // able to re-send it. Found by the UI integrator: the field was reachable only by calling
    // this private method directly, which is exactly what the tests were doing.
    const sessionState = this.sessions.get(String(sessionId));
    if (sessionState && config.lora) sessionState.lora = config.lora;
    if (sessionState && config.onServeBackError) sessionState.onServeBackError = config.onServeBackError;

    if (scope === 'shared') {
      this.serveBackError = null;
      this.serveBackUnsubscribe?.();          // a re-init REPLACES the listener, never adds one
      this.serveBackUnsubscribe = undefined;
      this.loraSessionActive = config.lora !== undefined;
    }
    if (config.lora) {
      initPayload.lora = buildLoraSessionField(config.lora);
    }

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
        // Acks and errors carry session_id (node API.md:2059). One stamped for
        // a different session belongs to another flow on this socket — treating
        // it as ours is how an init "completes" without the node ever having
        // processed it.
        if ((data.type === 'session_init_ack' || data.type === 'error') &&
            !this.frameTargetsSession(data, sessionId.toString())) {
          console.warn(`[SDK:wire] ack session=${data.session_id} ignored (waiting=${sessionId})`);
          return;
        }
        if (data.type === 'session_init_ack') {
          console.warn(`[SDK:encryptedInit:11] Got session_init_ack - init complete`);
          clearTimeout(timeout);
          unsubscribe();
          // Bind the key's lifetime to the connection that carried the init. The
          // node registered it against this connection; a later one has no
          // session for it.
          if (ws === this.wsClient) {
            this.sessionKeyGeneration = ws.getConnectionGeneration();
            this.sessionKeyClient = ws;
          }
          resolve();
        } else if (data.type === 'error') {
          console.error(`[SDK:encryptedInit:11b] Got error: ${data.message}`);
          clearTimeout(timeout);
          unsubscribe();
          // The node's own code travels with it (Milestone B D33), as REQUEST_ERROR's does.
          reject(new SDKError(data.message || 'Session init failed', 'SESSION_INIT_ERROR', { nodeCode: data.code, sessionId: sessionId.toString() }));
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

    // E.3: THE ACK MEANS ACCEPTED, NOT READY. Staging runs AFTER the ack — it has to, since
    // an adapter can be hundreds of MB and blocking the handshake on the fetch overruns the
    // 30 s init timeout above. So `LORA_STAGING_FAILED` arrives post-ack and UNCORRELATED,
    // by which time the ack handler has already unsubscribed and the frame lands on nobody.
    // Without this listener the failure is SILENT and the session answers from the base
    // model. Installed only for lora sessions, so non-lora behaviour is unchanged.
    if (config.lora) {
      // A dedicated socket's listener lives and dies with that socket; only the shared one is tracked.
      const unsubscribe = ws.onMessage((data: any) => {
        const error = toServeBackError(data);
        if (!error) return;
        this.serveBackError = error;
        config.onServeBackError?.(error);
      });
      if (scope === 'shared') this.serveBackUnsubscribe = unsubscribe;
    }
    return sessionKey;
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
   * @param thinking - Optional per-request thinking/reasoning mode
   * @param sampling - Optional per-request sampling overrides ({ temperature, maxTokens })
   * @private
   */
  private async sendEncryptedMessage(
    sessionId: string,
    message: string,
    webSearchOptions?: {
      webSearch: boolean;
      maxSearches: number;
      searchQueries: string[] | null;
    },
    images?: ImageAttachment[],
    thinking?: import('../types').ThinkingMode,
    sampling?: { temperature?: number; maxTokens?: number }
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

    // The frame's target is the session this call was made FOR — never derived
    // by scanning for "the" active session. With two registered active sessions
    // (e.g. a stalled setup that completed on-chain after queued wallet
    // approvals and was abandoned), a first-active scan stamps the zombie's id
    // on a frame encrypted under the real session's key, and the node rightly
    // rejects it: that connection's key is registered for the other session.
    const currentSession = this.sessions.get(sessionId);
    if (!currentSession) {
      throw new SDKError(
        `Session ${sessionId} not found for encrypted messaging`,
        'SESSION_NOT_FOUND'
      );
    }

    try {
      // Build structured JSON payload (node v8.15.3+)
      const structuredPayload: any = {
        prompt: message,
        model: currentSession.model,
        max_tokens: sampling?.maxTokens ?? LLM_MAX_TOKENS,
        temperature: sampling?.temperature ?? 0.7,
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

      // Encrypt with the key of the session this frame is STAMPED for, and
      // advance that session's own replay counter. Using the legacy shared
      // fields here meant the stamp and the key could name different sessions
      // whenever another flow inited in between.
      const outSessionId = sessionId;
      const scoped = this.sessionCrypto.get(outSessionId);
      const encryptKey = scoped?.key ?? this.sessionKey;
      const outIndex = scoped ? scoped.messageIndex++ : this.messageIndex++;
      console.warn(`[SDK:wire] encrypt session=${outSessionId} idx=${outIndex} fp=${this.wireFp(encryptKey)} src=${scoped ? 'scoped' : 'legacy'}`);
      const payload = this.encryptionManager.encryptMessage(
        encryptKey,
        JSON.stringify(structuredPayload),
        outIndex
      );

      // Wrap payload with message structure (per docs lines 498-508)
      // Use sendWithoutResponse to avoid conflicting handlers (v1.3.28 fix)
      const messageToSend: any = {
        type: 'encrypted_message',
        session_id: outSessionId,
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
    if (!this.sessionKey && this.sessionCrypto.size === 0) {
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

    // The frame names its session (node API.md:2087); use THAT session's key.
    // The legacy shared field holds whichever session inited most recently,
    // which is not necessarily the session this frame belongs to.
    const frameSessionId = encryptedMessage.session_id !== undefined && encryptedMessage.session_id !== null
      ? String(encryptedMessage.session_id)
      : undefined;
    const scoped = frameSessionId ? this.sessionCrypto.get(frameSessionId) : undefined;
    const decryptKey = scoped?.key ?? this.sessionKey;
    if (!decryptKey) {
      throw new SDKError(
        `No session key for session ${frameSessionId ?? '(unstamped frame)'}`,
        'SESSION_KEY_NOT_AVAILABLE'
      );
    }

    try {
      // Extract payload from message (per docs lines 514-527 for encrypted_chunk)
      // Message structure: { type, session_id, id, payload: { ciphertextHex, nonceHex, aadHex } }
      const payload = encryptedMessage.payload || encryptedMessage;

      // Decrypt message with session key
      const plaintext = this.encryptionManager.decryptMessage(
        decryptKey,
        payload
      );

      const okFp = this.wireFp(decryptKey);
      if (!this.wireOkLogged.has(okFp)) {
        this.wireOkLogged.add(okFp);
        console.warn(`[SDK:wire] decrypt frame=${encryptedMessage.type} session=${frameSessionId ?? '-'} fp=${okFp} src=${scoped ? 'scoped' : 'legacy'} -> ok (further ok-decrypts under this key not logged)`);
      }
      return plaintext;
    } catch (error: any) {
      console.warn(`[SDK:wire] decrypt frame=${encryptedMessage.type} session=${frameSessionId ?? '-'} fp=${this.wireFp(decryptKey)} src=${scoped ? 'scoped' : 'legacy'} -> FAIL ${error.message}`);
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
      // A dead shared client being replaced: its session's connection closed (1.39.21 S1)
      if (this.wsClient) this.markMaySettle(this.wsSessionId);
      this.wsClient = new WebSocketClient(`wss://${session.provider}/ws`);
      this.wsSessionId = sessionId.toString();   // owned from creation (Milestone B review M3)
      this.watchConnectionIdentity(this.wsClient);
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
      this.markMaySettle(this.wsSessionId);   // its connection closes (1.39.21)
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

    this.refuseIfNoLongerActive(sessionId.toString(), session);   // names a settled session's reason (1.39.22)
    const endpoint = this.requireEndpoint(session, sessionId);
    await this.refuseIfSettledOnChain(sessionId.toString(), session, { rest: true });   // 1.39.21 S2; REST: refused by the node only with session-settled-rest (1.39.23 R1)

    try {
      // Add prompt to session
      session.prompts.push(prompt);

      // For now, use REST API and simulate streaming
      const httpUrl = SessionManager.nodeRestBase(endpoint);   // any endpoint form (1.39.23 review)
      
      // Call REST API for inference
      const inferenceUrl = `${httpUrl}/v1/inference`;
      const requestBody = {
        model: session.model,
        prompt: prompt,
        max_tokens: options?.maxTokens ?? LLM_MAX_TOKENS,  // Allow longer responses for poems, stories, etc.
        temperature: options?.temperature ?? 0.7,  // Add temperature for better responses
        // The node's InferenceRequest (handlers.rs): job_id is a u64 (a string fails to parse, 422) and session_id has no
        // camelCase alias; the settled refusal (409) and billing key on them (1.39.23 review)
        session_id: sessionId.toString(),
        job_id: Number(session.jobId),
        chain_id: session.chainId,
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
        this.refuseOnRestRefusal(sessionId.toString(), fetchResponse.status, errorText);   // 1.39.23 R2
        throw new Error(`Inference failed: ${fetchResponse.status} - ${errorText}`);
      }
      
      const result = await fetchResponse.json();
      // The node's InferenceResponse carries the reply as `content` (handlers.rs) (1.39.23 review: this read `response`)
      const fullResponse = result?.content;

      if (typeof fullResponse !== 'string') {
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

      // Update storage without waiting (R2, S6)
      this.logExchange(sessionId.toString(), session, options, [
        { role: 'user', content: prompt, timestamp: Date.now() },
        { role: 'assistant', content: fullResponse, timestamp: Date.now() },
      ]).catch(err => console.warn('[SessionManager] Failed to store the exchange:', err));
    } catch (error: any) {
      // The node's REST refusals reach the caller as themselves (1.39.23 R2)
      if (error?.code === 'SESSION_NOT_ACTIVE' || error?.code === 'SESSION_AUTH_DENIED') throw error;
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
    this.maySettle.clear();   // no sessions left to gate
    this.settledOnChain.clear();
    this.settledByNode.clear();
    this.lastGatedAt.clear();
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

    this.refuseIfNoLongerActive(sessionId, session);   // names a settled session's reason (1.39.22)

    const endpoint = this.requireEndpoint(session, sessionId);
    const wsUrl = endpoint.includes('ws://') || endpoint.includes('wss://')
      ? endpoint
      : endpoint.replace('http://', 'ws://').replace('https://', 'wss://') + '/v1/ws';

    // 2. Force new WebSocket if session changed (old connection belongs to previous session)
    if (this.wsClient && this.wsSessionId && this.wsSessionId !== sessionId) {
      this.markMaySettle(this.wsSessionId);   // its connection closes: the node may settle it (1.39.21 S1)
      try { await this.wsClient.disconnect(); } catch (_) { /* ignore */ }
      this.wsClient = undefined;
      this.wsSessionId = undefined;
      this.sessionKey = undefined;
      this.messageIndex = 0;
    }

    if (!this.wsClient || !this.wsClient.isConnected()) {
      // A dead shared client being replaced: its session's connection closed (1.39.21 S1)
      if (this.wsClient) this.markMaySettle(this.wsSessionId);
      this.wsClient = new WebSocketClient(wsUrl, { chainId: session.chainId });
      this.wsSessionId = sessionId;   // owned from creation (Milestone B review M3)
      this.watchConnectionIdentity(this.wsClient);
      await this.wsClient.connect();

      // Set up global RAG message handlers
      this._setupRAGMessageHandlers();

      // Set up global web search message handlers (Phase 5.2-5.3)
      this._setupWebSearchMessageHandlers();

      // Set up global session status handler (Phase 14.3)
      this._setupSessionStatusHandler();
    }

    await this.refuseIfSettledOnChain(sessionId, session);   // 1.39.21 S2, after the socket setup (it may have replaced a dropped connection)

    // Re-init before RAG operations, except where the node keeps the key for the connection (Milestone B D38)
    if (session.encryption && this.encryptionManager) {
      if (!(await this.sharedConnectionHoldsKey(sessionId))) {
        const config: ExtendedSessionConfig = {
          chainId: session.chainId,
          host: session.provider,
          modelId: session.model,
          endpoint: session.endpoint,
          paymentMethod: 'deposit',
          encryption: true,
          lora: session.lora,          // E.3: a re-init MUST re-send it, or the node keeps refusing
          onServeBackError: session.onServeBackError,
        };
        await this.sendEncryptedInit(this.wsClient, config, session.sessionId, session.jobId);
      }
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
        this.refuseIfNoLongerActive(sessionId, session);   // 1.39.21: the session may have been found settled since the gate (review round 4)
      } catch (refusal: any) {
        // Batches already accepted landed: report them, as a malformed ack does (settled-guard review round 5)
        if (totalUploaded > 0) session.ragContext = session.ragContext || { vectorDbId: `vectors-${sessionId}` };
        refusal.details = { ...refusal.details, batch: batchIndex + 1, uploadedSoFar: totalUploaded, rejectedSoFar: totalRejected, errorsSoFar: allErrors };
        throw refusal;
      }
      try {
        // Send message and wait for response (with 30s timeout)
        const response = await this._sendRAGRequest(requestId, message, 30000);

        // Accumulate the node's own counts (validated in _handleUploadVectorsResponse, Milestone B D36)
        totalUploaded += response.uploaded;
        totalRejected += response.rejected;
        allErrors.push(...response.errors);
      } catch (error: any) {
        // A malformed ack is a protocol fault, not a batch outcome: fail fast instead of reporting a count, carrying what
        // the earlier batches confirmed (review m3).
        if (error?.code === 'UPLOAD_RESPONSE_MALFORMED' || (error?.code === 'SESSION_NOT_ACTIVE' && error?.details?.reason === 'SETTLED_BY_NODE')) {
          if (totalUploaded > 0) session.ragContext = session.ragContext || { vectorDbId: `vectors-${sessionId}` };
          error.details = { ...error.details, batch: batchIndex + 1, uploadedSoFar: totalUploaded, rejectedSoFar: totalRejected, errorsSoFar: allErrors };
          throw error;
        }
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
    this.refuseIfNoLongerActive(sessionId, session);   // names a settled session's reason (1.39.22)

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

    await this.refuseIfSettledOnChain(sessionId, session);   // 1.39.21 S2

    // Re-init before RAG operations, except where the node keeps the key for the connection (Milestone B D38)
    if (session.encryption && this.encryptionManager) {
      if (!(await this.sharedConnectionHoldsKey(sessionId))) {
        const config: ExtendedSessionConfig = {
          chainId: session.chainId,
          host: session.provider,
          modelId: session.model,
          endpoint: session.endpoint,
          paymentMethod: 'deposit',
          encryption: true,
          lora: session.lora,          // E.3: a re-init MUST re-send it, or the node keeps refusing
          onServeBackError: session.onServeBackError,
        };
        await this.sendEncryptedInit(this.wsClient, config, session.sessionId, session.jobId);
      }
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
    this.refuseIfNoLongerActive(sessionId, session);   // 1.39.21: the session may have been found settled since the gate (review round 4)
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

    // A missing endpoint is a bug, not something to degrade around: outside the catch below (F3).
    const endpoint = this.requireEndpoint(session, sessionId);

    try {
      // Create HostAdapter to generate embedding
      const { HostAdapter } = await import('../embeddings/adapters/HostAdapter');
      const hostAdapter = new HostAdapter({
        hostUrl: endpoint,
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

    // The UI's block format: the question follows the end marker, where userTextOf finds it (U4)
    const context = contextChunks.join('\n\n');
    return `${RAG_CONTEXT_START_MARKER}\n${context}\n${RAG_CONTEXT_END_MARKER}\n\n${question}`;
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

    // The node's own counts, whatever the status (Milestone B D36). An ack without them is refused, not guessed at.
    const { uploaded, rejected, errors } = response as Partial<UploadVectorsResponse>;
    if (!Number.isInteger(uploaded) || !Number.isInteger(rejected) || !Array.isArray(errors) || errors.some((e) => typeof e !== 'string')) {
      pending.reject(new SDKError(
        'The node\'s uploadVectorsResponse has no uploaded/rejected/errors counts',
        'UPLOAD_RESPONSE_MALFORMED',
        { requestId: response.requestId, status: response.status }
      ));
      return;
    }
    pending.resolve({ uploaded, rejected, errors });
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
    const endpoint = this.requireEndpoint(session, sessionId);

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
      const endpoint = this.requireEndpoint(session, id);
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
      if (error instanceof SDKError && error.code === 'SESSION_ENDPOINT_MISSING') throw error;   // F4: typed, as thrown
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

    if (session.status !== 'active') console.error(`[SDK:generateImage:4] SESSION_NOT_ACTIVE status=${session.status}`);
    this.refuseIfNoLongerActive(sessionId, session);   // names a settled session's reason (1.39.22)

    // Require encryption manager
    if (!this.encryptionManager) {
      console.error(`[SDK:generateImage:5] ENCRYPTION_NOT_AVAILABLE`);
      throw new SDKError('EncryptionManager not available', 'ENCRYPTION_NOT_AVAILABLE');
    }
    console.warn(`[SDK:generateImage:6] EncryptionManager OK`);

    // Lazily initialize WebSocket if not connected
    const endpoint = this.requireEndpoint(session, sessionId);
    const wsUrl = endpoint.includes('ws://') || endpoint.includes('wss://')
      ? endpoint
      : endpoint.replace('http://', 'ws://').replace('https://', 'wss://') + '/v1/ws';
    console.warn(`[SDK:generateImage:7] endpoint=${endpoint} wsUrl=${wsUrl}`);

    // Force new WebSocket if session changed (old connection belongs to previous session)
    if (this.wsClient && this.wsSessionId && this.wsSessionId !== sessionId) {
      console.warn(`[SDK:generateImage:8] Session changed ${this.wsSessionId} -> ${sessionId}, tearing down old WebSocket`);
      this.markMaySettle(this.wsSessionId);   // its connection closes: the node may settle it (1.39.21 S1)
      try { await this.wsClient.disconnect(); } catch (_) { /* ignore */ }
      this.wsClient = undefined;
      this.wsSessionId = undefined;
      this.sessionKey = undefined;
      this.messageIndex = 0;
    }

    if (!this.wsClient || !this.wsClient.isConnected()) {
      console.warn(`[SDK:generateImage:9] Creating fresh WebSocket to ${wsUrl}`);
      try {
        // A dead shared client being replaced: its session's connection closed (1.39.21 S1)
        if (this.wsClient) this.markMaySettle(this.wsSessionId);
        this.wsClient = new WebSocketClient(wsUrl, { chainId: session.chainId });
        this.wsSessionId = sessionId;   // owned from creation (Milestone B review M3)
        this.watchConnectionIdentity(this.wsClient);
        console.warn(`[SDK:generateImage:10] WebSocket created, calling connect()...`);
        await this.wsClient.connect();
        console.warn(`[SDK:generateImage:11] WebSocket connected OK`);
      } catch (err: any) {
        console.error(`[SDK:generateImage:12] WebSocket connect FAILED: ${err.message}`, err);
        throw err;
      }
    } else {
      console.warn(`[SDK:generateImage:9b] Reusing existing WebSocket (connected=${this.wsClient.isConnected()})`);
    }

    await this.refuseIfSettledOnChain(sessionId, session);   // 1.39.21 S2, after the socket setup

    // Send session_init with a fresh ECDH key exchange, except where the node keeps the key for the connection (Milestone
    // B D38, review m1): a re-init would replace the key a chat reply on this session is still decrypted with.
    if (!(await this.sharedConnectionHoldsKey(sessionId))) {
      console.warn(`[SDK:generateImage:13] Sending sendEncryptedInit for session ${sessionId} job ${session.jobId}`);
      const initConfig: ExtendedSessionConfig = {
        chainId: session.chainId,
        host: session.provider,
        modelId: session.model,
        endpoint: session.endpoint,
        paymentMethod: 'deposit',
        encryption: true,
        lora: session.lora,            // E.3: a re-init MUST re-send it
        onServeBackError: session.onServeBackError,
      };
      try {
        await this.sendEncryptedInit(this.wsClient, initConfig, session.sessionId, session.jobId);
        console.warn(`[SDK:generateImage:14] sendEncryptedInit completed OK, hasKey=${!!this.sessionKey}`);
      } catch (err: any) {
        console.error(`[SDK:generateImage:15] sendEncryptedInit FAILED: ${err.message}`, err);
        throw err;
      }
    }

    // The init just wrote this session's entry; its counter is the one chat continues from (E3).
    const imageCrypto = this.sessionCrypto.get(sessionId);
    if (!imageCrypto) {
      console.error(`[SDK:generateImage:16] SESSION_KEY_NOT_AVAILABLE after init`);
      throw new SDKError('Session key not available after init', 'SESSION_KEY_NOT_AVAILABLE');
    }

    // Delegate to standalone utility
    console.warn(`[SDK:generateImage:17] Calling generateImageWs prompt="${prompt.substring(0, 50)}..." msgIdx=${this.messageIndex}`);
    const messageIndexRef = this.liveIndex(imageCrypto);
    this.refuseIfNoLongerActive(sessionId, session);   // 1.39.21: the session may have been found settled since the gate (review round 4)
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
        sessionKey: imageCrypto.key,
        messageIndex: messageIndexRef,
        prompt,
        options,
      });
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
      // The node refused it on a settled session: the listener has settled it; say so (1.39.22 N2)
      if (this.settledByNode.has(sessionId)) throw this.settledByNodeError(sessionId);
      throw err;
    }
  }

  /** Submit an LTX video job via encrypted WebSocket (mirrors submitTranscode; Constraint 7). */
  /**
   * The hosts trusted with confidential jobs (1.39.19): an encrypted transcode, every LTX job and every training job put
   * keys in the host's hands, and nothing on the node or the contracts stops another host taking them, so the SDK refuses
   * such a job for any other host — and, with no list configured, for every host. Unencrypted transcodes and chat stay
   * open. Set through FabstirSDKCore's `confidentialHosts`.
   */
  setConfidentialHosts(hosts: readonly string[]): void {
    if (!Array.isArray(hosts) || hosts.some((h) => typeof h !== 'string' || !ethers.isAddress(h))) {
      throw new SDKError('confidentialHosts must be a list of host addresses', 'INVALID_CONFIDENTIAL_HOSTS', { hosts, retryable: false });
    }
    this.confidentialHosts = new Set(hosts.map((h) => h.toLowerCase()));
  }

  /** The configured confidential hosts (lower-cased), or undefined when none is configured. */
  getConfidentialHosts(): string[] | undefined {
    return this.confidentialHosts ? [...this.confidentialHosts] : undefined;
  }

  /**
   * Refuse a confidential job for `host` unless it is on the list (fail closed): SDKError CONFIDENTIAL_HOST_NOT_ALLOWED,
   * `details { reason: 'NO_ALLOWLIST' | 'HOST_NOT_ALLOWED', host, job }`. The managers call it before funding (1.39.19).
   */
  assertConfidentialHost(host: string, job: SessionJobKind): void {
    if (!this.confidentialHosts) {
      throw new SDKError(`Confidential ${job} jobs are refused: no confidentialHosts are configured`, 'CONFIDENTIAL_HOST_NOT_ALLOWED',
        { reason: 'NO_ALLOWLIST', host, job, retryable: false });
    }
    if (!this.confidentialHosts.has(String(host).toLowerCase())) {
      throw new SDKError(`Host ${host} is not trusted with confidential ${job} jobs (confidentialHosts)`, 'CONFIDENTIAL_HOST_NOT_ALLOWED',
        { reason: 'HOST_NOT_ALLOWED', host, job, retryable: false });
    }
  }

  /** How the SDK reads a session job on chain for the transcode wait: the read provider's path, never the wallet's (1.39.18). */
  setSessionJobReader(reader: NonNullable<SessionManager['sessionJobReader']>): void {
    this.sessionJobReader = reader;
  }


  /** How often a dropped transcode's stored result is asked for, and how long one answer may take (1.39.15 H4). */
  static TRANSCODE_RESULT_POLL_MS = 15_000;
  static TRANSCODE_RESULT_ANSWER_MS = 30_000;

  /**
   * Whether the session's node reports `session-job-completion` in GET /v1/version (1.39.15 H1). A 2xx answer is
   * remembered for the session; a probe that fails is not, and counts as NO: a wrong "no" is 1.39.14's loud refusal or
   * final WS_CLOSED, a wrong "yes" a frame that silently fails to decrypt or a session settling under a running job.
   */
  private async isJobCompletionNode(sessionId: string, fresh = false): Promise<boolean> {
    const known = this.jobCompletionNodes.get(sessionId);
    if (known !== undefined && !fresh) return known;
    const session = this.sessions.get(sessionId);
    if (!session?.endpoint?.trim()) return false;   // the caller's own guard reports SESSION_ENDPOINT_MISSING
    try {
      const httpUrl = session.endpoint.trim()
        .replace(/^(wss?|https?):\/\//i, (_m, scheme: string) => `${{ ws: 'http', wss: 'https' }[scheme.toLowerCase()] ?? scheme.toLowerCase()}://`)
        .replace(/\/+$/, '').replace(/\/v1\/ws$/i, '').replace(/\/+$/, '');
      const response = await fetch(`${httpUrl}/v1/version`, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) return false;
      const data = await response.json();
      const yes = Array.isArray(data?.features) && data.features.includes('session-job-completion');
      this.jobCompletionNodes.set(sessionId, yes);
      this.settledNoticeNodes.set(sessionId, Array.isArray(data?.features) && data.features.includes('session-settled-notice'));
      this.settledRestNodes.set(sessionId, Array.isArray(data?.features) && data.features.includes('session-settled-rest'));
      this.holdsKeyProbeFailedAt.delete(sessionId);
      return yes;
    } catch {
      return false;
    }
  }

  /**
   * Ask a node that reports `session-job-completion` for a transcode's stored result: the outputs of a job whose
   * connection dropped, kept for 7 days and served only to the identity that submitted it (1.39.15 H3). Works on a
   * session already ended or completed; never bills, re-runs or settles. Save the output CIDs as soon as they arrive.
   *
   * @returns `{ status: 'complete', result }`, or `{ status: 'pending' }` while the job still runs (ask again later)
   * @throws TranscodeError TRANSCODE_FAILED with `details.nodeCode` RESULT_NOT_FOUND / RESULT_EXPIRED (gone — treat both
   *   the same), NOT_OWNER, or the job's own failure (e.g. BILLING_FAILED, a moderation hold)
   * @throws SDKError TRANSCODE_RESULT_UNSUPPORTED (not retryable) — the node does not report the marker
   */
  async fetchTranscodeResult(sessionId: string, taskId: string): Promise<TranscodeResultAnswer> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new SDKError('Session not found', 'SESSION_NOT_FOUND');
    this.requireEndpoint(session, sessionId);
    if (!(await this.isJobCompletionNode(sessionId, true))) {
      throw new SDKError(
        `The node for session ${sessionId} does not report session-job-completion, so it keeps no transcode results`,
        'TRANSCODE_RESULT_UNSUPPORTED', { sessionId, taskId, retryable: false },
      );
    }
    const { wsClient, sessionKey, messageIndexRef, encryptionAdapter } = await this.acquireSessionTransport(sessionId, 'fetch');
    try {
      return await fetchTranscodeResultWs({
        wsClient, encryptionManager: encryptionAdapter, sessionId, sessionKey, messageIndex: messageIndexRef,
        taskId, timeoutMs: SessionManager.TRANSCODE_RESULT_ANSWER_MS,
      });
    } finally {
      void wsClient.disconnect().catch(() => {});
    }
  }

  /**
   * A transcode whose connection dropped after `transcode_accepted`, on a `session-job-completion` node: the node carries
   * it to the end and keeps the result, so fetch it until it is there, gone, or the submit's own deadline passes (H4).
   * A failed attempt (host unreachable) waits for the next tick; the node's verdict (gone, NOT_OWNER, the job's failure)
   * ends it.
   */
  private async recoverTranscodeResult(
    sessionId: string, taskId: string, deadline: number, cancelled: { signal: Promise<never> },
  ): Promise<TranscodeResult> {
    const timedOut = () => new TranscodeError(
      `The connection for transcode ${taskId} dropped and its stored result did not arrive before the deadline`,
      'TRANSCODE_TIMEOUT', undefined, { reason: 'WS_CLOSED', taskId },
    );
    // Every wait — an attempt or the pause between attempts — is bounded by the caller's deadline and by cancel().
    const bounded = <T>(work: Promise<T>): Promise<T> => {
      work.catch(() => {});   // an abandoned attempt still settles (its socket closes in fetchTranscodeResult's finally)
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadlineHit = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(timedOut()), Math.max(0, deadline - Date.now())); });
      return Promise.race([work, deadlineHit, cancelled.signal]).finally(() => clearTimeout(timer));
    };
    for (;;) {
      try {
        const answer = await bounded(this.fetchTranscodeResult(sessionId, taskId));
        if (answer.status === 'complete') return answer.result;
      } catch (err: any) {
        // Only a transport failure is worth another attempt; the node's verdict, a refused init, a missing session, a
        // node that no longer reports the marker, the deadline or cancel() end the recovery.
        if (!isTransientFetchFailure(err)) throw err;
      }
      if (deadline - Date.now() <= 0) throw timedOut();
      await bounded(new Promise((r) => setTimeout(r, SessionManager.TRANSCODE_RESULT_POLL_MS)));
    }
  }

  /** SESSION_JOB_IN_FLIGHT when `sessionId` has a job in flight in this manager (1.39.14, G1/G8). */
  private refuseIfJobInFlight(sessionId: string): void {
    const inFlight = this.jobsInFlight.get(sessionId);
    if (!inFlight) return;
    throw new SDKError(
      `Session ${sessionId} already has a ${inFlight} job in flight. Run one job per session: the node keeps one ` +
      'key per session and completes the session when any of its sockets closes',
      'SESSION_JOB_IN_FLIGHT', { sessionId, inFlight, retryable: false },
    );
  }

  /**
   * The session's endpoint, or a typed refusal. No fallback: a session with no endpoint is a bug,
   * and substituting localhost would send the user's prompt or a paid job to the developer's own
   * machine instead of the host. Callers check it before any side effect and outside any try that
   * rewraps errors (1.36.0 Q7 for the WS submits; every other site 1.39.13).
   */
  private requireEndpoint(session: SessionState, sessionId: string | bigint): string {
    if (!session.endpoint?.trim()) {
      throw new SDKError(`Session ${sessionId} has no endpoint`, 'SESSION_ENDPOINT_MISSING');
    }
    return session.endpoint;
  }

  /**
   * The session's own replay counter as a `{ value }` ref, live rather than a copy: chat and any job
   * on the shared socket draw from ONE counter per key, so no index repeats under that key and there
   * is no write-back step a throw could skip (IMPLEMENTATION-TRANSPORT-ISOLATION E3).
   */
  private liveIndex(entry: { messageIndex: number }): { value: number } {
    return { get value() { return entry.messageIndex; }, set value(v: number) { entry.messageIndex = v; } };
  }

  /**
   * Acquire an encrypted transport for a session: reuse the shared socket when it is already
   * this session's, otherwise stand up a dedicated one and run the encrypted init on it.
   *
   * Extracted from `submitLtx` so training rides the SAME mechanism rather than a parallel
   * copy of it. A second inline copy would be ~50 lines that must not drift, and the parts
   * most worth not drifting — the no-fallback endpoint guard and the save/restore of the
   * shared `sessionKey`/`messageIndex` around a dedicated init — are exactly the parts a
   * copy gets subtly wrong.
   */
  private async acquireSessionTransport(sessionId: string, mode: 'job' | 'fetch' = 'job'): Promise<{
    wsClient: WebSocketClient;
    sessionKey: Uint8Array;
    messageIndexRef: { value: number };
    ownsWs: boolean;
    encryptionAdapter: {
      encryptMessage(key: Uint8Array, plaintext: string, index: number): any;
      decryptMessage(key: Uint8Array, payload: any): string;
    };
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new SDKError('Session not found', 'SESSION_NOT_FOUND');
    // A result fetch works on a session the caller ended or the node completed (1.39.15 H3).
    if (mode === 'job') this.refuseIfNoLongerActive(sessionId, session);   // carries details.status (1.39.21)
    if (!this.encryptionManager) throw new SDKError('EncryptionManager not available', 'ENCRYPTION_NOT_AVAILABLE');

    const endpoint = this.requireEndpoint(session, sessionId);
    const wsUrl = endpoint.includes('ws://') || endpoint.includes('wss://')
      ? endpoint : endpoint.replace('http://', 'ws://').replace('https://', 'wss://') + '/v1/ws';

    let wsClient: WebSocketClient;
    let sessionKey: Uint8Array;
    let messageIndexRef: { value: number };

    // Identity, not liveness: a silent reconnect leaves isConnected() true on a
    // connection the node never received an init for, and reusing the key here
    // would encrypt under a key that connection has no record of.
    // The entry must also be the key the LAST shared init minted: a session-switch teardown clears
    // `sessionKey` but leaves the old entry, and a fresh socket restarts at generation 1.
    // A shared init in flight has already written its new key, before the node has it (Milestone B round 2).
    if (mode === 'job') {
      // 1.39.21 S2, before any socket or frame, and BEFORE the init-chain wait: an init queued during the chain read would
      // otherwise sit between the wait and the reuse check below (settled-guard review round 3).
      await this.refuseIfSettledOnChain(sessionId, session);
      await this.initChain;
      // The session may have been completed, ended or found settled during the wait (round 3 m2; settled-guard round 4)
      this.refuseIfNoLongerActive(sessionId, session);
    }
    const shared = this.sessionCrypto.get(sessionId);
    // A fetch always gets its own connection: the node serves it on a freshly inited one, and never settles on it.
    if (mode === 'job' && !this.needsSessionInit() && this.wsSessionId === sessionId && shared && shared.key === this.sessionKey) {
      wsClient = this.wsClient!;
      sessionKey = shared.key;
      messageIndexRef = this.liveIndex(shared);
    } else {
      // A per-job socket never silently reconnects: a reconnected socket has no session init and the
      // frames are not re-delivered. A FAILED init must leave nothing behind — no open socket with a
      // 30 s heartbeat, no background reconnect loop — and the init itself touches no shared state (E1).
      // 1.39.22 N3: a new connection on a notice node is read first (a node restart forgets what it settled)
      if (mode === 'job' && this.settledNoticeNodes.get(sessionId) === true) {
        this.markMaySettle(sessionId);
        await this.refuseIfSettledOnChain(sessionId, session);
      }
      wsClient = new WebSocketClient(wsUrl, { reconnect: false });
      wsClient.onMessage(this.dedicatedSettledFrameListener);   // its notice and refusal (1.39.22); the socket's close drops it
      try {
        await wsClient.connect();
        sessionKey = await this.sendEncryptedInit(wsClient, {
          chainId: session.chainId, host: session.provider, modelId: session.model,
          endpoint, encryption: true,
          // E.3: a job's re-init MUST re-send it. A result fetch's must NOT (1.39.16): the node stages the adapter
          // after the ack (up to 300 s, re-fetched from S5) and the fetch frame waits behind it; a fetch never prompts.
          lora: mode === 'fetch' ? undefined : session.lora,
          onServeBackError: mode === 'fetch' ? undefined : session.onServeBackError,
        // Deliberately partial: sendEncryptedInit reads only this subset, and the required
        // pricing/proof fields are meaningless for a re-init on an already-funded session. The
        // cast was always hiding that; the double cast only stops TS's overlap heuristic from
        // objecting now that there are two more properties to weigh.
        } as unknown as ExtendedSessionConfig, session.sessionId, session.jobId, 'dedicated');
        // Inside the try: a keyless init is a failed init, and its socket must not outlive it.
        if (!sessionKey) throw new SDKError('Session key not available after init', 'SESSION_KEY_NOT_AVAILABLE');
      } catch (err) {
        await wsClient.disconnect().catch(() => {});   // cleanup only — the init failure is what surfaces
        if (mode === 'job') this.markMaySettle(sessionId);   // the node may have registered the job (1.39.21)
        throw err;
      }
      messageIndexRef = { value: 0 };
    }

    return {
      wsClient,
      sessionKey,
      messageIndexRef,
      ownsWs: wsClient !== this.wsClient, // dedicated per-job socket, not the shared session WS
      encryptionAdapter: {
        encryptMessage: (key: Uint8Array, plaintext: string, index: number) =>
          this.encryptionManager!.encryptMessage(key, plaintext, index),
        decryptMessage: (key: Uint8Array, payload: any) => {
          const p = payload.payload || payload;
          return this.encryptionManager!.decryptMessage(key, p);
        },
      },
    };
  }

  /**
   * Run a WS submit over this session's transport, and close a socket it OPENED on every outcome:
   * a throw before the handle exists, and the result settling either way. A reused shared socket
   * is never closed here. The node settles the session when its socket closes, so a leaked
   * dedicated socket leaves the host unpaid and the session Active until the tab unloads.
   */
  private async submitOverTransport<H extends { result: Promise<any> }>(
    sessionId: string, kind: SessionJobKind,
    submit: (t: Awaited<ReturnType<SessionManager['acquireSessionTransport']>> & { jobCompletionNode: boolean }) => Promise<H>,
    /** Work that may refuse the job before any socket, run AFTER the claim so the claim stays first (1.39.18). */
    prepare?: () => Promise<void>,
    /** The job puts keys in the host's hands: only a confidential host may take it (1.39.19). */
    confidential = true,
  ): Promise<H> {
    // Confidential hosts (1.39.19): checked on a usable session only, so the session guards (not found, not active, no
    // endpoint, no EncryptionManager) keep their precedence; the record checked is the one the job must go out on.
    const usable = this.sessions.get(sessionId);
    let guarded: SessionState | undefined;
    if (usable && usable.status === 'active' && usable.endpoint?.trim() && this.encryptionManager) {
      guarded = usable;
      if (confidential) {
        try {
          this.assertConfidentialHost(usable.provider, kind);
        } catch (err: any) {
          throw kind === 'transcode'
            ? new TranscodeError(err.message, 'CONFIDENTIAL_HOST_NOT_ALLOWED', usable.provider, err.details)
            : err;
        }
      }
    }
    // One job per session (1.39.14) on a node WITHOUT `session-job-completion`: it holds ONE key per session id across
    // connections (a second init replaces the first job's key) and completes the session when any of its sockets
    // closes. A node that reports the marker keys by connection and completes per job, so nothing is claimed (1.39.15
    // H2). Check and claim are one synchronous step after the probe, so two submits in one tick cannot both pass.
    // Until a node is KNOWN to report the marker, claim synchronously on entry exactly as 1.39.14 does (the first caller
    // wins, and registerExternalSession is refused from the first instant); a probe that then says yes gives it back.
    let jobCompletionNode = this.jobCompletionNodes.get(sessionId) === true;
    let release = () => {};
    if (!jobCompletionNode) {
      this.refuseIfJobInFlight(sessionId);
      this.jobsInFlight.set(sessionId, kind);
      release = () => { this.jobsInFlight.delete(sessionId); };
      if (this.sessions.get(sessionId)?.status === 'active') {   // else acquire throws its typed refusal
        try {
          jobCompletionNode = await this.isJobCompletionNode(sessionId);
        } catch (err) {
          release();
          throw err;
        }
        if (jobCompletionNode) { release(); release = () => {}; }
      }
    }
    let transport: Awaited<ReturnType<SessionManager['acquireSessionTransport']>>;
    try {
      if (prepare) await prepare();
      transport = await this.acquireSessionTransport(sessionId);
    } catch (err) {
      release();
      throw err;
    }
    const { wsClient, ownsWs } = transport;
    const close = () => { void wsClient.disconnect().catch(() => {}); };
    let handle: H;
    try {
      // A re-registration while this submit awaited could point the record at another host; the job frame carries the
      // keys, so it goes out only to the host and endpoint the check passed (1.39.18 review R1, now for every job). An
      // identical re-seed (the same session adopted again for the same host) is not a swap (1.39.19 review).
      const current = this.sessions.get(sessionId);
      const sameTarget = !!current && !!guarded
        && String(current.provider).toLowerCase() === String(guarded.provider).toLowerCase()
        && current.endpoint === guarded.endpoint;
      if (!sameTarget) {
        throw kind === 'transcode'
          ? new TranscodeError(`Session ${sessionId} was re-registered while the transcode was being submitted`, 'TRANSCODE_FAILED',
            undefined, { reason: 'SESSION_CHANGED', sessionId })
          : new SDKError(`Session ${sessionId} was re-registered while the ${kind} job was being submitted`, 'SESSION_CHANGED',
            { reason: 'SESSION_CHANGED', sessionId, retryable: false });
      }
      // The record this submit was guarded on, and the current one (settled-guard review round 6)
      this.refuseIfNoLongerActive(sessionId, guarded!);   // sameTarget above requires `guarded`   // 1.39.21: the session may have been found settled since the gate (review round 4)
      handle = await submit({ ...transport, jobCompletionNode });
    } catch (err) {
      if (ownsWs) close();
      release();
      this.markMaySettle(sessionId);   // 1.39.21 S1: a job's end, or its socket's close, can settle the session
      throw err;
    }
    // A job that failed (timed out, lost its socket, cancelled locally) may still be running on the node and settle the
    // session when it ends: its mark is sticky (1.39.21 review round 1).
    handle.result = handle.result.then(
      (value) => { if (ownsWs) close(); release(); this.markMaySettle(sessionId); return value; },
      (err) => {
        if (ownsWs) close(); release();
        // The node's settled refusal (an encrypted transcode_error SESSION_SETTLED, an LTX/training error) settles it
        if (SessionManager.isSettledRefusal(err)) this.markSettledByNode(sessionId, 'refused');
        else this.markMaySettle(sessionId, true);
        throw err;
      },
    );
    // Every re-wrap is a NEW promise the *-ws module never marked handled. Without this a job
    // rejected before the consumer attaches is an unhandled rejection (process exit in Node).
    handle.result.catch(() => {});
    return handle;
  }

  /**
   * Submit a training job over this session's encrypted transport (§ WebSocket protocol).
   * Rides `acquireSessionTransport`, so LTX and training cannot drift apart on socket reuse,
   * the endpoint guard, or the shared-key save/restore.
   *
   * The dedicated socket is closed once the run settles either way — but NOT before: every
   * capability pointer arrives on THIS socket, delivered once, with no reconnect re-delivery
   * in M0 (CK-6). Dropping it early loses the user's artifact, not just a frame.
   */
  async submitTraining(
    sessionId: string, job: TrainingJob, options?: Partial<TrainingWsOptions>,
  ): Promise<TrainingHandle> {
    return this.submitOverTransport(sessionId, 'training', ({ wsClient, sessionKey, messageIndexRef, encryptionAdapter }) =>
      submitTrainingWs({
        wsClient, encryptionManager: encryptionAdapter,
        sessionId, sessionKey, messageIndex: messageIndexRef, job, ...options,
      } as TrainingWsOptions));
  }

  async submitLtx(sessionId: string, job: LtxJob, options?: LtxSubmitOptions): Promise<LtxHandle> {
    // Frames/verify use S5, not this WS, so the dedicated socket can close as soon as the clip settles.
    return this.submitOverTransport(sessionId, 'ltx', async ({ wsClient, sessionKey, messageIndexRef, encryptionAdapter }) => {
      const handle = await submitLtxWs({
        wsClient, encryptionManager: encryptionAdapter,
        sessionId, sessionKey, messageIndex: messageIndexRef,
        job, requestId: options?.requestId, onProgress: options?.onProgress, timeoutMs: options?.timeoutMs,
      });
      // Echo the conditioning seed so the granular submitLtx result is self-contained (matches generate()).
      handle.result = handle.result.then((r: LtxResult) => { r.seed = job.seed; return r; });
      return handle;
    });
  }

  /** Submit a transcode job via encrypted WebSocket (rides the same transport as submitLtx/submitTraining). */
  async submitTranscode(
    sessionId: string, sourceCid: string, formats: VideoFormat[], options?: TranscodeSubmitOptions
  ): Promise<TranscodeHandle> {
    // A usable session only: the guards (not found, not active, no endpoint) keep their precedence (K6).
    let timeoutMs = options?.timeoutMs;
    const usable = this.sessions.get(sessionId);
    // The wait is read after the claim (prepare), so registerExternalSession is refused from the first instant (1.39.15 V1).
    let deadline = Date.now() + (timeoutMs ?? TRANSCODE_DEFAULT_TIMEOUT_MS);
    const prepare = usable && usable.status === 'active' && usable.endpoint?.trim() && this.encryptionManager && timeoutMs === undefined
      ? async () => { timeoutMs = await this.transcodeWaitForSession(sessionId, usable); deadline = Date.now() + timeoutMs; }
      : undefined;
    return this.submitOverTransport(sessionId, 'transcode', async ({ wsClient, sessionKey, messageIndexRef, encryptionAdapter, jobCompletionNode }) => {
      const session = this.sessions.get(sessionId)!;   // acquireSessionTransport refused a missing one
      const handle = await submitTranscodeWs({
        wsClient, encryptionManager: encryptionAdapter,
        sessionId, sessionKey, messageIndex: messageIndexRef,
        sourceCid, formats, jobId: Number(session.jobId),
        chainId: options?.chainId ?? session.chainId, isEncrypted: options?.isEncrypted,
        isGpu: options?.isGpu, onProgress: options?.onProgress, timeoutMs, previewPercent: options?.previewPercent,
      });
      // On a session-job-completion node a drop after the accept is not final: the node finishes and keeps the result (H4).
      if (jobCompletionNode) {
        // cancel() during recovery stops the SDK's polling. The node cannot be told over a dead socket: it finishes and
        // bills the job, and the result stays fetchable (fetchTranscodeResult) for 7 days.
        let cancel!: (err: Error) => void;
        const cancelled = { signal: new Promise<never>((_, reject) => { cancel = reject; }) };
        cancelled.signal.catch(() => {});
        const sendCancel = handle.cancel;
        handle.cancel = () => {
          sendCancel();
          cancel(new TranscodeError(`Transcode ${handle.taskId || ''} cancelled by the client`.replace('  ', ' '), 'TRANSCODE_FAILED',
            undefined, { reason: 'CANCELLED', taskId: handle.taskId || undefined }));
        };
        handle.result = handle.result.catch((err: any) => {
          const taskId = err?.details?.reason === 'WS_CLOSED' ? err.details.taskId : undefined;
          if (!taskId) throw err;   // closed before the accept: no task to fetch
          return this.recoverTranscodeResult(sessionId, taskId, deadline, cancelled);
        });
      }
      return handle;
    }, prepare, isEncryptedTranscode(sourceCid, options?.isEncrypted));
  }

  /**
   * How long to wait for a transcode on this session: until the session's own on-chain expiry plus 300 s (1.39.18). The
   * node keeps only a job it can bill before expiry and its run limit sits inside the lifetime, so the result arrives by
   * then. Read from the chain, because a session minted elsewhere (registerExternalSession) carries no lifetime here.
   */
  private async transcodeWaitForSession(sessionId: string, session: SessionState): Promise<number> {
    let job: any;
    try {
      if (!this.sessionJobReader) throw new Error('no session reader is wired (FabstirSDKCore sets one)');
      job = await this.sessionJobReader(session.chainId).getSessionJobOnChain(BigInt(session.jobId));
    } catch (err: any) {
      throw new TranscodeError(`Could not read session ${sessionId} on chain to time the transcode: ${err?.message ?? err}`,
        'TRANSCODE_FAILED', undefined, { reason: 'SESSION_UNREADABLE', sessionId, jobId: String(session.jobId) });
    }
    const startTime = Number(job?.startTime), maxDuration = Number(job?.maxDuration);
    if (!(startTime > 0) || !(maxDuration > 0)) {
      throw new TranscodeError(`Session ${sessionId} has no start time or lifetime on chain`, 'TRANSCODE_FAILED', undefined,
        { reason: 'SESSION_UNREADABLE', sessionId, jobId: String(session.jobId) });
    }
    const ms = (startTime + maxDuration + 300) * 1000 - Date.now();
    if (ms <= 0) {
      throw new TranscodeError(`Session ${sessionId} expired on chain`, 'TRANSCODE_FAILED', undefined,
        { reason: 'SESSION_EXPIRED', sessionId, jobId: String(session.jobId) });
    }
    return Math.min(ms, 2_147_483_647);   // a longer setTimeout delay fires at once
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

  getHostHealth(sessionId: bigint): HostHealthInfo | undefined {
    const session = this.sessions.get(sessionId.toString());
    return session?.lastHostHealth;
  }

  /** An explicit host's endpoint, from the registry: an active registered host with an apiUrl serving the model, else refused. */
  private async registryEndpoint(host: string, modelId: string): Promise<string> {
    if (!this.hostManager) {
      throw new SDKError(`No endpoint for host ${host}: pass endpoint, or set a HostManager so it can be read from the registry`, 'HOST_NOT_AVAILABLE', { host });
    }
    let info: Awaited<ReturnType<HostManager['getHostInfo']>>;
    try {
      info = await this.hostManager.getHostInfo(host);
    } catch (cause: any) {
      throw new SDKError(`Could not read host ${host} from the registry: ${cause?.message ?? String(cause)} — no session opened`, 'HOST_NOT_AVAILABLE', { host, cause });
    }
    if (!info.isActive || !info.apiUrl) { // an unregistered host reads isActive: false (HostManager.getHostStatus)
      throw new SDKError(`Host ${host} is not an active registered host with an apiUrl — no session opened`, 'HOST_NOT_AVAILABLE', { host });
    }
    if (!(info.supportedModels ?? []).some((m) => m.toLowerCase() === modelId.toLowerCase())) {
      throw new SDKError(`Host ${host} does not serve model ${modelId} — no session opened`, 'HOST_NOT_AVAILABLE', { host, modelId });
    }
    return this.transformEndpoint(info.apiUrl);
  }

  /** The configured endpoint transform (e.g. Docker localhost → host.docker.internal), applied to a discovered URL. */
  private transformEndpoint(url: string): string {
    if (!this.endpointTransform) return url;
    const out = this.endpointTransform(url);
    if (out !== url) console.log(`[SessionManager] Endpoint transformed: ${url} -> ${out}`);
    return out;
  }

  private async _checkHostHealth(endpoint: string): Promise<HostHealthInfo> {
    try {
      const httpUrl = endpoint.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/v1\/ws$/, '');
      const response = await fetch(`${httpUrl}/v1/health`, { signal: AbortSignal.timeout(3000) });
      // Only a 2xx carrying a status is an answer: a proxy's JSON 404/500 or a page without one is not the node (1.39.10).
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (typeof data?.status !== 'string') throw new Error('no status');
      return {
        status: data.status,
        issues: data.issues || [],
        checkedAt: Date.now(),
      };
    } catch {
      return { status: 'unreachable', issues: ['Health endpoint unreachable'], checkedAt: Date.now() };
    }
  }

  // =============================================================================
  // Session Status Handler (Phase 14.3)
  // =============================================================================

  /**
   * Set up persistent WebSocket listener for session_status, proof_submitted,
   * and checkpoint_submitted messages. Converts all formats to SessionStatusInfo.
   */
  private _setupSessionStatusHandler(): void {
    if (this.sessionStatusUnsubscribe) this.sessionStatusUnsubscribe();
    if (!this.wsClient) return;

    const unsubscribe = this.wsClient.onMessage((data: any) => {
      const callback = this.sessionStatusCallback;
      if (data.type === 'session_status') {
        this._processSessionStatus(data, callback);
      } else if (data.type === 'proof_submitted') {
        this._processSessionStatus({
          session_id: data.session_id,
          proof: { status: 'success', proof_id: data.proof_id, size_bytes: data.size_bytes },
          timestamp: data.timestamp,
        }, callback);
      } else if (data.type === 'checkpoint_submitted') {
        this._processSessionStatus({
          session_id: data.session_id,
          checkpoint: { status: 'success', checkpoint_index: data.checkpoint_index },
          timestamp: data.timestamp,
        }, callback);
      }
    });
    this.sessionStatusUnsubscribe = unsubscribe;
  }

  /**
   * Convert raw WebSocket data into a typed SessionStatusInfo and invoke callback.
   * No-op if callback is undefined.
   */
  private _processSessionStatus(data: any, callback?: (status: SessionStatusInfo) => void): void {
    if (!callback) return;
    const status: SessionStatusInfo = {
      sessionId: data.session_id || data.sessionId || '',
      proof: data.proof ? {
        status: data.proof.status || 'success',
        error: data.proof.error,
        proofId: data.proof.proof_id || data.proof.proofId,
        sizeBytes: data.proof.size_bytes || data.proof.sizeBytes,
      } : undefined,
      checkpoint: data.checkpoint ? {
        status: data.checkpoint.status || 'success',
        error: data.checkpoint.error,
        checkpointIndex: data.checkpoint.checkpoint_index ?? data.checkpoint.checkpointIndex,
      } : undefined,
      timestamp: data.timestamp || Date.now(),
    };
    callback(status);
  }
}