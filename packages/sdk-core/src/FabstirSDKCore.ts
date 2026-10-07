// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * FabstirSDKCore - Browser-compatible SDK for Fabstir LLM Marketplace
 *
 * This is the main entry point for browser applications.
 * All functionality is browser-safe with zero Node.js dependencies.
 */

import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import {
  IAuthManager,
  IPaymentManager,
  IStorageManager,
  ISessionManager,
  IHostManager,
  ITreasuryManager,
  ITranscodeManager,
  ILtxManager,
  ITrainingManager
} from './interfaces';
import { IVectorRAGManager } from './managers/interfaces/IVectorRAGManager';
import { IWalletProvider } from './interfaces/IWalletProvider';
import { AuthManager } from './managers/AuthManager';
import { PaymentManager } from './managers/PaymentManager';
import { PaymentManager as PaymentManagerMultiChain } from './managers/PaymentManagerMultiChain';
import { StorageManager, STORAGE_MANAGER_SYNC_MEMBERS, type LogMigrationReport } from './managers/StorageManager';
import type { DiscardUnreadable, MigrationProgress, RagMigrationReport } from './storage/sealed/rag-migration';
import { SessionManager } from './managers/SessionManager';
import {
  validateRpcUrl,
  validateRequiredAddresses,
  validateOptionalAddress
} from './utils/validation';
import { HostManager } from './managers/HostManager';
import { ModelManager } from './managers/ModelManager';
import { TreasuryManager } from './managers/TreasuryManager';
import { ClientManager } from './managers/ClientManager';
import { EncryptionManager } from './managers/EncryptionManager';
import { TranscodeManager } from './managers/TranscodeManager';
import { LtxManager } from './managers/LtxManager';
import { TrainingManager } from './managers/TrainingManager';
import { JobMarketplaceWrapper } from './contracts/JobMarketplace';
import { VectorRAGManager } from './managers/VectorRAGManager';
import { SessionGroupManager } from './managers/SessionGroupManager';
import { SessionGroupStorage } from './storage/SessionGroupStorage';
import { DEFAULT_RAG_CONFIG } from './rag/config';
import { ContractManager, ContractAddresses } from './contracts/ContractManager';
import { UnifiedBridgeClient } from './services/UnifiedBridgeClient';
import { HostSelectionService } from './services/HostSelectionService';
import { SDKConfig, SDKError } from './types';
import { getOrGenerateS5Seed, hasCachedSeed, cacheSeed, deriveEntropyFromSignature, entropyToS5Phrase, SEED_DOMAIN_SEPARATOR, generateS5SeedFromPrivateKey, generateS5SeedFromAddress } from './utils/s5-seed-derivation';
import { ChainRegistry } from './config/ChainRegistry';
import { ChainId, ChainConfig } from './types/chain.types';
import { UnsupportedChainError } from './errors/ChainErrors';
import { ensureSubAccount, createSubAccountSigner, SubAccountOptions } from './wallet';
import { AASigner, type AASignerOptions } from './wallet';
import { retryableOf } from './storage/sealed/sealed-io';
import { withTimeout } from './utils/with-timeout';
import { sharedRpcProvider, verifyRpcChain, NETWORK_TIMEOUT_MS, networkUnreachable } from './utils/rpc-provider';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

/** SHA-256 of the repository's well-known test seed (refused in production mode by validateSeed). */
const KNOWN_TEST_SEED_SHA256 = 'ef52b4316e947e9707187d9b872f1ff0e163044b30dcb436538e8727eaf4cf86';

/** How long storage may take to start before the SDK goes on without it (STORAGE_UNAVAILABLE — §24 EE4). */
const STORAGE_START_TIMEOUT_MS = 90_000;
/** How long a Base Account approval — its send and confirmation — may take before the sign-in goes on without it (§25 FF2, §26 GG4). */
const APPROVAL_TIMEOUT_MS = 120_000;
const authSuperseded = () => new SDKError('A sign-out superseded this sign-in', 'AUTH_SUPERSEDED', { retryable: false });
/** A cause's own verdict, when it gives one — never a default (a wallet rejection is not retried). */
const explicitVerdict = (error: any): boolean | undefined =>
  typeof error?.details?.retryable === 'boolean' ? error.details.retryable : typeof error?.retryable === 'boolean' ? error.retryable : undefined;

/** The USDC approval a Base Account sign-in makes, as it ended (§26 GG4). */
export type BaseAccountApproval = 'confirmed' | 'unconfirmed' | 'failed' | 'skipped';
export interface BaseAccountSignIn {
  subAccount: string;
  isNewlyCreated: boolean;
  approval: BaseAccountApproval;
  /** Why the approval is `'unconfirmed'` (`APPROVAL_UNCONFIRMED`) or `'failed'`. */
  approvalError?: unknown;
}

export interface FabstirSDKCoreConfig {
  // Network configuration
  rpcUrl?: string;
  chainId?: number;
  /**
   * @deprecated Ignored since 1.39.3: every LTX job runs on its own template's model, ltxModelIdFor(templateId, sidecar), and
   * the LTX manager needs no opt-in. Kept so existing configs still compile.
   */
  ltxModelId?: string;
  /** Registered TRAINING model id (bytes32, A.2) — enables getTrainingManager(). */
  trainingModelId?: string;
  /** The node's `TRAIN_JOB_TIMEOUT_SECS` (deployable; M0 pins 12600). Feeds the A.3
   *  remaining-lifetime pre-flight on adopted (vault / card-paid) training sessions. */
  trainingJobTimeoutSecs?: number;

  // Contract addresses (optional - can use env vars)
  contractAddresses?: {
    jobMarketplace?: string;
    nodeRegistry?: string;
    proofSystem?: string;
    hostEarnings?: string;
    fabToken?: string;
    usdcToken?: string;
    modelRegistry?: string;
  };
  
  // S5 Storage configuration
  s5Config?: {
    portalUrl?: string;
    // Backend API URL for secure registration (beta.32+ RECOMMENDED for browser apps)
    // Master token stays server-side, client only sends signatures
    // Example: '/api/s5' or 'https://api.example.com/s5'
    authApiUrl?: string;
    // Master token for S5 portal registration (beta.31+)
    // SECURITY WARNING: Only use for server-side apps or testing
    // For browser apps, use authApiUrl instead to keep token server-side
    masterToken?: string;
    // Optional: Pre-cached S5 seed phrase for cross-tab consistency
    // When provided, this seed is used for BOTH S5 identity AND encryption keys
    // This ensures consistent encryption/decryption across all browser tabs
    // If not provided, seed is derived from wallet signature (requires sign popup)
    seedPhrase?: string;
  };
  
  // Bridge configuration for server features
  bridgeConfig?: {
    url?: string;
    autoConnect?: boolean;
  };
  
  // Smart wallet configuration
  smartWallet?: {
    factoryAddress?: string;
    entryPointAddress?: string;
  };
  
  // Development mode
  mode?: 'production' | 'development';

  // Host-only mode: Skip S5/Storage/Session initialization (for host CLI operations)
  // When true, only HostManager, ModelManager, and PaymentManager are initialized
  hostOnly?: boolean;

  // Skip S5 storage + VectorRAG/SessionGroup/Transcode (but KEEP SessionManager).
  // For inference-only consumers (e.g. the orchestrator delegate/coding-agent
  // daemon) that proxy chat/completions and don't need conversation persistence
  // or RAG. Conversation storage degrades to a no-op proxy. Also honored via the
  // SKIP_S5_STORAGE env var. Unlike hostOnly, SessionManager IS initialized.
  skipS5?: boolean;

  // Moderation publish-gate ENFORCEMENT (M3 ships dark — default false).
  // The gate is still evaluated + logged on every publish call regardless;
  // this flag only lets it refuse publishes. Flip to true only at the
  // documented go-live (CONTRACT-MODERATION-SERVICE.md Appendix A), together
  // with the node's MODERATION_ENFORCE. NOT a security control until M5
  // signing — see src/moderation/gate.ts.
  moderationGate?: boolean;
}

/** The multi-chain surface the SDK's own PaymentManagerMultiChain has and IPaymentManager does not declare. */
type ChainSwitchable = { switchChain(chainId: number): Promise<void>; getCurrentChainId(): number };

export class FabstirSDKCore extends EventEmitter {
  private config: FabstirSDKCoreConfig;
  private provider?: ethers.BrowserProvider | ethers.JsonRpcProvider;
  /**
   * Dedicated provider for contract reads, built from `config.rpcUrl`.
   *
   * `this.provider` is the *wallet's* provider on the browser auth paths
   * (authenticateWithMetaMask, authenticateWithSigner), so it cannot serve
   * reads without putting them back on window.ethereum. Discovery reads are
   * public eth_calls and belong on the configured endpoint; only writes need
   * the signer.
   */
  private readProvider?: ethers.BrowserProvider | ethers.JsonRpcProvider;
  private readProviderSource: 'rpcUrl' | 'wallet' = 'wallet';
  private chainParityListener?: (...args: any[]) => void;
  private signer?: ethers.Signer;
  private contractManager?: ContractManager;
  private bridgeClient?: UnifiedBridgeClient;
  private walletProvider?: IWalletProvider;
  private currentChainId: number;
  private chainSwitchInFlight?: number;
  
  // Manager instances
  private authManager?: IAuthManager;
  private paymentManager?: IPaymentManager;
  private storageManager?: IStorageManager;
  private sessionManager?: ISessionManager;
  private hostManager?: IHostManager;
  private modelManager?: ModelManager;
  private clientManager?: ClientManager;
  private treasuryManager?: ITreasuryManager;
  private encryptionManager?: EncryptionManager;
  private vectorRAGManager?: IVectorRAGManager;
  private sessionGroupManager?: SessionGroupManager;
  private transcodeManager?: TranscodeManager;
  private ltxManager?: LtxManager;
  private trainingManager?: TrainingManager;

  private authenticated = false;
  /** Sign-ins run one after another on this chain (§23 DD1). */
  private authQueue: Promise<unknown> = Promise.resolve();
  /** Bumped by every `disconnect()`: a sign-in requested before it is superseded (§24 EE4). */
  private identityEpoch = 0;
  /** Bumped whenever an identity is forgotten: an operation bound to one knows when it no longer is (§26 GG2). */
  private identitiesForgotten = 0;
  private s5Seed?: string;
  /**
   * Set when storage failed to start: what the log preflight, the RAG and session-group getters and the transcode,
   * LTX and training getters report (§19 Z16, §23 DD3).
   */
  private storageUnavailable?: SDKError;
  private userAddress?: string;
  private initialized = false;
  private authMode?: 'metamask' | 'privatekey' | 'signer' | 'aa-signer' | 'delegate';
  private eoaWallet?: ethers.Wallet;
  /** Set in delegate-pays mode: the payer (owner) whose USDC funds sessions. */
  private delegatePayer?: string;
  /**
   * Promise tracking the deferred VectorRAG initialization. Started during
   * initializeManagers; consumers await it via `getVectorRAGReady()`.
   */
  private vectorRAGReady?: Promise<void>;

  constructor(config: FabstirSDKCoreConfig = {}) {
    super();
    this.currentChainId = config.chainId || ChainId.BASE_SEPOLIA;

    // Validate chain ID is supported
    if (!ChainRegistry.isChainSupported(this.currentChainId)) {
      throw new UnsupportedChainError(this.currentChainId, ChainRegistry.getSupportedChains());
    }

    this.config = this.validateConfig(config);
  }
  
