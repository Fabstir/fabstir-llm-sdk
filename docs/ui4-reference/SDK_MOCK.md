# Mock SDK Reference

This document provides complete specifications for implementing `@fabstir/sdk-core-mock` - a mock version of the Fabstir LLM SDK that enables rapid UI development without blockchain, WebSocket, or S5 storage dependencies.

---

## Overview

**Purpose**: Enable UI development with instant responses and localStorage persistence, using the exact same interfaces as the production SDK.

**Key Principle**: The mock SDK should be a **drop-in replacement** for the real SDK. When the UI is complete, swapping from mock to real should only require changing one import statement.

---

## Architecture

```
@fabstir/sdk-core-mock/
├── src/
│   ├── FabstirSDKCoreMock.ts          # Main SDK class
│   ├── managers/
│   │   ├── SessionGroupManager.mock.ts
│   │   ├── SessionManager.mock.ts
│   │   ├── VectorRAGManager.mock.ts
│   │   ├── DocumentManager.mock.ts
│   │   ├── HostManager.mock.ts
│   │   └── PaymentManagerMultiChain.mock.ts
│   ├── storage/
│   │   └── MockStorage.ts              # localStorage wrapper with encryption simulation
│   ├── fixtures/
│   │   └── mockData.ts                 # Predefined fake data
│   └── types/
│       └── index.ts                    # Re-export production types
├── package.json
└── tsconfig.json
```

---

## Installation & Setup

### Package Structure

```json
{
  "name": "@fabstir/sdk-core-mock",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@fabstir/sdk-core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}
```

### UI Project Integration

```typescript
// In your UI project (e.g., apps/fabstir-ui/lib/sdk.ts)

// Phase 1: Use Mock SDK
import { FabstirSDKCoreMock as FabstirSDKCore } from '@fabstir/sdk-core-mock';

// Phase 2: Swap to Real SDK (just change this one line!)
// import { FabstirSDKCore } from '@fabstir/sdk-core';

export const sdk = new FabstirSDKCore({
  mode: 'production' as const,
  chainId: 84532, // Base Sepolia
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
  contractAddresses: {
    // These are ignored by mock, but keep for future swap
    jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE!,
    nodeRegistry: process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY!,
    // ... other addresses
  }
});

// Initialize on app start
export async function initializeSDK() {
  await sdk.authenticate('mock', {
    privateKey: '0xMOCK_PRIVATE_KEY' // Mock accepts any value
  });
}
```

---

## Core Interfaces

### Main SDK Class

```typescript
// @fabstir/sdk-core-mock/src/FabstirSDKCoreMock.ts

import type {
  IFabstirSDKCore,
  ISessionGroupManager,
  ISessionManager,
  IVectorRAGManager,
  IDocumentManager,
  IHostManager,
  IPaymentManager
} from '@fabstir/sdk-core';

export class FabstirSDKCoreMock implements IFabstirSDKCore {
  private authenticated: boolean = false;
  private userAddress: string = '';

  constructor(options: any) {
    // Mock ignores most options, but stores for compatibility
    console.log('[Mock SDK] Initialized with options:', options);
  }

  async authenticate(method: string, credentials: any): Promise<void> {
    // Simulate authentication delay
    await this.delay(300);

    this.authenticated = true;
    this.userAddress = '0x1234567890ABCDEF1234567890ABCDEF12345678';

    console.log('[Mock SDK] Authenticated as:', this.userAddress);
  }

  async getSessionGroupManager(): Promise<ISessionGroupManager> {
    this.ensureAuthenticated();
    return new SessionGroupManagerMock(this.userAddress);
  }

  async getSessionManager(): Promise<ISessionManager> {
    this.ensureAuthenticated();
    return new SessionManagerMock(this.userAddress);
  }

  async getVectorRAGManager(): Promise<IVectorRAGManager> {
    this.ensureAuthenticated();
    return new VectorRAGManagerMock(this.userAddress);
  }

  async getDocumentManager(): Promise<IDocumentManager> {
    this.ensureAuthenticated();
    return new DocumentManagerMock();
  }

  async getHostManager(): Promise<IHostManager> {
    this.ensureAuthenticated();
    return new HostManagerMock();
  }

  getPaymentManager(): IPaymentManager {
    this.ensureAuthenticated();
    return new PaymentManagerMultiChainMock();
  }

  private ensureAuthenticated() {
    if (!this.authenticated) {
      throw new Error('[Mock SDK] Must authenticate before accessing managers');
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## Manager Implementations

### 1. SessionGroupManager Mock

**Purpose**: Manage session groups (projects) with chat history.

```typescript
// @fabstir/sdk-core-mock/src/managers/SessionGroupManager.mock.ts

