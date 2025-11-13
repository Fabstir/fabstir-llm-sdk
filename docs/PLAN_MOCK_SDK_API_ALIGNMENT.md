# Plan: Update Mock SDK to Match Real SDK API

**Created:** 2025-01-12
**Reviewed:** 2025-01-12 (Source code validation)
**Status:** ⚠️ CORRECTED - Ready for user review
**Goal:** Align `@fabstir/sdk-core-mock` with `@fabstir/sdk-core` API to enable seamless UI4 → UI5 migration

---

## ⚠️ CRITICAL: Plan Review Findings

**This plan has been reviewed against real SDK source code and corrected.**

**12 critical inaccuracies** were found and fixed. See detailed findings: [`/workspace/docs/PLAN_CORRECTIONS_CRITICAL.md`](/workspace/docs/PLAN_CORRECTIONS_CRITICAL.md)

**Key Corrections:**

1. ✅ `createSessionGroup` uses `CreateSessionGroupInput` object, not individual parameters
2. ✅ `description` field is **required**, not optional
3. ✅ Added missing `metadata` and `deleted` fields to SessionGroup
4. ✅ Renamed `linkDatabase` → `linkVectorDatabase` (returns SessionGroup, not void)
5. ✅ Added missing methods: `setDefaultDatabase`, `listLinkedDatabases`, `handleDatabaseDeletion`
6. ✅ **Kept** `addChatSession` and `listChatSessions` (plan incorrectly said to remove)
7. ✅ Changed `listSessionGroups` parameter from `requestor` to `owner`
8. ✅ `updateSessionGroup` uses `UpdateSessionGroupInput`, not `Partial<SessionGroup>`
9. ✅ `defaultDatabase` is optional, not required

**Recommendation:** Review corrected plan and corrections document before executing.

---

## Executive Summary

Update the mock SDK to match the real SDK's API exactly, so UI4 → UI5 migration becomes a simple dependency swap instead of a major refactor. This approach:

- ✅ Reduces migration time from 20+ hours to ~6 hours
- ✅ Reduces migration risk (fewer code changes)
- ✅ Allows UI4 to continue development with real API patterns
- ✅ Makes UI5 a simple package.json change + real dependencies (S5, wallet)

---

## Current State Analysis

### Discrepancies Found

Based on comparison between:

- **Mock SDK:** `/workspace/packages/sdk-core-mock/src/`
- **Real SDK:** `/workspace/packages/sdk-core/src/`
- **Reference Docs:** `/workspace/SDK_MOCK_VS_REAL_COMPARISON.md`

**Critical Breaking Changes:**

1. **Permission Model** (HIGHEST PRIORITY)

   - Mock: Implicit `userAddress` in constructor
   - Real: Explicit `requestor` parameter on every method
   - Impact: Every SessionGroupManager call needs update

2. **Type Structure Changes** (HIGH PRIORITY)

   - `created` → `createdAt` (number → Date)
   - `updated` → `updatedAt` (number → Date)
   - `databases` → `linkedDatabases`
   - `defaultDatabaseId` → `defaultDatabase`
   - `chatSessions: ChatSessionSummary[]` → `chatSessions: string[]`

3. **Removed Methods** (MEDIUM PRIORITY)

   - Chat methods moved to SessionManager
   - Document methods (future Phase 5)
   - Sharing methods (future Phase 5)

4. **Configuration Changes** (MEDIUM PRIORITY)
   - Mock: Simple constructor
   - Real: Complex with S5, PermissionManager, RPC config

---

## Implementation Plan

### Phase 1: Update Mock SDK Interfaces (2 hours)

**Location:** `/workspace/packages/sdk-core-mock/src/interfaces/`

#### 1.1 ISessionGroupManager Updates

**File:** `interfaces/ISessionGroupManager.ts`

**⚠️ CRITICAL:** See `/workspace/docs/PLAN_CORRECTIONS_CRITICAL.md` for detailed review findings.