  /**
   * Validate and normalize configuration
   */
  private validateConfig(config: FabstirSDKCoreConfig): FabstirSDKCoreConfig {
    // Validate RPC URL - NO fallback to environment variables
    validateRpcUrl(config.rpcUrl);

    // Build configuration without environment variable fallbacks
    const defaultConfig: FabstirSDKCoreConfig = {
      mode: config.mode || 'production',
      rpcUrl: config.rpcUrl, // Required, no fallback
      chainId: config.chainId || 84532, // Base Sepolia default
      trainingModelId: config.trainingModelId, // Training M0 model id (enables getTrainingManager)
      trainingJobTimeoutSecs: config.trainingJobTimeoutSecs,

      contractAddresses: {
        // Required addresses - no fallbacks
        jobMarketplace: config.contractAddresses?.jobMarketplace,
        nodeRegistry: config.contractAddresses?.nodeRegistry,
        proofSystem: config.contractAddresses?.proofSystem,
        hostEarnings: config.contractAddresses?.hostEarnings,
        usdcToken: config.contractAddresses?.usdcToken,
        // Optional addresses
        fabToken: config.contractAddresses?.fabToken,
        modelRegistry: config.contractAddresses?.modelRegistry
      },

      s5Config: {
        portalUrl: config.s5Config?.portalUrl,
        ...config.s5Config
      },

      bridgeConfig: {
        url: config.bridgeConfig?.url || 'http://localhost:3000',
        autoConnect: config.bridgeConfig?.autoConnect ?? false
      },

      smartWallet: config.smartWallet,

      // Host-only mode: Skip S5/Storage/Session initialization
      hostOnly: config.hostOnly,

      // Inference-only: skip S5 storage + RAG, keep SessionManager. Env-overridable.
      skipS5: config.skipS5 ?? (typeof process !== 'undefined' && process.env?.SKIP_S5_STORAGE === 'true'),

      // Moderation publish-gate enforcement — ships dark (M3, D1).
      moderationGate: config.moderationGate ?? false
    };

    // Validate all required contract addresses
    validateRequiredAddresses(defaultConfig.contractAddresses as any);

    // Validate optional addresses if provided
    if (defaultConfig.contractAddresses?.fabToken) {
      validateOptionalAddress(defaultConfig.contractAddresses.fabToken, 'fabToken');
    }
    if (defaultConfig.contractAddresses?.modelRegistry) {
      validateOptionalAddress(defaultConfig.contractAddresses.modelRegistry, 'modelRegistry');
    }

    return defaultConfig;
  }
  
  /**
   * Authenticate with wallet
   */
  async authenticate(method: 'metamask' | 'privatekey' | 'signer' | 'aa-signer' = 'metamask', options?: any): Promise<void> {
    const epoch = this.identityEpoch;
    return this.oneAtATime(() => this._authenticate(method, options, epoch));
  }

  /**
   * Run a sign-in once every earlier one has settled (§23 DD1): an overlapping call — a retry after the UI's own
   * timeout, an account switch, a double-run effect — never interleaves with another's writes (signer, address,
   * seed, managers), so no manager is built from one identity's address and another's seed. A failed sign-in does
   * not stop the next. `disconnect()` does not wait here: it supersedes (§24 EE4). The network steps a sign-in owns
   * are bounded (storage start, network detection, registration calls, a Base Account approval — §24 EE4, §25 FF2),
   * so a later sign-in waits at most for those or a wallet prompt left unanswered — and, with `bridgeConfig.autoConnect`,
   * for the bridge's connect, whose every step is bounded (§30 KK1, §31 LL1).
   */
  private oneAtATime<T>(change: () => Promise<T>): Promise<T> {
    const run = this.authQueue.then(change);
    this.authQueue = run.catch(() => undefined);
    return run;
  }

  /** A sign-in a later `disconnect()` superseded: what it wrote is removed, and it says so (§24 EE4). */
  private assertCurrent(epoch: number): void {
    if (epoch === this.identityEpoch) return;
    this.forgetIdentity();
    throw authSuperseded();
  }

  /** A sign-in requested before a sign-out never starts — nothing written, nothing to remove (§24 EE4, §25 FF2). */
  private refuseIfSuperseded(epoch: number): void {
    if (epoch !== this.identityEpoch) throw authSuperseded();
  }

  /** `derivedSeed`: the Base Account composite's, for its signer step — never a public option (§29 JJ3). */
  private async _authenticate(method: 'metamask' | 'privatekey' | 'signer' | 'aa-signer', options: any, epoch: number, derivedSeed?: string): Promise<void> {
    this.refuseIfSuperseded(epoch);
    // A sign-in starts by forgetting the previous identity (§25 FF1): its managers — a RAG manager the UI holds
    // included — refuse from now on, and no delegate payer carries over (§24 EE5). Authenticated only once the new
    // managers are up (§20 AA6, §21 BB6): until then every getter refuses NOT_AUTHENTICATED.
    this.forgetIdentity();
    try {
      if (method === 'metamask') {
        await this.authenticateWithMetaMask();
      } else if (method === 'privatekey') {
        if (!options || !options.privateKey) {
          throw new SDKError('Private key required in options', 'PRIVATE_KEY_MISSING');
        }
        await this.authenticateWithPrivateKey(options.privateKey);
      } else if (method === 'signer') {
        if (!options || !options.signer) {
          throw new SDKError('Signer required in options', 'SIGNER_MISSING');
        }
        await this.authenticateWithSigner(options.signer, derivedSeed);
      } else if (method === 'aa-signer') {
        await this.authenticateWithAASigner(options);
      } else {
        throw new SDKError('Unsupported authentication method', 'AUTH_METHOD_UNSUPPORTED');
      }
      this.assertCurrent(epoch);
      // Only now — the sign-in still the current one — is its derived seed cached (§27 HH3): a sign-out during a wallet
      // prompt or the derivation never leaves this identity's seed behind. A provided seed is never cached.
      if (this.s5Seed && this.s5Seed !== this.config.s5Config?.seedPhrase) cacheSeed(this.userAddress!, this.s5Seed);

      this.authMode = method;

      // Initialize contract manager
      this.contractManager = new ContractManager(
        this.provider!,
        this.config.contractAddresses! as ContractAddresses
      );
      await this.contractManager.setSigner(this.signer!);
      this.assertCurrent(epoch);

      // Initialize managers
      await this.initializeManagers();
      this.assertCurrent(epoch);
      // The identity's bridge: built only by a sign-in still current — a superseded one never touches it (§34 OO1) —
      // and, with autoConnect, connected before the SDK is authenticated; a sign-out during it supersedes the sign-in.
      await this.buildBridge();
      this.assertCurrent(epoch);
      this.authenticated = true;
    } catch (error: any) {
      if (error?.code === 'AUTH_SUPERSEDED') throw error;
      // Superseded while it failed: the sign-out stands, and this says why (§24 EE4).
      this.assertCurrent(epoch);
      console.error('Authentication error details:', error);
      // Never left half-authenticated (§20 AA6): what the attempt wrote — its seed, signer, address — is forgotten
      // (§25 FF1).
      this.forgetIdentity();
      // An s5js the SDK cannot run on is a configuration error with its own code — never folded into AUTH_FAILED.
      if (error?.code === 'S5JS_UNSUPPORTED_VERSION') throw error;
      // Nested (NETWORK_UNREACHABLE, …): the cause's own verdict travels with it, never a default (§25 FF3).
      const retryable = explicitVerdict(error);
      throw new SDKError(
        `Authentication failed: ${error.message}`,
        'AUTH_FAILED',
        { error: error.message, cause: error, ...(retryable === undefined ? {} : { retryable }) }
      );
    }
  }

  /**
   * Authenticate as a delegate (delegate-pays): a plain EOA `signer` spends the
   * `payer`'s on-chain-capped USDC allowance. Reuses authenticate('signer') for
   * full manager init, then records the payer and propagates it to PaymentManager.
   */
  async authenticateAsDelegate(options: { signer: ethers.Signer; payer: string }): Promise<void> {
    if (!options || !options.signer) {
      throw new SDKError('Delegate signer required', 'DELEGATE_SIGNER_MISSING');
    }
    if (!options.payer || options.payer === ethers.ZeroAddress) {
      throw new SDKError('Delegate payer (owner) required', 'DELEGATE_PAYER_MISSING');
    }
    // One sign-in, the payer included (§24 EE5): nothing awaits between the managers and the payer.
    const epoch = this.identityEpoch;
    return this.oneAtATime(async () => {
      await this._authenticate('signer', { signer: options.signer }, epoch);
      this.authMode = 'delegate';
      this.delegatePayer = options.payer;
      this.paymentManager!.setDelegatePayer(options.payer);
    });
  }

  /** The payer (owner) recorded in delegate-pays mode, or undefined otherwise. */
  getDelegatePayer(): string | undefined {
    return this.delegatePayer;
  }

  /**
   * Enable delegate-pays on the ALREADY-authenticated (primary) session so shared-PaymentManager
   * escrow — LTX video, LLM session-open — is signed by the sub-account (popup-free CryptoKey) while
   * `payer` funds it via its on-chain-capped USDC allowance.
   *
   * Unlike {@link authenticateAsDelegate} (which re-authenticates AS the delegate and thereby moves
   * userAddress + S5 identity to the sub-account), this leaves the authenticated identity — and thus
   * storage ownership, session groups, and the S5 seed — on the primary. Invariant: sign as the
   * delegate, identify as the payer. Call AFTER authenticate(); reversible via
   * {@link disableDelegatePayments}. `getDelegatePayer()` reports the active payer.
   */
  async enableDelegatePayments(options: { signer: ethers.Signer; payer: string }): Promise<void> {
    if (!this.authenticated || !this.paymentManager) {
      throw new SDKError('enableDelegatePayments requires an authenticated session', 'NOT_AUTHENTICATED', { retryable: false });
    }
    if (!options || !options.signer) {
      throw new SDKError('Delegate signer required', 'DELEGATE_SIGNER_MISSING');
    }
    if (!options.payer || options.payer === ethers.ZeroAddress) {
      throw new SDKError('Delegate payer (owner) required', 'DELEGATE_PAYER_MISSING');
    }
    // Swap ONLY the PaymentManager's signing key (+ rebuild its wrappers) and record the payer.
    // this.signer / this.userAddress / this.s5Seed / this.authMode are deliberately untouched.
    this.paymentManager.setSigner(options.signer);
    this.paymentManager.setDelegatePayer(options.payer);
    this.delegatePayer = options.payer;
  }

  /**
   * Revert {@link enableDelegatePayments}: route escrow back through the primary signer and clear the
   * payer. Escrow signs (and pops up) as the primary again. No-op on identity — it never moved.
   */
  async disableDelegatePayments(): Promise<void> {
    if (!this.paymentManager) {
      throw new SDKError('disableDelegatePayments requires an authenticated session', 'NOT_AUTHENTICATED', { retryable: false });
    }
    if (this.signer) {
      this.paymentManager.setSigner(this.signer);
    }
    this.paymentManager.setDelegatePayer(undefined);
    this.delegatePayer = undefined;
  }