import type {
  ISessionGroupManager,
  SessionGroup,
  ChatSession,
  ChatMessage
} from '@fabstir/sdk-core';
import { MockStorage } from '../storage/MockStorage';
import { generateMockSessionGroups } from '../fixtures/mockData';

export class SessionGroupManagerMock implements ISessionGroupManager {
  private storage: MockStorage;
  private userAddress: string;

  constructor(userAddress: string) {
    this.userAddress = userAddress;
    this.storage = new MockStorage(`session-groups-${userAddress}`);

    // Initialize with mock data if empty
    if (this.storage.getAll().length === 0) {
      generateMockSessionGroups().forEach(group => {
        this.storage.set(group.id, group);
      });
    }
  }

  async createSessionGroup(
    name: string,
    options?: { description?: string; databases?: string[] }
  ): Promise<SessionGroup> {
    await this.delay(500); // Simulate network delay

    const group: SessionGroup = {
      id: this.generateId('group'),
      name,
      description: options?.description,
      databases: options?.databases || [],
      defaultDatabaseId: this.generateId('default-db'),
      chatSessions: [],
      owner: this.userAddress,
      created: Date.now(),
      updated: Date.now(),
      permissions: {
        readers: [],
        writers: []
      }
    };

    this.storage.set(group.id, group);
    console.log('[Mock] Created session group:', name);

    return group;
  }

  async listSessionGroups(): Promise<SessionGroup[]> {
    await this.delay(200);

    const groups = this.storage.getAll() as SessionGroup[];

    // Sort by updated (newest first)
    return groups.sort((a, b) => b.updated - a.updated);
  }

  async getSessionGroup(groupId: string): Promise<SessionGroup> {
    await this.delay(150);

    const group = this.storage.get(groupId) as SessionGroup | null;
    if (!group) {
      throw new Error(`[Mock] Session group not found: ${groupId}`);
    }

    return group;
  }

  async deleteSessionGroup(groupId: string): Promise<void> {
    await this.delay(300);

    this.storage.delete(groupId);
    console.log('[Mock] Deleted session group:', groupId);
  }

  async updateSessionGroup(
    groupId: string,
    updates: Partial<SessionGroup>
  ): Promise<SessionGroup> {
    await this.delay(250);

    const group = await this.getSessionGroup(groupId);
    const updated = {
      ...group,
      ...updates,
      updated: Date.now()
    };

    this.storage.set(groupId, updated);
    return updated;
  }

  async linkDatabase(groupId: string, databaseName: string): Promise<void> {
    await this.delay(200);

    const group = await this.getSessionGroup(groupId);
    if (!group.databases.includes(databaseName)) {
      group.databases.push(databaseName);
      group.updated = Date.now();
      this.storage.set(groupId, group);
    }

    console.log('[Mock] Linked database to group:', databaseName);
  }

  async unlinkDatabase(groupId: string, databaseName: string): Promise<void> {
    await this.delay(200);

    const group = await this.getSessionGroup(groupId);
    group.databases = group.databases.filter(db => db !== databaseName);
    group.updated = Date.now();
    this.storage.set(groupId, group);

    console.log('[Mock] Unlinked database from group:', databaseName);
  }

  async getDefaultDatabase(groupId: string): Promise<string> {
    await this.delay(100);

    const group = await this.getSessionGroup(groupId);
    return group.defaultDatabaseId;
  }

  // Chat Session Methods

