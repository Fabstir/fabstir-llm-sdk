/**
 * Type definitions for Mock SDK
 * Re-exports types from @fabstir/sdk-core where available,
 * and defines Phase 11 types locally for UI development
 */

// ===== Types that exist in real SDK =====
export type {
  // Session types
  SessionConfig,

  // Vector types (from rag-websocket.ts)
  Vector,

  // Host types
  HostInfo,
  HostMetadata,
  ModelSpec,

  // Manager interfaces that exist
  ISessionManager,
  IVectorRAGManager,
  IHostManager,
  IPaymentManager,

  // Common types
  SDKError
} from '@fabstir/sdk-core';

// Define SearchResult locally (compatible with real SDK's SearchResult from rag-websocket.ts)
export interface SearchResult {
  id: string;
  vector: number[];
  metadata: Record<string, any>;
  score: number;
}

// ===== Phase 11 Types (UI Development - not in real SDK yet) =====

/**
 * Group Document
 * Files uploaded to the session group (available in all chat sessions)
 * @deprecated - Use DocumentManager in real SDK (kept for UI4 compatibility)
 */
export interface GroupDocument {
  id: string;
  name: string;
  size: number;
  uploaded: number; // Timestamp
  contentType?: string;
}

/**
 * Group Permissions
 * Access control for session groups
 * @deprecated - Use PermissionManager in real SDK (kept for UI4 compatibility)
 */
export interface GroupPermissions {
  readers: string[];  // User addresses with read access
  writers: string[];  // User addresses with write access
}

/**
 * Session Group (Project)
 * Organizes chat sessions and linked vector databases
 *
 * UPDATED: Aligned with real SDK (@fabstir/sdk-core)
 */
export interface SessionGroup {
  id: string;
  name: string;
  description: string;                    // REQUIRED (not optional!)
  createdAt: Date;                        // Date object (not number timestamp)
  updatedAt: Date;                        // Date object (not number timestamp)
  owner: string;                          // User address
  linkedDatabases: string[];              // Renamed from 'databases'
  defaultDatabase?: string;               // OPTIONAL - Renamed from 'defaultDatabaseId'
  chatSessions: string[];                 // Just IDs (not ChatSessionSummary[])
  metadata: Record<string, any>;          // Custom metadata fields
  deleted: boolean;                       // Soft-delete flag
  groupDocuments?: GroupDocument[];       // Documents uploaded to the group
  permissions?: GroupPermissions;         // Access control
}

/**
 * Chat Session Summary (for list views)
 * @deprecated - Real SDK uses string[] for chatSessions (kept for UI4 compatibility)
 */
export interface ChatSessionSummary {
  sessionId: string;
  title: string; // Auto-generated from first message
  timestamp: number;
  messageCount: number;
  active: boolean;
  lastMessage?: string;
}

/**
 * Input type for creating session groups
 * ADDED: Required by real SDK
 */
export interface CreateSessionGroupInput {
  name: string;
  description: string;        // REQUIRED!
  owner: string;
  metadata?: Record<string, any>;
}

/**
 * Input type for updating session groups
 * ADDED: Required by real SDK (only allows updating name, description, metadata)
 */
export interface UpdateSessionGroupInput {
  name?: string;
  description?: string;
  metadata?: Record<string, any>;
  // Note: Cannot update owner, linkedDatabases, defaultDatabase, chatSessions
}

/**
 * Full Chat Session (with messages)
 */
export interface ChatSession {
  sessionId: string;
  groupId: string;
  title: string;
  messages: ChatMessage[];
  metadata?: ChatSessionMetadata;
  created: number;
  updated: number;
}

/**
 * Chat Message
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sources?: SearchResult[]; // RAG sources used for this message
}

/**
 * Chat Session Metadata
 */
export interface ChatSessionMetadata {
  model?: string;
  hostUrl?: string;
  totalTokens?: number;
  databasesUsed?: string[]; // Which vector databases were queried
}

/**
 * Session Group Manager Interface
 * UPDATED: Aligned with real SDK (@fabstir/sdk-core)
 */
export interface ISessionGroupManager {
  // Core session group methods
  createSessionGroup(input: CreateSessionGroupInput): Promise<SessionGroup>;
  listSessionGroups(owner: string): Promise<SessionGroup[]>;
  getSessionGroup(groupId: string, requestor: string): Promise<SessionGroup>;
  updateSessionGroup(groupId: string, requestor: string, updates: UpdateSessionGroupInput): Promise<SessionGroup>;
  deleteSessionGroup(groupId: string, requestor: string): Promise<void>;

  // Vector database linking methods
  linkVectorDatabase(groupId: string, requestor: string, databaseId: string): Promise<SessionGroup>;
  unlinkVectorDatabase(groupId: string, requestor: string, databaseId: string): Promise<SessionGroup>;
  setDefaultDatabase(groupId: string, requestor: string, databaseId?: string): Promise<SessionGroup>;
  listLinkedDatabases(groupId: string, requestor: string): Promise<VectorDatabaseMetadata[]>;
  handleDatabaseDeletion(databaseId: string): Promise<void>;

  // Chat session management (KEPT - these exist in real SDK!)
  addChatSession(groupId: string, requestor: string, sessionId: string): Promise<SessionGroup>;
  listChatSessions(groupId: string, requestor: string): Promise<string[]>;

  // Removed methods (no longer in real SDK):
  // - startChatSession, getChatSession, addMessage, deleteChatSession, etc. (use SessionManager)
  // - addGroupDocument, removeGroupDocument, listGroupDocuments (use DocumentManager)
  // - shareGroup, unshareGroup, listSharedGroups (use PermissionManager)
}

/**
 * Vector Database Metadata (for vector DB management)
 * UPDATED: Renamed from DatabaseMetadata to match real SDK
 */
export interface VectorDatabaseMetadata {
  id: string;                  // ADDED: Database ID
  name: string;
  dimensions: number;
  vectorCount: number;
  storageSizeBytes: number;
  owner: string;
  created: number;
  lastAccessed: number;
  description?: string;
  folderStructure?: boolean;
}

/**
 * @deprecated Use VectorDatabaseMetadata instead
 */
export type DatabaseMetadata = VectorDatabaseMetadata;

/**
 * Folder Statistics (for folder management)
 */
export interface FolderStats {
  path: string;
  vectorCount: number;
  sizeBytes: number;
  lastModified: number;
}

/**
 * Session Info (for session tracking)
 */
export interface SessionInfo {
  sessionId: string | bigint;
  hostUrl: string;
  jobId: bigint;
  modelName: string;
  chainId: number;
  status: 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'ended';
  createdAt: number;
  groupId?: string; // Link to session group
}

/**
 * Extended Session Config for Mock SDK
 * (Real SDK uses different SessionConfig - this is mock-specific)
 */
export interface MockSessionConfig {
  hostUrl: string;
  jobId: bigint;
  modelName: string;
  chainId: number;
  groupId?: string;
  depositAmount?: string;
  pricePerToken?: number;
  proofInterval?: number;
  duration?: number;
}