  /**
   * Authenticate with the initialized wallet provider
   */
  async authenticateWithWallet(): Promise<void> {
    if (!this.walletProvider) {
      throw new SDKError('No wallet provider initialized', 'WALLET_NOT_INITIALIZED');
    }

    if (!this.walletProvider.isConnected()) {
      throw new SDKError('Wallet not connected', 'WALLET_NOT_CONNECTED');
    }

    const address = await this.walletProvider.getAddress();
    this.userAddress = address;

    // VoidSigner cannot sign transactions - it's read-only
    // This is a critical issue that must be fixed
    const provider = sharedRpcProvider(this.config.rpcUrl!, this.config.chainId!);
    this.provider = provider;

    // CRITICAL: VoidSigner cannot sign transactions
    // Production code must use a real signer
    throw new SDKError(
      'Cannot create signer from wallet provider. Use authenticateWithPrivateKey or authenticateWithMetaMask for transaction signing',
      'SIGNER_NOT_AVAILABLE'
    );

    this.authenticated = true;

    // Initialize contract manager
    this.contractManager = new ContractManager(
      this.provider,
      this.config.contractAddresses! as ContractAddresses
    );
    await this.contractManager.setSigner(this.signer);

    // Initialize managers
    await this.initializeManagers();
  }

  /**
   * Authenticate with MetaMask
   */
  private async authenticateWithMetaMask(): Promise<void> {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new SDKError('MetaMask not available', 'METAMASK_NOT_FOUND');
    }
    
    // Request accounts
    const accounts = await window.ethereum.request({ 
      method: 'eth_requestAccounts' 
    });
    
    if (!accounts || accounts.length === 0) {
      throw new SDKError('No accounts found', 'NO_ACCOUNTS');
    }
    
    // Create provider and signer
    this.provider = new ethers.BrowserProvider(window.ethereum);
    this.signer = await this.provider.getSigner();
    this.userAddress = await this.signer.getAddress();
    