```typescript
// BEFORE (Mock)
interface ISessionGroupManager {
  createSessionGroup(name: string, options?: {...}): Promise<SessionGroup>;
  listSessionGroups(): Promise<SessionGroup[]>;
  getSessionGroup(groupId: string): Promise<SessionGroup>;
  updateSessionGroup(groupId: string, updates: Partial<SessionGroup>): Promise<SessionGroup>;
  deleteSessionGroup(groupId: string): Promise<void>;
  linkDatabase(groupId: string, databaseName: string): Promise<void>;
  unlinkDatabase(groupId: string, databaseName: string): Promise<void>;
  getDefaultDatabase(groupId: string): Promise<string>;

  // Chat methods (many - will be removed/updated)
  startChatSession(groupId: string, initialMessage?: string): Promise<ChatSession>;
  getChatSession(groupId: string, sessionId: string): Promise<ChatSession>;
  listChatSessions(groupId: string, options?: {...}): Promise<ChatSession[]>;
  addMessage(groupId: string, sessionId: string, message: ChatMessage): Promise<void>;
  // ... other chat methods

  // Document methods (will be removed)
  addGroupDocument(groupId: string, document: GroupDocument): Promise<void>;
  removeGroupDocument(groupId: string, documentId: string): Promise<void>;
  listGroupDocuments(groupId: string): Promise<GroupDocument[]>;

  // Sharing methods (will be removed)
  shareGroup(groupId: string, userAddress: string, role: 'reader' | 'writer'): Promise<void>;
  unshareGroup(groupId: string, userAddress: string): Promise<void>;
  listSharedGroups(): Promise<SessionGroup[]>;
  getGroupPermissions(groupId: string): Promise<{...}>;
}

// AFTER (Real SDK - CORRECTED)
interface ISessionGroupManager {
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

  // Chat session management (KEEP THESE - they exist in real SDK!)
  addChatSession(groupId: string, requestor: string, sessionId: string): Promise<SessionGroup>;
  listChatSessions(groupId: string, requestor: string): Promise<string[]>;

  // Removed from mock:
  // - All detailed chat methods (startChatSession, getChatSession, addMessage, etc.)
  // - All document methods (addGroupDocument, removeGroupDocument, listGroupDocuments)
  // - All sharing methods (shareGroup, unshareGroup, listSharedGroups, getGroupPermissions)
}

// New input types (required by real SDK)
interface CreateSessionGroupInput {
  name: string;
  description: string;        // REQUIRED in real SDK!
  owner: string;
  metadata?: Record<string, any>;
}

interface UpdateSessionGroupInput {
  name?: string;
  description?: string;
  metadata?: Record<string, any>;
  // Cannot update: owner, linkedDatabases, defaultDatabase, chatSessions, etc.
}

interface VectorDatabaseMetadata {
  id: string;
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
```

**Key Corrections from Review:**

1. ✅ `createSessionGroup` uses `CreateSessionGroupInput` object, not individual parameters
2. ✅ `listSessionGroups` parameter is `owner`, not `requestor`
3. ✅ `updateSessionGroup` uses `UpdateSessionGroupInput`, not `Partial<SessionGroup>`
4. ✅ Database methods renamed: `linkVectorDatabase` / `unlinkVectorDatabase`
5. ✅ Database methods return `SessionGroup`, not `void`
6. ✅ Added `setDefaultDatabase` (was missing)
7. ✅ Added `listLinkedDatabases` (was missing)
8. ✅ Added `handleDatabaseDeletion` (was missing)
9. ✅ **Kept** `addChatSession` and `listChatSessions` (plan incorrectly said to remove)
10. ✅ Removed detailed chat methods (startChatSession, getChatSession, etc.)
11. ✅ Removed all document methods
12. ✅ Removed all sharing methods

#### 1.2 Type Updates

**File:** `types/index.ts`

**⚠️ CRITICAL:** See correction issues #2 (description required), #3 (missing fields), #9 (UpdateSessionGroupInput).

