// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * @fabstir/sdk-core - Browser-compatible SDK for Fabstir P2P LLM marketplace
 * 
 * This package provides browser-safe components for interacting with the
 * Fabstir marketplace, including contract interactions, wallet management,
 * and storage capabilities.
 */

// Main SDK class
export { FabstirSDKCore } from './FabstirSDKCore';
export type { FabstirSDKCoreConfig } from './FabstirSDKCore';

// Factory pattern - commented out to avoid sdk-node imports in browser
// export { 
//   FabstirSDKFactory,
//   createFabstirSDK,
//   createAutoSDK
// } from './factory/FabstirSDKFactory';
// export type { SDKFactoryConfig, SDKEnvironment } from './factory/FabstirSDKFactory';

// Compatibility layer - commented out temporarily
// export { FabstirSDK } from './compat/FabstirSDKCompat';

// Export browser-compatible managers
export { AuthManager } from './managers/AuthManager';
export { PaymentManager } from './managers/PaymentManager';
export { PaymentManager as PaymentManagerMultiChain } from './managers/PaymentManagerMultiChain';
export { StorageManager } from './managers/StorageManager';
export type { S5ConnectionStatus, SyncStatus } from './managers/StorageManager';
export { SessionManager } from './managers/SessionManager';
export {
  HostManager,
  // PRICE_PRECISION constant (1000x multiplier for sub-$1/million pricing)
  PRICE_PRECISION,
  // Native token pricing (ETH/BNB)
  MIN_PRICE_NATIVE,
  MAX_PRICE_NATIVE,
  DEFAULT_PRICE_NATIVE,
  // Stablecoin pricing (USDC)
  MIN_PRICE_STABLE,
  MAX_PRICE_STABLE,
  DEFAULT_PRICE_STABLE,
  // Legacy constants (backward compatibility)
  MIN_PRICE_PER_TOKEN,
  MAX_PRICE_PER_TOKEN,
  DEFAULT_PRICE_PER_TOKEN,
  DEFAULT_PRICE_PER_TOKEN_NUMBER
} from './managers/HostManager';
export { TreasuryManager } from './managers/TreasuryManager';

// Model governance managers
export { ModelManager } from './managers/ModelManager';
export { ClientManager } from './managers/ClientManager';

// Permission and collaboration managers
export { PermissionManager } from './managers/PermissionManager';
export { PermissionStorage } from './storage/PermissionStorage';

// RAG and Vector Database managers (host-side via WebSocket)
export { VectorRAGManager } from './managers/VectorRAGManager';
export { DocumentManager } from './managers/DocumentManager';
export { HostAdapter } from './embeddings/adapters/HostAdapter';
export type { IVectorRAGManager } from './managers/interfaces/IVectorRAGManager';
export type { IDocumentManager } from './documents/interfaces/IDocumentManager';
export type { IEmbeddingService } from './embeddings/interfaces/IEmbeddingService';

// Services
export { UnifiedBridgeClient } from './services/UnifiedBridgeClient';
export { P2PBridgeClient } from './services/P2PBridgeClient';
export { ProofBridgeClient } from './services/ProofBridgeClient';
export { ProofVerifier } from './services/ProofVerifier';

// Export contract interfaces and helpers
export * from './contracts';
export { TransactionHelper } from './contracts/TransactionHelper';
export { ContractManager } from './contracts/ContractManager';
export { JobMarketplaceWrapper } from './contracts/JobMarketplace';
export type { SessionCreationParams, DirectSessionParams, SessionJob, DelegatedSessionParams } from './contracts/JobMarketplace';
export type { SessionJobParams, DepositBalances } from './managers/PaymentManagerMultiChain';

// Export types
export * from './types';
export * from './types/models';
export * from './types/chain.types';
export * from './types/session-groups.types';

// Export chain configuration
export { ChainRegistry } from './config/ChainRegistry';
export { ChainId, type ChainConfig, type ChainContracts, type NativeToken } from './types/chain.types';

// Export interfaces
export * from './interfaces';
export {
  type IWalletProvider,
  type WalletCapabilities,
  type TransactionRequest,
  type TransactionResponse
} from './interfaces/IWalletProvider';

// Export model constants
export * from './constants/models';

// Export chain-aware errors
export {
  UnsupportedChainError,
  ChainMismatchError,
  InsufficientDepositError,
  NodeChainMismatchError,
  DepositAccountNotAvailableError
} from './errors/ChainErrors';

// Export S5 seed derivation utilities
export {
  deriveEntropyFromSignature,
  deriveEntropyFromPrivateKey,
  deriveEntropyFromAddress,
  entropyToS5Phrase,
  getCachedSeed,
  cacheSeed,
  clearCachedSeed,
  verifyCachedSeed,
  getOrGenerateS5Seed,
  generateS5SeedWithoutCache,
  generateS5SeedFromPrivateKey,
  generateS5SeedFromAddress,
  hasCachedSeed,
  exportAllCachedSeeds,
  SEED_DOMAIN_SEPARATOR
} from './utils/s5-seed-derivation';

// Export web search errors
export { WebSearchError } from './errors/web-search-errors';

// Export context limit errors
export { ContextLimitError } from './errors/context-errors';

// Export image generation errors
export { ImageGenerationError } from './errors/image-generation-errors';
export { analyzePromptForImageIntent, type ImageIntentResult } from './utils/image-intent-analyzer';

// Export wallet providers
export { EOAProvider } from './providers/EOAProvider';
export { SmartAccountProvider } from './providers/SmartAccountProvider';
export * from './providers';

// Export utilities
export * from './utils';
export { EnvironmentDetector } from './utils/EnvironmentDetector';
export type { EnvironmentCapabilities } from './utils/EnvironmentDetector';

// Export wallet utilities for Base Account Kit integration
export {
  ensureSubAccount,
  getExistingSubAccount,
  createSubAccountSigner,
  type SubAccountOptions,
  type SubAccountResult,
  type SubAccountSignerOptions,
} from './wallet';

// Export WebSocket client
export { WebSocketClient } from './websocket/WebSocketClient';

// Version
export const VERSION = '1.0.0';
export const SDK_TYPE = 'browser';