    // Verify network (bounded — §24 EE4)
    const network = await withTimeout(this.provider.getNetwork(), NETWORK_TIMEOUT_MS, networkUnreachable);
    if (network.chainId !== BigInt(this.config.chainId!)) {
      // Try to switch network
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${this.config.chainId!.toString(16)}` }]
        });
      } catch (error) {
        throw new SDKError(
          `Wrong network. Please switch to chain ${this.config.chainId}`,
          'WRONG_NETWORK'
        );
      }
    }
    
    // Generate or retrieve S5 seed deterministically (skip in hostOnly mode)
    if (this.config.hostOnly !== true) {
      try {
        // PRIORITY 1: Use provided seedPhrase if available (for cross-tab consistency)
        if (this.config.s5Config?.seedPhrase) {
          console.log('[SDK] Using provided s5Config.seedPhrase for S5 identity');
          this.s5Seed = this.config.s5Config.seedPhrase;
        } else {
          // PRIORITY 2: Check cache first
          const hasCached = hasCachedSeed(this.userAddress);
          if (hasCached) {
            const { getCachedSeed } = await import('./utils/s5-seed-derivation');
            this.s5Seed = getCachedSeed(this.userAddress)!;
            console.log('[SDK] Using cached S5 seed');
          } else {
            // PRIORITY 3: Derive from ADDRESS (not signature) for determinism
            // This survives browser clear since address is always the same
            this.s5Seed = await generateS5SeedFromAddress(this.userAddress, this.config.chainId!);
            console.log('[SDK] Generated S5 seed from wallet address (deterministic, no signature needed)');
          }
        }
      } catch (error: any) {
        console.warn('[S5 Seed] Failed to generate deterministic seed:', error);

        // No fallbacks in production - seed must be explicitly provided
        throw new SDKError(
          `Failed to generate S5 seed: ${error.message}`,
          'SEED_GENERATION_FAILED'
        );
      }
    } else {
      console.log('[SDK] Host-only mode: Skipping S5 seed generation');
    }
  }


  /**
   * Authenticate with private key (for testing)
   *
   * NOTE: When using private key auth, S5 seed is derived DETERMINISTICALLY
   * from the private key itself, NOT from wallet signatures. This means:
   * - Same private key = Same S5 seed (always, across sessions/devices)
   * - Survives browser data clear
   * - No signature popups required
   */
  private async authenticateWithPrivateKey(privateKey: string): Promise<void> {
    if (!privateKey) {
      throw new SDKError('Private key required', 'PRIVATE_KEY_REQUIRED');
    }

    if (!this.config.rpcUrl) {
      throw new SDKError('RPC URL required for private key auth', 'RPC_URL_REQUIRED');
    }

    this.provider = sharedRpcProvider(this.config.rpcUrl, this.config.chainId!);

    // Create wallet without provider first (for offline signing)
    const wallet = new ethers.Wallet(privateKey);

    this.signer = wallet.connect(this.provider);

    this.userAddress = await this.signer.getAddress();

    // Generate S5 seed DETERMINISTICALLY from private key (skip in hostOnly mode)
    // This is more reliable than signature-based derivation because:
    // 1. 100% deterministic - same key always produces same seed
    // 2. Survives browser data clear
    // 3. Works across devices
    if (this.config.hostOnly !== true) {
      try {
        // PRIORITY 1: Use provided seedPhrase if available (for cross-tab consistency)
        if (this.config.s5Config?.seedPhrase) {
          console.log('[SDK] Using provided s5Config.seedPhrase for S5 identity');
          this.s5Seed = this.config.s5Config.seedPhrase;
        } else {
          // PRIORITY 2: Derive S5 seed deterministically from private key
          // This is the KEY FIX for the "data loss after browser clear" bug
          console.log('[SDK] Deriving S5 seed deterministically from private key...');
          this.s5Seed = await generateS5SeedFromPrivateKey(privateKey);
          console.log('[SDK] S5 seed derived (deterministic from private key)');
        }
      } catch (error: any) {
        console.error('[S5 Seed] Failed to derive seed from private key:', error);

        // No fallbacks in production - seed must be explicitly provided
        throw new SDKError(
          `Failed to derive S5 seed from private key: ${error.message}`,
          'SEED_GENERATION_FAILED'
        );
      }
    } else {
      console.log('[SDK] Host-only mode: Skipping S5 seed generation');
    }
  }

  /**
   * Authenticate via ERC-4337 Smart Account. The Smart Account holds funds;
   * the caller-supplied `sendUserOp` callback executes UserOps on the bundler
   * of their choice. The EOA private key is used internally for off-chain
   * signing only (signMessage, signTypedData, encrypted session init) — it
   * never broadcasts and is not expected to hold ETH.
   */
  private async authenticateWithAASigner(
    options: AASignerOptions & { rpcUrl: string },
  ): Promise<void> {
    if (!options?.smartAccountAddress) {
      throw new SDKError('Smart account address required', 'AA_SMART_ACCOUNT_MISSING');
    }
    if (!options.eoaPrivateKey) {
      throw new SDKError('EOA private key required', 'AA_EOA_KEY_MISSING');
    }
    if (!options.sendUserOp) {
      throw new SDKError('sendUserOp callback required', 'AA_SEND_USEROP_MISSING');
    }
    if (!options.rpcUrl) {
      throw new SDKError('RPC URL required for aa-signer auth', 'AA_RPC_URL_MISSING');
    }

    this.provider = sharedRpcProvider(options.rpcUrl, options.chainId);
    this.eoaWallet = new ethers.Wallet(options.eoaPrivateKey, this.provider);
    this.signer = new AASigner(
      {
        smartAccountAddress: options.smartAccountAddress,
        eoaPrivateKey: options.eoaPrivateKey,
        sendUserOp: options.sendUserOp,
        chainId: options.chainId,
      },
      this.provider,
    );
    this.userAddress = options.smartAccountAddress;

    if (this.config.hostOnly !== true) {
      try {
        if (this.config.s5Config?.seedPhrase) {
          this.s5Seed = this.config.s5Config.seedPhrase;
        } else {
          this.s5Seed = await generateS5SeedFromPrivateKey(options.eoaPrivateKey);
        }
      } catch (error: any) {
        throw new SDKError(
          `Failed to derive S5 seed from EOA private key: ${error.message}`,
          'SEED_GENERATION_FAILED',
        );
      }
    }
  }

  /**
   * Authenticate with an existing signer (for testing with external wallets). `derivedSeed`: a seed a composite sign-in
   * derived for this signer (the Base Account's, from its primary account — §28 II5) — after a provided seed, before
   * the cache; `_authenticate` caches it once the sign-in is current.
   */
  private async authenticateWithSigner(signer: ethers.Signer, derivedSeed?: string): Promise<void> {
    if (!signer) {
      throw new SDKError('Signer required', 'SIGNER_REQUIRED');
    }
    
    this.signer = signer;
    
    // Get provider from signer if available
    if ('provider' in signer && signer.provider) {
      this.provider = signer.provider as ethers.BrowserProvider | ethers.JsonRpcProvider;
    } else if (this.config.rpcUrl) {
      // Create provider if not available
      this.provider = sharedRpcProvider(this.config.rpcUrl, this.config.chainId!);
    } else {
      throw new SDKError('Provider or RPC URL required', 'PROVIDER_REQUIRED');
    }
    
    this.userAddress = await this.signer.getAddress();

    // Generate or retrieve S5 seed deterministically (skip in hostOnly mode)
    if (this.config.hostOnly !== true) {
      try {
        // PRIORITY 1: Use provided seedPhrase if available (for cross-tab consistency)
        if (this.config.s5Config?.seedPhrase) {
          console.log('[SDK] Using provided s5Config.seedPhrase for S5 identity');
          this.s5Seed = this.config.s5Config.seedPhrase;
        } else if (derivedSeed) {
          this.s5Seed = derivedSeed;
        } else {
          // PRIORITY 2: Check cache first
          const hasCached = hasCachedSeed(this.userAddress);
          if (hasCached) {
            const { getCachedSeed } = await import('./utils/s5-seed-derivation');
            this.s5Seed = getCachedSeed(this.userAddress)!;
            console.log('[SDK] Using cached S5 seed');
          } else {
            // PRIORITY 3: Derive from ADDRESS (not signature) for determinism
            // Works with ANY signer type: MetaMask, Base Account Kit, WalletConnect, etc.
            this.s5Seed = await generateS5SeedFromAddress(this.userAddress, this.config.chainId!);
            console.log('[SDK] Generated S5 seed from wallet address (deterministic, no signature needed)');
          }
        }
      } catch (error: any) {
        console.error('[S5 Seed] Failed to generate deterministic seed:', error);

        // No fallbacks in production - seed must be explicitly provided
        throw new SDKError(
          `Failed to generate S5 seed: ${error.message}`,
          'SEED_GENERATION_FAILED'
        );
      }
    } else {
      console.log('[SDK] Host-only mode: Skipping S5 seed generation');
    }
  }

  /**
   * Authenticate with Base Account Kit for popup-free transactions
   *
   * This method:
   * 1. Creates or retrieves a sub-account with spend permissions
   * 2. Creates a custom signer that uses wallet_sendCalls
   * 3. Authenticates the SDK with this signer
   * 4. Caches S5 seed to avoid signature popups
   *
   * @param options Configuration options
   * @returns Sub-account address, whether it was newly created, and the USDC approval's outcome (§26 GG4):
   *   `'confirmed'`; `'unconfirmed'` (not confirmed within 120 s — it may still land); `'failed'` (with
   *   `approvalError`); `'skipped'` (no JobMarketplace configured). Only `'confirmed'` means the approval is in place.
   */
  async authenticateWithBaseAccount(options: {
    provider: any;           // Base Account Kit provider
    primaryAccount: string;  // Primary smart wallet address
    chainId?: number;        // Override chain ID (defaults to config)
    tokenAddress?: string;   // Token for spend permissions (defaults to USDC)
    tokenDecimals?: number;  // Token decimals (defaults to 6)
    maxAllowance?: string;   // Max allowance in token units (defaults to "1000000")
    periodDays?: number;     // Permission period in days (defaults to 365)
  }): Promise<BaseAccountSignIn> {
    // One sign-in, its approval included (§24 EE5).
    const epoch = this.identityEpoch;
    return this.oneAtATime(() => this._authenticateWithBaseAccount(options, epoch));
  }

  private async _authenticateWithBaseAccount(options: {
    provider: any; primaryAccount: string; chainId?: number; tokenAddress?: string; tokenDecimals?: number;
    maxAllowance?: string; periodDays?: number;
  }, epoch: number): Promise<BaseAccountSignIn> {
    const {
      provider,
      primaryAccount,
      chainId = this.config.chainId!,
      tokenAddress = this.config.contractAddresses?.usdcToken,
      tokenDecimals = 6,
      maxAllowance = '1000000',
      periodDays = 365,
    } = options;

    if (!tokenAddress) {
      throw new SDKError(
        'Token address required for Base Account authentication. Provide tokenAddress or configure contractAddresses.usdcToken',
        'TOKEN_ADDRESS_MISSING'
      );
    }
    // Requested before a sign-out: no wallet step at all (§25 FF2).
    this.refuseIfSuperseded(epoch);

    // 1. Ensure sub-account exists with spend permissions
    const subAccountResult = await ensureSubAccount(provider, primaryAccount, {
      tokenAddress,
      tokenDecimals,
      maxAllowance,
      periodDays,
    });
    // A sign-out during that prompt: refused before anything else (§26 GG4).
    this.refuseIfSuperseded(epoch);


    // 2. The sub-account's S5 seed, derived from the PRIMARY account address (data sovereignty): same passkey → same
    // smart wallet → same address → same seed, with no signature — across sessions, browsers and devices. Handed to
    // the signer step, never cached here: `_authenticate` caches it once the sign-in is current (§28 II5). A provided
    // seed (`s5Config.seedPhrase`) or one already cached needs no derivation.
    const subAccountLower = subAccountResult.address.toLowerCase();
    console.log('[BaseAccount Auth] Sub-account address:', subAccountLower);
    console.log('[BaseAccount Auth] Primary account address:', primaryAccount.toLowerCase());
    const derivedSeed = this.config.s5Config?.seedPhrase || hasCachedSeed(subAccountLower)
      ? undefined
      : await generateS5SeedFromAddress(primaryAccount, chainId);

    // 3. Create custom signer that uses wallet_sendCalls
    const customSigner = createSubAccountSigner({
      provider,
      subAccount: subAccountResult.address,
      primaryAccount,
      chainId,
    });


    // 4. Authenticate SDK with the custom signer (within this change — never queued behind it)
    await this._authenticate('signer', { signer: customSigner }, epoch, derivedSeed);


    // 5. Approve JobMarketplace to spend USDC from sub-account
    // This is required for createSessionJob to work. Its outcome is reported, never thrown: the approval may already
    // exist, or be made later (§26 GG4).
    let approval: BaseAccountApproval = 'skipped';
    let approvalError: unknown;
    if (this.config.contractAddresses?.jobMarketplace) {
      // Never after a sign-out — and that refusal is not one the approval's catch may swallow (§25 FF2).
      this.assertCurrent(epoch);
      try {
        const ethersProvider = new ethers.BrowserProvider(provider);
        const usdcContract = new ethers.Contract(
          tokenAddress,
          ['function approve(address spender, uint256 amount) returns (bool)'],
          customSigner
        );

        // Approve a large amount (effectively unlimited)
        const approvalAmount = ethers.parseUnits(maxAllowance, tokenDecimals);
        // Bounded whole (§25 FF2, §26 GG4): the send — the wallet transport's request and its transaction lookup, no
        // prompt — and the confirmation; neither may hold every later sign-in.
        await withTimeout(
          usdcContract.approve(this.config.contractAddresses.jobMarketplace, approvalAmount).then((tx: any) => tx.wait(1)),
          APPROVAL_TIMEOUT_MS,
          () => new SDKError('The approval did not confirm in time', 'APPROVAL_UNCONFIRMED', { retryable: true }));
        approval = 'confirmed';
      } catch (error) {
        console.warn('[BaseAccount Auth] Failed to approve JobMarketplace:', error);
        approval = (error as any)?.code === 'APPROVAL_UNCONFIRMED' ? 'unconfirmed' : 'failed';
        approvalError = error;
      }
    }
    // A sign-out during the approval: not a success (§25 FF2).
    this.assertCurrent(epoch);

    return {
      subAccount: subAccountResult.address,
      isNewlyCreated: !subAccountResult.isExisting,
      approval,
      ...(approvalError === undefined ? {} : { approvalError }),
    };
  }

  /**
   * Start storage for SessionManager and VectorRAG. `skipS5`: the app chose none — a no-op store (inference only).
   * A start that fails, or S5 that never connected, leaves a store that says so: every storage call (the log
   * preflight included), the RAG getters, the session-group manager and the transcode, LTX and training getters
   * reject STORAGE_UNAVAILABLE with the cause — never a silent "no log" or a dropped write (§19 Z16, §20 AA1, §23 DD3).
   * A start that stalls is one that failed, after STORAGE_START_TIMEOUT_MS (§24 EE4). It is not retryable:
   * authenticating again starts storage again, which clears it. An s5js the SDK cannot run on is fatal (Z1).
   */
  private async _initStorage(skipS5: boolean): Promise<void> {
    this.storageUnavailable = undefined;
    const noop = (addr: string) => new Proxy({} as any, {
      get(_target, prop) {
        if (prop === 'isInitialized') return () => true;
        if (prop === 'getHostSelectionMode') return async () => 'auto';
        if (prop === 'getUserSettings') return async () => ({});
        if (prop === 'getUserAddress') return () => addr;
        if (typeof prop === 'string' && prop !== 'then') return async () => undefined;
        return undefined;
      }
    });
    // Present (SessionManager needs a store, and log-off sessions with a named host still run — automatic selection
    // reads the saved preferences, which live in storage), but every storage call refuses — the
    // way the real member reports: a synchronous one throws, an asynchronous one rejects (§21 BB3, §22 CC7). Only the
    // presence, the address and the connection status answer.
    const unavailableStore = (addr: string, unavailable: SDKError) => {
      const synchronous = new Set<string>(STORAGE_MANAGER_SYNC_MEMBERS);
      return new Proxy({} as any, {
        get(_target, prop) {
          if (prop === 'isInitialized') return () => true;
          if (prop === 'getUserAddress') return () => addr;
          if (prop === 'getConnectionStatus') return () => 'disconnected';
          if (prop === 'dispose' || prop === 'cleanup') return () => {}; // nothing started: nothing to release (§26 GG1, §32 MM5)
          // Only a StorageManager's own members are storage calls; anything else (`then`, `toJSON`, `toString`,
          // `hasOwnProperty`, …) is not there — never a rejection nobody awaits (§23 DD6).
          if (typeof prop !== 'string' || !Object.prototype.hasOwnProperty.call(StorageManager.prototype, prop) || prop === 'constructor') return undefined;
          return synchronous.has(prop) ? () => { throw unavailable; } : async () => { throw unavailable; };
        }
      });
    };
    if (skipS5) {
      this.storageManager = noop(this.userAddress || '');
      return;
    }
    if (!this.s5Seed || !this.userAddress) {
      throw new SDKError('S5 seed and user address required for StorageManager initialization', 'STORAGE_INIT_FAILED');
    }
    // The store this start began with — not whatever the SDK holds when it ends (a sign-out may have dropped it — §27 HH10).
    const store = this.storageManager!;
    let failure: unknown;
    try {
      // Bounded (§24 EE4): a portal that stalls makes storage unavailable, never a sign-in that never settles.
      await withTimeout(store.initialize(this.s5Seed, this.userAddress), STORAGE_START_TIMEOUT_MS,
        () => new SDKError('Storage did not start in time', 'STORAGE_START_TIMEOUT', { retryable: true }));
      if (!store.isInitialized()) failure = new SDKError('S5 did not connect', 'STORAGE_NOT_INITIALIZED');
    } catch (storageErr: any) {
      if (storageErr?.code === 'S5JS_UNSUPPORTED_VERSION') throw storageErr;
      failure = storageErr;
    }
    if (failure === undefined) return;
    // The store it abandons is disposed: a start that ends later releases what it set up (§26 GG1).
    store.dispose();
    const reason = (failure as any)?.message ?? String(failure);
    console.warn(`[SDK] Storage is unavailable (conversation log and RAG): ${reason}`);
    this.storageUnavailable = new SDKError(`Storage is unavailable: ${reason} — authenticate again to retry`, 'STORAGE_UNAVAILABLE', {
      cause: failure, retryable: false,
    });
    this.storageManager = unavailableStore(this.userAddress, this.storageUnavailable);
  }

  private async initializeManagers(): Promise<void> {
    // Reads go to the configured endpoint, writes to the signer. Establish
    // this before any manager is constructed so none of them capture the
    // wallet provider for reads.
    this.initializeReadProvider();
    await this.assertReadWriteChainParity();
    this.watchWalletChainChanges();

    // Create auth manager with authenticated data
    this.authManager = new AuthManager(this.signer, this.provider, this.userAddress, this.s5Seed);

    // Create other managers
    // Use PaymentManagerMultiChain for deposit/withdrawal support
    this.paymentManager = new PaymentManagerMultiChain(undefined, this.currentChainId);

    // Host-only mode: Skip S5/Storage/Session/Encryption (for host CLI operations)
    const hostOnly = this.config.hostOnly === true;
    // Inference-only mode: skip S5 storage + RAG, but KEEP SessionManager.
    const skipS5 = this.config.skipS5 === true;

    if (!hostOnly && !skipS5) {
      // StorageManager constructor takes s5PortalUrl and auth config
      const s5PortalUrl = this.config.s5Config?.portalUrl;
      const s5AuthApiUrl = this.config.s5Config?.authApiUrl;
      const s5MasterToken = this.config.s5Config?.masterToken;

      // Prefer authApiUrl (secure) over masterToken (exposed)
      if (s5AuthApiUrl) {
        this.storageManager = new StorageManager(
          s5PortalUrl || StorageManager.DEFAULT_S5_PORTAL,
          s5AuthApiUrl,
          true  // isAuthApiUrl = true
        );
      } else {
        this.storageManager = new StorageManager(
          s5PortalUrl || StorageManager.DEFAULT_S5_PORTAL,
          s5MasterToken,
          false  // isAuthApiUrl = false (using masterToken)
        );
      }

    }

    // VectorRAGManager needs userAddress, seedPhrase, config, and sessionManager
    // These will be set after authentication, so we defer initialization

    this.treasuryManager = new TreasuryManager(this.contractManager!);

    // Note: HostManager and ModelManager will be created after authentication
    // when we have a signer available

    // Initialize managers that need a signer
    if (this.signer) {
      await (this.paymentManager as any).initialize(this.signer);

      if (!hostOnly) {
        await this._initStorage(skipS5);

        // Create SessionManager after storage init (so it gets the proxy if storage failed)
        this.sessionManager = new SessionManager(this.paymentManager as any, this.storageManager);

        // Create EncryptionManager
        // PRIORITY: Use S5 seed for encryption key derivation (ensures cross-tab consistency)
        if (this.s5Seed) {
          const address = await this.signer.getAddress();
          this.encryptionManager = EncryptionManager.fromSeed(this.s5Seed, address);
        } else if (this.signer && 'privateKey' in this.signer) {
          // Fallback: For Wallet instances with direct privateKey access (testing)
          this.encryptionManager = new EncryptionManager(this.signer as ethers.Wallet);
        } else {
          throw new SDKError(
            'S5 seed required for encryption. Ensure wallet can sign messages for seed derivation.',
            'ENCRYPTION_SEED_REQUIRED'
          );
        }

        await (this.sessionManager as any).initialize();  // SessionManager doesn't take signer
      } else {
        console.log('[SDK] Host-only mode: Skipping S5/Storage/Session/Encryption initialization');
      }

      // Create and initialize ModelManager and HostManager now that we have a signer
      const modelRegistryAddress = this.config.contractAddresses?.modelRegistry;
      if (!modelRegistryAddress) {
        throw new SDKError('Model Registry address not configured', 'CONFIG_ERROR');
      }
      const nodeRegistryAddress = this.config.contractAddresses?.nodeRegistry;
      if (!nodeRegistryAddress) {
        throw new SDKError('Node Registry address not configured', 'CONFIG_ERROR');
      }
      await this.constructModelAndHostManagers({
        modelRegistry: modelRegistryAddress, nodeRegistry: nodeRegistryAddress,
        fabToken: this.config.contractAddresses?.fabToken, hostEarnings: this.config.contractAddresses?.hostEarnings,
      });

      // NEW: Enable price validation in SessionManager
      if (this.sessionManager) {
        (this.sessionManager as any).setHostManager(this.hostManager);
      }

      // NEW: Enable encryption in SessionManager (if EncryptionManager available)
      if (this.sessionManager && this.encryptionManager) {
        (this.sessionManager as any).setEncryptionManager(this.encryptionManager);
      }

      // NEW: Enable automatic host selection in SessionManager (Phase 5.1)
      if (this.sessionManager && this.hostManager) {
        const hostSelectionService = new HostSelectionService(this.hostManager as HostManager);
        (this.sessionManager as any).setHostSelectionService(hostSelectionService);
      }

      // Create ClientManager after ModelManager and HostManager are available
      this.clientManager = new ClientManager(
        this.modelManager!,   // built by constructModelAndHostManagers() above
        this.hostManager as HostManager,
        this.contractManager!
      );
      await this.clientManager.initialize(this.signer);

      await (this.treasuryManager as any).initialize(this.signer);

      // Initialize VectorRAGManager after authentication (needs userAddress and s5Seed)
      // Skip in hostOnly / skipS5 mode (no S5 storage available)
      if (!hostOnly && !skipS5 && !this.storageUnavailable && this.userAddress && this.s5Seed && this.sessionManager) {
        const ragConfig = {
          ...DEFAULT_RAG_CONFIG,
          s5Portal: this.config.s5Config?.portalUrl || DEFAULT_RAG_CONFIG.s5Portal
        };
        const storageForRag = this.storageManager!;
        this.vectorRAGManager = new VectorRAGManager({
          userAddress: this.userAddress,
          seedPhrase: this.s5Seed,
          config: ragConfig,
          sessionManager: this.sessionManager as SessionManager,
          s5Client: this.storageManager!.getS5Client(),
          encryptionManager: this.encryptionManager!,
          // The store this manager was built with — not whatever the SDK holds later (§24 EE8).
          isOnline: () => storageForRag.getConnectionStatus() !== 'disconnected',
        });

        // Kick off vectorRAG initialization in the background so the SDK-init
        // critical path stays fast. Consumers that need vector features ready
        // before use can `await sdk.getVectorRAGReady()`. Errors surface to
        // awaiters and are logged here for observability of the silent path.
        this.vectorRAGReady = this.vectorRAGManager.initialize().catch((err: any) => {
          console.warn('[FabstirSDKCore] Background VectorRAG init failed:', err?.message ?? err);
          throw err;
        });

        // Initialize SessionGroupManager with S5 storage and retry/reconnect support (v1.4.26+)
        const sessionGroupStorage = new SessionGroupStorage(
          this.storageManager!.getS5Client(),
          this.s5Seed,
          this.userAddress,
          this.encryptionManager,
          this.storageManager  // Pass StorageManager for auto-retry/reconnect
        );

        this.sessionGroupManager = new SessionGroupManager(sessionGroupStorage);
      } else if (!hostOnly) {
        console.warn('VectorRAGManager initialization skipped: host-only or skipS5 mode, missing userAddress or s5Seed, or storage unavailable');
      }

      // Initialize TranscodeManager (needs sessionManager, storageManager, contractManager, encryptionManager)
      if (!hostOnly && !skipS5 && this.sessionManager && this.storageManager && this.contractManager && this.encryptionManager) {
        this.transcodeManager = new TranscodeManager(
          this.sessionManager, this.storageManager, this.contractManager,
          this.encryptionManager, this.signer!, this.currentChainId,
        );
        if (this.hostManager) {
          this.transcodeManager.setHostSelectionService(
            new HostSelectionService(this.hostManager as HostManager)
          );
        }
      }

      // LTX + Training managers — rebuilt on switchChain(), see buildSidecarManagers.
      await this.buildSidecarManagers(hostOnly, skipS5);
    }
  }

  /** The signed-in identity's bridge client, for `bridgeConfig.url` (always set — it defaults); connected with autoConnect. */
  private async buildBridge(): Promise<void> {
    const { url, autoConnect } = this.config.bridgeConfig!;
    this.bridgeClient = new UnifiedBridgeClient({ bridgeUrl: url!, autoConnect }, this.contractManager);
    if (!autoConnect) return;
    try {
      await this.bridgeClient.connect();
    } catch (error) {
      console.warn('Failed to auto-connect to bridge:', error);
    }
  }
  
  /**
   * Connect the signed-in identity's bridge (P2P and proof features). The bridge URL is configuration
   * (`bridgeConfig.url`, default `http://localhost:3000`), fixed per SDK instance: call this with no argument — a `url`
   * that is not exactly that string (a trailing `/`, a change of case, `''` and `null` included) refuses; another
   * bridge needs an SDK constructed with that `bridgeConfig.url` (§32 MM1, §34 OO2). Every sign-in builds a new client
   * (and closes the previous one).
   *
   * @throws SDKError NOT_AUTHENTICATED (not retryable) — not signed in
   * @throws SDKError BRIDGE_URL_MISMATCH (not retryable) — `url` is not this SDK's bridge
   * @throws SDKError BRIDGE_CONNECTION_FAILED — its `cause` and verdict; cause BRIDGE_CLOSED: a sign-out
   *   (`disconnect()`) or a new sign-in after this call superseded it — the bridge is the identity's (§34 OO7)
   */
  async connectToBridge(url?: string): Promise<void> {
    // The bridge is the signed-in identity's (§26 GG8): never one a sign-in in progress would orphan (§30 KK1). Every
    // sign-in builds it before it is authenticated, so a signed-in SDK always holds one (§33 NN2).
    this.ensureAuthenticated();
    const bridge = this.bridgeClient!;
    // Never a client replaced mid-call, never another URL silently used (§32 MM1); nothing awaited before the connect,
    // so only a sign-out or a new sign-in — each closes the bridge — supersedes it (§30 KK1, §34 OO7).
    if (url !== undefined && url !== bridge.getBridgeUrl()) {
      throw new SDKError(
        `This SDK's bridge is ${bridge.getBridgeUrl()} — another needs an SDK constructed with that bridgeConfig.url`,
        'BRIDGE_URL_MISMATCH', { retryable: false },
      );
    }
    await bridge.connect();
  }
  
  /**
   * Get authentication manager
   */
  getAuthManager(): IAuthManager {
    this.ensureAuthenticated();
    return this.authManager!;
  }
  
  /**
   * Get payment manager
   */
  getPaymentManager(): IPaymentManager {
    this.ensureAuthenticated();
    return this.paymentManager!;
  }
  
  /**
   * Get storage manager
   */
  getStorageManager(): IStorageManager {
    this.ensureAuthenticated();
    return this.storageManager!;
  }
  
  /**
   * Get session manager
   */
  getSessionManager(): ISessionManager {
    this.ensureAuthenticated();
    return this.sessionManager!;
  }

  /**
   * Get the WebSocket client address for the FC1.6 session-auth handshake.
   *
   * Returns the EOA the node recovers from the signature on
   * `encrypted_session_init` — the encryption-key address, NOT the wallet
   * address. Read this BEFORE calling `POST /fiat/session` so the same address
   * is used in /fiat/session, /v1/session-auth, and the live WS connection.
   *
   * @throws SDKError NOT_AUTHENTICATED before authentication
   * @throws SDKError ENCRYPTION_NOT_AVAILABLE in host-only mode (no encryption manager)
   */
  getWsClientAddress(): string {
    this.ensureAuthenticated();
    if (!this.encryptionManager) {
      throw new SDKError(
        'EncryptionManager not available — getWsClientAddress is unavailable in host-only mode',
        'ENCRYPTION_NOT_AVAILABLE'
      );
    }
    return this.encryptionManager.getWsClientAddress();
  }

  /**
   * Get host manager
   */
  getHostManager(): IHostManager {
    this.ensureAuthenticated();
    return this.hostManager!;
  }

  /**
   * Get vector RAG manager for document embeddings and semantic search.
   *
   * Note: returns the manager instance immediately, but the underlying
   * S5 manifest cache may still be loading. If you need readiness before
   * issuing queries, await `getVectorRAGReady()`.
   *
   * @throws STORAGE_UNAVAILABLE when storage failed to start (not retryable: authenticate again — plan §20 AA1).
   */
  getVectorRAGManager(): IVectorRAGManager {
    this.ensureAuthenticated();
    if (this.storageUnavailable) throw this.storageUnavailable; // §19 Z16
    return this.vectorRAGManager!;
  }

  /**
   * Promise that resolves when the deferred VectorRAG initialization (started
   * during SDK auth/init) completes successfully, or rejects if it fails.
   *
   * Consumers that genuinely need the manifest cache populated before issuing
   * `listDatabases()` / vector queries should `await sdk.getVectorRAGReady()`
   * after `authenticate()`. Consumers that only need the manager handle (e.g.
   * for later use) can skip this — `getVectorRAGManager()` returns immediately.
   *
   * Throws if the SDK is not authenticated, or if VectorRAG was not
   * initialized in the current configuration (e.g. host-only mode, or
   * missing userAddress / s5Seed at auth time); rejects STORAGE_UNAVAILABLE
   * when storage failed to start (authenticate again — plan §20 AA1).
   */
  getVectorRAGReady(): Promise<void> {
    this.ensureAuthenticated();
    if (this.storageUnavailable) return Promise.reject(this.storageUnavailable); // §19 Z16
    if (!this.vectorRAGReady) {
      return Promise.reject(
        new SDKError(
          'VectorRAG was not initialized for this SDK instance (host-only mode or missing s5Seed/userAddress at authenticate time)',
          'VECTOR_RAG_NOT_INITIALIZED',
          { retryable: false }, // the configuration it was authenticated with (§21 BB5)
        ),
      );
    }
    return this.vectorRAGReady;
  }

  /**
   * Get session group manager for organizing sessions
   */
  getSessionGroupManager(): SessionGroupManager {
    this.ensureAuthenticated();
    if (this.storageUnavailable) throw this.storageUnavailable; // §20 AA1
    return this.sessionGroupManager!;
  }

  getTranscodeManager(): ITranscodeManager {
    this.ensureAuthenticated();
    // Its jobs keep their spec and results in storage: with none, nothing is funded that cannot be used (§23 DD3).
    if (this.storageUnavailable) throw this.storageUnavailable;
    if (!this.transcodeManager) {
      throw new SDKError('TranscodeManager not initialized', 'TRANSCODE_NOT_AVAILABLE');
    }
    return this.transcodeManager;
  }

  /** Get the LTX video-sidecar manager — one manager serves every template (each job runs on its template's model). */
  getLtxManager(): ILtxManager {
    this.ensureAuthenticated();
    if (this.storageUnavailable) throw this.storageUnavailable; // its results are read from storage (§23 DD3)
    if (!this.ltxManager) {
      throw new SDKError('LtxManager not initialized (hostOnly or skipS5 sign-in)', 'LTX_NOT_AVAILABLE');
    }
    return this.ltxManager;
  }

  /** Get the Training M0 manager (requires config.trainingModelId to have been set). */
  getTrainingManager(): ITrainingManager {
    this.ensureAuthenticated();
    if (this.storageUnavailable) throw this.storageUnavailable; // its datasets and results live in storage (§23 DD3)
    if (!this.trainingManager) {
      throw new SDKError('TrainingManager not initialized (set config.trainingModelId)', 'TRAINING_NOT_AVAILABLE');
    }
    return this.trainingManager;
  }

  /**
   * Get host's public key for end-to-end encryption.
   *
   * This method:
   * 1. Checks cache first for performance
   * 2. Tries to get public key from host metadata (preferred)
   * 3. Falls back to signature-based recovery if metadata missing
   * 4. Caches the recovered key for future use
   *
   * @param hostAddress - Host's Ethereum address
   * @param hostApiUrl - Optional host API URL (for signature recovery fallback)
   * @returns Compressed secp256k1 public key (33 bytes hex, 66 characters)
   * @throws Error if public key cannot be obtained
   *
   * @example
   * ```typescript
   * // Get public key for encryption
   * const hostPubKey = await sdk.getHostPublicKey(hostAddress);
   *
   * // With explicit API URL for fallback
   * const hostPubKey = await sdk.getHostPublicKey(hostAddress, 'http://host:8080');
   * ```
   */
  async getHostPublicKey(hostAddress: string, hostApiUrl?: string): Promise<string> {
    const hostManager = this.getHostManager();
    return hostManager.getHostPublicKey(hostAddress, hostApiUrl);
  }

  /**
   * Save a conversation to the S5 conversation log — always sealed (1.39.0; the former `encrypt`/`hostPubKey`
   * options wrote to a key the user could not decrypt and never worked, so they are gone).
   */
  async saveConversation(conversation: any): Promise<any> {
    return this.getStorageManager().saveConversation(conversation);
  }

  /**
   * Load a conversation from the S5 conversation log (sealed, or a legacy plaintext log).
   */
  async loadConversation(conversationId: string): Promise<any> {
    return this.getStorageManager().loadConversation(conversationId);
  }

  /**
   * Move everything a user stored in plaintext by earlier SDKs to sealed storage and delete the plaintext:
   * RAG databases (vectors, manifests, document bodies) and conversation logs. Idempotent and resumable —
   * run it on every vault unlock; it also cleans up after browser tabs still running an older build.
   *
   * `discardUnreadable`: per database, the exact unreadable items (a `failed` entry names them in `unreadable`)
   * the USER consented to leave out — never by default; an item not named, or readable on this run, is migrated.
   *
   * @throws SDKError MIGRATION_INCOMPLETE when either side threw: `details` carries the report that
   *   completed (`rag` / `logs`) and the error of the one that did not (`ragError` / `logsError`). Run again
   *   only when `details.retryable` is true.
   * @throws SDKError STORAGE_UNAVAILABLE (itself, not nested) when storage did not start — authenticate again.
   * @throws SDKError STORAGE_NOT_AVAILABLE (not retryable) in a configuration without storage (`hostOnly`, `skipS5`):
   *   nothing was stored, so nothing moves (§43 XX6).
   * @throws SDKError AUTH_SUPERSEDED (not retryable) when a sign-out or another sign-in forgot the identity it ran for
   *   before it ended: `details` as MIGRATION_INCOMPLETE's. Ignore it — the next sign-in's run finishes the work (§26 GG2).
   */
  async migrateToSealedStorage(opts: { onProgress?: (e: MigrationProgress) => void; discardUnreadable?: DiscardUnreadable } = {}): Promise<{ rag: RagMigrationReport; logs: LogMigrationReport }> {
    // Storage did not start: that is the answer, not a failure of each side (§21 BB5).
    if (this.storageUnavailable) throw this.storageUnavailable;
    // Bound now (§25 FF1): this identity's managers, whatever the SDK holds by the time the RAG start finishes — its
    // consent and callbacks never run on another identity's data. Disjoint roots and locks: the two run concurrently;
    // one side failing never discards the other's report (R12).
    const storage = this.getStorageManager();
    // No storage in this configuration — decided by the configuration: `skipS5` holds a stand-in store that refuses every
    // call (§44 YY1). Said first, before the RAG start is asked for, whose rejection would then go unhandled (§43 XX6).
    if (this.config.hostOnly === true || this.config.skipS5 === true) {
      throw new SDKError('This SDK is configured without storage (hostOnly / skipS5): there is nothing to migrate', 'STORAGE_NOT_AVAILABLE', { retryable: false });
    }
    const ragReady = this.getVectorRAGReady();
    const ragManager = this.getVectorRAGManager();
    // Still the signed-in identity's run (§26 GG2): a sign-out or the next sign-in forgets that identity.
    const forgotten = this.identitiesForgotten;
    const current = () => this.identitiesForgotten === forgotten;
    const { onProgress } = opts;
    // The callback's own result goes back: an async one's rejection is the guard's to catch (§27 HH6, §28 II2).
    const run = { ...opts, onProgress: onProgress && ((e: MigrationProgress) => (current() ? onProgress(e) : undefined)) };
    const [rag, logs] = await Promise.allSettled([
      ragReady.then(() => ragManager!.migrateLegacyRagStorage(run)),
      storage.migrateLegacyConversationLogs(run),
    ]);
    const reports = {
      // A RAG migration that finished before its refresh failed still reports (§16 V10).
      rag: rag.status === 'fulfilled' ? rag.value : (rag.reason as any)?.details?.report,
      logs: logs.status === 'fulfilled' ? logs.value : undefined,
      ragError: rag.status === 'rejected' ? rag.reason : undefined,
      logsError: logs.status === 'rejected' ? logs.reason : undefined,
    };
    if (!current()) {
      // Not this identity's failure: the next unlock's run finishes the work (§26 GG2).
      throw new SDKError('A sign-out or another sign-in superseded this migration — the next run finishes it', 'AUTH_SUPERSEDED', {
        retryable: false, ...reports,
      });
    }
    if (rag.status === 'fulfilled' && logs.status === 'fulfilled') return { rag: rag.value, logs: logs.value };
    const errors = [rag, logs].filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason);
    throw new SDKError('Migration to sealed storage did not complete — run it again', 'MIGRATION_INCOMPLETE', {
      retryable: errors.every(retryableOf), // running it again may help only if every failure may pass (§19 Z14)
      ...reports,
    });
  }