```typescript
// BEFORE (Mock)
interface SessionGroup {
  id: string;
  name: string;
  description?: string; // ← Change to required string
  databases: string[]; // ← Change to linkedDatabases
  defaultDatabaseId: string; // ← Change to defaultDatabase (optional!)
  chatSessions: ChatSessionSummary[]; // ← Change to string[]
  groupDocuments: GroupDocument[]; // ← Remove (use DocumentManager)
  owner: string;
  created: number; // ← Change to createdAt: Date
  updated: number; // ← Change to updatedAt: Date
  permissions?: {
    // ← Remove (use PermissionManager)
    readers?: string[];
    writers?: string[];
  };
  // MISSING: metadata, deleted
}

// AFTER (Real SDK - CORRECTED)
interface SessionGroup {
  id: string;
  name: string;
  description: string; // ← REQUIRED (not optional!)
  createdAt: Date; // ← Date object (not number)
  updatedAt: Date; // ← Date object (not number)
  owner: string;
  linkedDatabases: string[]; // ← Renamed from databases
  defaultDatabase?: string; // ← OPTIONAL (not required!) Renamed from defaultDatabaseId
  chatSessions: string[]; // ← Just IDs (not ChatSessionSummary[])
  metadata: Record<string, any>; // ← ADDED (was missing in plan!)
  deleted: boolean; // ← ADDED (was missing in plan!)
  // Removed: groupDocuments (use DocumentManager)
  // Removed: permissions (use PermissionManager)
}

// REMOVED TYPES (no longer in real SDK)
interface ChatSessionSummary {
  sessionId: string;
  title: string;
  timestamp: number;
  messageCount: number;
  active: boolean;
  lastMessage?: string;
}

interface GroupDocument {
  id: string;
  name: string;
  size: number;
  uploaded: number;
  contentType?: string;
}

// ADDED TYPES (required by real SDK)
interface CreateSessionGroupInput {
  name: string;
  description: string; // REQUIRED!
  owner: string;
  metadata?: Record<string, any>;
}

interface UpdateSessionGroupInput {
  name?: string;
  description?: string;
  metadata?: Record<string, any>;
  // Note: Cannot update owner, linkedDatabases, defaultDatabase, chatSessions
}

interface VectorDatabaseMetadata {
  id: string;
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
```

**Key Corrections from Review:**

