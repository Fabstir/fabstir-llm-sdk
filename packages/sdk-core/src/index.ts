/**
 * @fabstir/sdk-core - Browser-compatible SDK for Fabstir P2P LLM marketplace
 * 
 * This package provides browser-safe components for interacting with the
 * Fabstir marketplace, including contract interactions, wallet management,
 * and storage capabilities.
 */

// Export main SDK class
export { FabstirSDKCore } from './FabstirSDKCore';

// Export browser-compatible managers
export { AuthManager } from './managers/AuthManager';
export { PaymentManager } from './managers/PaymentManager';
export { StorageManager } from './managers/StorageManager';
export { SessionManager } from './managers/SessionManager';
export { HostManager } from './managers/HostManager';
export { SmartWalletManager } from './managers/SmartWalletManager';
export { TreasuryManager } from './managers/TreasuryManager';

// Export contract interfaces
export * from './contracts';

// Export types
export * from './types';

// Export utilities
export * from './utils';

// Version
export const VERSION = '1.0.0';