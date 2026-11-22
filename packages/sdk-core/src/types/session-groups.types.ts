// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Session Groups Types
 *
 * Types for session group management (Claude Projects-style organization)
 */

/**
 * Chat Message
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sources?: Array<{
    fileName: string;
    score: number;
    content: string;
  }>;
}

/**
 * Chat Session
 *
 * Represents a single chat conversation within a session group
 */
export interface ChatSession {
  sessionId: string;
  groupId: string;
  title: string;
  messages: ChatMessage[];
  metadata: {
    model?: string;
    hostUrl?: string;
    databasesUsed?: string[];
    [key: string]: any;
  };
  created: number;
  /** Last activity (epoch ms). Yours to set; `addMessage` moves it. Order your chat list by it. */
  updated: number;
  /**
   * Set by SessionGroupManager on every change it makes to the chat (1.39.26, epoch ms) — do not set it. It decides
   * which copy of a chat is later when another tab's copy of the group is adopted; copy it with the chat (`{ ...chat }`).
   */
  revision?: number;
}

/**
 * Group Document Metadata
 *
 * Metadata for documents uploaded to a session group
 */
export interface GroupDocumentMetadata {
  id: string;
  name: string;
  size: number;
  uploaded: number;
  contentType?: string;
}

/**
 * Session Group
 *
 * Organizes related chat sessions and vector databases (Claude Projects-style)
 */
export interface SessionGroup {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  owner: string;
  linkedDatabases: string[]; // Database IDs
  chatSessions: string[]; // Session IDs
  chatSessionsData?: Record<string, ChatSession>; // Full session objects (for persistence)
  documents?: GroupDocumentMetadata[]; // Group documents
  metadata: Record<string, any>;
  deleted: boolean;
}

/**
 * Create Session Group Input
 */
export interface CreateSessionGroupInput {
  name: string;
  description?: string;
  owner: string;
  metadata?: Record<string, any>;
}

/**
 * Update Session Group Input
 */
export interface UpdateSessionGroupInput {
  name?: string;
  description?: string;
  metadata?: Record<string, any>;
  chatSessionsData?: Record<string, ChatSession>;
}

/**
 * Vector Database Metadata (for linking to groups)
 */
export interface VectorDatabaseMetadata {
  id: string;
  name: string;
  dimensions?: number;
  vectorCount: number;
  storageSizeBytes?: number;
  owner: string;
  created: number;
  lastAccessed: number;
  description?: string;
  folderStructure?: boolean;
}
