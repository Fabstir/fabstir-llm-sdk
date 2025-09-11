/**
 * @fabstir/sdk-node - Server-side extensions for Fabstir SDK
 * 
 * This package provides Node.js-specific functionality including:
 * - P2P networking via libp2p
 * - EZKL proof generation
 * - Heavy cryptographic operations
 * - WebSocket server capabilities
 */

// Re-export everything from sdk-core for convenience
export * from '@fabstir/sdk-core';

// Export the extended SDK class
export { FabstirSDKNode } from './FabstirSDKNode';
export type { FabstirSDKNodeConfig } from './FabstirSDKNode';

// Export P2P components
export { P2PBridgeServer } from './p2p/P2PBridgeServer';
export * from './p2p/types';

// Export proof components
export { EZKLProofGenerator } from './proof/EZKLProofGenerator';
export { ProofBridgeServer } from './proof/ProofBridgeServer';
export * from './proof/types';

// Export bridge components
export { UnifiedBridgeServer } from './bridge/UnifiedBridgeServer';
export type { BridgeConfig } from './bridge/UnifiedBridgeServer';

// Export Node.js specific managers
export { InferenceManagerNode } from './managers/InferenceManagerNode';

// Export WebSocket server
export { WebSocketServer } from './p2p/WebSocketServer';

// Export utilities
export * from './utils';

// Version
export const VERSION = '1.0.0';