  async startChatSession(
    groupId: string,
    initialMessage?: string
  ): Promise<ChatSession> {
    await this.delay(400);

    const group = await this.getSessionGroup(groupId);

    const session: ChatSession = {
      sessionId: this.generateId('sess'),
      groupId,
      title: initialMessage
        ? this.generateTitle(initialMessage)
        : 'New conversation',
      messages: initialMessage ? [{
        role: 'user',
        content: initialMessage,
        timestamp: Date.now()
      }] : [],
      metadata: {
        model: 'llama-3',
        hostUrl: 'http://localhost:8080',
        databasesUsed: group.databases
      },
      created: Date.now(),
      updated: Date.now()
    };

    // Store session separately
    this.storage.set(`chat-${session.sessionId}`, session);

    // Add to group's session list
    group.chatSessions.push({
      sessionId: session.sessionId,
      title: session.title,
      timestamp: session.created,
      messageCount: session.messages.length,
      active: true,
      lastMessage: initialMessage
    });
    group.updated = Date.now();
    this.storage.set(groupId, group);

    console.log('[Mock] Started chat session:', session.sessionId);
    return session;
  }

  async getChatSession(groupId: string, sessionId: string): Promise<ChatSession> {
    await this.delay(150);

    const session = this.storage.get(`chat-${sessionId}`) as ChatSession | null;
    if (!session || session.groupId !== groupId) {
      throw new Error(`[Mock] Chat session not found: ${sessionId}`);
    }

    return session;
  }