  /**
   * Get treasury manager
   */
  getTreasuryManager(): ITreasuryManager {
    this.ensureAuthenticated();
    return this.treasuryManager!;
  }

  /**
   * Get model manager
   */
  getModelManager(): ModelManager {
    this.ensureAuthenticated();
    if (!this.modelManager) {
      throw new SDKError('ModelManager not initialized', 'MANAGER_NOT_INITIALIZED');
    }
    return this.modelManager;
  }

  /**
   * Get client manager
   */
  getClientManager(): ClientManager {
    this.ensureAuthenticated();
    if (!this.clientManager) {
      throw new SDKError('ClientManager not initialized', 'MANAGER_NOT_INITIALIZED');
    }
    return this.clientManager;
  }

  /**
   * Get bridge client for P2P and proof operations
   */
  getBridgeClient(): UnifiedBridgeClient | undefined {
    return this.bridgeClient;
  }
  
  /**
   * Check if P2P features are available
   */
  isP2PAvailable(): boolean {
    return this.bridgeClient?.isP2PAvailable() || false;
  }
  
  /**
   * Check if proof generation is available
   */
  isProofAvailable(): boolean {
    return this.bridgeClient?.isProofAvailable() || false;
  }
  
  /**
   * Get current provider
   */
  /**
   * Build the provider that serves contract reads.
   *
   * `config.rpcUrl` is required at construction, so this always resolves to a
   * dedicated JSON-RPC provider. If that ever changes, reads degrade to the
   * wallet — which is a legitimate deployment choice but never a silent one,
   * so it warns and is reported by getReadProviderSource().
   */
  private initializeReadProvider(): void {
    if (this.config.rpcUrl) {
      this.readProvider = sharedRpcProvider(this.config.rpcUrl, this.config.chainId!);
      this.readProviderSource = 'rpcUrl';
      return;
    }

    const walletProvider = this.provider ?? (this.signer?.provider as any);
    if (!walletProvider) {
      throw new SDKError(
        'No rpcUrl configured and no wallet provider available for contract reads',
        'READ_PROVIDER_UNAVAILABLE'
      );
    }

    this.readProvider = walletProvider;
    this.readProviderSource = 'wallet';
    console.warn(
      '[SDK] No rpcUrl configured: contract reads will go through the wallet ' +
      'provider. Host and model discovery can then be rate-limited by the ' +
      'wallet, and a user-configured RPC endpoint is bypassed. Set config.rpcUrl ' +
      'to route reads off the wallet.'
    );
  }

