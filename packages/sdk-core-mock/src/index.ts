/**
 * @fabstir/sdk-core-mock
 *
 * Mock implementation of Fabstir SDK Core for UI development
 *
 * This package provides a drop-in replacement for @fabstir/sdk-core that:
 * - Uses localStorage instead of blockchain/S5 storage
 * - Includes realistic fixtures for immediate development
 * - Simulates network delays for realistic UX testing
 * - Requires zero configuration or external services
 *
 * Usage:
 * ```typescript
 * // Instead of:
 * // import { FabstirSDKCore } from '@fabstir/sdk-core';
 *
 * // Use:
 * import { FabstirSDKCoreMock as FabstirSDKCore } from '@fabstir/sdk-core-mock';
 *
 * const sdk = new FabstirSDKCore({
 *   userAddress: '0x1234...'
 * });
 *
 * await sdk.authenticate('password');
 *
 * // All managers work the same way
 * const sessionGroupManager = sdk.getSessionGroupManager();
 * const groups = await sessionGroupManager.listSessionGroups();
 * ```
 *
 * When ready to integrate with real SDK, just swap the import:
 * ```typescript
 * import { FabstirSDKCore } from '@fabstir/sdk-core'; // ✅ One line change!
 * ```
 */

// Main SDK class
export { FabstirSDKCoreMock, FabstirSDKCoreMock as default } from './FabstirSDKCore.mock';
export type { FabstirSDKCoreMockConfig } from './FabstirSDKCore.mock';

// Manager exports
export { SessionGroupManagerMock } from './managers/SessionGroupManager.mock';
export { SessionManagerMock } from './managers/SessionManager.mock';
export { VectorRAGManagerMock } from './managers/VectorRAGManager.mock';
export { HostManagerMock } from './managers/HostManager.mock';
export { PaymentManagerMock } from './managers/PaymentManager.mock';

// Utilities
export { MockStorage } from './storage/MockStorage';

// Fixtures
export {
  generateMockSessionGroups,
  generateMockVectorDatabases,
  generateMockChatMessages
} from './fixtures/mockData';

// Re-export all types from production SDK
export type {
  // Session Group types
  SessionGroup,
  ChatSession,
  ChatMessage,

  // Vector RAG types
  DatabaseMetadata,
  Vector,
  SearchResult,
  FolderStats,

  // Session types
  SessionConfig,
  SessionInfo,

  // Host types
  HostInfo,
  HostMetadata,
  ModelSpec,

  // Manager interfaces
  ISessionGroupManager,
  ISessionManager,
  IVectorRAGManager,
  IHostManager,
  IPaymentManager
} from './types';