  async listChatSessions(
    groupId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<ChatSession[]> {
    await this.delay(200);

    const group = await this.getSessionGroup(groupId);
    const sessionIds = group.chatSessions.map(s => s.sessionId);

    const sessions: ChatSession[] = [];
    for (const sessionId of sessionIds) {
      const session = this.storage.get(`chat-${sessionId}`) as ChatSession;
      if (session) sessions.push(session);
    }

    // Sort by updated (newest first)
    sessions.sort((a, b) => b.updated - a.updated);

    // Apply pagination
    const { limit = 50, offset = 0 } = options || {};
    return sessions.slice(offset, offset + limit);
  }

  async addMessage(
    groupId: string,
    sessionId: string,
    message: ChatMessage
  ): Promise<void> {
    await this.delay(100);

    const session = await this.getChatSession(groupId, sessionId);
    session.messages.push(message);
    session.updated = Date.now();
    this.storage.set(`chat-${sessionId}`, session);

    // Update group's session metadata
    const group = await this.getSessionGroup(groupId);
    const sessionMeta = group.chatSessions.find(s => s.sessionId === sessionId);
    if (sessionMeta) {
      sessionMeta.messageCount = session.messages.length;
      sessionMeta.lastMessage = message.content.substring(0, 100);
      sessionMeta.timestamp = message.timestamp;
      group.updated = Date.now();
      this.storage.set(groupId, group);
    }
  }

  async deleteChatSession(groupId: string, sessionId: string): Promise<void> {
    await this.delay(300);

    // Remove session data
    this.storage.delete(`chat-${sessionId}`);

    // Remove from group's session list
    const group = await this.getSessionGroup(groupId);
    group.chatSessions = group.chatSessions.filter(s => s.sessionId !== sessionId);
    group.updated = Date.now();
    this.storage.set(groupId, group);

    console.log('[Mock] Deleted chat session:', sessionId);
  }

  // Sharing Methods

  async shareGroup(
    groupId: string,
    userAddress: string,
    role: 'reader' | 'writer'
  ): Promise<void> {
    await this.delay(300);

    const group = await this.getSessionGroup(groupId);

    if (role === 'reader' && !group.permissions?.readers?.includes(userAddress)) {
      group.permissions = group.permissions || { readers: [], writers: [] };
      group.permissions.readers!.push(userAddress);
    } else if (role === 'writer' && !group.permissions?.writers?.includes(userAddress)) {
      group.permissions = group.permissions || { readers: [], writers: [] };
      group.permissions.writers!.push(userAddress);
    }

    group.updated = Date.now();
    this.storage.set(groupId, group);

    console.log('[Mock] Shared group with:', userAddress, role);
  }

  async unshareGroup(groupId: string, userAddress: string): Promise<void> {
    await this.delay(250);

    const group = await this.getSessionGroup(groupId);

    if (group.permissions) {
      group.permissions.readers = group.permissions.readers?.filter(a => a !== userAddress);
      group.permissions.writers = group.permissions.writers?.filter(a => a !== userAddress);
    }

    group.updated = Date.now();
    this.storage.set(groupId, group);

    console.log('[Mock] Unshared group with:', userAddress);
  }

  async listSharedGroups(): Promise<SessionGroup[]> {
    await this.delay(200);

    // Mock: Return predefined shared groups
    return generateMockSessionGroups().filter(g =>
      g.owner !== this.userAddress
    );
  }

  // Helper Methods

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateTitle(message: string): string {
    // Take first 50 chars of message as title
    return message.substring(0, 50) + (message.length > 50 ? '...' : '');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

### 2. SessionManager Mock

**Purpose**: Handle active LLM chat sessions with streaming responses.

```typescript
// @fabstir/sdk-core-mock/src/managers/SessionManager.mock.ts

import type {
  ISessionManager,
  SessionConfig,
  SessionInfo,
  Vector,
  SearchResult
} from '@fabstir/sdk-core';

export class SessionManagerMock implements ISessionManager {
  private activeSessions: Map<string, SessionInfo> = new Map();
  private userAddress: string;

  constructor(userAddress: string) {
    this.userAddress = userAddress;
  }

  async startSession(config: SessionConfig): Promise<SessionInfo> {
    await this.delay(800); // Simulate connection time

    const sessionId = this.generateId('sess');
    const sessionInfo: SessionInfo = {
      sessionId,
      hostUrl: config.hostUrl,
      jobId: config.jobId,
      modelName: config.modelName,
      chainId: config.chainId,
      status: 'active',
      createdAt: Date.now(),
      groupId: config.groupId
    };

    this.activeSessions.set(sessionId, sessionInfo);
    console.log('[Mock] Started session:', sessionId);

    return sessionInfo;
  }

  async endSession(sessionId: string | BigInt): Promise<void> {
    await this.delay(300);

    const id = sessionId.toString();
    this.activeSessions.delete(id);
    console.log('[Mock] Ended session:', id);
  }

  async sendPromptStreaming(
    sessionId: string | BigInt,
    prompt: string,
    onChunk: (chunk: { content: string; done: boolean }) => void
  ): Promise<void> {
    const id = sessionId.toString();

    if (!this.activeSessions.has(id)) {
      throw new Error(`[Mock] Session not found: ${id}`);
    }

    // Simulate streaming response
    const mockResponse = this.generateMockResponse(prompt);
    const words = mockResponse.split(' ');

    for (let i = 0; i < words.length; i++) {
      await this.delay(50); // Simulate streaming delay

      onChunk({
        content: words[i] + ' ',
        done: i === words.length - 1
      });
    }
  }

  async sendPrompt(sessionId: string | BigInt, prompt: string): Promise<string> {
    const id = sessionId.toString();

    if (!this.activeSessions.has(id)) {
      throw new Error(`[Mock] Session not found: ${id}`);
    }

    await this.delay(1500); // Simulate response time
    return this.generateMockResponse(prompt);
  }

  // RAG Methods

  async uploadVectors(
    sessionId: string | BigInt,
    vectors: Vector[],
    replace?: boolean
  ): Promise<{ success: boolean; count: number }> {
    const id = sessionId.toString();
    await this.delay(500);

    console.log(`[Mock] Uploaded ${vectors.length} vectors to session ${id}`);

    return {
      success: true,
      count: vectors.length
    };
  }

  async searchVectors(
    sessionId: string | BigInt,
    queryVector: number[],
    k?: number,
    threshold?: number
  ): Promise<SearchResult[]> {
    const id = sessionId.toString();
    await this.delay(300);

    // Return mock search results
    const topK = k || 5;
    const results: SearchResult[] = [];

    for (let i = 0; i < topK; i++) {
      results.push({
        id: `vec-${i}`,
        score: 0.9 - (i * 0.1),
        metadata: {
          text: `Mock search result ${i + 1} for session ${id}`,
          source: `document-${i}.pdf`,
          folderPath: `/documents/category-${i % 3}`
        }
      });
    }

    return results;
  }

  async askWithContext(
    sessionId: string | BigInt,
    question: string,
    topK?: number
  ): Promise<string> {
    const id = sessionId.toString();
    await this.delay(2000);

    return `[Mock RAG Response for session ${id}]\n\nBased on the context from your documents, here's the answer to "${question}":\n\n${this.generateMockResponse(question)}\n\nSources: document-1.pdf, document-2.pdf`;
  }

  getSession(sessionId: string): SessionInfo | undefined {
    return this.activeSessions.get(sessionId);
  }

  listActiveSessions(): SessionInfo[] {
    return Array.from(this.activeSessions.values());
  }

  // Helper Methods

  private generateMockResponse(prompt: string): string {
    const responses = [
      `Based on the information provided, here's a comprehensive answer to your question about "${prompt.substring(0, 30)}..."`,
      `Great question! Let me break this down for you regarding "${prompt.substring(0, 30)}..."`,
      `To address your query about "${prompt.substring(0, 30)}...", I'd recommend the following approach`,
      `Here's what I found in your documentation about "${prompt.substring(0, 30)}..."`
    ];

    const mockContent = `
${responses[Math.floor(Math.random() * responses.length)]}:

1. First key point: This is a simulated response from the mock SDK.
2. Second key point: In production, this would be a real LLM response.
3. Third key point: The mock maintains the same interface for seamless integration.

Additional context: This mock response includes realistic formatting and structure to help you build and test your UI without needing the full blockchain/WebSocket infrastructure.

Would you like me to elaborate on any of these points?
    `.trim();

    return mockContent;
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

### 3. VectorRAGManager Mock

**Purpose**: Manage vector databases with folder hierarchy.

```typescript
// @fabstir/sdk-core-mock/src/managers/VectorRAGManager.mock.ts

import type {
  IVectorRAGManager,
  Vector,
  SearchResult,
  DatabaseMetadata,
  FolderStats
} from '@fabstir/sdk-core';
import { MockStorage } from '../storage/MockStorage';
import { generateMockVectorDatabases } from '../fixtures/mockData';

export class VectorRAGManagerMock implements IVectorRAGManager {
  private storage: MockStorage;
  private userAddress: string;

  constructor(userAddress: string) {
    this.userAddress = userAddress;
    this.storage = new MockStorage(`vector-dbs-${userAddress}`);

    // Initialize with mock data if empty
    if (this.storage.getAll().length === 0) {
      generateMockVectorDatabases().forEach(db => {
        this.storage.set(db.name, db);
      });
    }
  }

  async createSession(
    databaseName: string,
    options?: { dimensions?: number; folderStructure?: boolean }
  ): Promise<void> {
    await this.delay(400);

    const db: DatabaseMetadata = {
      name: databaseName,
      dimensions: options?.dimensions || 384,
      vectorCount: 0,
      storageSizeBytes: 0,
      owner: this.userAddress,
      created: Date.now(),
      lastAccessed: Date.now(),
      description: '',
      folderStructure: options?.folderStructure !== false
    };

    this.storage.set(databaseName, db);
    this.storage.set(`${databaseName}-vectors`, []);

    console.log('[Mock] Created vector database:', databaseName);
  }

  async addVector(
    databaseName: string,
    id: string,
    vector: number[],
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.delay(150);

    const vectors = this.storage.get(`${databaseName}-vectors`) as Vector[] || [];

    vectors.push({
      id,
      vector,
      metadata: {
        ...metadata,
        addedAt: Date.now()
      }
    });

    this.storage.set(`${databaseName}-vectors`, vectors);

    // Update database metadata
    const db = this.storage.get(databaseName) as DatabaseMetadata;
    if (db) {
      db.vectorCount = vectors.length;
      db.storageSizeBytes = vectors.length * vector.length * 4; // Rough estimate
      db.lastAccessed = Date.now();
      this.storage.set(databaseName, db);
    }
  }

  async searchVectors(
    databaseName: string,
    queryVector: number[],
    k?: number,
    threshold?: number
  ): Promise<SearchResult[]> {
    await this.delay(300);

    const topK = k || 5;
    const vectors = this.storage.get(`${databaseName}-vectors`) as Vector[] || [];

    // Return mock results
    const results: SearchResult[] = [];
    for (let i = 0; i < Math.min(topK, vectors.length); i++) {
      results.push({
        id: vectors[i].id,
        score: 0.95 - (i * 0.08),
        metadata: vectors[i].metadata
      });
    }

    return results;
  }

  async listDatabases(): Promise<DatabaseMetadata[]> {
    await this.delay(200);

    const allData = this.storage.getAll();
    const databases = allData.filter((item: any) =>
      item.name && item.vectorCount !== undefined
    ) as DatabaseMetadata[];

    return databases.sort((a, b) => b.lastAccessed - a.lastAccessed);
  }

  async deleteDatabase(databaseName: string): Promise<void> {
    await this.delay(400);

    this.storage.delete(databaseName);
    this.storage.delete(`${databaseName}-vectors`);

    console.log('[Mock] Deleted vector database:', databaseName);
  }

  async getDatabaseMetadata(databaseName: string): Promise<DatabaseMetadata> {
    await this.delay(100);

    const db = this.storage.get(databaseName) as DatabaseMetadata | null;
    if (!db) {
      throw new Error(`[Mock] Database not found: ${databaseName}`);
    }

    return db;
  }

  // Folder Methods

  async listFolders(databaseName: string): Promise<string[]> {
    await this.delay(150);

    const vectors = this.storage.get(`${databaseName}-vectors`) as Vector[] || [];
    const folders = new Set<string>();

    vectors.forEach(v => {
      if (v.metadata?.folderPath) {
        folders.add(v.metadata.folderPath);
      }
    });

    return Array.from(folders).sort();
  }

  async getFolderStatistics(
    databaseName: string,
    folderPath: string
  ): Promise<FolderStats> {
    await this.delay(100);

    const vectors = this.storage.get(`${databaseName}-vectors`) as Vector[] || [];
    const folderVectors = vectors.filter(v =>
      v.metadata?.folderPath === folderPath
    );

    return {
      folderPath,
      vectorCount: folderVectors.length,
      totalSize: folderVectors.length * 384 * 4,
      lastModified: Date.now()
    };
  }

  async moveToFolder(
    databaseName: string,
    vectorId: string,
    targetFolder: string
  ): Promise<void> {
    await this.delay(200);

    const vectors = this.storage.get(`${databaseName}-vectors`) as Vector[] || [];
    const vector = vectors.find(v => v.id === vectorId);

    if (vector && vector.metadata) {
      vector.metadata.folderPath = targetFolder;
      this.storage.set(`${databaseName}-vectors`, vectors);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## Mock Data Fixtures

```typescript
// @fabstir/sdk-core-mock/src/fixtures/mockData.ts

import type { SessionGroup, DatabaseMetadata } from '@fabstir/sdk-core';

export function generateMockSessionGroups(): SessionGroup[] {
  const now = Date.now();

  return [
    {
      id: 'group-engineering-001',
      name: 'Engineering Project',
      description: 'All engineering-related discussions and documentation',
      databases: ['api-documentation', 'design-specifications'],
      defaultDatabaseId: 'default-engineering-001',
      chatSessions: [
        {
          sessionId: 'sess-001',
          title: 'How to implement authentication for mobile apps?',
          timestamp: now - 5 * 60 * 1000, // 5 min ago
          messageCount: 12,
          active: true,
          lastMessage: 'What about token refresh strategies?'
        },
        {
          sessionId: 'sess-002',
          title: 'Database migration strategy',
          timestamp: now - 2 * 60 * 60 * 1000, // 2 hours ago
          messageCount: 8,
          active: false,
          lastMessage: 'Let\'s use blue-green deployment approach'
        }
      ],
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: now - 7 * 24 * 60 * 60 * 1000, // 7 days ago
      updated: now - 5 * 60 * 1000,
      permissions: {
        readers: [],
        writers: ['0xABCDEF1234567890ABCDEF1234567890ABCDEF12']
      }
    },
    {
      id: 'group-research-001',
      name: 'Product Research',
      description: 'Market analysis and competitor research',
      databases: ['research-papers', 'market-analysis', 'competitor-data'],
      defaultDatabaseId: 'default-research-001',
      chatSessions: [
        {
          sessionId: 'sess-003',
          title: 'Analyze competitor pricing strategies',
          timestamp: now - 2 * 60 * 60 * 1000,
          messageCount: 15,
          active: false,
          lastMessage: 'Summary: Most competitors use tiered pricing...'
        }
      ],
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: now - 14 * 24 * 60 * 60 * 1000,
      updated: now - 2 * 60 * 60 * 1000,
      permissions: {
        readers: [],
        writers: []
      }
    },
    {
      id: 'group-design-shared',
      name: 'Design Brainstorming',
      description: 'UI/UX design discussions',
      databases: ['design-system'],
      defaultDatabaseId: 'default-design-shared',
      chatSessions: [
        {
          sessionId: 'sess-004',
          title: 'Color palette recommendations for mobile app',
          timestamp: now - 24 * 60 * 60 * 1000, // Yesterday
          messageCount: 4,
          active: false,
          lastMessage: 'I like the blue gradient approach'
        }
      ],
      owner: '0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF', // Different owner
      created: now - 3 * 24 * 60 * 60 * 1000,
      updated: now - 24 * 60 * 60 * 1000,
      permissions: {
        readers: ['0x1234567890ABCDEF1234567890ABCDEF12345678'],
        writers: []
      }
    }
  ];
}

export function generateMockVectorDatabases(): DatabaseMetadata[] {
  const now = Date.now();

  return [
    {
      name: 'api-documentation',
      dimensions: 384,
      vectorCount: 2345,
      storageSizeBytes: 3600000,
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: now - 30 * 24 * 60 * 60 * 1000,
      lastAccessed: now - 2 * 60 * 60 * 1000,
      description: 'Complete API documentation and guides',
      folderStructure: true
    },
    {
      name: 'design-specifications',
      dimensions: 384,
      vectorCount: 1823,
      storageSizeBytes: 2800000,
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: now - 25 * 24 * 60 * 60 * 1000,
      lastAccessed: now - 1 * 24 * 60 * 60 * 1000,
      description: 'Design specs and wireframes',
      folderStructure: true
    },
    {
      name: 'research-papers',
      dimensions: 384,
      vectorCount: 5621,
      storageSizeBytes: 8600000,
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: now - 60 * 24 * 60 * 60 * 1000,
      lastAccessed: now - 3 * 24 * 60 * 60 * 1000,
      description: 'Academic and industry research papers',
      folderStructure: true
    },
    {
      name: 'personal-knowledge',
      dimensions: 384,
      vectorCount: 892,
      storageSizeBytes: 1400000,
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: now - 45 * 24 * 60 * 60 * 1000,
      lastAccessed: now - 7 * 24 * 60 * 60 * 1000,
      description: 'Personal notes and learning materials',
      folderStructure: true
    }
  ];
}
```

---

## MockStorage Utility

```typescript
// @fabstir/sdk-core-mock/src/storage/MockStorage.ts

/**
 * localStorage wrapper that simulates S5 encrypted storage
 */
export class MockStorage {
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = `fabstir-mock-${prefix}`;
  }

  set(key: string, value: any): void {
    const fullKey = `${this.prefix}-${key}`;
    localStorage.setItem(fullKey, JSON.stringify(value));
  }

  get(key: string): any | null {
    const fullKey = `${this.prefix}-${key}`;
    const value = localStorage.getItem(fullKey);

    if (value === null) return null;

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  delete(key: string): void {
    const fullKey = `${this.prefix}-${key}`;
    localStorage.removeItem(fullKey);
  }

  getAll(): any[] {
    const results: any[] = [];
    const prefixLength = this.prefix.length + 1;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${this.prefix}-`)) {
        const value = this.get(key.substring(prefixLength));
        if (value !== null) {
          results.push(value);
        }
      }
    }

    return results;
  }

  clear(): void {
    const keysToDelete: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${this.prefix}-`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => localStorage.removeItem(key));
  }
}
```

---

## Usage Examples

### Example 1: Basic Setup

```typescript
// In your Next.js app
import { FabstirSDKCoreMock } from '@fabstir/sdk-core-mock';

const sdk = new FabstirSDKCoreMock({
  mode: 'production',
  chainId: 84532
});

await sdk.authenticate('mock', { privateKey: '0xMOCK' });

// Now use managers
const sessionGroupManager = await sdk.getSessionGroupManager();
const groups = await sessionGroupManager.listSessionGroups();
console.log('Session groups:', groups);
```

### Example 2: Creating and Using Session Groups

```typescript
// Create a new session group
const group = await sessionGroupManager.createSessionGroup(
  'My New Project',
  {
    description: 'Working on new features',
    databases: ['api-docs', 'design-specs']
  }
);

// Start a chat session
const chatSession = await sessionGroupManager.startChatSession(
  group.id,
  'How do I implement user authentication?'
);

// Add a message
await sessionGroupManager.addMessage(
  group.id,
  chatSession.sessionId,
  {
    role: 'assistant',
    content: 'Here\'s how to implement authentication...',
    timestamp: Date.now()
  }
);

// List all sessions in group
const sessions = await sessionGroupManager.listChatSessions(group.id);
```

### Example 3: Vector Database Operations

```typescript
const vectorRAG = await sdk.getVectorRAGManager();

// Create a database
await vectorRAG.createSession('my-docs', {
  dimensions: 384,
  folderStructure: true
});

// Add vectors with folder organization
await vectorRAG.addVector(
  'my-docs',
  'vec-1',
  new Array(384).fill(0.1),
  {
    text: 'Authentication guide content...',
    source: 'auth-guide.md',
    folderPath: '/guides/authentication'
  }
);

// Search
const results = await vectorRAG.searchVectors(
  'my-docs',
  new Array(384).fill(0.2),
  5,
  0.7
);
```

---

## Testing the Mock SDK

### Unit Tests

```typescript
// @fabstir/sdk-core-mock/tests/SessionGroupManager.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionGroupManagerMock } from '../src/managers/SessionGroupManager.mock';

describe('SessionGroupManagerMock', () => {
  let manager: SessionGroupManagerMock;

  beforeEach(() => {
    localStorage.clear();
    manager = new SessionGroupManagerMock('0xTEST');
  });

  it('should create a session group', async () => {
    const group = await manager.createSessionGroup('Test Group');

    expect(group.name).toBe('Test Group');
    expect(group.owner).toBe('0xTEST');
    expect(group.chatSessions).toHaveLength(0);
  });

  it('should persist groups across instances', async () => {
    await manager.createSessionGroup('Persistent Group');

    const newManager = new SessionGroupManagerMock('0xTEST');
    const groups = await newManager.listSessionGroups();

    expect(groups.some(g => g.name === 'Persistent Group')).toBe(true);
  });

  it('should start a chat session', async () => {
    const group = await manager.createSessionGroup('Chat Test');
    const session = await manager.startChatSession(
      group.id,
      'Hello, world!'
    );

    expect(session.title).toContain('Hello');
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].content).toBe('Hello, world!');
  });
});
```

---

## Migration Path: Mock → Real SDK

### Before (Mock)

```typescript
// apps/my-ui/lib/sdk.ts
import { FabstirSDKCoreMock as FabstirSDKCore } from '@fabstir/sdk-core-mock';
```

### After (Real)

```typescript
// apps/my-ui/lib/sdk.ts
import { FabstirSDKCore } from '@fabstir/sdk-core';
```

**That's it!** Everything else stays the same.

---

## Key Differences from Real SDK

| Feature | Mock SDK | Real SDK |
|---------|----------|----------|
| **Response Time** | Instant (simulated delay) | Variable (blockchain/WebSocket) |
| **Persistence** | localStorage | S5 network |
| **Authentication** | Accepts any value | Requires real wallet signature |
| **Blockchain** | None | Base Sepolia transactions |
| **WebSocket** | Simulated streaming | Real WebSocket to node |
| **Cost** | Free | Gas fees + token payments |
| **Data** | Predefined fixtures | Real user data |

---

## Console Output

The mock SDK logs all operations with `[Mock]` prefix:

```
[Mock SDK] Initialized with options: { mode: 'production', chainId: 84532 }
[Mock SDK] Authenticated as: 0x1234567890ABCDEF1234567890ABCDEF12345678
[Mock] Created session group: Engineering Project
[Mock] Started chat session: sess-1704067200000-abc123
[Mock] Uploaded 234 vectors to session sess-1704067200000-abc123
[Mock] Deleted vector database: old-docs
```

This helps distinguish mock operations from real SDK operations during development.

---

## Summary

**Mock SDK Provides:**
- ✅ Identical interfaces to real SDK
- ✅ Instant responses (no blockchain delays)
- ✅ localStorage persistence (survives refresh)
- ✅ Predefined realistic data
- ✅ Drop-in replacement (change 1 import to swap to real)
- ✅ Full TypeScript type safety

**Use Mock SDK For:**
- UI development and iteration
- Component testing
- Demo/prototype builds
- Frontend development without backend dependencies

**Switch to Real SDK When:**
- UI is complete and polished
- Ready for blockchain integration
- Need real S5 storage
- Ready for production testing
