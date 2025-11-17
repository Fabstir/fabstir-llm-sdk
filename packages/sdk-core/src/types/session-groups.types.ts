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
  updated: number;
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