  /**
   * The provider serving contract reads.
   */
  getReadProvider(): ethers.BrowserProvider | ethers.JsonRpcProvider | undefined {
    return this.readProvider;
  }

  /**
   * Where contract reads are going: the configured endpoint, or the wallet.
   */
  getReadProviderSource(): 'rpcUrl' | 'wallet' {
    return this.readProviderSource;
  }

  /**
   * Reads and writes now use different providers, so they can sit on different
   * chains — `rpcUrl` pins the read chain while the signer follows whatever
   * network the wallet is on. Reading one chain's state and signing on another
   * is not recoverable by preferring either side, so surface it as an error.
   *
   * This failure mode is introduced by the read/write split; it could not
   * happen when one provider served both.
   */
  private async assertReadWriteChainParity(): Promise<void> {
    if (this.readProviderSource !== 'rpcUrl') {
      return; // Reads are on the wallet: one provider, nothing to diverge.
    }
    if (!this.readProvider) {
      return;
    }
    // The read provider's network is fixed (never detected): ask the RPC which chain it serves, once (R3) — a dead or
    // wrong rpcUrl is caught here, NETWORK_UNREACHABLE within the bound or RPC_CHAIN_MISMATCH.
    await verifyRpcChain(this.readProvider as ethers.JsonRpcProvider, this.currentChainId);
    if (!this.signer?.provider) {
      return;
    }

    const [readNetwork, signerNetwork] = await withTimeout(Promise.all([
      this.readProvider.getNetwork(),
      this.signer.provider.getNetwork(),
    ]), NETWORK_TIMEOUT_MS, networkUnreachable); // ethers retries detection forever on an unreachable RPC (§24 EE4)

    const readChainId = Number(readNetwork.chainId);
    const signerChainId = Number(signerNetwork.chainId);

    if (readChainId !== signerChainId) {
      throw new SDKError(
        `Read/write chain mismatch: reads are on chain ${readChainId} (rpcUrl) ` +
        `but the signer is on chain ${signerChainId} (wallet). The app would read ` +
        `one chain's state and sign transactions on another. Switch the wallet to ` +
        `chain ${readChainId}, or point rpcUrl at chain ${signerChainId}.`,
        'READ_WRITE_CHAIN_MISMATCH'
      );
    }
  }

