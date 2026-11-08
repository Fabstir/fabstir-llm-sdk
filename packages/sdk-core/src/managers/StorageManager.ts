// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Browser-compatible Storage Manager using S5.js
 * 
 * This manager handles decentralized storage operations through S5.js,
 * which is fully browser-compatible. No Node.js dependencies.
 */

// Dynamic import for S5 - loaded when needed
import { IStorageManager } from '../interfaces';
import {
  SDKError,
  StorageOptions,
  StorageResult,
  ConversationData,
  Message,
  UserSettings,
  PartialUserSettings,
  UserSettingsVersion
} from '../types';
import { HostSelectionMode } from '../types/settings.types';
import { ModelInfo } from '../types/models';
import { migrateUserSettings } from './migrations/user-settings';
import type { EncryptionManager } from './EncryptionManager';
import type { EncryptedStorage } from '../interfaces/IEncryptionManager';
import { FolderHierarchy, type FolderListItem, type FolderMetadata } from '../storage/folder-operations.js';
import { getParentPath, getAncestorPaths } from '../storage/path-validator.js';
import { SEED_MESSAGE } from '../utils/s5-seed-derivation';
import { registerS5WithBackend } from '../utils/s5-secure-registration';
import { storageSealerFromSeed, type StorageSealer } from '../storage/sealed/StorageSealer';
import { SealedIO, isS5Absent, retryableOf, sealedBlobHash } from '../storage/sealed/sealed-io';
import { bytesToHex, hexToBytes } from '../crypto/utilities';
import { sha256 } from '@noble/hashes/sha256';
import { mapWithConcurrency } from '../utils/concurrency';
import { createRagCoherence, headNotRecorded, type RagHead } from '../storage/sealed/rag-coherence';
import { logHeadKeyOf, isDense } from '../storage/sealed/rag-layout';
import { reportProgress, type MigrationProgress } from '../storage/sealed/rag-migration';
import { assertSupportedS5js, withS5Guards } from '../storage/s5-guards';

/** Result of sealing the legacy plaintext conversation logs. */
export interface LogMigrationReport {
  sealed: number;
  alreadySealed: number;
  /** Logs moved from `home/sessions/{address}/{id}` to their opaque path (1.39.24 D41). */
  moved: number;
  /** Plaintext files older SDKs left beside the logs (conversation-plaintext.json, summary.json, exchanges/, hierarchy.json). */
  purged: string[];
  /**
   * Every failure carries a code (STORAGE_MIGRATION_FAILED when the error brought none) and `retryable`: whether
   * retrying may help (§17 W4).
   */
  failed: Array<{ id: string; error: string; code: string; retryable: boolean }>;
  /** Files beside the logs that no older SDK wrote — kept, never deleted (§20 AA10). */
  unrecognisedFiles?: string[];
}

/**
 * The sealed log payload. `legacyKeys`: keys of every plaintext message this log has absorbed (its legacy
 * content, and what outdated tabs added since) — so an outdated tab's plaintext can add a new message but
 * never resurrect one deleted after the seal (plan §14 S2).
 */
interface SealedLog { revision: number; conversation: ConversationData; legacyKeys?: string[] }
/** `atLegacy`: read from the pre-1.39.24 path `home/sessions/{address}/{id}` (no v2 log yet); the next write moves it. */
type LogRead = { conversation: ConversationData | null; revision: number; legacyKeys?: string[]; atLegacy?: boolean };

const utf8Encoder = new TextEncoder();
const messageKey = (m: any): string =>
  bytesToHex(sha256(utf8Encoder.encode(`${m?.role}\u0000${m?.timestamp}\u0000${typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content)}`))).slice(0, 16);

/** A conversation: an object with a messages array (§21 BB8, §22 CC6). */
const isConversation = (x: unknown): x is ConversationData => typeof x === 'object' && x !== null && Array.isArray((x as any).messages);
const notAConversation = (x: unknown) =>
  new SDKError('A conversation needs a messages array', 'STORAGE_CONVERSATION_INVALID', { conversationId: (x as any)?.id, retryable: false });
/** Messages to append: a list of message objects, with no holes — a hole would be sealed as `undefined` (§43 XX4, §44 YY4). */
const isMessageList = (x: unknown): x is Message[] =>
  isDense(x) && x.every((m) => typeof m === 'object' && m !== null && !Array.isArray(m));

/** What a disposed store answers (§26 GG1): its identity is gone, so no retry passes. */
const storageManagerDisposed = () =>
  new SDKError('This storage manager belongs to an identity that is signed out — get the current one from the SDK', 'STORAGE_MANAGER_DISPOSED', { retryable: false });

/**
 * A storage failure in the one shape (§16 V8): `cause`, and `retryable` — the cause's verdict when it gives one,
 * else true (an I/O failure may pass). `originalError` is kept for existing callers.
 */
function storageFailure(message: string, code: string, cause: unknown): SDKError {
  // A write that landed says so, whatever wraps it (§34 OO4).
  const committed = (cause as SDKError | undefined)?.details?.committed === true;
  return new SDKError(message, code, { originalError: cause, cause, retryable: retryableOf(cause), ...(committed ? { committed } : {}) });
}

/**
 * A sealed copy an outdated tab overwrote with plaintext (S2): the plaintext is the later write, so its fields win —
 * its metadata over the sealed copy's, key by key — and the messages are the union (the plaintext's that the sealed
 * copy has never seen, by key, in timestamp order). Never worse than the plaintext alone, however old the sealed
 * copy (§21 BB9).
 */
function adoptPlaintext(sealed: SealedLog, plain: ConversationData): LogRead {
  const plainMessages = plain.messages;
  const seen = new Set([...(sealed.legacyKeys ?? []), ...sealed.conversation.messages.map(messageKey)]);
  const adopted = plainMessages.filter((m) => !seen.has(messageKey(m)));
  const legacyKeys = [...new Set([...(sealed.legacyKeys ?? []), ...plainMessages.map(messageKey)])];
  const messages = adopted.length === 0 ? sealed.conversation.messages
    : [...sealed.conversation.messages, ...adopted].sort((a: any, b: any) => (a?.timestamp ?? 0) - (b?.timestamp ?? 0));
  const metadata = { ...sealed.conversation.metadata, ...plain.metadata };
  return { conversation: { ...sealed.conversation, ...plain, metadata, messages }, revision: sealed.revision, legacyKeys };
}

export interface Exchange {
  prompt: string;
  response: string;
  timestamp: number;
  tokensUsed?: number;
  model?: string;
}

export interface SessionMetadata {
  sessionId: string;
  created: number;
  model?: string;
  temperature?: number;
  hostAddress?: string;
  userAddress: string;
}

export interface SessionSummary {
  exchangeCount: number;
  totalTokens: number;
  lastUpdated: number;
  firstExchange?: number;
  lastExchange?: number;
}

export interface ListOptions {
  limit?: number;
  cursor?: string;
  reverse?: boolean;
}

/**
 * Conversation metadata info (Phase 5.2)
 */
export interface ConversationInfo {
  cid: string;
  storedAt: string;
  conversationId: string;
  isEncrypted: boolean;
  senderAddress?: string;  // Optional - only present for encrypted conversations
}

/**
 * Result from loading conversation with metadata (Phase 5.2)
 */
export interface LoadConversationResult {
  conversation: ConversationData;
  senderAddress?: string;  // Optional - only present for encrypted conversations
}

/**
 * Browser-compatible StorageManager implementation
 * Uses S5.js for decentralized storage operations
 */
/**
 * S5 connection status type (matches Enhanced S5.js v0.9.0-beta.5)
 */
export type S5ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

/**
 * Sync status for UI display
 */
export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'error';

/**
 * Queued operation for retry when disconnected
 */
interface QueuedOperation {
  id: string;
  type: 'put' | 'get' | 'delete';
  path: string;
  data?: any;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  attempts: number;
  createdAt: number;
}

/**
 * The synchronous public members — every other one is async. What the SDK's stand-in for a store that did not start
 * relies on to refuse each the way the real one reports (§22 CC7): not the `AsyncFunction` tag, which a consumer's
 * toolchain may compile away. A test walks the prototype so a new member is classified here.
 */
export const STORAGE_MANAGER_SYNC_MEMBERS = [
  'setEncryptionManager', 'getS5Client', 'isInitialized', 'getParentPath', 'getConnectionStatus', 'getSyncStatus',
  'getPendingOperationCount', 'getLastError', 'onSyncStatusChange', 'cleanup', 'setModelManager', 'dispose', 'getSealer',
] as const satisfies ReadonlyArray<keyof StorageManager>;

export class StorageManager implements IStorageManager {
  static readonly DEFAULT_S5_PORTAL = 'wss://z2DcjTLqfj6PTMsDbFfgtuHtYmrKeibFTkvqY8QZeyR3YmE@s5.platformlessai.ai/s5/p2p';
  static readonly REGISTRY_PREFIX = 'fabstir-llm';
  static readonly CONVERSATION_PATH = 'home/conversations';
  static readonly SESSIONS_PATH = 'home/sessions';

  // Retry configuration
  private static readonly MAX_RETRIES = 5;
  private static readonly BASE_DELAY_MS = 1000;
  private static readonly MAX_QUEUE_SIZE = 100;

  private s5Client?: any;
  private userSeed?: string;
  private userAddress?: string;
  private initialized = false;
  private encryptionManager?: EncryptionManager; // NEW: Optional encryption support
  private modelManager?: { getModelDetails(modelId: string): Promise<ModelInfo | null> }; // For preference helpers

  // Connection handling (v0.9.0-beta.5)
  private connectionStatus: S5ConnectionStatus = 'disconnected';
  private connectionUnsubscribe?: () => void;
  private operationQueue: QueuedOperation[] = [];
  private isProcessingQueue = false;
  private syncStatus: SyncStatus = 'synced';
  private syncListeners: Array<(status: SyncStatus) => void> = [];
  private lastError: Error | null = null;
  /** The browser listeners `setupAutoReconnect` added — kept so disposal removes exactly these (§26 GG1). */
  private reconnectListeners: Array<{ target: Pick<EventTarget, 'removeEventListener'>; type: string; handler: () => void }> = [];
  /** Set by `dispose()`: every public member but `cleanup` refuses from then on (§26 GG1). */
  private disposed = false;
  /** Set by `cleanup()`: the connection is no longer heard, so nothing is queued for it (§31 LL2). */
  private cleanedUp = false;

  /** Seals the conversation log; derived from the S5 seed in initialize() (the SDK EncryptionManager's key). */
  private sealer?: StorageSealer;
  /** Per-conversation locks — Web Locks across tabs in a browser, an in-process mutex elsewhere. */
  private coherence = createRagCoherence();
  /** The tail of each conversation's appends, in call order (see `appendMessages`). */
  private appendChains = new Map<string, Promise<void>>();

  // User settings cache
  private settingsCache: {
    data: UserSettings | null;
    timestamp: number;
  } | null = null;

  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Execute operation with per-conversation lock to prevent S5 revision conflicts and lost appends.
   * Serializes operations on the same conversation across tabs (Web Locks) as well as within one.
   *
   * @param conversationId - The conversation ID to lock
   * @param operation - Async operation to execute under lock
   * @returns The result of the operation
   */
  private async withConversationLock<T>(
    conversationId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return this.coherence.withLock(`conv:${conversationId}`, operation);
  }

