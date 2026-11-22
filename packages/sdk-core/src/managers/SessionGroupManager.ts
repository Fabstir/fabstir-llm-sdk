// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type { ISessionGroupManager } from '../interfaces/ISessionGroupManager';
import type {
  SessionGroup,
  CreateSessionGroupInput,
  UpdateSessionGroupInput,
  VectorDatabaseMetadata,
  ChatSession,
  ChatMessage,
} from '../types/session-groups.types';
import { SessionGroupStorage, newerThan } from '../storage/SessionGroupStorage';
import { AsyncMutex } from '../utils/AsyncMutex';
import { SDKError } from '../types';
import { rethrowDisposal } from '../utils/disposal';

/**
 * Session Group Manager
 *
 * Manages Session Groups (Claude Projects-style organization).
 * Groups organize related chat sessions and vector databases.
 *
 * Storage: S5-backed with in-memory caching for performance
 *
 * Memory is the authority for a group this manager holds (1.39.25): a stored copy replaces it only when its `updatedAt`
 * is strictly later (`install`); every change is made to the group object that is in memory at that instant and stamped
 * with `touch`; every save writes the one that is in memory when the save runs (`persist`). A chat of a group in memory
 * is one object, in `chatStorage` and in the group's `chatSessionsData`; `chatStorage` is a cache a consumer may empty,
 * so a change looks in both.
 */
export class SessionGroupManager implements ISessionGroupManager {
  private groups: Map<string, SessionGroup> = new Map();
  // Mock database registry for testing (Phase 1 in-memory only)
  // In production, this would be replaced with VectorDatabaseManager
  private mockDatabases: Map<string, VectorDatabaseMetadata> = new Map();
  // Chat session storage (for UI testing - production uses SessionManager)
  private chatStorage: Map<string, ChatSession> = new Map();
  // S5 storage for persistence
  private storage: SessionGroupStorage | null = null;
  private storageInitialized: boolean = false;
  private groupLock = new AsyncMutex();
  /**
   * Every chat object this manager has taken in or stamped (1.39.26). One of these passed back to `updateSessionGroup`
   * is not a new version of its chat: it is the current object, or an older one a caller still held.
   */
  private knownChats = new WeakSet<ChatSession>();
  /** Set by `dispose()`: every public member refuses from then on (plan §26 GG1). */
  private disposed = false;

  constructor(storage?: SessionGroupStorage) {
    this.storage = storage || null;
    this.storageInitialized = !!storage;
  }