1. ✅ `description` is **required**, not optional (Issue #2)
2. ✅ Added `metadata: Record<string, any>` field (Issue #3)
3. ✅ Added `deleted: boolean` field (Issue #3)
4. ✅ `defaultDatabase` is **optional**, not required
5. ✅ `linkedDatabases` renamed from `databases`
6. ✅ `chatSessions` is `string[]` not `ChatSessionSummary[]`
7. ✅ `createdAt` / `updatedAt` are `Date` objects, not `number`
8. ✅ Removed `groupDocuments` field (use DocumentManager)
9. ✅ Removed `permissions` field (use PermissionManager)
10. ✅ Added `CreateSessionGroupInput` type (Issue #1)
11. ✅ Added `UpdateSessionGroupInput` type (Issue #9)
12. ✅ Added `VectorDatabaseMetadata` type (Issue #6)

---

### Phase 2: Update Mock Implementation (2 hours)

**Location:** `/workspace/packages/sdk-core-mock/src/managers/`

#### 2.1 SessionGroupManager.mock.ts

**Changes Required:**

1. **Add `requestor` parameter to all methods:**

```typescript
// BEFORE
async createSessionGroup(name: string, options?: {...}): Promise<SessionGroup> {
  const group: SessionGroup = {
    id: this.generateId('group'),
    name,
    owner: this.userAddress,  // ← Implicit from constructor
    // ...
  };
}

// AFTER
async createSessionGroup(name: string, requestor: string, options?: {...}): Promise<SessionGroup> {
  const group: SessionGroup = {
    id: this.generateId('group'),
    name,
    owner: requestor,  // ← Explicit from parameter
    // ...
  };
}
```

2. **Update field names:**

```typescript
// BEFORE
const group: SessionGroup = {
  created: Date.now(),
  updated: Date.now(),
  databases: [],
  defaultDatabaseId: this.generateId("default-db"),
  chatSessions: [], // ChatSessionSummary[]
};

// AFTER
const group: SessionGroup = {
  createdAt: new Date(),
  updatedAt: new Date(),
  linkedDatabases: [],
  defaultDatabase: this.generateId("default-db"),
  chatSessions: [], // string[] (just IDs)
};
```

3. **Remove methods:**

   - `startChatSession()` - use SessionManager.startSession()
   - `getChatSession()` - use SessionManager.getSession()
   - `addMessage()` - use SessionManager.sendMessage()
   - `addGroupDocument()` - wait for DocumentManager
   - `removeGroupDocument()` - wait for DocumentManager
   - `shareGroup()` - wait for PermissionManager
   - `unshareGroup()` - wait for PermissionManager

4. **Update internal storage:**

```typescript
// BEFORE
group.chatSessions.push({
  sessionId: session.sessionId,
  title: session.title,
  timestamp: session.created,
  messageCount: session.messages.length,
  active: true,
  lastMessage: initialMessage,
});

// AFTER
group.chatSessions.push(session.sessionId); // Just the ID
```

#### 2.2 MockStorage.ts Updates

**Handle Date objects:**

```typescript
// BEFORE
set<T>(key: string, value: T): void {
  localStorage.setItem(`${this.prefix}:${key}`, JSON.stringify(value));
}

// AFTER
set<T>(key: string, value: T): void {
  const serialized = JSON.stringify(value, (key, val) => {
    // Convert Date objects to ISO strings
    if (val instanceof Date) {
      return { __type: 'Date', value: val.toISOString() };
    }
    return val;
  });
  localStorage.setItem(`${this.prefix}:${key}`, serialized);
}

get<T>(key: string): T | null {
  const item = localStorage.getItem(`${this.prefix}:${key}`);
  if (!item) return null;

  return JSON.parse(item, (key, val) => {
    // Convert ISO strings back to Date objects
    if (val && val.__type === 'Date') {
      return new Date(val.value);
    }
    return val;
  });
}
```

---

### Phase 3: Update UI4 Code (2 hours)

**Location:** `/workspace/apps/ui4/`

#### 3.1 Hook Updates

**File:** `hooks/use-session-groups.ts`

```typescript
// BEFORE
const groups = await sessionGroupManager.listSessionGroups();
const group = await sessionGroupManager.getSessionGroup(groupId);
await sessionGroupManager.createSessionGroup(name, { description });

// AFTER
const userAddress = wallet.address; // Get from wallet context
const groups = await sessionGroupManager.listSessionGroups(userAddress);
const group = await sessionGroupManager.getSessionGroup(groupId, userAddress);
await sessionGroupManager.createSessionGroup(name, userAddress, {
  description,
});
```

#### 3.2 Component Updates

**Files to update (~20 files):**

- `app/session-groups/page.tsx`
- `app/session-groups/[id]/page.tsx`
- `app/session-groups/[id]/settings/page.tsx`
- `app/session-groups/new/page.tsx`
- `components/session-groups/*.tsx`

**Pattern:**

```typescript
// BEFORE
{selectedGroup.created}
{selectedGroup.databases.map(...)}
{selectedGroup.chatSessions.map(session => (
  <div key={session.sessionId}>
    <h3>{session.title}</h3>
    <p>{session.messageCount} messages</p>
  </div>
))}

// AFTER
{selectedGroup.createdAt.toISOString()}
{selectedGroup.linkedDatabases.map(...)}
{selectedGroup.chatSessions.map(sessionId => {
  // Need to fetch full session data from SessionManager
  const session = await sessionManager.getSession(sessionId);
  return (
    <div key={sessionId}>
      <h3>{session.title}</h3>
      <p>{session.messages.length} messages</p>
    </div>
  );
})}
```

#### 3.3 Chat Operation Migration

**Move from SessionGroupManager to SessionManager:**

```typescript
// BEFORE (SessionGroupManager)
const session = await sessionGroupManager.startChatSession(
  groupId,
  initialMessage
);
const chat = await sessionGroupManager.getChatSession(groupId, sessionId);
await sessionGroupManager.addMessage(groupId, sessionId, message);

// AFTER (SessionManager)
const session = await sessionManager.startSession({
  groupId,
  initialMessage,
  hostUrl: "http://localhost:8080",
  modelName: "llama-3",
});
const chat = await sessionManager.getSession(sessionId);
await sessionManager.sendMessage(sessionId, message);
```

**Files affected:**

- `app/session-groups/[id]/[sessionId]/page.tsx`
- `components/chat/ChatInterface.tsx`
- `hooks/use-session-groups.ts` (if it handles chat)

---

### Phase 4: Testing & Validation (1 hour)

#### 4.1 Unit Tests

**Create:** `packages/sdk-core-mock/tests/SessionGroupManager.test.ts`

```typescript
import { SessionGroupManagerMock } from "../src/managers/SessionGroupManager.mock";

describe("SessionGroupManager Mock - API Compatibility", () => {
  let manager: SessionGroupManagerMock;
  const userAddress = "0x1234567890ABCDEF1234567890ABCDEF12345678";

  beforeEach(() => {
    localStorage.clear();
    manager = new SessionGroupManagerMock(userAddress);
  });

  test("createSessionGroup requires requestor parameter", async () => {
    const group = await manager.createSessionGroup("Test Group", userAddress);
    expect(group.owner).toBe(userAddress);
    expect(group.createdAt).toBeInstanceOf(Date);
    expect(group.linkedDatabases).toEqual([]);
  });

  test("listSessionGroups requires requestor parameter", async () => {
    await manager.createSessionGroup("Group 1", userAddress);
    const groups = await manager.listSessionGroups(userAddress);
    expect(groups.length).toBe(1);
  });

  test("chatSessions are stored as IDs only", async () => {
    const group = await manager.createSessionGroup("Test", userAddress);
    expect(Array.isArray(group.chatSessions)).toBe(true);
    expect(typeof group.chatSessions[0]).toBe("string"); // Just ID
  });

  test("Date fields are Date objects", async () => {
    const group = await manager.createSessionGroup("Test", userAddress);
    expect(group.createdAt).toBeInstanceOf(Date);
    expect(group.updatedAt).toBeInstanceOf(Date);
  });
});
```

#### 4.2 UI4 Integration Testing

**Manual Testing Checklist:**

- [ ] Session Groups page loads without errors
- [ ] Can create new session group
- [ ] Can list all session groups
- [ ] Can view session group details
- [ ] Can update session group settings
- [ ] Can delete session group
- [ ] Can link/unlink databases
- [ ] Chat sessions display correctly (fetched from SessionManager)
- [ ] Date fields display correctly
- [ ] No console errors related to missing fields

#### 4.3 Backwards Compatibility

**Migration strategy for existing localStorage data:**

```typescript
// In SessionGroupManager.mock.ts constructor
constructor(userAddress: string) {
  this.userAddress = userAddress;
  this.storage = new MockStorage(`session-groups-${userAddress}`);

  // Migrate old data format to new format
  this.migrateOldData();
}

private migrateOldData(): void {
  const groups = this.storage.getAll<any>();

  groups.forEach(group => {
    let updated = false;

    // Migrate field names
    if (group.created !== undefined) {
      group.createdAt = new Date(group.created);
      delete group.created;
      updated = true;
    }
    if (group.updated !== undefined) {
      group.updatedAt = new Date(group.updated);
      delete group.updated;
      updated = true;
    }
    if (group.databases !== undefined) {
      group.linkedDatabases = group.databases;
      delete group.databases;
      updated = true;
    }
    if (group.defaultDatabaseId !== undefined) {
      group.defaultDatabase = group.defaultDatabaseId;
      delete group.defaultDatabaseId;
      updated = true;
    }

    // Migrate chatSessions from objects to IDs
    if (group.chatSessions && group.chatSessions.length > 0) {
      if (typeof group.chatSessions[0] === 'object') {
        group.chatSessions = group.chatSessions.map((s: any) => s.sessionId);
        updated = true;
      }
    }

    if (updated) {
      this.storage.set(group.id, group);
      console.log('[Mock] Migrated session group:', group.id);
    }
  });
}
```

---

## File Changes Summary

### Mock SDK Changes

**Modified Files:**

- `/workspace/packages/sdk-core-mock/src/interfaces/ISessionGroupManager.ts`
- `/workspace/packages/sdk-core-mock/src/types/index.ts`
- `/workspace/packages/sdk-core-mock/src/managers/SessionGroupManager.mock.ts`
- `/workspace/packages/sdk-core-mock/src/storage/MockStorage.ts`

**Removed Types:**

- `ChatSessionSummary` (no longer used)

**Removed Methods:**

- `startChatSession()` → use SessionManager
- `getChatSession()` → use SessionManager
- `addMessage()` → use SessionManager
- `addGroupDocument()` → future DocumentManager
- `removeGroupDocument()` → future DocumentManager
- `shareGroup()` → future PermissionManager
- `unshareGroup()` → future PermissionManager

### UI4 Changes

**Hooks:**

- `/workspace/apps/ui4/hooks/use-session-groups.ts` (add userAddress param)
- `/workspace/apps/ui4/hooks/use-wallet.ts` (ensure address is available)

**Pages:**

- `/workspace/apps/ui4/app/session-groups/page.tsx`
- `/workspace/apps/ui4/app/session-groups/[id]/page.tsx`
- `/workspace/apps/ui4/app/session-groups/[id]/settings/page.tsx`
- `/workspace/apps/ui4/app/session-groups/[id]/[sessionId]/page.tsx`
- `/workspace/apps/ui4/app/session-groups/new/page.tsx`

**Components:**

- `/workspace/apps/ui4/components/session-groups/*.tsx` (all)
- `/workspace/apps/ui4/components/chat/ChatInterface.tsx`

**Estimated Files:** ~25-30 files

---

## Implementation Timeline

### Week 1: Mock SDK Updates

- **Day 1-2:** Update interfaces and types (Phase 1)
- **Day 3-4:** Update mock implementations (Phase 2)
- **Day 5:** Write unit tests, rebuild package

### Week 2: UI4 Updates

- **Day 1-2:** Update hooks and core components (Phase 3.1-3.2)
- **Day 3:** Migrate chat operations (Phase 3.3)
- **Day 4:** Integration testing (Phase 4)
- **Day 5:** Bug fixes and validation

**Total Time:** 10 days (2 weeks) or ~6 hours focused work

---

## Success Criteria

### Mock SDK

- ✅ All interface methods match real SDK exactly
- ✅ All type structures match real SDK exactly
- ✅ No methods exist in mock that don't exist in real SDK
- ✅ Unit tests pass (100% coverage for public API)
- ✅ Package builds without errors

### UI4

- ✅ All pages load without errors
- ✅ All CRUD operations work (Create, Read, Update, Delete)
- ✅ Chat functionality works (via SessionManager)
- ✅ No TypeScript errors
- ✅ No console errors
- ✅ Existing localStorage data migrates successfully

### UI5 Migration Readiness

- ✅ UI4 code is compatible with real SDK API
- ✅ Migration = change package.json + add config
- ✅ No refactoring needed for UI5

---

## Risk Mitigation

### Risk 1: Breaking UI4 during mock updates

**Mitigation:**

- Update mock SDK first, test in isolation
- Update UI4 incrementally (one page at a time)
- Keep UI4 on old mock until fully tested
- Use feature branch for all changes

### Risk 2: Missing real SDK features

**Mitigation:**

- Reference `/workspace/SDK_MOCK_VS_REAL_COMPARISON.md`
- Read real SDK source code directly
- Test against real SDK interfaces

### Risk 3: Data migration failures

**Mitigation:**

- Implement automatic migration in constructor
- Log all migrations
- Provide fallback to old format if migration fails
- Test with real user data (export from UI4)

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Create feature branch:** `feature/align-mock-sdk-api`
3. **Start Phase 1:** Update mock SDK interfaces
4. **Validate incrementally:** Test after each phase
5. **Document decisions:** Update this plan as we progress

---

## References

- **Comparison Report:** `/workspace/SDK_MOCK_VS_REAL_COMPARISON.md`
- **Mock SDK Source:** `/workspace/packages/sdk-core-mock/src/`
- **Real SDK Source:** `/workspace/packages/sdk-core/src/`
- **UI4 Source:** `/workspace/apps/ui4/`

---

**Last Updated:** 2025-11-12
**Status:** Ready for execution