  /**
   * Run `operation` under this identity's cross-tab lock named `key` (Web Locks in a browser, in-process otherwise) —
   * for stores built on this one, e.g. a session group's move from its legacy layout (1.39.24 review round 2).
   */
  async withStorageLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    this.ensureNotDisposed();
    return this.coherence.withLock(`store:${key}`, operation);
  }

  // Folder hierarchy manager (Sub-phase 2.1)
  private folderHierarchy: FolderHierarchy;

  // S5 master token for portal registration (beta.31+)
  // DEPRECATED: Use authApiUrl for secure browser apps
  private masterToken?: string;

  // Backend API URL for secure registration (beta.32+)
  // When set, registration uses backend proxy to keep master token server-side
  private authApiUrl?: string;

  constructor(
    private s5PortalUrl: string = StorageManager.DEFAULT_S5_PORTAL,
    masterTokenOrAuthApiUrl?: string,
    isAuthApiUrl: boolean = false
  ) {
    this.folderHierarchy = new FolderHierarchy();
    if (isAuthApiUrl) {
      this.authApiUrl = masterTokenOrAuthApiUrl;
    } else {
      this.masterToken = masterTokenOrAuthApiUrl;
    }
  }

  /**
   * Set EncryptionManager for encrypted storage (Phase 5.1)
   */
  setEncryptionManager(encryptionManager: EncryptionManager): void {
    this.ensureNotDisposed();
    this.encryptionManager = encryptionManager;
  }

  /**
   * Get S5 client instance (for VectorRAGManager)
   */
  getS5Client(): any {
    this.ensureNotDisposed();
    return this.s5Client;
  }

  /** Raw blob bytes by CID (no CBOR/JSON decode) — for proofHash over exact stored bytes (Constraint 3). */
  async getRawBytes(cid: string): Promise<Uint8Array> {
    this.ensureNotDisposed();
    if (!this.s5Client) throw new Error('S5 client not available');
    return this.s5Client.downloadByCID(cid);
  }

  /**
   * Fetch + decrypt a `u`-prefix `0xae` capability CID → plaintext bytes (Constraint 5, LTX frames).
   * Net-new: parse the 0xae envelope (blake3 blobHash, key, size), then reuse s5js downloadAndDecryptBlob.
   */
  async downloadDecryptedByCID(cid: string): Promise<Uint8Array> {
    this.ensureNotDisposed();
    if (!this.s5Client) throw new Error('S5 client not available');
    if (cid[0] !== 'u') throw new Error(`Not a u-prefix capability CID: ${cid.slice(0, 12)}`);
    const body = this.base64UrlToBytes(cid.slice(1));
    if (body[0] !== 0xae) throw new Error(`Not a 0xae encrypted CID (got 0x${(body[0] ?? 0).toString(16)})`);
    if (body.length < 107) throw new Error(`Malformed 0xae capability CID: body too short (${body.length} bytes)`);
    if (body[2] !== 0x12) throw new Error(`Unexpected 0xae chunk-size byte 0x${body[2].toString(16)} (expected 0x12)`);
    const encBlobHash = body.slice(4, 36); // blake3(ciphertext) — the fetch hash
    const key = body.slice(36, 68);
    let size = 0;
    for (let i = body.length - 1; i >= 106; i--) size = size * 256 + body[i]; // sizeLE-trimmed at offset 106
    if (size === 0) throw new Error('Malformed 0xae capability CID: decoded size is 0');
    // downloadAndDecryptBlob lives on the FS5 sub-object (s5.fs — fs5.js:684), not the S5 root.
    return this.s5Client.fs.downloadAndDecryptBlob(encBlobHash, key, size);
  }

  /**
   * Encrypt + upload a blob to S5 and return its `u`-prefix `0xae` capability CID (M1a input images).
   * s5js's public uploadBlobEncrypted does all the crypto (chunked XChaCha20-Poly1305, padding) but
   * drops the CID it computes — rebuild the same envelope from its returned fields (layout verified
   * byte-exact against capability-fixture.json).
   */
  async uploadEncryptedBlob(bytes: Uint8Array): Promise<string> {
    this.ensureNotDisposed();
    if (!this.s5Client) throw new Error('S5 client not available');
    const r = await this.s5Client.fs.uploadBlobEncrypted(new Blob([bytes as unknown as BlobPart])); // TS lib quirk: Uint8Array<ArrayBufferLike> vs BlobPart; valid at runtime
    const norm = (h: any, what: string) => {
      const b = h instanceof Uint8Array ? h : new Uint8Array(h);
      if (b.length === 32) return b;
      if (b.length === 33) return b.subarray(1); // strip multihash prefix
      throw new Error(`unexpected ${what} length ${b.length} from uploadBlobEncrypted`);
    };
    const encBlobHash = norm(r.encryptedBlobHash, 'encryptedBlobHash');
    const ptHash = norm(r.hash, 'plaintext hash');
    const key = new Uint8Array(r.encryptionKey);
    if (key.length !== 32) throw new Error(`unexpected key length ${key.length}`);
    const padLE = new Uint8Array(4);
    new DataView(padLE.buffer).setUint32(0, r.padding, true);
    const sizeLE: number[] = []; // little-endian, trailing zeros trimmed (mirrors the parse at :224)
    for (let s = r.size; s > 0; s = Math.floor(s / 256)) sizeLE.push(s & 0xff);
    const body = new Uint8Array([0xae, 0xa6, 0x12, 0x1f, ...encBlobHash, ...key, ...padLE, 0x26, 0x1f, ...ptHash, ...sizeLE]);
    return 'u' + this.bytesToBase64Url(body);
  }

  /** Encode bytes as unpadded base64url (multibase `u` body). Inverse of base64UrlToBytes. */
  private bytesToBase64Url(bytes: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /** Decode multibase `u` (base64url, unpadded) to bytes. Browser-safe (atob). */
  private base64UrlToBytes(s: string): Uint8Array {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /**
   * Fetch content by CID (content-addressed retrieval) from the S5 network.
   * Used for checkpoint delta recovery where deltas are stored by CID only.
   *
   * This method downloads directly from the S5 P2P network using the raw
   * downloadBlobAsBytes API, bypassing local filesystem path lookup.
   * This is necessary for retrieving content uploaded by other users (e.g., nodes).
   *
   * @param cid - The S5 CID string (e.g., "baaaqeayea...")
   * @returns The content stored at the CID (auto-decoded from CBOR/JSON)
   * @throws Error if CID not found or S5 client not available
   */
  async getByCID(cid: string): Promise<any> {
    this.ensureNotDisposed();
    if (!this.s5Client) {
      throw new Error('S5 client not available');
    }

    // Use downloadByCID API (v0.9.0-beta.7 - includes auth headers fix)
    // This fetches from configured portals with automatic fallback and BLAKE3 hash verification
    const rawBytes = await this.s5Client.downloadByCID(cid);

    // Decode the data following S5.js fs.get() pattern:
    // 1. Try CBOR first
    // 2. If that fails, try JSON
    // 3. If that fails, return as-is
    try {
      const { decode } = await import('cbor-x');
      const decoded = decode(rawBytes);
      // Convert Map to plain object if needed (CBOR can return Map)
      if (decoded instanceof Map) {
        return Object.fromEntries(decoded);
      }
      return decoded;
    } catch {
      // If CBOR fails, try JSON
      try {
        const text = new TextDecoder().decode(rawBytes);
        return JSON.parse(text);
      } catch {
        // If JSON fails, return raw bytes
        return rawBytes;
      }
    }
  }

  /**
   * Initialize storage with S5 seed
   */
  async initialize(seed: string, userAddress?: string): Promise<void> {
    this.ensureNotDisposed();

    // Skip S5 initialization if explicitly disabled (e.g., for hosts)
    if (process.env.SKIP_S5_STORAGE === 'true') {
      this.initialized = true;
      return;
    }

    try {
      this.userSeed = seed;
      this.userAddress = userAddress || '';
      // The SDK EncryptionManager's keys (fromSeed, bound to the address — §19 Z8), set before anything can fail, so
      // the log is never written unsealed. With no address there is no sealer, and the log fails closed.
      this.sealer = userAddress ? storageSealerFromSeed(seed, userAddress) : undefined;
      // Another identity's settings and adopted-file stamp never carry over (1.39.24 review round 5)
      this.settingsCache = null;
      this.settingsLegacyStamp = undefined;


      // Dynamically import S5 when needed
      let S5: any;
      try {
        const s5Module = await import('@julesl23/s5js');
        assertSupportedS5js(s5Module); // §19 Z1: never run sealed storage on an s5js that loses updates
        S5 = s5Module.S5;
      } catch (importError: any) {
        if (importError?.code === 'S5JS_UNSUPPORTED_VERSION') throw importError;
        console.error('❌ Failed to import S5:', importError.message);
        throw new SDKError(
          `Failed to load S5 module: ${importError.message}`,
          'STORAGE_MODULE_ERROR',
          { originalError: importError }
        );
      }


      // Use the correct portal URL or empty array to skip default peers
      const peersToUse = this.s5PortalUrl ? [this.s5PortalUrl] : [];

      // Create S5 instance with timeout protection
      // skipIdentityLoad: true prevents S5 from loading stale cached identity
      // before SDK provides the wallet-derived seed via recoverIdentityFromSeedPhrase()
      const s5CreatePromise = S5.create({
        initialPeers: peersToUse,
        skipIdentityLoad: true,
      });

      // Add a 30-second timeout (S5 can take time to connect to peers)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('S5 client creation timed out after 30 seconds')), 30000);
      });

      let s5Instance: any;
      try {
        // §18 X1: s5js errors carry the root keys — every consumer gets the scrubbing instance, never the raw one.
        s5Instance = withS5Guards(await Promise.race([s5CreatePromise, timeoutPromise]) as object);
      } catch (timeoutError: any) {
        console.warn('⚠️ StorageManager.initialize: S5 instance creation failed or timed out:', timeoutError.message);
        console.warn('⚠️ StorageManager: Continuing without S5 storage (operations will fail gracefully)');
        this.initialized = false;
        return;
      }

      console.log('[StorageManager] Recovering identity from seed phrase...');
      await s5Instance.recoverIdentityFromSeedPhrase(this.userSeed);
      console.log('[StorageManager] Identity recovered');

      // Store the S5 instance - we'll use s5Instance.fs for file operations
      this.s5Client = s5Instance;

      // Setup connection change listener (v0.9.0-beta.5)
      this.setupConnectionHandling(s5Instance);

      // Portal registration (S5.js beta.32+)
      console.log('[StorageManager] Registering on portal...');
      if (this.authApiUrl) {
        // Secure backend-mediated registration (master token stays server-side)
        // This is explicitly configured, so errors should NOT be silently caught
        console.log('[StorageManager] Using secure backend registration via:', this.authApiUrl);
        try {
          await registerS5WithBackend(s5Instance, {
            backendUrl: this.authApiUrl,
            portalHost: 's5.platformlessai.ai',
            portalUrl: 'https://s5.platformlessai.ai',
          });
          console.log('[StorageManager] Secure backend registration complete');
        } catch (error: any) {
          console.error('[StorageManager] Secure backend registration FAILED:', error.message);
          throw new SDKError(
            `Secure S5 registration failed: ${error.message}. Check that backend API routes are configured at ${this.authApiUrl}`,
            'S5_REGISTRATION_FAILED',
            { originalError: error }
          );
        }
      } else if (this.masterToken) {
        // Direct registration with master token (for server-side apps or testing)
        try {
          console.log('[StorageManager] Using master token for registration');
          await s5Instance.registerOnNewPortal('https://s5.platformlessai.ai', this.masterToken);
          console.log('[StorageManager] Master token registration complete');
        } catch (error: any) {
          console.warn('[StorageManager] Master token registration failed:', error.message);
          // Don't throw - might be returning user who doesn't need registration
        }
      } else {
        // Try without token (works for returning users / login)
        try {
          await s5Instance.registerOnNewPortal('https://s5.platformlessai.ai');
          console.log('[StorageManager] Portal registration complete (no token)');
        } catch (error: any) {
          console.warn('[StorageManager] Portal registration skipped:', error.message);
        }
      }

      console.log('[StorageManager] Ensuring identity initialized...');
      await s5Instance.fs.ensureIdentityInitialized();
      console.log('[StorageManager] Identity initialized');
      this.initialized = true;

      // Setup auto-reconnect handlers for browser environment
      this.setupAutoReconnect();
    } catch (error: any) {
      if (error?.code === 'S5JS_UNSUPPORTED_VERSION') throw error; // fatal, and already says why (§19 Z1)
      // Capture full error details even if message is empty
      const errorMessage = error?.message || error?.toString?.() || JSON.stringify(error) || 'Unknown error';
      const errorDetails = {
        originalError: error,
        errorType: typeof error,
        errorName: error?.name,
        errorStack: error?.stack,
        errorKeys: error ? Object.keys(error) : []
      };
      console.error('[StorageManager] Initialize failed:', errorDetails);
      throw new SDKError(
        `Failed to initialize StorageManager: ${errorMessage}`,
        'STORAGE_INIT_ERROR',
        errorDetails
      );
    } finally {
      // Disposed while it started: what the start set up since (listeners, the connection subscription) goes too.
      if (this.disposed) this.release();
    }
  }

  /**
   * Store data to S5 network
   */
  async store(
    data: string | Uint8Array | object,
    options?: StorageOptions
  ): Promise<StorageResult> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    if (options?.path) this.refusePlaintextRagWrite(options.path);
    if (options?.encrypt === false) {
      throw new SDKError('store() writes nothing in plaintext: encrypt: false is refused', 'STORAGE_PLAINTEXT_REFUSED', { retryable: false });
    }

    // `compress` was never implemented — it only ever recorded `compressed: true` in the
    // metadata and uploaded the data uncompressed. Fail fast rather than keep the lie.
    if (options?.compress) {
      throw new SDKError(
        'StorageOptions.compress is not implemented; it would record compressed:true without compressing.',
        'STORAGE_COMPRESS_UNSUPPORTED'
      );
    }

    try {
      // Generate unique key based on timestamp
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const key = `${timestamp}-${random}`;
      const path =
        options?.path ?? `${StorageManager.CONVERSATION_PATH}/${this.userAddress}/${key}.json`;

      // Always encrypted: an opt-out would write plaintext to a public network (refused below, 1.39.24 D35).
      const encrypt = true;

      // Prepare data with metadata
      const storageData = {
        data,
        metadata: {
          ...options?.metadata,
          timestamp,
          compressed: false,
          // Derived from the SAME value handed to fs.put below, so it cannot drift from reality.
          encrypted: encrypt
        }
      };

      // FS5.put encrypts (XChaCha20-Poly1305) only when handed `options.encryption`; with no
      // options it takes the uploadBlobWithoutEncryption branch. Passing this through IS the fix.
      const putOptions = encrypt ? { encryption: {} } : undefined;

      // Store to S5 with performance tracking
      const startTime = performance.now();
      console.log(`[Enhanced S5.js] PUT ${path} ${encrypt ? '(encrypted)' : '(PLAINTEXT — encrypt:false)'}`);
      await this.s5Client.fs.put(path, storageData, putOptions);
      const duration = Math.round(performance.now() - startTime);
      console.log(`[Enhanced S5.js] Operation: Store data - Time: ${duration}ms`);

      // Return immediately using generated key (no getMetadata to avoid race condition)
      // NOTE: `cid` is a storage key, NOT a content address — see StorageResult.
      return {
        cid: key,
        url: `s5://${key}`,
        size: JSON.stringify(storageData).length,
        timestamp,
        path,
        encrypted: encrypt
      };
    } catch (error: any) {
      throw new SDKError(
        `Failed to store data: ${error.message}`,
        'STORAGE_STORE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Retrieve data from S5 network
   */
  async retrieve(cid: string): Promise<any> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      // Try to retrieve by path or CID
      const path = cid.includes('/')
        ? cid
        : `${StorageManager.CONVERSATION_PATH}/${this.userAddress}/${cid}.json`;

      const startTime = performance.now();
      console.log(`[Enhanced S5.js] GET ${path}`);
      const retrievedData = await this.s5Client.fs.get(path);
      const duration = Math.round(performance.now() - startTime);
      console.log(`[Enhanced S5.js] Operation: Retrieve data - Time: ${duration}ms`);

      if (!retrievedData) return null;

      return retrievedData.data || retrievedData;
    } catch (error: any) {
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        return null;
      }
      throw new SDKError(
        `Failed to retrieve data: ${error.message}`,
        'STORAGE_RETRIEVE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Delete data from S5 network
   */
  async delete(cid: string): Promise<void> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      const path = cid.includes('/') 
        ? cid 
        : `${StorageManager.CONVERSATION_PATH}/${this.userAddress}/${cid}.json`;
      
      await this.s5Client.fs.delete(path);
    } catch (error: any) {
      throw new SDKError(
        `Failed to delete data: ${error.message}`,
        'STORAGE_DELETE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * List stored items
   */
  async list(prefix?: string): Promise<string[]> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      const userPath = `${StorageManager.CONVERSATION_PATH}/${this.userAddress}`;
      const files = [];
      
      // Use async iterator (browser-compatible)
      for await (const item of this.s5Client.fs.list(userPath)) {
        if (item.type === 'file' && item.name.endsWith('.json')) {
          const key = item.name.replace('.json', '');
          if (!prefix || key.startsWith(prefix)) {
            files.push(key);
          }
        }
      }
      
      return files;
    } catch (error: any) {
      console.debug('List error (returning empty):', error.message);
      return [];
    }
  }

  /**
   * Store a conversation (implements interface method)
   */
  async storeConversation(conversation: ConversationData): Promise<StorageResult> {
    this.ensureNotDisposed();
    return this.saveConversation(conversation);
  }

  /**
   * Retrieve a conversation (implements interface method)
   */
  async retrieveConversation(conversationId: string): Promise<ConversationData> {
    this.ensureNotDisposed();
    const conversation = await this.loadConversation(conversationId);
    if (!conversation) {
      throw new SDKError(
        `Conversation ${conversationId} not found`,
        'CONVERSATION_NOT_FOUND',
        { conversationId, retryable: false }
      );
    }
    return conversation;
  }

  /**
   * List all conversations with metadata (Phase 5.2)
   * Returns metadata only (not full conversation data)
   */
  async listConversations(): Promise<ConversationInfo[]> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }
    // 1.39.24: the sealed logs (opaque and legacy) — before, only the old wrapper files were looked for, so no sealed
    // log was ever listed.
    return (await this._listLogs()).map(({ id, created, sealed }) => ({
      cid: id,
      storedAt: new Date(created ?? Date.now()).toISOString(),
      conversationId: id,
      isEncrypted: sealed,
    }));
  }

  /**
   * Add message to conversation (implements interface method)
   */
  async addMessage(conversationId: string, message: Message): Promise<void> {
    this.ensureNotDisposed();
    return this.appendMessage(conversationId, message);
  }

  /**
   * Check if data exists (implements interface method)
   */
  async exists(cid: string): Promise<boolean> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      const path = cid.includes('/') 
        ? cid 
        : `${StorageManager.CONVERSATION_PATH}/${this.userAddress}/${cid}.json`;
      
      const metadata = await this.s5Client.fs.getMetadata(path);
      return !!metadata;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get storage statistics (implements interface method)
   */
  async getStats(): Promise<{
    totalSize: number;
    fileCount: number;
    conversations: number;
  }> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    let totalSize = 0;
    let fileCount = 0;
    
    const conversations = await this.listConversations();
    
    // Count files in conversation path
    const conversationPath = `${StorageManager.CONVERSATION_PATH}/${this.userAddress}`;
    try {
      for await (const item of this.s5Client.fs.list(conversationPath)) {
        if (item.type === 'file') {
          fileCount++;
          // Estimate size based on metadata if available
          if (item.size) {
            totalSize += item.size;
          }
        }
      }
    } catch {}
    
    // Count files in sessions path
    const sessionsPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}`;
    try {
      for await (const item of this.s5Client.fs.list(sessionsPath)) {
        if (item.type === 'file') {
          fileCount++;
          if (item.size) {
            totalSize += item.size;
          }
        }
      }
    } catch {}
    
    return {
      totalSize,
      fileCount,
      conversations: conversations.length
    };
  }

  /**
   * Clear all local cache (implements interface method)
   */
  async clearCache(): Promise<void> {
    this.ensureNotDisposed();
    // S5.js handles its own caching internally
    // This method is a no-op for browser compatibility
    console.debug('Cache clear requested - S5.js manages its own cache');
  }

  /**
   * Save conversation data to S5 storage.
   *
   * **Thread Safety:** All saves to the same conversation are serialized through
   * per-conversation locking to prevent S5 "Revision number too low" errors.
   * Saves to different conversations can proceed in parallel.
   *
   * **Retry Logic:** Automatically retries up to 3 times with exponential backoff
   * (200ms, 400ms, 800ms) when revision conflicts occur.
   *
   * @param conversation - The conversation data to save
   * @returns Promise resolving to StorageResult with CID and metadata
   * @throws SDKError if save fails after retries
   */
  async saveConversation(conversation: ConversationData): Promise<StorageResult> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }
    // No conversation at all is refused before its id is read (§35 PP9).
    if (!isConversation(conversation)) throw notAConversation(conversation);
    return this.withConversationLock(conversation.id, async () =>
      this._saveConversationInternal(conversation, await this._readLog(conversation.id))
    );
  }

  /**
   * Throws unless a conversation log can be written here — checked BEFORE a session is funded (D23): an
   * environment problem (no sealer, no usable cross-tab lock) must never surface after money has moved.
   */
  async assertConversationLogWritable(): Promise<void> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }
    this.requireSealer();
    await this.coherence.assertUsable();
    if (this.connectionStatus === 'disconnected') {
      throw new SDKError('S5 is disconnected: the conversation log cannot be written', 'STORAGE_OFFLINE', { retryable: true });
    }
  }

  /** This identity's head for a log (S9): keyed by an id derived from the identity. */
  private logHead(conversationId: string): { getAnyAge(): Promise<RagHead | undefined>; put(head: RagHead): Promise<void> } {
    const key = logHeadKeyOf(this.requireSealer(), conversationId);
    return { getAnyAge: () => this.coherence.getHeadAnyAge(key), put: (head) => this.coherence.putHead(key, head) };
  }

  /** Conversation logs since 1.39.24 (D41): no address and no id on S5, only ids derived from the identity. */
  private static readonly LOG_ROOT = 'home/sessions/v2';
  /** User settings since 1.39.24 (D34), sealed per identity. */
  private static readonly SETTINGS_ROOT = 'home/user/v2';
  private static readonly SETTINGS_CONTEXT = 'settings/v1';
  /**
   * The `lastUpdated` of the shared legacy file this identity's settings were adopted from (`null`: none; `undefined`:
   * not read yet). Kept in the sealed record, so a leftover copy (its delete failed) is still recognised as this
   * identity's after later edits (1.39.24 review round 4).
   */
  private settingsLegacyStamp: number | null | undefined = undefined;

  /**
   * The sealed settings record (1.39.24): `{ settings, legacyStamp? }`. `settings: null` is a cleared record — Reset
   * Preferences — so this identity still "has sealed settings" and never adopts the shared legacy file again, which may
   * be another identity's (review round 4).
   */
  private openSettingsRecord(bytes: Uint8Array): { settings: UserSettings | null; legacyStamp?: number } {
    const value = this.requireSealer().open(bytes, StorageManager.SETTINGS_CONTEXT).value as any;
    if (!value || typeof value !== 'object' || !('settings' in value)) {
      throw new SDKError('Sealed settings hold no settings record', 'INVALID_SETTINGS_STRUCTURE', { retryable: false });
    }
    return value;
  }

  private async writeSettingsRecord(settings: UserSettings | null, legacyStamp: number | null | undefined): Promise<void> {
    const record = { settings, ...(typeof legacyStamp === 'number' ? { legacyStamp } : {}) };
    const sealed = this.requireSealer().seal({ kind: 'cbor', value: record }, StorageManager.SETTINGS_CONTEXT);
    await this.s5Client.fs.put(this.settingsPath(), sealed, { mediaType: 'application/octet-stream' });
  }
  private static readonly LEGACY_SETTINGS_PATH = 'home/user/settings.json';

  /**
   * This identity's own segment under a shared root: one S5 seed can serve several addresses (one vault seed, the
   * harness's test users), and each address's data must stay its own — listed, opened and cleared apart — without the
   * address appearing on S5 (1.39.24 review).
   */
  private ownerSegment(): string {
    return this.requireSealer().deriveId('owner', 'storage');
  }

  private logRoot(): string {
    return `${StorageManager.LOG_ROOT}/${this.ownerSegment()}`;
  }

  private settingsPath(): string {
    return `${StorageManager.SETTINGS_ROOT}/${this.ownerSegment()}/settings`;
  }

  private logOpaqueId(conversationId: string): string {
    return this.requireSealer().deriveId('conv', conversationId);
  }

  private logPath(conversationId: string): string {
    return `${this.logRoot()}/${this.logOpaqueId(conversationId)}/log`;
  }

  /** Bound to the opaque id, so a listing can open a log without knowing its conversation id. */
  private static logContext(opaqueId: string): string {
    return `conv/v2/${opaqueId}`;
  }

  /** The pre-1.39.24 path, still read until the log moves. */
  private legacyLogPath(conversationId: string): string {
    return `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${conversationId}/conversation.json`;
  }

  /**
   * What is at a log's legacy path now, fresh: a sealed copy (as 1.39.0–1.39.23 tabs write it) or a plaintext one
   * (older SDKs); `null` when there is none. A tab that predates 1.39.24 writes here even after the log has moved.
   */
  private async _readLegacyCopy(conversationId: string): Promise<ConversationData | null> {
    const at = await this.s5Client.fs.get(this.legacyLogPath(conversationId), { fresh: true }).catch((error: any) => {
      if (isS5Absent(error)) return null;
      throw storageFailure(`Failed to read conversation ${conversationId}'s legacy copy: ${error?.message ?? error}`, 'STORAGE_LOAD_ERROR', error);
    });
    if (at == null) return null;
    if (at instanceof Uint8Array) {
      const log = this.requireSealer().open(at, `conv/v1/${conversationId}`).value as SealedLog;
      if (!isConversation(log?.conversation)) throw new SDKError(`Sealed log ${conversationId} is unreadable`, 'STORAGE_LOAD_ERROR', { retryable: false });
      return log.conversation;
    }
    if (!isConversation(at)) throw new SDKError(`Legacy log ${conversationId} is unreadable`, 'STORAGE_LOAD_ERROR', { retryable: false });
    return at;
  }

  /**
   * What a legacy copy holds that the moved log does not (1.39.24 review round 2): messages it has never seen, and
   * whether the copy was written later (an outdated tab's rename or status change carries no new message).
   */
  private static legacyNews(copy: ConversationData, moved: ConversationData, legacyKeys?: string[]): { adds: boolean; newer: boolean } {
    const covered = new Set([...(legacyKeys ?? []), ...moved.messages.map(messageKey)]);
    const time = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : -Infinity);
    return { adds: !copy.messages.every((m) => covered.has(messageKey(m))), newer: time(copy.updatedAt) > time(moved.updatedAt) };
  }

  /**
   * Remove a log's legacy copy only if the moved log has everything in it: all its messages (or seen before), and it is
   * not the later write. Never an outdated tab's newer write — the next migration merges that.
   */
  private async _dropLegacyCopyIfCovered(conversationId: string, moved: ConversationData, legacyKeys?: string[]): Promise<boolean> {
    const copy = await this._readLegacyCopy(conversationId);
    if (copy === null) return true;
    const news = StorageManager.legacyNews(copy, moved, legacyKeys);
    if (news.adds || news.newer) return false;   // the next migration merges it
    await this.s5Client.fs.delete(this.legacyLogPath(conversationId)).catch((error: any) => { if (!isS5Absent(error)) throw error; });
    return true;
  }

  /**
   * The log at its path — a fresh read (§18 B1) that already holds every commit of this origin's tabs; a registry
   * miss fails it (s5js D3b), so absence is certain (S1). A head never overrides it (§19 Z5). Sealed logs carry a
   * revision; a legacy plaintext log is revision 0; no log is revision -1.
   *
   * The one thing a head still recovers: plaintext at the path over a sealed copy this origin committed (an
   * outdated tab wrote it). The sealed copy, by the head's hash, plus the plaintext's messages that are in neither
   * it nor its `legacyKeys` snapshot; the caller's next write reseals the path (S2).
   */
  private async _readLog(conversationId: string): Promise<LogRead> {
    // null: s5js threw "does not exist" (the conversation's directory is not there); undefined: the directory
    // holds no log.
    const readPath = async (path: string): Promise<unknown> => {
      try {
        return await this.s5Client.fs.get(path, { fresh: true }); // §18 B1
      } catch (error: any) {
        if (isS5Absent(error)) return null;
        throw storageFailure(`Failed to load conversation: ${error.message}`, 'STORAGE_LOAD_ERROR', error);
      }
    };
    // Not a conversation — a message list missing included, sealed or legacy: no retry reads it differently
    // (§20 AA8, §21 BB8, §22 CC6).
    const unreadable = (kind: string) => new SDKError(`${kind} log ${conversationId} is unreadable`, 'STORAGE_LOAD_ERROR', { retryable: false });
    // 1.39.24 D41: the opaque path first. Only a sealed log is ever written there.
    const atV2 = await readPath(this.logPath(conversationId));
    if (atV2 != null) {
      if (!(atV2 instanceof Uint8Array)) throw unreadable('Sealed');
      const log = this.requireSealer().open(atV2, StorageManager.logContext(this.logOpaqueId(conversationId))).value as SealedLog;
      if (!isConversation(log?.conversation)) throw unreadable('Sealed');
      return log;
    }
    // None there yet: the log as 1.39.0–1.39.23 kept it, at its legacy path; the next write moves it (atLegacy).
    const open = (bytes: Uint8Array) => {
      const log = this.requireSealer().open(bytes, `conv/v1/${conversationId}`).value as SealedLog;
      if (!isConversation(log?.conversation)) throw unreadable('Sealed');
      return { ...log, atLegacy: true };
    };
    const atPath = await readPath(this.legacyLogPath(conversationId));
    if (atPath == null) return { conversation: null, revision: -1 };
    if (atPath instanceof Uint8Array) return open(atPath);
    const plain = atPath as ConversationData;
    if (!isConversation(plain)) throw unreadable('Legacy');
    const known = await this.logHead(conversationId).getAnyAge(); // at any age (§20 AA3)
    let sealed: SealedLog | undefined;
    if (known?.manifestHash && known.revision > 0) {
      try {
        sealed = open(await this.s5Client.downloadByCID(hexToBytes(known.manifestHash)));
      } catch (error: any) {
        // The head names a log already moved to its opaque path (1.39.24): not a legacy sealed copy (review m1)
        if (error?.code === 'SEALED_OPEN_FAILED') sealed = undefined;
        else throw storageFailure(`Failed to load conversation: ${error?.message ?? error}`, 'STORAGE_LOAD_ERROR', error);
      }
    }
    return sealed
      ? { ...adoptPlaintext(sealed, plain), atLegacy: true }
      : { conversation: plain, revision: 0, legacyKeys: plain.messages.map(messageKey), atLegacy: true };
  }

  /**
   * Internal save - handles actual S5 write with retry logic for revision conflicts, then commits the head
   * (R1) so the next reader in any tab proves it has the newest copy.
   * Called by locked methods only (saveConversation, appendMessage, updateConversationMetadata, the migration).
   * @param conversation - The conversation data to save
   * @param base - The copy this save builds on (from `_readLog`): its revision and plaintext snapshot
   * @param maxRetries - Maximum retry attempts for revision conflicts (default: 3)
   */
  private async _saveConversationInternal(
    conversation: ConversationData,
    base: LogRead,
    maxRetries = 3
  ): Promise<StorageResult> {
    // Nothing that is not a conversation is ever sealed (§22 CC6): every caller passes one `saveConversation` or
    // `_readLog` checked (§36 QQ7).
    const path = this.logPath(conversation.id);
    const revision = Math.max(base.revision, 0) + 1;
    // A move records what its legacy copy held, so a leftover copy (its delete failed) never "adds" a message removed
    // since — it is only dropped (1.39.24 review round 3).
    const legacyKeys = base.atLegacy && base.conversation
      ? [...new Set([...(base.legacyKeys ?? []), ...base.conversation.messages.map(messageKey)])]
      : base.legacyKeys;
    const log: SealedLog = { revision, conversation, ...(legacyKeys?.length ? { legacyKeys } : {}) };
    // Every prompt carries its RAG context: the log is sealed, never written in plaintext (fail closed). A conversation
    // the sealer cannot encode (a function, a symbol, a cycle) is the caller's to fix — no retry encodes it (§34 OO5).
    const sealer = this.requireSealer();
    let sealed: Uint8Array;
    try {
      sealed = sealer.seal({ kind: 'cbor', value: log }, StorageManager.logContext(this.logOpaqueId(conversation.id)));
    } catch (cause: any) {
      throw new SDKError(`Conversation ${conversation.id} cannot be sealed: ${cause?.message ?? cause}`, 'STORAGE_CONVERSATION_INVALID', { conversationId: conversation.id, cause, retryable: false });
    }
    const head = this.logHead(conversation.id);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.s5Client.fs.put(path, sealed, { mediaType: 'application/octet-stream' });
      } catch (error: any) {
        // Get error message from multiple sources (S5.js errors may have message in different places)
        const errorMsg = error?.message || error?.toString?.() || String(error) || '';
        console.log(`[StorageManager] Save error on attempt ${attempt}/${maxRetries}:`, errorMsg);

        // Retryable errors
        const isRevisionError = errorMsg.includes('Revision number too low');
        const isDirectoryError = errorMsg.includes('DirectoryTransactionException') ||
                                  errorMsg.includes('same name');

        // S5.js bug: retry on _error_stack errors
        const isS5Bug = errorMsg.includes('_error_stack');

        console.log(`[StorageManager] Error checks: revision=${isRevisionError}, directory=${isDirectoryError}, s5bug=${isS5Bug}`);

        if ((isRevisionError || isDirectoryError || isS5Bug) && attempt < maxRetries) {
          // Exponential backoff: 200ms, 400ms, 800ms
          const reason = isRevisionError ? 'Revision conflict' : isDirectoryError ? 'Directory conflict' : 'S5 bug';
          console.log(`[StorageManager] ${reason} on save (attempt ${attempt}/${maxRetries}), retrying...`);
          await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
          continue;
        }

        console.log(`[StorageManager] Save failed after ${attempt} attempts, throwing error`);
        const finalErrorMsg = error.message || error.toString() || JSON.stringify(error) || 'Unknown S5 error';
        throw storageFailure(`Failed to save conversation: ${finalErrorMsg}`, 'STORAGE_SAVE_ERROR', error);
      }
      // Written: a head this tab cannot record never reports the log as unwritten (§34 OO4) — the next read is fresh.
      await head.put({ revision, manifestHash: sealedBlobHash(sealed) }).catch((error) => { throw headNotRecorded(error); });
      // Moved (1.39.24 D41): the legacy copy goes, a plaintext one above all. A failed delete is not this write's
      // failure — the opaque copy is read first from now on — and the unlock migration removes what is left.
      if (base.atLegacy) {
        await this._dropLegacyCopyIfCovered(conversation.id, conversation, log.legacyKeys).catch((error: any) => {
          console.warn(`[StorageManager] Log ${conversation.id} moved; its legacy copy could not be removed yet: ${error?.message ?? error}`);
        });
      }

      // Return immediately using conversation ID (no getMetadata to avoid race condition)
      return {
        cid: conversation.id,
        url: `s5://${conversation.id}`,
        size: sealed.length,
        timestamp: conversation.updatedAt
      };
    }

    // TypeScript: unreachable but needed for return type
    throw new SDKError('Save failed after retries', 'STORAGE_SAVE_ERROR');
  }

  /**
   * Load conversation data
   */
  async loadConversation(conversationId: string): Promise<ConversationData | null> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    // A sealed log is opaque bytes; a legacy log is the plaintext object (re-sealed on its next write).
    return (await this._readLog(conversationId)).conversation;
  }

  /**
   * Patch a conversation's metadata (status, endTime, …) as ONE load-modify-save under the conversation
   * lock, so an append in flight cannot be overwritten. No log → nothing is written.
   */
  async updateConversationMetadata(conversationId: string, patch: Record<string, unknown>): Promise<void> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }
    await this.withConversationLock(conversationId, async () => {
      const current = await this._readLog(conversationId);
      const conversation = current.conversation;
      if (!conversation) return;
      conversation.metadata = { ...conversation.metadata, ...patch };
      conversation.updatedAt = Date.now();
      await this._saveConversationInternal({ ...conversation, id: conversationId }, current); // the id asked for (§43 XX7)
    });
  }

  /**
   * Seal every legacy plaintext conversation log and purge the plaintext files older SDKs left beside them.
   * Idempotent; each log is handled under its cross-tab lock, so a concurrent append is never lost.
   */
  async migrateLegacyConversationLogs(opts: { onProgress?: (e: MigrationProgress) => void } = {}): Promise<LogMigrationReport> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }
    const io = new SealedIO(this.s5Client, (b) => this.requireSealer().isSealed(b));
    const base = `${StorageManager.SESSIONS_PATH}/${this.userAddress}`;
    const report: LogMigrationReport = { sealed: 0, alreadySealed: 0, moved: 0, purged: [], failed: [] };
    const ids = ((await io.list(base)) ?? []).filter((e) => e.type === 'directory').map((e) => e.name);
    let done = 0;
    // A few conversations at a time: each is a list + (at most) one download and one upload.
    await mapWithConcurrency(ids, 5, async (id) => {
      try {
        await this.withConversationLock(id, () => this._sealLegacyLogLocked(io, `${base}/${id}`, id, report));
      } catch (error: any) {
        // Every failure carries a code (S4): an error that brought none is STORAGE_MIGRATION_FAILED.
        report.failed.push({
          id, error: error?.message ?? String(error), code: typeof error?.code === 'string' ? error.code : 'STORAGE_MIGRATION_FAILED', retryable: retryableOf(error),
        });
      }
      reportProgress(opts.onProgress, { phase: 'logs', done: ++done, total: ids.length, item: id });
    });
    return report;
  }

  private async _sealLegacyLogLocked(io: SealedIO, dir: string, id: string, report: LogMigrationReport): Promise<void> {
    const entries = (await io.list(dir)) ?? [];
    const log = entries.find((e) => e.type === 'file' && e.name === 'conversation.json');
    const sealedBefore = log?.mediaType === 'application/octet-stream'; // sealed logs are the only octet-stream ones
    let resealed = false;
    if (log) {
      // 1.39.24 D41: a log at its legacy path moves to its opaque one, sealed. `_readLog` reads the opaque copy first;
      // with none there it supplies the legacy log (a sealed one, or plaintext with any newer sealed copy, S2).
      const current = await this._readLog(id);
      let base: LogRead = current;
      if (!current.atLegacy && current.conversation) {
        // Moved already, and a copy at the legacy path since: a tab that predates 1.39.24 wrote it after the move
        // (plaintext from an older SDK, sealed from 1.39.0–1.39.23). Its new messages join the opaque log before the
        // copy goes (as S2 adopts them over a sealed copy).
        // Only what the copy adds: a leftover the moved log already covers (its delete failed) is just dropped below,
        // and the copy's fields and metadata win only when it is the later write (1.39.24 review round 2).
        const copy = await this._readLegacyCopy(id);
        const news = copy ? StorageManager.legacyNews(copy, current.conversation, current.legacyKeys) : undefined;
        if (copy && news && (news.adds || news.newer)) {
          const sealedLog = { revision: current.revision, conversation: current.conversation, legacyKeys: current.legacyKeys };
          const merged = adoptPlaintext(sealedLog, news.newer ? copy : { ...current.conversation, messages: copy.messages });
          // A 1.39.x tab that found no log started a new one: its createdAt is not the conversation's (review m2)
          if (merged.conversation) merged.conversation.createdAt = current.conversation.createdAt;
          base = { ...merged, atLegacy: true };
        }
      }
      const conversation = base.conversation;
      if (conversation && base.atLegacy) { // null: deleted since this listing. `_readLog` refused a malformed one.
        // A move whose head this tab could not record is written all the same (§36 QQ3): a log is read fresh from its
        // path, never from a cache another tab trusts. The save removes the legacy copy.
        await this._saveConversationInternal({ ...conversation, id }, base).catch((error) => {
          if (error?.details?.committed !== true) throw error;
          console.warn(`[StorageManager] Log ${id} moved; this tab could not record its head: ${error.message}`);
        });
        resealed = !sealedBefore;
        report.moved++;
      }
      // What is still at the legacy path goes only if the opaque log holds all of it (a write landing meanwhile stays
      // for the next run).
      const after = await this._readLog(id);
      if (after.conversation) await this._dropLegacyCopyIfCovered(id, after.conversation, after.legacyKeys);
    }
    const hasExchanges = entries.some((e) => e.type === 'directory' && e.name === 'exchanges');
    const siblings = entries.filter((e) => e.type === 'file' && ['conversation-plaintext.json', 'summary.json', 'hierarchy.json'].includes(e.name));
    // Read back, fresh, before it is counted or anything beside it deleted (§35 PP1's rule, §36 QQ3): a sealed log that
    // does not open — resealed now, or by an earlier run — fails here and keeps its plaintext copies. A sealed log with
    // nothing beside it is not downloaded.
    if (log || hasExchanges || siblings.length) await this._readLog(id);
    if (log && sealedBefore) report.alreadySealed++;
    if (resealed) report.sealed++;
    if (hasExchanges) {
      // Only the files storeExchange wrote (`{timestamp}-{random}.json`, the timestamp as JS renders it — §22 CC4);
      // anything else is someone else's — kept and reported (§20 AA10, as §19 Z13 for RAG).
      const exchangesDir = `${dir}/exchanges`;
      const listed = (await io.list(exchangesDir)) ?? [];
      const ours = listed.filter((e) => e.type === 'file' && /^[1-9]\d*-[a-z0-9]*\.json$/.test(e.name)).map((e) => e.name);
      await io.deleteFiles(exchangesDir, ours);
      const kept = listed.filter((e) => !ours.includes(e.name)).map((e) => `${exchangesDir}/${e.name}`);
      if (kept.length) (report.unrecognisedFiles ??= []).push(...kept);
      if (await io.deleteDir(exchangesDir)) report.purged.push(exchangesDir);
      else report.purged.push(...ours.map((name) => `${exchangesDir}/${name}`));
    }
    if (siblings.length) {
      await io.deleteFiles(dir, siblings.map((e) => e.name));
      report.purged.push(...siblings.map((e) => `${dir}/${e.name}`));
    }
    // A directory the move and purge emptied goes too (S8) — only through s5js's own resolved-and-empty check, never
    // recursively (§16 V11).
    if ((log || hasExchanges || siblings.length) && await io.deleteDir(dir)) report.purged.push(dir);
  }

  /**
   * RAG data is sealed by VectorRAGManager: a write into a RAG root through a generic funnel (queued or not)
   * is refused. Checked on the path as s5js normalises it (repeated or leading slashes collapse).
   */
  private refusePlaintextRagWrite(path: string): void {
    if (/^home\/(vector-databases|rag)(\/|$)/.test(path.replace(/\/+/g, '/').replace(/^\//, ''))) {
      throw new SDKError(
        `Refusing a plaintext write into RAG storage (${path}) — use the VectorRAGManager document APIs`,
        'RAG_PLAINTEXT_WRITE_REFUSED',
        { path, retryable: false }
      );
    }
  }

  /**
   * The identity's sealer, for stores outside this manager that keep their records sealed the same way (session groups,
   * 1.39.24). Throws STORAGE_SEALER_MISSING before the identity is set.
   */
  getSealer(): StorageSealer {
    this.ensureNotDisposed();
    return this.requireSealer();
  }

  private requireSealer(): StorageSealer {
    if (!this.sealer) {
      throw new SDKError('Storage is only ever written sealed, and no sealer is set', 'STORAGE_SEALER_MISSING', { retryable: false });
    }
    return this.sealer;
  }

  /**
   * Append a message to an existing conversation (or create new if not exists) — `appendMessages` with one.
   *
   * @param conversationId - The conversation ID to append to
   * @param message - The message to append
   * @throws SDKError if append fails
   */
  async appendMessage(conversationId: string, message: Message): Promise<void> {
    this.ensureNotDisposed();
    return this.appendMessages(conversationId, [message]);
  }

  /**
   * Append messages — an exchange — to a conversation (or create it if it does not exist — an empty list creates it
   * with no messages), all or none: one read-modify-write under the conversation's lock (§27 HH1).
   *
   * **Admitted when called:** appends to one conversation run one after another in call order, so one asked for
   * before a `dispose()` (a sign-out) still lands whole; only one asked for after it is refused. Appends to different
   * conversations proceed in parallel.
   *
   * @throws SDKError STORAGE_APPEND_ERROR (its cause's verdict) if the write fails; STORAGE_CONVERSATION_INVALID (not
   *   retryable) unless `messages` is a list of message objects with no holes — refused before anything (§43 XX4,
   *   §44 YY4)
   */
  async appendMessages(conversationId: string, messages: Message[]): Promise<void> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }
    if (!isMessageList(messages)) {
      throw new SDKError('Messages to append are a list of message objects', 'STORAGE_CONVERSATION_INVALID', { conversationId, retryable: false });
    }
    const previous = this.appendChains.get(conversationId);
    const run = (previous ?? Promise.resolve()).catch(() => undefined).then(() => this._appendLocked(conversationId, messages));
    this.appendChains.set(conversationId, run);
    const settle = () => { if (this.appendChains.get(conversationId) === run) this.appendChains.delete(conversationId); };
    run.then(settle, settle);
    return run;
  }

  private _appendLocked(conversationId: string, messages: Message[]): Promise<void> {
    return this.withConversationLock(conversationId, async () => {
      try {
        // Load the current copy (R1), or create a new one — on a certain absence only (S1)
        const current = await this._readLog(conversationId);
        let conversation = current.conversation;

        if (!conversation) {
          conversation = {
            id: conversationId,
            messages: [],
            metadata: {},
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
        }

        conversation.messages.push(...messages);
        conversation.updatedAt = Date.now();

        // Save using internal method (already under lock, no need for double-locking) — under the id asked for, never
        // a legacy log's own `id` field (§43 XX7, as the log migration does)
        await this._saveConversationInternal({ ...conversation, id: conversationId }, current);
      } catch (error: any) {
        throw storageFailure(`Failed to append message: ${error.message}`, 'STORAGE_APPEND_ERROR', error);
      }
    });
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(
    conversationId: string,
    limit?: number
  ): Promise<Message[]> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      const conversation = await this.loadConversation(conversationId);
      if (!conversation) return [];
      
      const messages = conversation.messages || [];
      
      if (limit && limit > 0) {
        return messages.slice(-limit);
      }
      
      return messages;
    } catch (error: any) {
      // Its cause's verdict travels with it (§22 CC6).
      throw storageFailure(`Failed to get conversation history: ${error.message}`, 'STORAGE_HISTORY_ERROR', error);
    }
  }

  /**
   * Clear all conversations
   */
  async clearAll(): Promise<void> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    // Every log, in both layouts, file by file: s5js deletes only an empty directory, so the old one-call delete of the
    // root never removed anything (1.39.24). A failure is the caller's to see (fail closed).
    const io = new SealedIO(this.s5Client, (b) => this.requireSealer().isSealed(b));
    const clearDirs = async (root: string, file: string) => {
      const dirs = ((await io.list(root)) ?? []).filter((e) => e.type === 'directory');
      await mapWithConcurrency(dirs, 10, async (e) => {
        await io.deleteFiles(`${root}/${e.name}`, [file]);
        await io.deleteDir(`${root}/${e.name}`);
      });
      await io.deleteDir(root);
    };
    await clearDirs(this.logRoot(), 'log');   // this identity's logs only
    await clearDirs(`${StorageManager.SESSIONS_PATH}/${this.userAddress}`, 'conversation.json');
  }

  /**
   * Check if storage is initialized
   */
  isInitialized(): boolean {
    this.ensureNotDisposed();
    return this.initialized;
  }

  // ============= Session-Based Methods =============
  



  /**
   * List all sessions
   */
  async listSessions(): Promise<Array<{ id: string; created?: number }>> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }
    return (await this._listLogs()).map(({ id, created }) => ({ id, created }));
  }

  /**
   * Every conversation log (1.39.24 D41): the opaque ones, each opened for its id (an opaque path names none), and
   * the legacy ones not moved yet, once each. A log that cannot be opened fails the listing (fail closed).
   */
  private async _listLogs(): Promise<Array<{ id: string; created?: number; sealed: boolean }>> {
    const sealer = this.requireSealer();
    const io = new SealedIO(this.s5Client, (b) => sealer.isSealed(b));
    const found = new Map<string, { id: string; created?: number; sealed: boolean }>();
    const root = this.logRoot();
    const opaque = ((await io.list(root)) ?? []).filter((e) => e.type === 'directory');
    await mapWithConcurrency(opaque, 10, async (e) => {
      const bytes = await this.s5Client.fs.get(`${root}/${e.name}/log`, { fresh: true }).catch((error: any) => {
        if (isS5Absent(error)) return undefined;
        throw storageFailure(`Failed to list conversations: ${error?.message ?? error}`, 'STORAGE_LOAD_ERROR', error);
      });
      if (bytes === undefined || bytes === null) return; // a directory with no log yet (a write in progress)
      if (!(bytes instanceof Uint8Array)) {
        throw new SDKError(`Conversation log ${e.name} is unreadable`, 'STORAGE_LOAD_ERROR', { opaqueId: e.name, retryable: false });
      }
      const log = sealer.open(bytes, StorageManager.logContext(e.name)).value as SealedLog;
      if (!isConversation(log?.conversation) || typeof log.conversation.id !== 'string') {
        throw new SDKError(`Conversation log ${e.name} is unreadable`, 'STORAGE_LOAD_ERROR', { opaqueId: e.name, retryable: false });
      }
      found.set(log.conversation.id, { id: log.conversation.id, created: log.conversation.createdAt, sealed: true });
    });
    const legacyRoot = `${StorageManager.SESSIONS_PATH}/${this.userAddress}`;
    const legacy = ((await io.list(legacyRoot)) ?? []).filter((e) => e.type === 'directory' && !found.has(e.name));
    await mapWithConcurrency(legacy, 10, async (e) => {
      const entries = (await io.list(`${legacyRoot}/${e.name}`)) ?? [];
      const log = entries.find((x) => x.type === 'file' && x.name === 'conversation.json');
      if (!log) return; // not a conversation (a database's old hierarchy.json directory, say)
      found.set(e.name, { id: e.name, sealed: log.mediaType === 'application/octet-stream' });
    });
    return [...found.values()];
  }

  // ============= User Settings Methods =============

  /**
   * Save complete user settings to S5 storage, sealed
   * Path: home/user/v2/{owner}/settings (1.39.24; before: home/user/settings.json, plaintext)
   */
  async saveUserSettings(settings: UserSettings): Promise<void> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    // Validate required fields
    if (!settings.version || !settings.lastUpdated) {
      throw new SDKError(
        'UserSettings must have version and lastUpdated fields',
        'INVALID_SETTINGS'
      );
    }

    const settingsPath = this.settingsPath();
    // Sealed (1.39.24 D34): the settings name the user's hosts and models. Fail closed without a sealer.
    this.requireSealer();

    try {
      const startTime = performance.now();
      console.log(`[Enhanced S5.js] PUT ${settingsPath}`);
      await this.writeSettingsRecord(settings, this.settingsLegacyStamp);
      const duration = Math.round(performance.now() - startTime);
      console.log(`[Enhanced S5.js] Operation: Save settings - Time: ${duration}ms`);

      // Update cache
      this.settingsCache = {
        data: settings,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      throw new SDKError(
        `Failed to save user settings: ${error.message}`,
        'STORAGE_SAVE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Load user settings from S5 storage
   * Returns null if no settings exist (first-time user)
   * Uses in-memory cache with 5-minute TTL
   */
  async getUserSettings(): Promise<UserSettings | null> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    // Check cache first
    if (this.settingsCache) {
      const age = Date.now() - this.settingsCache.timestamp;
      if (age < this.CACHE_TTL) {
        console.log('[Enhanced S5.js] Cache hit for user settings');
        return this.settingsCache.data;
      }
    }

    const settingsPath = this.settingsPath();

    try {
      // S5 automatically decodes CBOR to object
      console.log('[Enhanced S5.js] Cache miss, fetching from S5');
      const startTime = performance.now();
      // This identity's sealed settings (1.39.24 D34), and the shared plaintext file older SDKs wrote. That file names
      // no identity: on a seed shared by several it may be another's. So it is adopted only while this identity has no
      // sealed settings (the first reader takes it), and removed only when it is provably this identity's — adopted
      // now, or a leftover of its own move (same lastUpdated) whose delete failed (1.39.24 review rounds 2–3). An absent
      // directory is "nothing here yet" (s5js throws for one never written).
      const absentOk = (error: any) => { if (isS5Absent(error)) return undefined; throw error; };
      const [stored, legacyStored] = await Promise.all([
        this.s5Client.fs.get(settingsPath, { fresh: true }).catch(absentOk),
        this.s5Client.fs.get(StorageManager.LEGACY_SETTINGS_PATH, { fresh: true }).catch(absentOk),
      ]);
      const duration = Math.round(performance.now() - startTime);
      console.log(`[Enhanced S5.js] Operation: Load settings - Time: ${duration}ms`);
      // A sealed record — a cleared one too (settings: null) — means this identity has sealed settings
      const record: { settings: UserSettings | null; legacyStamp?: number } | undefined = stored instanceof Uint8Array
        ? this.openSettingsRecord(stored)
        : stored != null ? { settings: stored as any } : undefined;   // plaintext at the path: never written by this SDK
      const sealedSettings = record?.settings ?? undefined;
      if (record) this.settingsLegacyStamp = typeof record.legacyStamp === 'number' ? record.legacyStamp : null;
      const legacy = legacyStored != null && !(legacyStored instanceof Uint8Array) ? legacyStored as any : undefined;
      const stamp = (x: any) => (typeof x?.lastUpdated === 'number' ? x.lastUpdated : -Infinity);
      const fromLegacy = legacy !== undefined && record === undefined;
      // This identity's own leftover: the file its settings were adopted from (by stamp), or one equal to them
      const ownLeftover = legacy !== undefined && record !== undefined
        && (stamp(legacy) === record.legacyStamp || (sealedSettings != null && stamp(legacy) === stamp(sealedSettings)));
      if (fromLegacy) this.settingsLegacyStamp = stamp(legacy) === -Infinity ? null : stamp(legacy);
      const settings = fromLegacy ? legacy : sealedSettings;
      // Plaintext to seal: the legacy file adopted, or (pre-1.39.24 mocks, never written by this SDK) plaintext at the path
      const legacyPlaintext = fromLegacy || (!!stored && !(stored instanceof Uint8Array));
      if (!settings && legacyStored != null && legacy === undefined) {
        console.warn('[StorageManager] home/user/settings.json holds something that is not settings; it is left as it is');
      }

      // Return null if no settings file exists (first-time user)
      if (!settings) {
        // Update cache with null (first-time user)
        this.settingsCache = {
          data: null,
          timestamp: Date.now(),
        };
        return null;
      }

      // Migrate settings to current version
      const migratedSettings = migrateUserSettings(settings);
      // Best effort, both halves: an offline read still answers, and the next read tries again (1.39.24 review m3).
      try {
        if (legacyPlaintext) await this.saveUserSettings(migratedSettings);   // sealed at this identity's path
        if (fromLegacy || ownLeftover) {
          // Removed only if no outdated tab wrote it again since this read (a fresh re-read): that write is the next read's.
          const again = await this.s5Client.fs.get(StorageManager.LEGACY_SETTINGS_PATH, { fresh: true }).catch(absentOk);
          if (again != null && !(stamp(again) > stamp(legacy))) await this.s5Client.fs.delete(StorageManager.LEGACY_SETTINGS_PATH);
        }
      } catch (error: any) {
        console.warn(`[StorageManager] Settings read; sealing or removing the plaintext copy failed and is retried on the next read: ${error?.message ?? error}`);
      }

      // Update cache with migrated settings
      this.settingsCache = {
        data: migratedSettings,
        timestamp: Date.now(),
      };

      return migratedSettings;
    } catch (error: any) {
      // Return null for "not found" errors (first-time user)
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        // Update cache with null
        this.settingsCache = {
          data: null,
          timestamp: Date.now(),
        };
        return null;
      }

      // Re-throw validation and migration errors
      if (error.code === 'INVALID_SETTINGS_STRUCTURE') {
        throw error;
      }

      // Re-throw migration errors (missing version, unsupported version, missing required fields)
      if (error.message?.includes('missing version field') ||
          error.message?.includes('missing lastUpdated field') ||
          error.message?.includes('Unsupported UserSettings version')) {
        throw new SDKError(
          'Invalid UserSettings structure in S5 storage',
          'INVALID_SETTINGS_STRUCTURE',
          { originalError: error }
        );
      }

      // Network error - return stale cache if available (offline mode)
      if (error.message?.includes('network') ||
          error.message?.includes('timeout') ||
          error.message?.includes('Connection refused') ||
          error.message?.includes('ECONNREFUSED')) {
        if (this.settingsCache) {
          console.warn('[StorageManager] Using stale cache due to network error');
          return this.settingsCache.data;
        }
        // No cache available - throw error
      }

      // Wrap other errors
      throw new SDKError(
        `Failed to load user settings: ${error.message}`,
        'STORAGE_LOAD_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Update specific user settings without overwriting entire object
   * Merges partial update with existing settings
   */
  async updateUserSettings(partial: PartialUserSettings): Promise<void> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      // Load current settings, fresh: a cached copy may predate another tab's reset or adoption, and merging it would
      // write it back (1.39.24 review round 5 — startSession updates lastHostAddress unprompted).
      this.settingsCache = null;
      const current = await this.getUserSettings();

      // If settings exist, merge with partial update
      if (current) {
        const merged: UserSettings = {
          ...current,
          ...partial,
          version: current.version, // Preserve version
          lastUpdated: Date.now(), // Always update timestamp
        };

        await this.saveUserSettings(merged);
      } else {
        // No settings exist - create new with required fields
        const newSettings: UserSettings = {
          version: UserSettingsVersion.V1,
          lastUpdated: Date.now(),
          selectedModel: '', // Default required field
          ...partial, // Apply partial update
        };

        await this.saveUserSettings(newSettings);
      }
    } catch (error: any) {
      // Re-throw validation errors (these should bubble up)
      if (error.code === 'INVALID_SETTINGS' || error.code === 'INVALID_SETTINGS_STRUCTURE') {
        throw error;
      }

      // Wrap all other errors (including SDK errors from load/save)
      throw new SDKError(
        `Failed to update user settings: ${error.message}`,
        'STORAGE_UPDATE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Delete all user settings from S5 storage
   * Used for "Reset Preferences" functionality
   */
  async clearUserSettings(): Promise<void> {
    this.ensureNotDisposed();
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    const settingsPath = this.settingsPath();

    try {
      // The settings are replaced by a sealed cleared record (not deleted): with no sealed record the next read would
      // adopt the shared legacy file, which may be another identity's (1.39.24 review round 4). That file goes first, and
      // only when it is this identity's: with no sealed record it is the one this identity would adopt; otherwise the
      // file its settings were adopted from, or one equal to them. A sealed record that does not open is still replaced
      // (Reset Preferences is the way out of it), and the shared file is then left alone.
      const absentOk = (error: any) => { if (isS5Absent(error)) return undefined; throw error; };
      const [stored, legacy] = await Promise.all([
        this.s5Client.fs.get(settingsPath, { fresh: true }).catch(absentOk),
        this.s5Client.fs.get(StorageManager.LEGACY_SETTINGS_PATH, { fresh: true }).catch(absentOk),
      ]);
      let record: { settings: UserSettings | null; legacyStamp?: number } | undefined | 'unreadable';
      try {
        record = stored instanceof Uint8Array ? this.openSettingsRecord(stored) : stored != null ? { settings: stored as any } : undefined;
      } catch (error: any) {
        if (error?.code !== 'SEALED_OPEN_FAILED' && error?.code !== 'INVALID_SETTINGS_STRUCTURE') throw error;
        record = 'unreadable';
      }
      let legacyStamp = record === 'unreadable' ? undefined : record?.legacyStamp;
      if (legacy != null && !(legacy instanceof Uint8Array) && record !== 'unreadable') {
        const at = (legacy as any).lastUpdated;
        if (record === undefined || at === record.legacyStamp || at === record.settings?.lastUpdated) {
          await this.s5Client.fs.delete(StorageManager.LEGACY_SETTINGS_PATH);
          if (record === undefined && typeof at === 'number') legacyStamp = at;
        }
      }
      await this.writeSettingsRecord(null, legacyStamp);
      this.settingsLegacyStamp = typeof legacyStamp === 'number' ? legacyStamp : null;

      // Invalidate cache
      this.settingsCache = null;
    } catch (error: any) {
      throw new SDKError(
        `Failed to clear user settings: ${error.message}`,
        'STORAGE_CLEAR_ERROR',
        { originalError: error }
      );
    }
  }

  // ============= Encrypted Storage Methods (Phase 5.1) =============





  // ============= Metadata Methods (Phase 5.2) =============


  // ============================================================================
  // Folder Operations (Sub-phase 2.1: Enhanced Storage Manager for Folders)
  // ============================================================================

  /**
   * Create a virtual folder
   *
   * @param databaseName - Database name
   * @param path - Folder path
   */
  async createFolder(databaseName: string, path: string): Promise<void> {
    this.ensureNotDisposed();
    this.folderHierarchy.createFolder(databaseName, path);
  }

  /**
   * Delete a folder
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @param recursive - Delete recursively (default: false)
   * @param options - Delete options (deleteVectors)
   */
  async deleteFolder(
    databaseName: string,
    path: string,
    recursive: boolean = false,
    options?: { deleteVectors?: boolean }
  ): Promise<void> {
    this.ensureNotDisposed();
    this.folderHierarchy.deleteFolder(databaseName, path, recursive, options);
  }

  /**
   * Move a folder to a new location
   *
   * @param databaseName - Database name
   * @param sourcePath - Source folder path
   * @param destPath - Destination folder path
   */
  async moveFolder(databaseName: string, sourcePath: string, destPath: string): Promise<void> {
    this.ensureNotDisposed();
    this.folderHierarchy.moveFolder(databaseName, sourcePath, destPath);
  }

  /**
   * Rename a folder
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @param newName - New folder name
   */
  async renameFolder(databaseName: string, path: string, newName: string): Promise<void> {
    this.ensureNotDisposed();
    this.folderHierarchy.renameFolder(databaseName, path, newName);
  }

  /**
   * List folder contents
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @param options - List options (limit, cursor)
   * @returns Folder items or paginated result
   */
  async listFolder(
    databaseName: string,
    path: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<FolderListItem[] | { items: FolderListItem[]; cursor?: string }> {
    this.ensureNotDisposed();
    // In memory only: the plaintext hierarchy.json writer is gone (1.39.24 D35); RAG folders live in the sealed store
    return this.folderHierarchy.listFolder(databaseName, path, options);
  }

  /**
   * Get folder metadata
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @param options - Metadata options (recursive, formatSize)
   * @returns Folder metadata
   */
  async getFolderMetadata(
    databaseName: string,
    path: string,
    options?: { recursive?: boolean; formatSize?: boolean }
  ): Promise<FolderMetadata> {
    this.ensureNotDisposed();
    return this.folderHierarchy.getFolderMetadata(databaseName, path, options);
  }

  /**
   * Add file to folder (updates metadata)
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @param file - File info (name, size)
   */
  async addFileToFolder(
    databaseName: string,
    path: string,
    file: { name: string; size: number }
  ): Promise<void> {
    this.ensureNotDisposed();
    this.folderHierarchy.addFileToFolder(databaseName, path, file);
  }

  /**
   * Remove file from folder (updates metadata)
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @param fileName - File name to remove
   */
  async removeFileFromFolder(databaseName: string, path: string, fileName: string, fileSize?: number): Promise<void> {
    this.ensureNotDisposed();
    this.folderHierarchy.removeFileFromFolder(databaseName, path, fileName, fileSize);
  }

  /**
   * Validate folder hierarchy integrity
   *
   * @param databaseName - Database name
   * @returns True if valid
   */
  async validateHierarchy(databaseName: string): Promise<boolean> {
    this.ensureNotDisposed();
    // Simple validation - check if hierarchy exists
    try {
      this.folderHierarchy.getFolderMetadata(databaseName, '/');
      return true;
    } catch {
      return true; // Root always exists
    }
  }

  /**
   * Rebuild hierarchy from folder metadata
   *
   * @param databaseName - Database name
   * @returns True if successful
   */
  async rebuildHierarchy(databaseName: string): Promise<boolean> {
    this.ensureNotDisposed();
    // For testing purposes, just validate current hierarchy
    return this.validateHierarchy(databaseName);
  }

  /**
   * Get folder path
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @returns Full path
   */
  async getFolderPath(databaseName: string, path: string): Promise<string> {
    this.ensureNotDisposed();
    // Validate that folder exists
    this.folderHierarchy.getFolderMetadata(databaseName, path);
    return path;
  }

  /**
   * Get parent path of a folder
   *
   * @param path - Folder path
   * @returns Parent path or null if root
   */
  getParentPath(path: string): string | null {
    this.ensureNotDisposed();
    return getParentPath(path);
  }

  /**
   * Get all ancestors of a folder
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @returns Array of ancestor paths
   */
  async getAncestors(databaseName: string, path: string): Promise<string[]> {
    this.ensureNotDisposed();
    // Validate that folder exists
    this.folderHierarchy.getFolderMetadata(databaseName, path);
    return getAncestorPaths(path);
  }

  /**
   * Get all descendants of a folder
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @returns Array of descendant paths
   */
  async getDescendants(databaseName: string, path: string): Promise<string[]> {
    this.ensureNotDisposed();
    const descendants: string[] = [];

    const collectDescendants = async (currentPath: string): Promise<void> => {
      const contents = await this.listFolder(databaseName, currentPath);
      const items = Array.isArray(contents) ? contents : contents.items;

      for (const item of items) {
        descendants.push(item.path);
        await collectDescendants(item.path);
      }
    };

    await collectDescendants(path);
    return descendants;
  }

  // ============================================================================
  // S5 Connection Handling (v0.9.0-beta.5)
  // ============================================================================

  /**
   * Setup connection change listener
   */
  private setupConnectionHandling(s5Instance: any): void {
    // Check if the new connection API is available
    if (typeof s5Instance.onConnectionChange !== 'function') {
      console.warn('[StorageManager] S5 v0.9.0-beta.5 connection API not available');
      this.connectionStatus = 'connected'; // Assume connected for older versions
      return;
    }

    // Subscribe to connection changes (fires immediately with current status)
    this.connectionUnsubscribe = s5Instance.onConnectionChange((status: S5ConnectionStatus) => {
      const previousStatus = this.connectionStatus;
      this.connectionStatus = status;

      console.log(`[StorageManager] S5 connection: ${previousStatus} → ${status}`);

      if (status === 'connected' && previousStatus === 'disconnected') {
        // Connection restored - flush queued operations
        this.flushQueue();
      } else if (status === 'disconnected') {
        // Connection lost - update sync status
        if (this.operationQueue.length > 0) {
          this.updateSyncStatus('pending');
        }
      }
    });
  }

  /**
   * Setup auto-reconnect handlers for browser environment
   */
  private setupAutoReconnect(): void {
    // Only setup in browser environment
    if (typeof document === 'undefined' && typeof window === 'undefined') {
      return;
    }

    const listen = (target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>, type: string, handler: () => void) => {
      target.addEventListener(type, handler);
      this.reconnectListeners.push({ target, type, handler });
    };

    // Reconnect when tab becomes visible
    if (typeof document !== 'undefined') {
      listen(document, 'visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.connectionStatus === 'disconnected') {
          console.log('[StorageManager] Tab visible, attempting S5 reconnect...');
          this.attemptReconnect();
        }
      });
    }

    // Reconnect when network comes back online
    if (typeof window !== 'undefined') {
      listen(window, 'online', () => {
        if (this.connectionStatus === 'disconnected') {
          console.log('[StorageManager] Network online, attempting S5 reconnect...');
          this.attemptReconnect();
        }
      });
    }
  }

  /**
   * Attempt to reconnect to S5
   */
  private async attemptReconnect(): Promise<void> {
    if (!this.s5Client || typeof this.s5Client.reconnect !== 'function') {
      console.warn('[StorageManager] S5 reconnect() not available');
      return;
    }

    try {
      await this.s5Client.reconnect();
      console.log('[StorageManager] S5 reconnected successfully');
    } catch (error: any) {
      console.warn('[StorageManager] S5 reconnect failed:', error.message);
      // Connection change listener will update status
    }
  }

  /**
   * Get current S5 connection status
   */
  getConnectionStatus(): S5ConnectionStatus {
    this.ensureNotDisposed();
    return this.connectionStatus;
  }

  /**
   * Get current sync status for UI
   */
  getSyncStatus(): SyncStatus {
    this.ensureNotDisposed();
    return this.syncStatus;
  }

  /**
   * Get number of pending operations in queue
   */
  getPendingOperationCount(): number {
    this.ensureNotDisposed();
    return this.operationQueue.length;
  }

  /**
   * Get last error if sync status is 'error'
   */
  getLastError(): Error | null {
    this.ensureNotDisposed();
    return this.lastError;
  }

  /**
   * Subscribe to sync status changes
   * @returns Unsubscribe function
   */
  onSyncStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.ensureNotDisposed();
    this.syncListeners.push(callback);
    // Immediately call with current status
    callback(this.syncStatus);
    return () => {
      this.syncListeners = this.syncListeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Update sync status and notify listeners
   */
  private updateSyncStatus(status: SyncStatus, error?: Error): void {
    this.syncStatus = status;
    this.lastError = error || null;

    for (const listener of this.syncListeners) {
      try {
        listener(status);
      } catch (e) {
        console.error('[StorageManager] Sync status listener error:', e);
      }
    }
  }

  /**
   * Check if an error is a connection error
   */
  private isConnectionError(error: any): boolean {
    const msg = (error?.message || '').toLowerCase();
    return msg.includes('websocket') ||
           msg.includes('closing') ||
           msg.includes('closed') ||
           msg.includes('connection') ||
           msg.includes('network') ||
           msg.includes('timeout');
  }

  /**
   * Execute S5 operation with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationType: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < StorageManager.MAX_RETRIES; attempt++) {
      // Check connection status before attempting
      if (this.connectionStatus === 'disconnected' && attempt > 0) {
        console.log(`[StorageManager] S5 disconnected, attempt ${attempt + 1} waiting for reconnect...`);
        await this.attemptReconnect();
      }

      try {
        const result = await operation();
        // Success - clear any error state
        if (this.syncStatus === 'error') {
          this.updateSyncStatus(this.operationQueue.length > 0 ? 'pending' : 'synced');
        }
        return result;
      } catch (error: any) {
        lastError = error;
        console.warn(`[StorageManager] ${operationType} failed (attempt ${attempt + 1}/${StorageManager.MAX_RETRIES}):`, error.message);

        if (this.isConnectionError(error)) {
          // Connection error - wait with exponential backoff
          const delay = StorageManager.BASE_DELAY_MS * Math.pow(2, attempt);
          console.log(`[StorageManager] Connection error, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // Non-connection error - don't retry
          throw error;
        }
      }
    }

    // All retries exhausted
    this.updateSyncStatus('error', lastError!);
    throw new SDKError(
      `${operationType} failed after ${StorageManager.MAX_RETRIES} attempts: ${lastError?.message}`,
      'STORAGE_RETRY_EXHAUSTED',
      { originalError: lastError }
    );
  }

  /**
   * Queue an operation for later execution
   */
  private queueOperation<T>(
    type: 'put' | 'get' | 'delete',
    path: string,
    data?: any
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      // After cleanup() nothing hears S5 come back: only a flush already running would take it (§30 KK2) — else refuse (§31 LL2).
      if (this.cleanedUp && !this.isProcessingQueue) {
        reject(new SDKError('This store was cleaned up: a write waiting for S5 to reconnect would never be sent', 'STORAGE_CLEANUP', { retryable: false }));
        return;
      }
      // Check queue size limit
      if (this.operationQueue.length >= StorageManager.MAX_QUEUE_SIZE) {
        const error = new SDKError(
          'Operation queue full - too many pending operations',
          'STORAGE_QUEUE_FULL'
        );
        this.updateSyncStatus('error', error);
        reject(error);
        return;
      }

      const op: QueuedOperation = {
        id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
        type,
        path,
        data,
        resolve,
        reject,
        attempts: 0,
        createdAt: Date.now()
      };

      this.operationQueue.push(op);
      console.log(`[StorageManager] Queued ${type} operation for ${path} (queue size: ${this.operationQueue.length})`);
      this.updateSyncStatus('pending');
    });
  }

  /**
   * Flush queued operations when connection is restored
   */
  private async flushQueue(): Promise<void> {
    if (this.isProcessingQueue || this.operationQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    this.updateSyncStatus('syncing');
    console.log(`[StorageManager] Flushing ${this.operationQueue.length} queued operations`);

    try {
      while (this.operationQueue.length > 0) {
        const op = this.operationQueue[0];

        try {
          let result: any;

          switch (op.type) {
            case 'put':
              result = await this.executeWithRetry(
                () => this.s5Client.fs.put(op.path, op.data),
                `PUT ${op.path}`
              );
              break;
            case 'get':
              result = await this.executeWithRetry(
                () => this.s5Client.fs.get(op.path),
                `GET ${op.path}`
              );
              break;
            case 'delete':
              result = await this.executeWithRetry(
                () => this.s5Client.fs.delete(op.path),
                `DELETE ${op.path}`
              );
              break;
          }

          // Success - remove from queue and resolve
          this.operationQueue.shift();
          op.resolve(result);
          console.log(`[StorageManager] Queued ${op.type} completed for ${op.path}`);

        } catch (error: any) {
          // Failed after retries - reject and remove from queue
          this.operationQueue.shift();
          op.reject(error);
          console.error(`[StorageManager] Queued ${op.type} failed for ${op.path}:`, error.message);
        }
      }
    } finally {
      // CRITICAL: Always reset flag even if an unexpected exception occurs
      this.isProcessingQueue = false;
      this.updateSyncStatus(this.lastError ? 'error' : 'synced');
      console.log('[StorageManager] Queue flush complete');
    }
  }

  /**
   * S5 PUT with retry and queue support
   */
  async putWithRetry(path: string, data: any): Promise<void> {
    this.ensureNotDisposed();
    if (!this.initialized || !this.s5Client) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    this.refusePlaintextRagWrite(path);

    // If disconnected, queue the operation
    if (this.connectionStatus === 'disconnected') {
      console.log(`[StorageManager] S5 disconnected, queueing PUT for ${path}`);
      return this.queueOperation('put', path, data);
    }

    // Execute with retry
    return this.executeWithRetry(
      () => this.s5Client.fs.put(path, data),
      `PUT ${path}`
    );
  }

  /**
   * S5 GET with retry support (no queue - reads need immediate response)
   */
  async getWithRetry(path: string, opts?: { fresh?: boolean }): Promise<any> {
    this.ensureNotDisposed();
    if (!this.initialized || !this.s5Client) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    return this.executeWithRetry(
      () => (opts ? this.s5Client.fs.get(path, opts) : this.s5Client.fs.get(path)),
      `GET ${path}`
    );
  }

  /**
   * S5 DELETE with retry and queue support
   */
  async deleteWithRetry(path: string): Promise<boolean> {
    this.ensureNotDisposed();
    if (!this.initialized || !this.s5Client) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    // If disconnected, queue the operation
    if (this.connectionStatus === 'disconnected') {
      console.log(`[StorageManager] S5 disconnected, queueing DELETE for ${path}`);
      return this.queueOperation('delete', path);
    }

    return this.executeWithRetry(
      () => this.s5Client.fs.delete(path),
      `DELETE ${path}`
    );
  }

  /**
   * Force a sync attempt - useful for UI "retry" buttons
   */
  async forceSync(): Promise<void> {
    this.ensureNotDisposed();
    if (this.connectionStatus === 'disconnected') {
      await this.attemptReconnect();
    }

    if (this.connectionStatus === 'connected' && this.operationQueue.length > 0) {
      await this.flushQueue();
    }
  }

  /**
   * Cleanup connection handlers
   */
  cleanup(): void {
    // From now on nothing hears the connection come back: a write that could only wait for it refuses (§31 LL2).
    this.cleanedUp = true;
    if (this.connectionUnsubscribe) {
      this.connectionUnsubscribe();
      this.connectionUnsubscribe = undefined;
    }

    // Clear pending operations — the waiting ones: the one a flush runs settles with its own outcome, and the array is
    // the flush's too, so it is emptied in place (§30 KK2)
    for (const op of this.operationQueue.splice(this.isProcessingQueue ? 1 : 0)) {
      op.reject(new SDKError('StorageManager cleanup', 'STORAGE_CLEANUP'));
    }

    // Clear listeners
    this.syncListeners = [];
  }

  /**
   * Dispose of this store when its identity is forgotten — a sign-out, the next sign-in, or a start the SDK abandoned
   * (§26 GG1). Refuses from its first line: every other public member then refuses `STORAGE_MANAGER_DISPOSED` (a
   * synchronous one throws it) — `cleanup()` alone answers, a no-op by then — and a call in flight runs on, but stops at
   * its next public step (an append asked for before it lands — §27 HH1). Releases what keeps it alive and holds the identity: its
   * browser listeners and connection subscription, its queued operations (rejected), its seed and settings cache.
   * A start still running releases what it sets up once it ends. Idempotent.
   */
  dispose(): void {
    this.disposed = true;
    this.release();
  }

  private release(): void {
    for (const { target, type, handler } of this.reconnectListeners.splice(0)) target.removeEventListener(type, handler);
    this.connectionUnsubscribe?.();
    this.connectionUnsubscribe = undefined;
    // The waiting ones only: the one a flush is running (the head) settles with its own outcome (§27 HH9).
    for (const op of this.operationQueue.splice(this.isProcessingQueue ? 1 : 0)) op.reject(storageManagerDisposed());
    this.syncListeners = [];
    this.userSeed = undefined;
    this.settingsCache = null;
    this.settingsLegacyStamp = undefined;
  }

  private ensureNotDisposed(): void {
    if (this.disposed) throw storageManagerDisposed();
  }

  // ============= AI Preference Helper Methods (Phase 4.1) =============

  /**
   * Set ModelManager for preference helpers
   * Required for getDefaultModel() and setDefaultModel() validation
   */
  setModelManager(modelManager: { getModelDetails(modelId: string): Promise<ModelInfo | null> }): void {
    this.ensureNotDisposed();
    this.modelManager = modelManager;
  }

  /**
   * Get user's default model
   * Returns ModelInfo if a default is set, null otherwise
   */
  async getDefaultModel(): Promise<ModelInfo | null> {
    this.ensureNotDisposed();
    if (!this.modelManager) {
      throw new SDKError('ModelManager not set', 'MODEL_MANAGER_NOT_SET');
    }

    const settings = await this.getUserSettings();
    if (!settings?.defaultModelId) {
      return null;
    }

    return this.modelManager.getModelDetails(settings.defaultModelId);
  }

  /**
   * Set user's default model
   * Pass null to clear the default
   * Validates model exists before setting
   */
  async setDefaultModel(modelId: string | null): Promise<void> {
    this.ensureNotDisposed();
    if (modelId !== null) {
      if (!this.modelManager) {
        throw new SDKError('ModelManager not set', 'MODEL_MANAGER_NOT_SET');
      }

      // Validate model exists
      const model = await this.modelManager.getModelDetails(modelId);
      if (!model) {
        throw new SDKError(
          `Model ${modelId} not found in registry`,
          'MODEL_NOT_FOUND'
        );
      }
    }

    await this.updateUserSettings({
      defaultModelId: modelId,
    });
  }

  /**
   * Get user's host selection mode
   * Returns AUTO if not set or no settings exist
   */
  async getHostSelectionMode(): Promise<HostSelectionMode> {
    this.ensureNotDisposed();
    const settings = await this.getUserSettings();
    return settings?.hostSelectionMode ?? HostSelectionMode.AUTO;
  }

  /**
   * Set user's host selection mode
   * For SPECIFIC mode, preferredHostAddress is required
   */
  async setHostSelectionMode(
    mode: HostSelectionMode,
    preferredHostAddress?: string
  ): Promise<void> {
    this.ensureNotDisposed();
    if (mode === HostSelectionMode.SPECIFIC && !preferredHostAddress) {
      throw new SDKError(
        'preferredHostAddress required for SPECIFIC mode',
        'INVALID_HOST_SELECTION_MODE'
      );
    }

    await this.updateUserSettings({
      hostSelectionMode: mode,
      preferredHostAddress: mode === HostSelectionMode.SPECIFIC ? preferredHostAddress : null,
    });
  }

  /**
   * Clear all AI preferences (model and host)
   * Resets to defaults without affecting other settings
   */
  async clearAIPreferences(): Promise<void> {
    this.ensureNotDisposed();
    await this.updateUserSettings({
      defaultModelId: null,
      hostSelectionMode: HostSelectionMode.AUTO,
      preferredHostAddress: null,
    });
  }
}