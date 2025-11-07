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
  SearchResult,

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

// ===== Phase 11 Types (UI Development - not in real SDK yet) =====

/**
 * Session Group (Project)
 * Organizes chat sessions and linked vector databases
 */
export interface SessionGroup {
  id: string;
  name: string;
  description?: string;
  databases: string[]; // Vector database names linked to this group
  defaultDatabaseId: string; // Auto-created default database
  chatSessions: ChatSessionSummary[];
  owner: string; // User address
  created: number; // Timestamp
  updated: number; // Timestamp
  permissions?: {
    readers?: string[]; // Addresses with read access
    writers?: string[]; // Addresses with write access
  };
}

/**
 * Chat Session Summary (for list views)
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
 */
export interface ISessionGroupManager {
  createSessionGroup(name: string, options?: {
    description?: string;
    databases?: string[];
  }): Promise<SessionGroup>;

  listSessionGroups(): Promise<SessionGroup[]>;
  getSessionGroup(groupId: string): Promise<SessionGroup>;
  deleteSessionGroup(groupId: string): Promise<void>;
  updateSessionGroup(groupId: string, updates: Partial<SessionGroup>): Promise<SessionGroup>;

  linkDatabase(groupId: string, databaseName: string): Promise<void>;
  unlinkDatabase(groupId: string, databaseName: string): Promise<void>;

  startChatSession(groupId: string, initialMessage?: string): Promise<ChatSession>;
  getChatSession(groupId: string, sessionId: string): Promise<ChatSession>;
  listChatSessions(groupId: string, options?: {
    limit?: number;
    activeOnly?: boolean;
  }): Promise<ChatSession[]>;

  addMessage(groupId: string, sessionId: string, message: ChatMessage): Promise<void>;
  deleteChatSession(groupId: string, sessionId: string): Promise<void>;

  shareGroup(groupId: string, userAddress: string, role: 'reader' | 'writer'): Promise<void>;
  unshareGroup(groupId: string, userAddress: string): Promise<void>;
  listSharedGroups(): Promise<SessionGroup[]>;
}

/**
 * Database Metadata (for vector DB management)
 */
export interface DatabaseMetadata {
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