  /**
   * Repoint the read provider at the chain the SDK has switched to.
   *
   * Without this, switchChain() moves the signer to the new chain while reads
   * stay pinned to the original `config.rpcUrl` — reads on one chain, writes on
   * another. Falls back to the wallet provider only if the registry has no RPC
   * URL for the chain, and says so.
   */
  private async reinitializeReadProviderForChain(): Promise<void> {
    const rpcUrl = ChainRegistry.getRpcUrl(this.currentChainId);

    if (!rpcUrl) {
      const walletProvider = this.provider ?? (this.signer?.provider as any);
      if (!walletProvider) {
        throw new SDKError(
          `No RPC URL configured for chain ${this.currentChainId} and no wallet provider for reads`,
          'READ_PROVIDER_UNAVAILABLE'
        );
      }
      this.readProvider = walletProvider;
      this.readProviderSource = 'wallet';
      console.warn(
        `[SDK] No RPC URL registered for chain ${this.currentChainId}: contract ` +
        'reads will go through the wallet provider and can be rate-limited.'
      );
      return;
    }

    this.readProvider = sharedRpcProvider(rpcUrl, this.currentChainId);
    this.readProviderSource = 'rpcUrl';
    await this.assertReadWriteChainParity();
  }

  /**
   * Re-check chain parity when the wallet switches network.
   */
  private watchWalletChainChanges(): void {
    const injected = typeof window !== 'undefined' ? (window as any).ethereum : undefined;
    if (!injected?.on || this.chainParityListener) {
      return;
    }

    this.chainParityListener = () => {
      this.assertReadWriteChainParity().catch((error: any) => {
        console.error('[SDK] ' + error.message);
      });
    };
    injected.on('chainChanged', this.chainParityListener);
  }

  getProvider(): ethers.BrowserProvider | ethers.JsonRpcProvider | undefined {
    return this.provider;
  }
  
  /**
   * Get current signer
   */
  getSigner(): ethers.Signer | undefined {
    if (this.authMode === 'aa-signer') return this.eoaWallet;
    return this.signer;
  }
  
  /**
   * Get current account address
   */
  async getAddress(): Promise<string | undefined> {
    if (!this.signer) return undefined;
    return await this.signer.getAddress();
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.authenticated;
  }

  /**
   * Generate a cryptographically secure seed phrase
   */
  private async generateSecureSeed(): Promise<string> {
    // Generate 16 bytes of entropy (128 bits for 12-word mnemonic)
    const entropy = ethers.randomBytes(16);
    const mnemonic = ethers.Mnemonic.fromEntropy(entropy);
    return mnemonic.phrase;
  }

  /**
   * Validate seed phrase entropy and format
   */
  async validateSeed(): Promise<boolean> {
    if (!this.s5Seed) {
      throw new SDKError('No seed phrase set', 'SEED_MISSING');
    }

    // The known test seed, recognised by its SHA-256 — the phrase itself never ships in the SDK
    if (bytesToHex(sha256(new TextEncoder().encode(this.s5Seed))) === KNOWN_TEST_SEED_SHA256) {
      if (this.config.mode === 'production') {
        throw new SDKError(
          'Test seed phrase not allowed in production mode',
          'WEAK_SEED'
        );
      }
      // Allow test seed in development without further validation
      return true;
    }

    // Validate seed format (12 or 24 words)
    const words = this.s5Seed.split(' ');
    if (words.length !== 12 && words.length !== 24) {
      throw new SDKError(
        'Invalid seed phrase format. Must be 12 or 24 words',
        'INVALID_SEED_FORMAT'
      );
    }

    // Check for weak entropy (all same words)
    const uniqueWords = new Set(words);
    if (uniqueWords.size < words.length * 0.5) {
      throw new SDKError(
        'Weak seed phrase detected. Too many repeated words',
        'WEAK_SEED'
      );
    }

    return true;
  }

  /**
   * Initialize SDK (for testing without wallet provider)
   */
  async initializeForTesting(): Promise<void> {
    if (this.initialized) return;

    // In production, require seed validation
    if (this.config.mode === 'production') {
      if (!this.s5Seed) {
        throw new SDKError(
          'S5 seed required in production mode. Call authenticate() first to derive seed from wallet.',
          'SEED_REQUIRED'
        );
      }

      await this.validateSeed();
    }

    this.initialized = true;
  }

  /**
   * Set S5 seed phrase
   */
  setS5Seed(seed: string): void {
    this.s5Seed = seed;
  }

  /**
   * Get S5 seed (for testing only)
   */
  getS5Seed(): string | undefined {
    return this.s5Seed;
  }
  