  /**
   * Dispose of this manager when its identity is forgotten — a sign-out or the next sign-in (plan §26 GG1). Refuses
   * from its first line: every other public member then refuses `SESSION_GROUP_MANAGER_DISPOSED`. A call in flight keeps
   * what it reads (plan §27 HH2) and stops at its next storage step, saying so — the disposed store's refusal is never
   * taken as best-effort. What it holds goes with it once nothing does.
   */
  dispose(): void {
    this.disposed = true;
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new SDKError('This session-group manager belongs to an identity that is signed out — get the current one from the SDK',
        'SESSION_GROUP_MANAGER_DISPOSED', { retryable: false });
    }
  }

  /**
   * Take a group read from storage into memory, and return the group that is in memory afterwards. Memory wins unless
   * the stored copy is strictly newer: a copy read before a save of this manager landed is older by its stamp. A newer
   * copy (another tab or device wrote it) is adopted with its chats; only a chat whose in-memory stamp (`chatStamp`:
   * the later of `revision` and `updated`) is strictly later than the stored one's is kept — this manager changed it
   * after the copy's writer last did. A chat the newer copy no longer has stays in `chatStorage`, as it always did:
   * whether it was deleted elsewhere or never seen there cannot be told from here, and it is not this method's to drop.
   */
  private install(loaded: SessionGroup): SessionGroup {
    const current = this.groups.get(loaded.id);
    if (current && !newerThan(loaded, current)) return current;
    const chats = loaded.chatSessionsData ?? {};
    for (const [sessionId, session] of Object.entries(chats)) {
      const held = this.chatInMemory(loaded.id, sessionId);
      const kept = held && chatStamp(held) > chatStamp(session) ? held : session;
      chats[sessionId] = kept;
      this.chatStorage.set(sessionId, kept);
      if (kept && typeof kept === 'object') this.knownChats.add(kept);
    }
    this.groups.set(loaded.id, loaded);
    return loaded;
  }

  /**
   * Stamp a change — always later than the stamp it replaces. A clock set back must not make a stored copy look newer,
   * and a change made after adopting a copy stamped ahead of this clock must still look newer to the device that wrote it.
   */
  private touch(group: SessionGroup): void {
    const previous = new Date(group.updatedAt).getTime();
    group.updatedAt = new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0));
  }

  /**
   * Stamp a change to a chat (1.39.26): `revision`, later than the chat's previous stamps — and than those of the
   * object it `replaces`, when it is a new object for that chat — whatever the clock says. `updated` is the callers'
   * (it orders their chat lists); this one is the manager's, and tells which copy of a chat was changed last when
   * another tab's group is adopted.
   */
  private stampChat(session: ChatSession, replaces?: ChatSession): void {
    const previous = Math.max(chatStamp(session), chatStamp(replaces));
    session.revision = Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0);
    this.knownChats.add(session);
  }

  /**
   * The group's chat as memory holds it: the cache when its entry is this group's, else the group's own record (a
   * consumer may have emptied the cache, and the cache is keyed by chat id alone).
   */
  private chatInMemory(groupId: string, sessionId: string): ChatSession | undefined {
    const cached = this.chatStorage.get(sessionId);
    return cached?.groupId === groupId ? cached : this.groups.get(groupId)?.chatSessionsData?.[sessionId] ?? undefined;
  }

  /**
   * Put memory's state of a group into a new group object, with new `chatSessions` and `chatSessionsData` containers
   * (the chats stay the same objects), and return it. Every list has always handed out new objects, and consumers
   * compare references to see a change. Safe because no change or save holds a group across an await (`persist`).
   */
  private renew(group: SessionGroup): SessionGroup {
    const copy: SessionGroup = { ...group };
    if (Array.isArray(group.chatSessions)) copy.chatSessions = [...group.chatSessions];
    if (group.chatSessionsData) copy.chatSessionsData = { ...group.chatSessionsData };
    this.groups.set(copy.id, copy);
    return copy;
  }

  /** Save the group as it is in memory when its turn under the lock comes — never an object captured earlier. */
  private persist(groupId: string): Promise<void> {
    return this.groupLock.withLock(groupId, async () => {
      const group = this.groups.get(groupId);
      if (group && this.storage) await this.storage.save(group);
    });
  }

  /**
   * Mock method to register a database for testing
   * In production, this would be handled by VectorDatabaseManager
   */
  private registerMockDatabase(db: VectorDatabaseMetadata): void {
    this.mockDatabases.set(db.id, db);
  }

  /**
   * Check if a database exists
   * In production, this would query VectorDatabaseManager
   */
  private async databaseExists(databaseId: string): Promise<boolean> {
    // Phase 1.2: In-memory stub - accept any database ID
    // TODO Phase 1.3+: Check VectorRAGManager for actual database existence
    return true;
  }

  /**
   * Get database metadata
   * In production, this would query VectorDatabaseManager
   */
  private async getDatabaseMetadata(databaseId: string): Promise<VectorDatabaseMetadata> {
    const db = this.mockDatabases.get(databaseId);
    if (!db) {
      throw new Error(`Database ${databaseId} not found in registry`);
    }
    return db;
  }

  /**
   * Create a new session group
   */
  async createSessionGroup(input: CreateSessionGroupInput): Promise<SessionGroup> {
    this.ensureNotDisposed();
    // Validate required fields
    if (!input.name || input.name.trim() === '') {
      throw new Error('name is required');
    }

    // Description is optional, but validate it's a string if provided
    if (input.description !== undefined && typeof input.description !== 'string') {
      throw new Error('description must be a string');
    }

    // Validate metadata if provided
    if (input.metadata !== undefined && typeof input.metadata !== 'object') {
      throw new Error('metadata must be an object');
    }

    // Generate unique ID
    const id = this.generateId();
    const now = new Date();

    const group: SessionGroup = {
      id,
      name: input.name,
      description: input.description,
      createdAt: now,
      updatedAt: now,
      owner: input.owner,
      linkedDatabases: [],
      chatSessions: [],
      chatSessionsData: {}, // Initialize for session persistence
      documents: [],
      metadata: input.metadata || {},
      deleted: false,
    };

    // Store in memory cache
    this.groups.set(id, group);

    // Persist to S5 storage if available
    if (this.storage) {
      try {
        console.log(`[Enhanced S5.js] Creating session group: /home/session-groups/${id}/`);
        await this.persist(id);
        console.log(`[Enhanced S5.js] Session group saved successfully`);
      } catch (err) {
        rethrowDisposal(err);
        console.error('[SessionGroupManager.createSessionGroup] Failed to save to S5 storage:', err);
        // Don't throw - allow operation to continue with in-memory only
        // This allows testing without full S5 setup
      }
    }

    return group;
  }

  /**
   * List all session groups for a user
   */
  async listSessionGroups(owner: string): Promise<SessionGroup[]> {
    this.ensureNotDisposed();
    const listed = new Set<string>();
    const result: SessionGroup[] = [];
    if (this.storage) {
      try {
        console.log(`[Enhanced S5.js] Listing directory: /home/session-groups/`);
        const allGroups = await this.storage.loadAll();
        for (const loaded of allGroups) {
          if (loaded.owner !== owner) continue;
          if (loaded.deleted && !this.groups.has(loaded.id)) continue; // a deleted group is not taken into memory
          let group = this.install(loaded);
          if (group !== loaded) group = this.renew(group); // memory won: its state, in a new object all the same
          listed.add(group.id);
          if (!group.deleted) result.push(group);
        }
        console.log(`[Enhanced S5.js] Found ${result.length} session groups`);
      } catch (err: any) {
        rethrowDisposal(err);
        // Only log unexpected errors (directory not found is expected on first load)
        if (!err.message?.includes('not found') && !err.message?.includes('does not exist')) {
          console.error('[SessionGroupManager.listSessionGroups] Failed to load from S5 storage:', err);
        }
        // What memory holds is returned below
      }
    }

    // Then the groups only memory holds: a create whose save has not landed, a file storage could not read this time.
    for (const group of this.heldFor(owner)) {
      if (!listed.has(group.id)) result.push(this.renew(group));
    }
    return result;
  }

  /**
   * The owner's groups as memory holds them now — no storage read: empty until a list or a load has run. The objects
   * are the manager's own.
   */
  getCachedSessionGroups(owner: string): SessionGroup[] {
    this.ensureNotDisposed();
    return this.heldFor(owner);
  }

  /** `getCachedSessionGroups` without the disposal check: a list in flight at a sign-out keeps what it read (§27 HH2). */
  private heldFor(owner: string): SessionGroup[] {
    return [...this.groups.values()].filter((group) => group.owner === owner && !group.deleted);
  }

  /**
   * Get a specific session group by ID
   */
  async getSessionGroup(groupId: string, requestor: string): Promise<SessionGroup> {
    this.ensureNotDisposed();
    // Validate group ID
    if (!groupId || groupId.trim() === '') {
      throw new Error('Invalid group ID');
    }

    // Check in-memory cache first
    let group = this.groups.get(groupId);

    // If not in cache and S5 storage is available, try loading from S5
    if (!group && this.storage) {
      try {
        console.log(`[SessionGroupManager.getSessionGroup] Loading group ${groupId} from S5...`);
        const loaded = await this.storage.load(groupId);
        if (loaded) {
          console.log(`[SessionGroupManager.getSessionGroup] ✅ Loaded from S5: ${loaded.chatSessions.length} session IDs`);
          // Memory may hold the group by now (a list installed it while this load ran): `install` keeps the newer.
          group = this.install(loaded);
        } else {
          console.warn(`[SessionGroupManager.getSessionGroup] ⚠️  Group ${groupId} not found in S5`);
        }
      } catch (err) {
        rethrowDisposal(err);
        console.error('[SessionGroupManager.getSessionGroup] Failed to load from S5 storage:', err);
        // Continue with cache-only check below
      }
    } else if (group) {
      console.log(`[SessionGroupManager.getSessionGroup] Found group ${groupId} in memory cache`);
      // Populate chat sessions from chatSessionsData even when from cache
      if (group.chatSessionsData) {
        for (const [sessionId, session] of Object.entries(group.chatSessionsData)) {
          // Only populate if not already in chatStorage to avoid unnecessary work
          if (!this.chatStorage.has(sessionId)) {
            this.chatStorage.set(sessionId, session);
            console.log(`[SessionGroupManager.getSessionGroup] Cached session ${sessionId} from memory group`);
          }
        }
      }
    }

    if (!group) {
      throw new Error('Session group not found');
    }

    // Check permissions
    if (group.owner !== requestor) {
      throw new Error('Permission denied');
    }

    return group;
  }

  /**
   * Update a session group
   */
  async updateSessionGroup(
    groupId: string,
    requestor: string,
    updates: UpdateSessionGroupInput
  ): Promise<SessionGroup> {
    this.ensureNotDisposed();
    // Validate group ID
    if (!groupId || groupId.trim() === '') {
      throw new Error('Invalid group ID');
    }

    const group = this.groups.get(groupId);

    if (!group) {
      throw new Error('Session group not found');
    }

    // Check permissions
    if (group.owner !== requestor) {
      throw new Error('Permission denied');
    }

    // Apply updates
    if (updates.name !== undefined) {
      group.name = updates.name;
    }

    if (updates.description !== undefined) {
      group.description = updates.description;
    }

    if (updates.metadata !== undefined) {
      // Merge metadata
      group.metadata = { ...group.metadata, ...updates.metadata };
    }

    if (updates.chatSessionsData !== undefined) {
      const held = group.chatSessionsData || {};
      for (const [sid, session] of Object.entries(updates.chatSessionsData)) {
        // An object this manager has never held is a new version of the chat. One it has held says nothing — the
        // group's own object passed along in a whole record, or an older one from a copy of the group the caller kept:
        // stamping those would make this tab's unchanged or stale chats beat another tab's real edits. A chat changed
        // in place goes through updateChatSession.
        if (session && typeof session === 'object' && !this.knownChats.has(session)) this.stampChat(session, held[sid]);
        this.chatStorage.set(sid, session);
      }
      group.chatSessionsData = { ...held, ...updates.chatSessionsData };
    }

    this.touch(group);
    await this.persist(groupId);
    return group;
  }

  /**
   * Soft-delete a session group (sets deleted: true)
   */
  async deleteSessionGroup(groupId: string, requestor: string): Promise<void> {
    this.ensureNotDisposed();
    const group = this.groups.get(groupId);

    if (!group) {
      throw new Error('Session group not found');
    }

    // Check permissions
    if (group.owner !== requestor) {
      throw new Error('Permission denied');
    }

    // Soft delete — set, stamped and saved as one step under the group's lock. Nothing later would save a deleted
    // group on purpose, so a delete whose save failed is taken back (1.39.26); the second stamp keeps memory newer
    // than a deleted copy that landed before the save threw (a failed network verification).
    await this.groupLock.withLock(groupId, async () => {
      const current = this.groups.get(groupId)!;
      const before = current.deleted;
      current.deleted = true;
      this.touch(current);
      try {
        if (this.storage) await this.storage.save(current);
      } catch (error) {
        const restored = this.groups.get(groupId)!; // a list may have put a new object in memory during the save
        restored.deleted = before;
        this.touch(restored);
        throw error;
      }
    });
  }

  /**
   * Link a vector database to a session group
   */
  async linkVectorDatabase(
    groupId: string,
    requestor: string,
    databaseId: string
  ): Promise<SessionGroup> {
    this.ensureNotDisposed();
    await this.getSessionGroup(groupId, requestor);

    // Validate database exists
    const exists = await this.databaseExists(databaseId);
    if (!exists) {
      throw new Error('Vector database not found');
    }

    const group = this.groups.get(groupId)!; // as it is now: it may have been replaced during the awaits above
    // Add database if not already linked (avoid duplicates)
    if (!group.linkedDatabases.includes(databaseId)) {
      group.linkedDatabases.push(databaseId);
      this.touch(group);
      await this.persist(groupId);
    }

    return group;
  }

  /**
   * Unlink a vector database from a session group
   */
  async unlinkVectorDatabase(
    groupId: string,
    requestor: string,
    databaseId: string
  ): Promise<SessionGroup> {
    this.ensureNotDisposed();
    await this.getSessionGroup(groupId, requestor);
    const group = this.groups.get(groupId)!; // as it is now

    // Remove database from linked list
    group.linkedDatabases = group.linkedDatabases.filter((id) => id !== databaseId);

    // Clear default database if it was the unlinked one
    if (group.defaultDatabase === databaseId) {
      group.defaultDatabase = undefined;
    }

    this.touch(group);
    await this.persist(groupId);

    return group;
  }

  /**
   * Set the default vector database for new document uploads
   */
  async setDefaultDatabase(
    groupId: string,
    requestor: string,
    databaseId?: string
  ): Promise<SessionGroup> {
    this.ensureNotDisposed();
    await this.getSessionGroup(groupId, requestor);
    const group = this.groups.get(groupId)!; // as it is now

    // If setting a database (not clearing)
    if (databaseId !== undefined) {
      // Validate database is linked to group
      if (!group.linkedDatabases.includes(databaseId)) {
        throw new Error('Database must be linked to group first');
      }
    }

    group.defaultDatabase = databaseId;
    this.touch(group);
    await this.persist(groupId);

    return group;
  }

  /**
   * List all linked vector databases with metadata
   */
  async listLinkedDatabases(
    groupId: string,
    requestor: string
  ): Promise<VectorDatabaseMetadata[]> {
    this.ensureNotDisposed();
    const group = await this.getSessionGroup(groupId, requestor);

    // Map database IDs to metadata
    const databases: VectorDatabaseMetadata[] = [];
    for (const dbId of group.linkedDatabases) {
      try {
        const metadata = await this.getDatabaseMetadata(dbId);
        databases.push(metadata);
      } catch (error) {
        // Skip databases that no longer exist
        console.warn(`Database ${dbId} not found in registry, skipping`);
      }
    }

    return databases;
  }

  /**
   * Handle database deletion by removing from all groups
   */
  async handleDatabaseDeletion(databaseId: string): Promise<void> {
    this.ensureNotDisposed();
    // Iterate through all groups
    for (const group of this.groups.values()) {
      let modified = false;

      // Remove from linkedDatabases
      const originalLength = group.linkedDatabases.length;
      group.linkedDatabases = group.linkedDatabases.filter((id) => id !== databaseId);
      if (group.linkedDatabases.length !== originalLength) {
        modified = true;
      }

      // Clear default database if it was the deleted one
      if (group.defaultDatabase === databaseId) {
        group.defaultDatabase = undefined;
        modified = true;
      }

      // Save if modified
      if (modified) {
        this.touch(group);
      }
    }

    // Remove from mock database registry
    this.mockDatabases.delete(databaseId);
  }

  /**
   * Add a chat session to a session group
   */
  async addChatSession(
    groupId: string,
    requestor: string,
    sessionId: string
  ): Promise<SessionGroup> {
    this.ensureNotDisposed();
    await this.getSessionGroup(groupId, requestor);
    const group = this.groups.get(groupId)!; // as it is now

    // Add session if not already in list (avoid duplicates)
    if (!group.chatSessions.includes(sessionId)) {
      group.chatSessions.push(sessionId);
      this.touch(group);
    }

    return group;
  }

  /**
   * List all chat sessions in a session group
   */
  async listChatSessions(groupId: string, requestor: string): Promise<string[]> {
    this.ensureNotDisposed();
    const group = await this.getSessionGroup(groupId, requestor);
    return [...group.chatSessions]; // Return copy
  }

  /**
   * Add a document to a session group
   */
  async addGroupDocument(
    groupId: string,
    document: import('../types/session-groups.types').GroupDocumentMetadata
  ): Promise<import('../types/session-groups.types').SessionGroup> {
    this.ensureNotDisposed();
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Session group not found: ${groupId}`);
    }

    // Initialize documents array if not exists
    if (!group.documents) {
      group.documents = [];
    }

    // Add document
    group.documents.push(document);
    this.touch(group);
    await this.persist(groupId);

    return { ...group }; // Return copy
  }

  /**
   * Remove a document from a session group
   */
  async removeGroupDocument(
    groupId: string,
    documentId: string
  ): Promise<import('../types/session-groups.types').SessionGroup> {
    this.ensureNotDisposed();
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Session group not found: ${groupId}`);
    }

    // Remove document
    if (group.documents) {
      group.documents = group.documents.filter(doc => doc.id !== documentId);
      this.touch(group);
      await this.persist(groupId);
    }

    return { ...group }; // Return copy
  }

  /**
   * Start a chat session (for UI compatibility - real implementation uses SessionManager)
   *
   * NOTE: This is a minimal implementation for UI testing compatibility with mock SDK.
   * In production, the actual LLM session is created via SessionManager.startSession() in the page component.
   * This method only creates the metadata tracking structure.
   */
  async startChatSession(groupId: string, initialMessage?: string): Promise<ChatSession> {
    this.ensureNotDisposed();
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Session group not found: ${groupId}`);
    }

    const sessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();

    // Create minimal chat session metadata
    const session: ChatSession = {
      sessionId,
      groupId,
      title: initialMessage || 'New Chat',
      messages: [],
      metadata: {
        databasesUsed: group.linkedDatabases
      },
      created: now,
      updated: now,
      revision: now
    };

    // Store chat session in memory
    this.chatStorage.set(sessionId, session);
    this.knownChats.add(session);

    // Add session ID to group
    if (!group.chatSessions.includes(sessionId)) {
      group.chatSessions.push(sessionId);
      this.touch(group);

      // Initialize chatSessionsData if not exists
      if (!group.chatSessionsData) {
        group.chatSessionsData = {};
      }

      // Store session data in group for persistence
      group.chatSessionsData[sessionId] = session;

      // Persist to S5
      if (this.storage) {
        try {
          await this.persist(groupId);
          console.log(`[SessionGroupManager.startChatSession] ✅ Saved session ${sessionId} to S5`);
        } catch (error) {
          rethrowDisposal(error);
          console.error(`[SessionGroupManager.startChatSession] ❌ Failed to save to S5:`, error);
          // Don't throw - session is already in memory, S5 is best-effort
        }
      } else {
        console.warn('[SessionGroupManager.startChatSession] ⚠️  S5 storage not available, session only in memory');
      }
    }

    return session;
  }

  /**
   * Get a chat session by ID
   *
   * Loads from S5 if requestor is provided and session not in cache.
   * If requestor is not provided, only checks memory cache.
   */
  /**
   * Get multiple chat sessions in one shot.
   *
   * Optimal pattern for bulk loads: a single S5 manifest fetch (via
   * getSessionGroup) populates chatStorage with EVERY session in the group,
   * so we never need N parallel per-session fetches. Strictly better than
   * looping `getChatSession` from the consumer side, which would re-trigger
   * the cache-miss path repeatedly. Order of returned sessions matches the
   * order of `sessionIds`; missing IDs return null at the same index.
   *
   * @throws Error if any returned session's groupId disagrees with the
   *         requested groupId (defensive — would indicate cache corruption).
   */
  async getChatSessionsBulk(
    groupId: string,
    sessionIds: string[],
    requestor: string,
  ): Promise<Array<ChatSession | null>> {
    this.ensureNotDisposed();
    if (sessionIds.length === 0) return [];

    // Fast path: every requested session is already in cache.
    const cachedAll = sessionIds.every((id) => this.chatStorage.has(id));
    if (!cachedAll) {
      try {
        await this.getSessionGroup(groupId, requestor);
      } catch (err) {
        rethrowDisposal(err);
        console.error(
          '[SessionGroupManager.getChatSessionsBulk] Failed to load group from S5:',
          err,
        );
        return sessionIds.map(() => null);
      }
    }

    return sessionIds.map((id) => {
      const session = this.chatStorage.get(id);
      if (!session) return null;
      if (session.groupId !== groupId) {
        throw new Error(`Session ${id} does not belong to group ${groupId}`);
      }
      return session;
    });
  }

  async getChatSession(groupId: string, sessionId: string, requestor?: string): Promise<ChatSession | null> {
    this.ensureNotDisposed();
    // First check memory cache
    let session = this.chatStorage.get(sessionId);

    // If not in memory and requestor provided, load group from S5
    if (!session && requestor) {
      try {
        console.log(`[SessionGroupManager.getChatSession] Session ${sessionId} not in cache, loading group ${groupId} from S5...`);
        // Load group from S5 - this will populate chatStorage with all sessions
        await this.getSessionGroup(groupId, requestor);

        // Check cache again after loading
        session = this.chatStorage.get(sessionId);

        if (session) {
          console.log(`[SessionGroupManager.getChatSession] ✅ Session ${sessionId} found after loading from S5`);
        } else {
          console.warn(`[SessionGroupManager.getChatSession] ⚠️  Session ${sessionId} not found in group ${groupId} even after S5 load`);
        }
      } catch (err) {
        rethrowDisposal(err);
        console.error('[SessionGroupManager.getChatSession] Failed to load group from S5:', err);
        return null;
      }
    } else if (!session && !requestor) {
      console.log(`[SessionGroupManager.getChatSession] Session ${sessionId} not in cache and no requestor provided`);
    } else {
      console.log(`[SessionGroupManager.getChatSession] Found session ${sessionId} in memory cache`);
    }

    if (!session) {
      return null;
    }

    if (session.groupId !== groupId) {
      throw new Error(`Session ${sessionId} does not belong to group ${groupId}`);
    }

    return session;
  }

  /**
   * Add a message to a chat session
   *
   * NOTE: This is a minimal implementation for UI testing compatibility.
   * Persists the updated session to S5 storage.
   */
  async addMessage(
    groupId: string,
    sessionId: string,
    message: ChatMessage
  ): Promise<void> {
    this.ensureNotDisposed();
    if (!(await this.getChatSession(groupId, sessionId))) {
      throw new Error(`Session ${sessionId} not found in group ${groupId}`);
    }

    // The lock covers read, change and save. The session is read inside it: it may have been replaced or deleted
    // while this call waited its turn.
    await this.groupLock.withLock(groupId, async () => {
      const session = this.chatInMemory(groupId, sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found in group ${groupId}`);
      }
      session.messages.push(message);
      this.stampChat(session);
      session.updated = Date.now();
      this.chatStorage.set(sessionId, session);

      const group = this.groups.get(groupId);
      if (group) {
        group.chatSessionsData = group.chatSessionsData || {};
        group.chatSessionsData[sessionId] = session;
        this.touch(group);

        // Persist to S5
        if (this.storage) {
          try {
            await this.storage.save(group);
            console.log(`[SessionGroupManager.addMessage] ✅ Saved message to S5 for session ${sessionId}`);
          } catch (error) {
            rethrowDisposal(error);
            console.error(`[SessionGroupManager.addMessage] ❌ Failed to save to S5:`, error);
            // Don't throw - message is already in memory, S5 is best-effort
          }
        } else {
          console.warn('[SessionGroupManager.addMessage] ⚠️  S5 storage not available, message only in memory');
        }
      }
    });
  }

  /**
   * Change a stored chat: `mutate` runs on the chat as it is when this call's turn under the group's lock comes (after
   * every `addMessage` queued before it — so not at the call), then the chat's `revision` and the group are stamped
   * and the group is saved. The chat's `updated` is left to `mutate`: a rename or a pin is not activity.
   *
   * `mutate` must be synchronous — the lock is not held across a caller's await. An `async` function is refused before
   * it runs; any other function that returns a promise is refused after its synchronous part ran. What a refused or
   * throwing `mutate` changed stays in memory unsaved, and the next save of the group writes it — as does the change
   * of a call whose save failed (call again with a no-op `mutate` to save it).
   *
   * @returns the chat — the manager's own object
   * @throws SDKError INVALID_MUTATOR if `mutate` is not a synchronous function
   * @throws Error if the group or chat is not found, the requestor is not the owner, or the save fails
   */
  async updateChatSession(
    groupId: string,
    sessionId: string,
    requestor: string,
    mutate: (session: ChatSession) => void
  ): Promise<ChatSession> {
    this.ensureNotDisposed();
    const refuse = () => new SDKError('updateChatSession takes a synchronous function: the group lock is not held across an await',
      'INVALID_MUTATOR', { retryable: false });
    if (typeof mutate !== 'function' || mutate.constructor?.name === 'AsyncFunction') throw refuse();
    await this.getSessionGroup(groupId, requestor);

    return this.groupLock.withLock(groupId, async () => {
      const before = this.chatInMemory(groupId, sessionId);
      if (!before) {
        throw new Error(`Session ${sessionId} not found in group ${groupId}`);
      }
      const returned: unknown = mutate(before);
      if (returned && typeof (returned as any).then === 'function') throw refuse();
      // Read again: `mutate` may have swapped the chat object (updateSessionGroup) or changed the group.
      const session = this.chatInMemory(groupId, sessionId) ?? before;
      this.stampChat(session);
      const group = this.groups.get(groupId)!;
      this.chatStorage.set(sessionId, session);
      group.chatSessionsData = group.chatSessionsData || {};
      group.chatSessionsData[sessionId] = session;
      this.touch(group);
      if (this.storage) await this.storage.save(group);
      return session;
    });
  }

  /**
   * Delete a chat session from a group
   *
   * Removes the session from both memory and S5 storage.
   * Updates the group's session list and persists changes to S5.
   */
  async deleteChatSession(groupId: string, sessionId: string): Promise<void> {
    this.ensureNotDisposed();
    // Get the session to verify it exists
    const session = await this.getChatSession(groupId, sessionId);
    if (!session) {
      // Already deleted or doesn't exist
      console.warn(`[SessionGroupManager.deleteChatSession] Session ${sessionId} not found, skipping delete`);
      return;
    }

    // Lock covers mutation + save to prevent concurrent overwrites
    await this.groupLock.withLock(groupId, async () => {
      // Remove from memory cache
      this.chatStorage.delete(sessionId);
      console.log(`[SessionGroupManager.deleteChatSession] Removed session ${sessionId} from memory`);

      // Get group and update
      const group = this.groups.get(groupId);
      if (!group) {
        console.warn(`[SessionGroupManager.deleteChatSession] Group ${groupId} not found in memory`);
        return;
      }

      // Create a NEW group object instead of mutating the cached one
      const updatedGroup: SessionGroup = {
        ...group,
        chatSessions: group.chatSessions.filter(id => id !== sessionId),
        chatSessionsData: {
          ...(group.chatSessionsData || {}),
        },
      };
      this.touch(updatedGroup);

      // Remove session data from chatSessionsData on the NEW object
      if (updatedGroup.chatSessionsData[sessionId]) {
        delete updatedGroup.chatSessionsData[sessionId];
      }

      // Update in-memory cache with NEW reference
      this.groups.set(groupId, updatedGroup);
      console.log(`[SessionGroupManager.deleteChatSession] Updated group ${groupId} in memory`);

      // Persist to S5
      if (this.storage) {
        try {
          await this.storage.save(updatedGroup);
          console.log(`[SessionGroupManager.deleteChatSession] ✅ Persisted deletion to S5 for session ${sessionId}`);
        } catch (error) {
          rethrowDisposal(error);
          console.error(`[SessionGroupManager.deleteChatSession] ❌ Failed to save to S5:`, error);
          // Don't throw - session is already deleted from memory, S5 is best-effort
        }
      } else {
        console.warn('[SessionGroupManager.deleteChatSession] ⚠️  S5 storage not available, deletion only in memory');
      }
    });
  }

  /**
   * Generate unique ID for session group
   */
  private generateId(): string {
    return `sg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * A chat's stamp, epoch ms: the later of the `revision` this manager gives it and the `updated` its callers move — so
 * chats written before 1.39.26, and a later `addMessage` from a tab on an older SDK, still compare. Neither: the oldest.
 */
function chatStamp(session: ChatSession | null | undefined): number {
  const stamp = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : -Infinity);
  return Math.max(stamp(session?.revision), stamp(session?.updated));
}