  /**
   * Ensure SDK is authenticated
   */
  private ensureAuthenticated(): void {
    if (!this.authenticated) {
      throw new SDKError('SDK not authenticated', 'NOT_AUTHENTICATED', { retryable: false });
    }
  }
  
  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    // At once — never behind a sign-in that may not settle — and every sign-in requested before it is superseded:
    // one in flight removes what it wrote when it resumes (§24 EE4).
    this.identityEpoch++;
    await this.forgetIdentity();
  }

  /**
   * Everything bound to the signed-in identity — its managers, keys, address, seed, payer and bridge (§24 EE4/EE5,
   * §26 GG8). Resolves once the bridge it closes has closed; nothing else waits.
   */
  private forgetIdentity(): Promise<void> {
    this.identitiesForgotten++;
    // Managers the UI still holds refuse from now on (§25 FF1, §26 GG1): disposal refuses from its first line.
    void this.vectorRAGManager?.dispose().catch(() => undefined);
    this.storageManager?.dispose();
    this.sessionGroupManager?.dispose();
    this.authManager?.disconnect(); // it holds the seed and the signer (§27 HH5)
    const bridge = this.bridgeClient;
    this.bridgeClient = undefined;
    // Clear managers
    this.authManager = undefined;
    this.paymentManager = undefined;
    this.storageManager = undefined;
    this.sessionManager = undefined;
    this.hostManager = undefined;
    this.modelManager = undefined;
    this.clientManager = undefined;
    this.treasuryManager = undefined;
    this.vectorRAGManager = undefined;
    this.transcodeManager = undefined;
    this.ltxManager = undefined;
    this.trainingManager = undefined;
    this.sessionGroupManager = undefined;
    this.encryptionManager = undefined;

    // Clear auth state
    this.provider = undefined;
    this.signer = undefined;
    this.contractManager = undefined;
    this.authenticated = false;
    this.authMode = undefined;
    this.delegatePayer = undefined;
    this.eoaWallet = undefined;
    this.vectorRAGReady = undefined;
    this.storageUnavailable = undefined;
    this.userAddress = undefined;
    this.s5Seed = undefined;
    return bridge ? bridge.disconnect().catch((error) => { console.warn('[SDK] The bridge did not close:', error); }) : Promise.resolve();
  }
  
  /**
   * Get chain ID
   */
  getChainId(): number {
    return this.config.chainId || 84532;
  }

  /**
   * Initialize SDK with a wallet provider
   */
  async initialize(walletProvider: IWalletProvider): Promise<void> {
    this.walletProvider = walletProvider;

    // Connect wallet to current chain
    await walletProvider.connect(this.currentChainId);

    this.initialized = true;
  }

  /**
   * Check if SDK is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current chain ID
   */
  getCurrentChainId(): number {
    return this.currentChainId;
  }

  /**
   * Get current chain configuration
   */
  getCurrentChain(): ChainConfig {
    return ChainRegistry.getChain(this.currentChainId);
  }

  /**
   * Switch to a different chain: the wallet, then a whole rebuild of every chain-bound manager — or, if the rebuild
   * fails, a whole rollback (`CHAIN_SWITCH_FAILED`).
   *
   * On the identity queue (§43 XX5, §44 YY2): a switch waits for any sign-in already asked for — running or queued — and
   * a sign-in waits for the switch. The checks that depend on the identity run once those have settled: a switch whose
   * sign-in failed (or that came with nobody signed in) refuses `CHAIN_SWITCH_UNAUTHENTICATED`.
   *
   * @throws SDKError CHAIN_SWITCH_IN_PROGRESS (a switch is queued or running), CHAIN_SWITCH_UNAUTHENTICATED,
   *   CHAIN_SWITCH_UNSUPPORTED, AA_SWITCH_CHAIN_UNSUPPORTED — every refusal before the wallet moves
   */
  async switchChain(chainId: number): Promise<void> {
    const aaRefusal = () => new SDKError(
      "switchChain is not supported in aa-signer mode. Call disconnect() then authenticate('aa-signer', { ...newChainOptions }) instead.",
      'AA_SWITCH_CHAIN_UNSUPPORTED',
    );
    if (this.authMode === 'aa-signer') throw aaRefusal();
    // A switch in flight owns the chain id already (it is committed before the rebuild), so this check must
    // come BEFORE the "already on target chain" return — or a concurrent same-target call resolves as a no-op
    // over a half-built SDK.
    if (this.chainSwitchInFlight !== undefined) {
      throw new SDKError(
        `switchChain(${chainId}) refused: a switch to chain ${this.chainSwitchInFlight} is still in progress`,
        'CHAIN_SWITCH_IN_PROGRESS',
      );
    }
    // Don't switch if already on target chain
    if (this.currentChainId === chainId) {
      return;
    }

    // Validate chain is supported
    if (!ChainRegistry.isChainSupported(chainId)) {
      throw new UnsupportedChainError(chainId, ChainRegistry.getSupportedChains());
    }
    this.chainSwitchInFlight = chainId;
    try {
      // On the identity queue (§43 XX5): a sign-in waits for the switch, and the switch for a sign-in already asked
      // for — never interleaved, so a failed rebuild never restores one identity's managers into another's SDK. Nothing
      // a sign-in runs calls switchChain, so the queue cannot deadlock. disconnect() still supersedes at once.
      await this.oneAtATime(async () => {
        // The identity's checks, once the sign-ins asked for before have settled (§44 YY2) — and every refusal BEFORE the
        // wallet moves, so a refused switch leaves nothing half-done.
        if (this.authMode === 'aa-signer') throw aaRefusal(); // the mode of a sign-in it waited for
        if (!this.authenticated) {
          // authenticate() builds every manager from the constructor's contractAddresses/rpcUrl (the constructor's
          // chain); switching first would leave the chain id on one chain and the managers on another.
          throw new SDKError(
            `switchChain(${chainId}) needs a signed-in SDK, and none is (no sign-in, or the one it waited for failed) — sign in first, or construct the SDK with chainId ${chainId}`,
            'CHAIN_SWITCH_UNAUTHENTICATED',
          );
        }
        const target = ChainRegistry.getChain(chainId).contracts;
        if (!target.modelRegistry || !target.nodeRegistry) {
          throw new SDKError(
            `Chain ${chainId} has no model/node registry configured; the managers cannot be rebuilt consistently`,
            'CHAIN_SWITCH_UNSUPPORTED',
          );
        }
        await this.performChainSwitch(chainId);
      });
    } finally {
      this.chainSwitchInFlight = undefined;
    }
  }

  /** The switch proper: wallet, then a whole rebuild or a whole rollback. Guards live in switchChain(). */
  private async performChainSwitch(chainId: number): Promise<void> {
    // Check if wallet provider supports chain switching
    if (this.walletProvider) {
      const capabilities = this.walletProvider.getCapabilities();
      if (!capabilities.supportsChainSwitching) {
        throw new Error('Wallet provider does not support chain switching');
      }

      // Switch wallet provider chain
      await this.walletProvider.switchChain(chainId);
    }

    const oldChainId = this.currentChainId;
    const snapshot = this.snapshotChainState();
    this.currentChainId = chainId;
    this.config.chainId = chainId;

    // A WHOLE switch or none of it: a rebuild that fails part-way is rolled back to the previous chain's
    // references, so the SDK never reports the new chain over a mix of old and new managers, and a retry
    // re-runs the rebuild instead of hitting the "already on target chain" guard.
    {
      try {
        await this.reinitializeManagersForChain();
      } catch (err) {
        await this.restoreChainState(snapshot);
        let walletNote = '';
        if (this.walletProvider) {
          try { await this.walletProvider.switchChain(oldChainId); }
          catch (e) { walletNote = `; the wallet stayed on chain ${chainId} (${(e as Error)?.message ?? String(e)})`; }
        }
        throw new SDKError(
          `switchChain(${chainId}) failed while rebuilding the managers; the SDK is back on chain ${oldChainId}${walletNote}: ` +
          ((err as Error)?.message ?? String(err)),
          'CHAIN_SWITCH_FAILED',
          { from: oldChainId, to: chainId, cause: err },
        );
      }
    }

    // Emit chain changed event
    this.emit('chainChanged', {
      oldChainId,
      newChainId: chainId
    });
  }

  /**
   * Reinitialize managers for new chain
   */
  /**
   * The sidecar managers (LTX, Training) each hold a JobMarketplace wrapper pinned to a chain and
   * the chain id itself, so they are REBUILT on switchChain() — the ContractManager rebuild alone
   * left them verifying against the old chain, which on the card-paid training path is a terminal
   * refusal on a session already paid for. The wrappers get the dedicated read provider so the A.3
   * pre-flight rides rpcUrl, not the injected wallet. Training's model id is its opt-in; LTX needs none (1.39.3).
   */
  private async buildSidecarManagers(
    hostOnly: boolean = this.config.hostOnly === true,
    skipS5: boolean = this.config.skipS5 === true,
  ): Promise<void> {
    if (hostOnly || skipS5 || !this.sessionManager || !this.storageManager || !this.contractManager) return;
    const usdcAddress = await this.contractManager.getContractAddress('usdcToken');
    const jobMarketplace = () => new JobMarketplaceWrapper(this.currentChainId, this.signer!, this.readProvider);
    // LTX needs no opt-in since 1.39.3: each job runs on its template's model (config.ltxModelId is ignored).
    // jobMarketplace activates the on-chain integrity poll in verifyAttestation (M1 economics —
    // live once the node submits proofs; skips cleanly while none exist).
    this.ltxManager = new LtxManager({
      sessionManager: this.sessionManager,
      storageManager: this.storageManager,
      paymentManager: this.paymentManager,
      jobMarketplace: jobMarketplace(),
      hostManager: this.hostManager,
      usdcAddress,
      chainId: this.currentChainId,
    });
    if (this.config.trainingModelId) {
      this.trainingManager = new TrainingManager({
        sessionManager: this.sessionManager,
        storageManager: this.storageManager,
        paymentManager: this.paymentManager,
        jobMarketplace: jobMarketplace(),
        hostManager: this.hostManager,
        trainingModelId: this.config.trainingModelId,
        usdcAddress,
        chainId: this.currentChainId,
        trainJobTimeoutSecs: this.config.trainingJobTimeoutSecs,
      });
    }
  }

  /**
   * The chain-bound pair: ModelManager (model registry, read provider) and HostManager (node registry,
   * read provider, model manager). ONE constructor for the initial build and the switchChain rebuild,
   * so the two cannot drift apart.
   */
  private async constructModelAndHostManagers(addresses: {
    modelRegistry: string; nodeRegistry: string; fabToken?: string; hostEarnings?: string;
  }): Promise<void> {
    const modelManager = new ModelManager(this.readProvider!, addresses.modelRegistry);
    this.modelManager = modelManager;
    this.hostManager = new HostManager(
      this.signer!,
      addresses.nodeRegistry,
      modelManager,
      addresses.fabToken,
      addresses.hostEarnings,
      this.contractManager,
      this.readProvider
    );
    await (this.hostManager as any).initialize();
  }

  /** Every reference switchChain() replaces, captured so a failed rebuild can put them all back. */
  private snapshotChainState() {
    return {
      currentChainId: this.currentChainId, configChainId: this.config.chainId,
      readProvider: this.readProvider, readProviderSource: this.readProviderSource,
      contractManager: this.contractManager, modelManager: this.modelManager, hostManager: this.hostManager,
      clientManager: this.clientManager, transcodeManager: this.transcodeManager,
      ltxManager: this.ltxManager, trainingManager: this.trainingManager,
      treasuryManager: this.treasuryManager,
      paymentChainId: this.paymentManager ? (this.paymentManager as unknown as ChainSwitchable).getCurrentChainId() : undefined,
      sessionHostSelection: (this.sessionManager as any)?.hostSelectionService,
    };
  }

  private async restoreChainState(s: ReturnType<FabstirSDKCore['snapshotChainState']>): Promise<void> {
    this.currentChainId = s.currentChainId; this.config.chainId = s.configChainId;
    this.readProvider = s.readProvider; this.readProviderSource = s.readProviderSource;
    this.contractManager = s.contractManager; this.modelManager = s.modelManager; this.hostManager = s.hostManager;
    this.clientManager = s.clientManager; this.transcodeManager = s.transcodeManager;
    this.ltxManager = s.ltxManager; this.trainingManager = s.trainingManager;
    this.treasuryManager = s.treasuryManager;
    if (this.sessionManager) {
      if (s.hostManager) (this.sessionManager as any).setHostManager(s.hostManager);
      if (s.sessionHostSelection) (this.sessionManager as any).setHostSelectionService(s.sessionHostSelection);
    }
    // Last, because it is the only await in the restore: every synchronous reference is already back.
    if (this.paymentManager && s.paymentChainId !== undefined) {
      await (this.paymentManager as unknown as ChainSwitchable).switchChain(s.paymentChainId);
    }
  }

  private async reinitializeManagersForChain(): Promise<void> {
    // Get new contract addresses for the chain
    const chainConfig = ChainRegistry.getChain(this.currentChainId);

    // Reads must follow the chain switch too, or they stay on the old chain.
    await this.reinitializeReadProviderForChain();

    // Update contract manager with new addresses
    if (this.contractManager && this.signer) {
      this.contractManager = new ContractManager(this.signer, {
        jobMarketplace: chainConfig.contracts.jobMarketplace,
        nodeRegistry: chainConfig.contracts.nodeRegistry,
        proofSystem: chainConfig.contracts.proofSystem,
        hostEarnings: chainConfig.contracts.hostEarnings,
        usdcToken: chainConfig.contracts.usdcToken,
        fabToken: chainConfig.contracts.fabToken
      });
    }

    // The payment manager's DEFAULT chain (every call without an explicit chainId) and the treasury
    // manager's ContractManager are chain-bound too; both used to stay on the old chain after a switch.
    if (this.paymentManager) {
      await (this.paymentManager as unknown as ChainSwitchable).switchChain(this.currentChainId);
    }
    if (this.treasuryManager && this.contractManager) {
      this.treasuryManager = new TreasuryManager(this.contractManager);
      await (this.treasuryManager as TreasuryManager).initialize(this.signer!);
    }

    // A WHOLE rebuild of everything chain-bound, or none of it: rebuilding only some managers leaves the
    // adopted training path reading the session on one chain and the host's price on another — a
    // spurious refusal and a second card session for a session that was fine. (The registry-address
    // check that guards this lives in switchChain(), BEFORE the wallet moves.)
    const contracts = chainConfig.contracts;
    await this.constructModelAndHostManagers({
      modelRegistry: contracts.modelRegistry, nodeRegistry: contracts.nodeRegistry,
      fabToken: contracts.fabToken, hostEarnings: contracts.hostEarnings,
    });
    if (this.sessionManager) {
      (this.sessionManager as any).setHostManager(this.hostManager);
      (this.sessionManager as any).setHostSelectionService(new HostSelectionService(this.hostManager as HostManager));
    }
    if (this.clientManager && this.contractManager) {
      // both constructed by constructModelAndHostManagers() just above
      this.clientManager = new ClientManager(this.modelManager!, this.hostManager as HostManager, this.contractManager);
      await this.clientManager.initialize(this.signer);
    }
    if (this.transcodeManager && this.sessionManager && this.storageManager && this.contractManager && this.encryptionManager) {
      this.transcodeManager = new TranscodeManager(
        this.sessionManager, this.storageManager, this.contractManager,
        this.encryptionManager, this.signer!, this.currentChainId,
      );
      this.transcodeManager.setHostSelectionService(new HostSelectionService(this.hostManager as HostManager));
    }
    // The sidecar managers hold chain-pinned wrappers and chain ids of their own. A caller-installed
    // host-selection service on the training manager survives the rebuild.
    const trainingHostSelection = (this.trainingManager as any)?.hostSelectionService;
    await this.buildSidecarManagers();
    if (trainingHostSelection && this.trainingManager) {
      (this.trainingManager as any).setHostSelectionService(trainingHostSelection);
    }
  }

  /**
   * Check if chain is supported
   */
  isChainSupported(chainId: number): boolean {
    return ChainRegistry.isChainSupported(chainId);
  }

  /**
   * Get list of supported chains
   */
  getSupportedChains(): number[] {
    return ChainRegistry.getSupportedChains();
  }

  /**
   * Get contract addresses for current chain
   */
  getContractAddresses(): any {
    const chainConfig = this.getCurrentChain();
    return chainConfig.contracts;
  }

  /**
   * Get SDK version
   */
  getVersion(): string {
    return '1.20.0-browser';
  }

  /**
   * Get SDK environment
   */
  getEnvironment(): 'browser' | 'node' {
    return 'browser';
  }
}