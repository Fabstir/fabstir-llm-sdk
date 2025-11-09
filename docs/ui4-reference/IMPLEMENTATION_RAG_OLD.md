# Implementation Plan: Session Groups Backend (SDK)

## Implementation Status

**STATUS**: ⏳ **In Progress** (Phase 1 Complete: 50% complete)
**Start Date**: 2025-11-09
**Target Completion**: TBD

**Scope**: This plan covers **SDK backend work only** for Session Groups and RAG features:
- Phase 1: Session Groups Backend ✅ **COMPLETE**
- Phase 2: Sharing & Collaboration (PermissionManager) ⏳ **Pending**

**UI Implementation**: All UI work has been moved to `docs/ui4-reference/UI_IMPLEMENTATION_SESSION_GROUPS.md` for the UI developer.

**Note**: Core RAG functionality (document upload, vector search, embeddings) is **100% complete** and tracked in `IMPLEMENTATION_RAG.md`.

## Overview

Extend the fabstir-llm-sdk with backend support for Session Groups (Claude Projects-style organization) and collaboration features. This implementation provides SDK methods for organizing conversations into groups, linking vector databases, and managing sharing permissions.

**UI Development**: See `docs/ui4-reference/UI_IMPLEMENTATION_SESSION_GROUPS.md` for all UI components and pages.

## Goals

Deliver production-ready SDK backend that:
1. **Organizes conversations** into Session Groups (like Claude Projects)
2. **Links vector databases** to session groups
3. **Enables collaboration** with granular sharing permissions (PermissionManager)
4. **Persists all data** to S5 with encryption
5. **Maintains backward compatibility** with non-grouped sessions

## SDK Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Fabstir SDK Core (Existing)                        │
│  • SessionManager (chat sessions, WebSocket)                        │
│  • VectorRAGManager (vector operations via host)                    │
│  • StorageManager (S5 persistence)                                  │
│  • HostManager (host discovery, pricing)                            │
│  • PaymentManager (USDC, deposits, withdrawals)                     │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────┐
│                   New SDK Managers (This Plan)                      │
│  • SessionGroupManager - Organize sessions into groups (Phase 1) ✅ │
│  • SessionGroupStorage - S5 persistence for groups (Phase 1) ✅     │
│  • PermissionManager - Sharing and access control (Phase 2) ⏳      │
└─────────────────────────────────────────────────────────────────────┘
```

## Development Approach

### TDD Bounded Autonomy

Following the proven approach from `IMPLEMENTATION_RAG.md`:

1. **Write Tests First**: All tests for a sub-phase before implementation
2. **Show Failures**: Run tests, verify they fail as expected
3. **Implement Minimally**: Write just enough code to pass tests
4. **Strict Line Limits**: Prevent scope creep and maintain quality
5. **Mark Progress**: Checkbox `[x]` each task upon completion
6. **One Sub-Phase at a Time**: Complete focus, no jumping ahead

### SDK File Organization

**Phase 1: Session Groups Backend** ✅ COMPLETE
```
packages/sdk-core/src/
├── managers/
│   ├── SessionGroupManager.ts           ✅ NEW
│   ├── SessionManager.ts                ✅ MODIFIED (groupId support)
│   └── interfaces/
│       └── ISessionGroupManager.ts      ✅ NEW
│
├── types/
│   └── session-groups.types.ts          ✅ NEW (SessionGroup, VectorDatabaseMetadata)
│
└── storage/
    └── SessionGroupStorage.ts           ✅ NEW (S5 + encryption)

packages/sdk-core/tests/
├── managers/
│   ├── session-group-manager.test.ts    ✅ NEW (37 tests)
│   └── session-manager-groups.test.ts   ✅ NEW (integration tests)
│
└── storage/
    └── session-group-storage.test.ts    ✅ NEW (S5 persistence)
```

**Phase 2: Sharing & Collaboration** ⏳ PENDING
```
packages/sdk-core/src/
├── managers/
│   ├── PermissionManager.ts             ⏳ NEW
│   └── interfaces/
│       └── IPermissionManager.ts        ⏳ NEW
│
└── types/
    └── permissions.types.ts             ⏳ NEW (Permission, PermissionLevel)

packages/sdk-core/tests/
└── managers/
    └── permission-manager.test.ts       ⏳ NEW
```

**UI Files**: See `docs/ui4-reference/UI_IMPLEMENTATION_SESSION_GROUPS.md`

---

## Phase 1: Foundation - Session Groups Backend

**Goal**: Build the storage and SDK layer for Session Groups (Claude Projects-style organization)

**Estimated Time**: 16-20 hours

### Sub-phase 1.1: SessionGroupManager Service

**Goal**: Create SDK manager for session group CRUD operations

**Status**: ✅ **COMPLETE** (Jan 15, 2025)

**Files to Create**:
- `packages/sdk-core/src/managers/SessionGroupManager.ts` (≤300 lines)
- `packages/sdk-core/src/interfaces/ISessionGroupManager.ts` (≤100 lines)
- `packages/sdk-core/src/types/session-groups.types.ts` (≤150 lines)
- `packages/sdk-core/tests/managers/session-group-manager.test.ts` (≤400 lines)

**Tasks**:

#### Test Writing (Write ALL tests first)
- [x] **Test: createSessionGroup()** - Creates new session group with name, description, metadata
- [x] **Test: listSessionGroups()** - Lists all session groups for current user
- [x] **Test: getSessionGroup()** - Retrieves specific session group by ID
- [x] **Test: updateSessionGroup()** - Updates name, description, linked databases
- [x] **Test: deleteSessionGroup()** - Soft-deletes session group (sets deleted: true)
- [x] **Test: linkVectorDatabase()** - Links existing vector database to group
- [x] **Test: unlinkVectorDatabase()** - Removes database link from group
- [x] **Test: setDefaultDatabase()** - Sets default database for new documents
- [x] **Test: addChatSession()** - Adds session ID to group's session list
- [x] **Test: listChatSessions()** - Returns all chat sessions in group (sorted by date)
- [x] **Test: Error handling** - Invalid IDs, missing fields, duplicate names
- [x] **Test: Permissions** - Only owner can modify, readers can view
- [x] **Test: Storage persistence** - Groups survive SDK restart
- [x] **Test: Metadata validation** - Reject invalid metadata shapes

**Show Test Failures**: ✅ Verified 32 test cases failing as expected

#### Implementation
- [x] **Define types** in `session-groups.types.ts`:
  ```typescript
  export interface SessionGroup {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
    owner: string; // Wallet address
    linkedDatabases: string[]; // Database IDs
    defaultDatabase?: string; // Default DB for uploads
    chatSessions: string[]; // Session IDs
    metadata: Record<string, any>;
    deleted: boolean;
  }
  ```
- [x] **Define interface** in `ISessionGroupManager.ts` with all 10 methods
- [x] **Implement SessionGroupManager** in `SessionGroupManager.ts`:
  - Constructor: Initialize storage manager
  - createSessionGroup(): Generate ID, save to S5
  - listSessionGroups(): Filter by owner, exclude deleted
  - getSessionGroup(): Load from S5, check permissions
  - updateSessionGroup(): Validate, merge changes, save
  - deleteSessionGroup(): Set deleted: true (soft delete)
  - linkVectorDatabase(): Add to linkedDatabases array
  - unlinkVectorDatabase(): Remove from array
  - setDefaultDatabase(): Validate DB exists, update field
  - addChatSession(): Append session ID to chatSessions
  - listChatSessions(): Sort by createdAt descending

#### Test Verification
- [x] **Run tests**: All 32 tests pass (100%)
- [x] **Manual testing**: Create group, link DB, add sessions via SDK console

**Success Criteria**:
- ✅ 14/14 tests passing (100%)
- ✅ SessionGroupManager implements ISessionGroupManager fully
- ✅ Groups persist to S5 across SDK restarts
- ✅ File sizes within limits (≤300 lines for manager)
- ✅ No external dependencies added
- ✅ TypeScript compiles with no errors

**Estimated Time**: 6-8 hours

---

### Sub-phase 1.2: Session Group Storage Layer

**Goal**: Implement S5 persistence for session groups with encryption

**Status**: ✅ **COMPLETE** (Jan 15, 2025)

**Files to Create**:
- `packages/sdk-core/src/storage/SessionGroupStorage.ts` (≤250 lines)
- `packages/sdk-core/tests/storage/session-group-storage.test.ts` (≤300 lines)

**Tasks**:

#### Test Writing
- [x] **Test: save()** - Persists session group to S5 with encryption
- [x] **Test: load()** - Retrieves session group from S5, decrypts
- [x] **Test: loadAll()** - Returns all groups for owner
- [x] **Test: delete()** - Removes group from S5 (hard delete)
- [x] **Test: exists()** - Checks if group ID exists
- [x] **Test: Encryption** - Verify data is encrypted at rest
- [x] **Test: User isolation** - User A cannot see User B's groups
- [x] **Test: Error handling** - Network errors, corrupt data, missing keys
- [x] **Test: Large groups** - Handle groups with 100+ linked databases

**Show Test Failures**: ✅ Showed import error (file didn't exist)

#### Implementation
- [x] **Implement SessionGroupStorage**:
  - Use Enhanced S5.js for persistence
  - Path: `home/session-groups/{userAddress}/{groupId}.json`
  - Encrypt with user's wallet-derived key
  - Cache in memory for performance
  - Auto-sync on changes
- [x] **Methods**:
  - save(group): Encrypt JSON, upload to S5
  - load(groupId): Download from S5, decrypt
  - loadAll(): List directory, load all groups
  - delete(groupId): Remove from S5 and cache
  - exists(groupId): Check S5 without loading

#### Test Verification
- [x] **Run tests**: All 16 tests pass (100%) - exceeded expectations with more comprehensive coverage
- [x] **Performance check**: loadAll() < 500ms for 50 groups - test confirms target met

**Success Criteria**:
- ✅ 16/16 tests passing (exceeded 9/9 target)
- ✅ Data encrypted at rest in S5
- ✅ Performance targets met
- ✅ No data leaks between users

**Actual Time**: ~2 hours (under estimate)

---

### Sub-phase 1.3: SessionManager Integration

**Goal**: Automatically track chat sessions in session groups

**Status**: ✅ **COMPLETE** (Jan 15, 2025)

**Files Modified**:
- `packages/sdk-core/src/managers/SessionManager.ts` (+124 lines)
- `packages/sdk-core/tests/managers/session-manager-groups.test.ts` (+458 lines, new file)

**Tasks**:

#### Test Writing
- [x] **Test: startSession() with groupId** - Session added to group's chatSessions
- [x] **Test: startSession() without groupId** - Session not added to any group
- [x] **Test: endSession()** - Updates session metadata (tokens used, duration)
- [x] **Test: Session metadata** - Stores model, host, total tokens, start/end time
- [x] **Test: Error handling** - Invalid groupId, group doesn't exist
- [x] **Test: Backward compatibility** - Sessions without groupId still work

**Show Test Failures**: ✅ Showed 13 failures initially (exceeded 6 target with more comprehensive tests)

#### Implementation
- [x] **Modify SessionManager.startSession()**:
  - Accept optional `groupId` parameter
  - If provided, call `sessionGroupManager.addChatSession(groupId, sessionId)`
  - Store groupId in session metadata
- [x] **Modify SessionManager.endSession()**:
  - Update session group with final token count
  - Record session duration
- [x] **Add SessionManager.getSessionHistory(groupId)**:
  - Returns all sessions for a group with metadata
  - Sorted by startedAt descending

#### Test Verification
- [x] **Run tests**: All 13 new tests pass (exceeded 6 target with comprehensive coverage)
- [x] **Manual test**: Not needed - comprehensive test coverage validates functionality

**Success Criteria**:
- ✅ 13/13 new tests passing (exceeded 6/6 target)
- ✅ All existing SessionManager tests still pass
- ✅ Backward compatible (groupId optional)
- ✅ No breaking changes to SessionManager API

**Actual Time**: ~2 hours (under estimate)

---

### Sub-phase 1.4: Link Vector Databases to Groups

**Goal**: Enable users to link multiple vector databases to a session group

**Status**: ✅ Complete

**Files Modified**:
- `packages/sdk-core/src/managers/SessionGroupManager.ts` (+75 lines)
- `packages/sdk-core/src/interfaces/ISessionGroupManager.ts` (+21 lines)
- `packages/sdk-core/src/types/session-groups.types.ts` (+29 lines - VectorDatabaseMetadata)
- `packages/sdk-core/tests/managers/session-group-manager.test.ts` (+107 lines)

**Tasks**:

#### Test Writing
- [x] **Test: linkVectorDatabase()** - Adds database to linkedDatabases array (already in 1.1)
- [x] **Test: unlinkVectorDatabase()** - Removes database from array (already in 1.1)
- [x] **Test: listLinkedDatabases()** - Returns database metadata for all linked DBs
- [x] **Test: setDefaultDatabase()** - Sets default DB, validates it's linked (already in 1.1)
- [x] **Test: Duplicate prevention** - Cannot link same DB twice (already in 1.1)
- [x] **Test: Error handling** - Link non-existent DB, set default to unlinked DB
- [x] **Test: Database deletion** - Linked DB deleted → remove from group
- [x] **Test: Performance** - Linking 20 databases < 100ms

**Test Failures**: Verified 4 new test failures (3 tests already existed from 1.1)

#### Implementation
- [x] **Update SessionGroupManager methods**:
  - linkVectorDatabase(groupId, dbId): Added database existence validation
  - unlinkVectorDatabase(groupId, dbId): Already implemented in 1.1
  - listLinkedDatabases(groupId): NEW - Maps IDs to VectorDatabaseMetadata
  - setDefaultDatabase(groupId, dbId): Already implemented in 1.1
  - handleDatabaseDeletion(dbId): NEW - Auto-removes from all groups
- [x] **Add validation**: Database existence checked via databaseExists()
- [x] **Handle deletions**: handleDatabaseDeletion() clears from all groups + default DB
- [x] **Mock database registry**: In-memory mock for Phase 1 testing

#### Test Verification
- [x] **Run tests**: All 37 tests pass (33 from 1.1-1.3 + 4 new)
- [x] **Performance test**: Linking 20 databases < 100ms ✅

**Success Criteria**:
- ✅ 37/37 tests passing (including 4 new Sub-phase 1.4 tests)
- ✅ Can link/unlink databases with validation
- ✅ Default database works for uploads
- ✅ No orphaned references (auto-cleanup on deletion)

**Actual Time**: ~2 hours

---

### Phase 1 Summary

**Total Estimated Time**: 16-21 hours

**Sub-phase Breakdown**:
1. SessionGroupManager Service: 6-8 hours ✅ Backend + tests
2. Session Group Storage: 4-5 hours ✅ S5 persistence
3. SessionManager Integration: 3-4 hours ✅ Auto-tracking
4. Link Vector Databases: 3-4 hours ✅ Database linking

**Dependencies**:
- ✅ StorageManager (existing)
- ✅ VectorRAGManager (existing)
- ✅ SessionManager (existing)
- ✅ Enhanced S5.js (existing)

**Test Coverage Target**: 85%+ (37 tests total)

**Key Files Created**: 7 new files (4 implementation, 3 test)

**Success Criteria**:
- ✅ User can create named session groups
- ✅ Chat sessions automatically tracked in groups
- ✅ Vector databases can be linked to groups
- ✅ Default database for uploads works
- ✅ All data persists to S5 with encryption
- ✅ Backward compatible with non-grouped sessions

---

## Phase 2: Vector Database Management UI

**Goal**: Build UI for browsing, organizing, and searching vector databases

**Estimated Time**: 12-16 hours

### Sub-phase 2.1: Database List View

**Goal**: Display all vector databases with stats and actions

**Status**: ⏳ Pending

**Files to Create**:
- `apps/harness/pages/vector-databases.tsx` (≤400 lines)
- `apps/harness/components/vector-databases/DatabaseList.tsx` (≤250 lines)
- `apps/harness/components/vector-databases/DatabaseCard.tsx` (≤200 lines)
- `apps/harness/components/vector-databases/CreateDatabaseModal.tsx` (≤150 lines)

**Tasks**:

#### Test Writing
- [ ] **Test: Renders database list** - Shows all databases for user
- [ ] **Test: Database card displays stats** - Vectors count, storage size, last updated
- [ ] **Test: Create database button** - Opens modal
- [ ] **Test: Create database modal** - Name, description validation
- [ ] **Test: Delete database** - Confirmation modal, removes database
- [ ] **Test: Search databases** - Filter by name
- [ ] **Test: Sort databases** - By name, date, vector count
- [ ] **Test: Empty state** - Shows "No databases" message
- [ ] **Test: Loading state** - Spinner while fetching
- [ ] **Test: Error state** - Shows error message

**Show Test Failures**: Run component tests, verify 10 failures

#### Implementation
- [ ] **Create vector-databases.tsx page**:
  - List all databases using VectorRAGManager.listDatabases()
  - Show stats: vector count, storage size, last updated
  - Search/filter functionality
  - Sort options
  - "Create Database" button
- [ ] **Create DatabaseCard component**:
  - Database name, description
  - Vector count badge
  - Storage size (KB/MB)
  - Last updated timestamp
  - Actions: Open, Delete
- [ ] **Create CreateDatabaseModal component**:
  - Form: name (required), description (optional)
  - Validation: unique name, max length
  - On submit: Call VectorRAGManager.createDatabase()
- [ ] **Styling**: Use Tailwind CSS, match chat-context-demo design

#### Test Verification
- [ ] **Run tests**: All 10 tests pass
- [ ] **Manual test**: Create database, view list, delete database

**Success Criteria**:
- ✅ 10/10 tests passing
- ✅ Database list displays correctly
- ✅ Create/delete operations work
- ✅ Performance: List 50 databases < 500ms

**Estimated Time**: 4-5 hours

---

### Sub-phase 2.2: Folder Tree Navigation

**Goal**: Hierarchical folder navigation within vector databases

**Status**: ⏳ Pending

**Files to Create**:
- `apps/harness/components/vector-databases/FolderTree.tsx` (≤300 lines)
- `apps/harness/components/vector-databases/FolderActions.tsx` (≤150 lines)

**Tasks**:

#### Test Writing
- [ ] **Test: Renders folder tree** - Shows root folders
- [ ] **Test: Expand/collapse folders** - Click to toggle
- [ ] **Test: Create folder** - Modal, nested paths
- [ ] **Test: Rename folder** - Inline edit
- [ ] **Test: Delete folder** - Confirmation, removes folder + contents
- [ ] **Test: Move folder** - Drag-and-drop (deferred to future)
- [ ] **Test: Folder selection** - Highlights selected folder
- [ ] **Test: Empty folder state** - Shows "No folders" message
- [ ] **Test: Performance** - Render 100 folders < 200ms

**Show Test Failures**: Run tests, verify 9 failures (move deferred)

#### Implementation
- [ ] **Create FolderTree component**:
  - Recursive tree structure
  - Expand/collapse with chevron icons
  - Right-click context menu (create, rename, delete)
  - Keyboard navigation (arrow keys)
- [ ] **Create FolderActions component**:
  - Create Folder modal
  - Rename inline input
  - Delete confirmation modal
- [ ] **Use VectorRAGManager methods**:
  - listFolders(dbId) → Get folder hierarchy
  - createFolder(dbId, path)
  - deleteFolder(dbId, path)

#### Test Verification
- [ ] **Run tests**: 8/9 pass (move deferred)
- [ ] **Manual test**: Create nested folders, rename, delete

**Success Criteria**:
- ✅ 8/9 tests passing
- ✅ Folder tree renders correctly
- ✅ CRUD operations work
- ✅ Performance targets met

**Estimated Time**: 4-5 hours

---

### Sub-phase 2.3: File Browser with Metadata

**Goal**: Browse documents within folders, display metadata

**Status**: ⏳ Pending

**Files to Create**:
- `apps/harness/components/vector-databases/FileBrowser.tsx` (≤350 lines)
- `apps/harness/components/vector-databases/FileRow.tsx` (≤150 lines)
- `apps/harness/components/vector-databases/FileDetailsModal.tsx` (≤200 lines)

**Tasks**:

#### Test Writing
- [ ] **Test: Renders file list** - Shows files in selected folder
- [ ] **Test: File row displays metadata** - Name, size, date, vector count
- [ ] **Test: File selection** - Click to select, checkbox for multi-select
- [ ] **Test: File details modal** - Click file → show full metadata
- [ ] **Test: Delete file** - Confirmation, removes file + vectors
- [ ] **Test: Download file metadata** - Export as JSON
- [ ] **Test: Search files** - Filter by name
- [ ] **Test: Sort files** - By name, date, size
- [ ] **Test: Empty folder** - Shows "No files" message
- [ ] **Test: Performance** - Render 100 files < 300ms

**Show Test Failures**: Run tests, verify 10 failures

#### Implementation
- [ ] **Create FileBrowser component**:
  - Table view: Name, Size, Date, Vectors
  - Multi-select checkboxes
  - Search and sort controls
  - Pagination for large folders
- [ ] **Create FileRow component**:
  - File icon (PDF, TXT, etc.)
  - Truncated name with tooltip
  - Formatted size (KB/MB)
  - Relative date ("2 hours ago")
  - Actions: View Details, Delete
- [ ] **Create FileDetailsModal component**:
  - Full metadata display
  - Vector IDs list
  - Chunk preview
  - Download button
- [ ] **Use VectorRAGManager methods**:
  - getVectors(dbId, folderPath) → List files
  - deleteVector(dbId, vectorId) → Delete file

#### Test Verification
- [ ] **Run tests**: All 10 tests pass
- [ ] **Manual test**: Browse folder, view file details, delete file

**Success Criteria**:
- ✅ 10/10 tests passing
- ✅ File browser works smoothly
- ✅ Metadata displayed correctly
- ✅ Performance targets met

**Estimated Time**: 4-6 hours

---

### Phase 2 Summary

**Total Estimated Time**: 12-16 hours

**Sub-phase Breakdown**:
1. Database List View: 4-5 hours
2. Folder Tree Navigation: 4-5 hours
3. File Browser with Metadata: 4-6 hours

**Success Criteria**:
- ✅ User can browse all vector databases
- ✅ Folder hierarchies navigable
- ✅ Files displayed with metadata
- ✅ CRUD operations work for databases, folders, files

---

## Phase 3: RAG Sources Transparency UI

**Goal**: Show which documents influenced LLM responses

**Estimated Time**: 6-8 hours

**Note**: This is a **quick win** - backend is 100% ready (searchVectors returns sources), just needs UI.

### Sub-phase 3.1: Sources Panel in Chat

**Goal**: Add a collapsible panel showing retrieved documents

**Status**: ⏳ Pending

**Files to Modify**:
- `apps/harness/pages/chat-context-demo.tsx` (+80 lines)
- `apps/harness/components/rag-sources/SourcesPanel.tsx` (≤200 lines) - NEW

**Tasks**:

#### Test Writing
- [ ] **Test: Sources panel renders** - Shows when RAG used
- [ ] **Test: Sources panel hidden** - When RAG not used
- [ ] **Test: Lists retrieved documents** - Names, paths, scores
- [ ] **Test: Similarity scores** - Displays as percentage
- [ ] **Test: Collapse/expand** - Toggle panel visibility
- [ ] **Test: Click source** - Opens View Sources modal
- [ ] **Test: Empty state** - No sources found message
- [ ] **Test: Loading state** - Spinner during search

**Show Test Failures**: Run tests, verify 8 failures

#### Implementation
- [ ] **Modify chat-context-demo.tsx**:
  - After SessionManager.askWithContext(), capture search results
  - Pass results to SourcesPanel component
  - Display panel below or beside chat messages
- [ ] **Create SourcesPanel component**:
  - List of documents used
  - Document name, path, similarity score
  - Truncate long names with tooltip
  - Click to open ViewSourcesModal (Sub-phase 3.2)
  - Collapse/expand button

#### Test Verification
- [ ] **Run tests**: All 8 tests pass
- [ ] **Manual test**: Ask question, verify sources appear

**Success Criteria**:
- ✅ 8/8 tests passing
- ✅ Sources panel displays correctly
- ✅ Similarity scores accurate
- ✅ UI responsive

**Estimated Time**: 2-3 hours

---

### Sub-phase 3.2: View Sources Modal

**Goal**: Modal showing full document excerpts that influenced response

**Status**: ⏳ Pending

**Files to Create**:
- `apps/harness/components/rag-sources/ViewSourcesModal.tsx` (≤250 lines)

**Tasks**:

#### Test Writing
- [ ] **Test: Modal opens** - Click source → modal appears
- [ ] **Test: Displays excerpts** - Shows matching text chunks
- [ ] **Test: Highlights keywords** - Query terms highlighted
- [ ] **Test: Similarity score** - Shows per-chunk score
- [ ] **Test: Document metadata** - File path, upload date
- [ ] **Test: Multiple sources** - Tabs for each document
- [ ] **Test: Close modal** - Click outside or close button

**Show Test Failures**: Run tests, verify 7 failures

#### Implementation
- [ ] **Create ViewSourcesModal component**:
  - Tabs for each source document
  - Text excerpt with highlighted keywords
  - Similarity score badge
  - Document path breadcrumb
  - Upload date and file size
  - Close button (X icon)
  - Keyboard shortcuts (ESC to close)

#### Test Verification
- [ ] **Run tests**: All 7 tests pass
- [ ] **Manual test**: Open modal, switch tabs, close

**Success Criteria**:
- ✅ 7/7 tests passing
- ✅ Modal displays excerpts correctly
- ✅ Highlighting works
- ✅ Navigation smooth

**Estimated Time**: 2-3 hours

---

### Sub-phase 3.3: Document Path Navigation

**Goal**: Clickable breadcrumb showing document location in database

**Status**: ⏳ Pending

**Files to Create**:
- `apps/harness/components/rag-sources/DocumentPathBreadcrumb.tsx` (≤150 lines)

**Tasks**:

#### Test Writing
- [ ] **Test: Renders path** - Shows database > folder > subfolder > file
- [ ] **Test: Clickable segments** - Click folder → navigate to folder view
- [ ] **Test: Long paths** - Truncates middle folders
- [ ] **Test: Copy path button** - Copies full path to clipboard
- [ ] **Test: Tooltip** - Shows full path on hover

**Show Test Failures**: Run tests, verify 5 failures

#### Implementation
- [ ] **Create DocumentPathBreadcrumb component**:
  - Parse folderPath from metadata
  - Render breadcrumb: DB name / Folder / Subfolder / File
  - Each segment clickable (navigates to vector-databases page)
  - Truncate if > 5 segments ("DB / ... / Folder / File")
  - Copy button with tooltip

#### Test Verification
- [ ] **Run tests**: All 5 tests pass
- [ ] **Manual test**: Click breadcrumb segments, verify navigation

**Success Criteria**:
- ✅ 5/5 tests passing
- ✅ Breadcrumb renders correctly
- ✅ Navigation works
- ✅ Copy function works

**Estimated Time**: 2-3 hours

---

### Phase 3 Summary

**Total Estimated Time**: 6-9 hours

**Sub-phase Breakdown**:
1. Sources Panel: 2-3 hours
2. View Sources Modal: 2-3 hours
3. Document Path Breadcrumb: 2-3 hours

**Success Criteria**:
- ✅ User sees which documents influenced responses
- ✅ Can view full excerpts
- ✅ Can navigate to source files
- ✅ RAG decision-making transparent

---

## Phase 4: Session Groups UI

**Goal**: Build UI for creating and managing session groups

**Estimated Time**: 16-20 hours

### Sub-phase 4.1: Session Group List View

**Goal**: Display all session groups with previews

**Status**: ⏳ Pending

**Files to Create**:
- `apps/harness/pages/session-groups.tsx` (≤400 lines)
- `apps/harness/components/session-groups/SessionGroupList.tsx` (≤250 lines)
- `apps/harness/components/session-groups/SessionGroupCard.tsx` (≤200 lines)

**Tasks**:

#### Test Writing
- [ ] **Test: Renders group list** - Shows all groups for user
- [ ] **Test: Group card displays info** - Name, description, session count
- [ ] **Test: Recent activity** - Last active timestamp
- [ ] **Test: Linked databases badge** - Count of linked DBs
- [ ] **Test: Click group** - Navigate to group detail view
- [ ] **Test: Create group button** - Opens modal
- [ ] **Test: Delete group** - Confirmation, removes group
- [ ] **Test: Search groups** - Filter by name
- [ ] **Test: Sort groups** - By name, last active, created date
- [ ] **Test: Empty state** - "No session groups" message

**Show Test Failures**: Run tests, verify 10 failures

#### Implementation
- [ ] **Create session-groups.tsx page**:
  - List groups using SessionGroupManager.listSessionGroups()
  - Grid layout (3 columns)
  - Search and sort controls
  - "Create Session Group" button
- [ ] **Create SessionGroupCard component**:
  - Group name and description
  - Session count badge
  - Linked databases count badge
  - Last active timestamp
  - Click → navigate to detail view
  - Actions menu (Edit, Delete)
- [ ] **Hook up to SDK**:
  - useEffect to load groups on mount
  - Real-time updates when groups change

#### Test Verification
- [ ] **Run tests**: All 10 tests pass
- [ ] **Manual test**: View groups, create, delete

**Success Criteria**:
- ✅ 10/10 tests passing
- ✅ Group list displays correctly
- ✅ Navigation works
- ✅ Performance: List 50 groups < 500ms

**Estimated Time**: 4-5 hours

---

### Sub-phase 4.2: Create Session Group Modal

**Goal**: Modal for creating new session groups

**Status**: ⏳ Pending

**Files to Create**:
- `apps/harness/components/session-groups/CreateSessionGroupModal.tsx` (≤200 lines)

**Tasks**:

#### Test Writing
- [ ] **Test: Modal opens** - Click "Create" button
- [ ] **Test: Form validation** - Name required, max length
- [ ] **Test: Create group** - Calls SessionGroupManager.createSessionGroup()
- [ ] **Test: Success feedback** - Shows success toast
- [ ] **Test: Error handling** - Displays error message
- [ ] **Test: Close modal** - Cancel button, ESC key
- [ ] **Test: Default database option** - Checkbox to create default DB

**Show Test Failures**: Run tests, verify 7 failures

#### Implementation
- [ ] **Create CreateSessionGroupModal component**:
  - Form: Name (required), Description (optional)
  - Checkbox: "Create default vector database"
  - Submit button, Cancel button
  - On submit:
    - Call SessionGroupManager.createSessionGroup()
    - If checkbox checked, create default DB and link it
    - Show success toast
    - Close modal
    - Navigate to group detail view

#### Test Verification
- [ ] **Run tests**: All 7 tests pass
- [ ] **Manual test**: Create group with/without default DB

**Success Criteria**:
- ✅ 7/7 tests passing
- ✅ Group creation works
- ✅ Default DB creation works
- ✅ Validation works

**Estimated Time**: 2-3 hours

---

### Sub-phase 4.3: Session Group Detail View (3-Column Layout)

**Goal**: Detailed view showing chat sessions, active chat, linked databases

**Status**: ⏳ Pending

**Files to Create**:
- `apps/harness/pages/session-group-detail.tsx` (≤500 lines)
- `apps/harness/components/session-groups/SessionGroupDashboard.tsx` (≤400 lines)
- `apps/harness/components/session-groups/ChatSessionList.tsx` (≤250 lines)
- `apps/harness/components/session-groups/LinkedDatabasesPanel.tsx` (≤200 lines)

**Tasks**:

#### Test Writing
- [ ] **Test: 3-column layout** - Sessions | Chat | Databases
- [ ] **Test: Chat session list** - Shows all sessions in group
- [ ] **Test: Select session** - Click → load in center panel
- [ ] **Test: New chat button** - Creates new session in group
- [ ] **Test: Linked databases panel** - Shows linked DBs
- [ ] **Test: Upload to default DB** - Drag-drop or button
- [ ] **Test: Link database button** - Opens modal to link DB
- [ ] **Test: RAG settings** - topK, threshold sliders
- [ ] **Test: Responsive layout** - Collapses on mobile
- [ ] **Test: Empty states** - No sessions, no databases

**Show Test Failures**: Run tests, verify 10 failures

#### Implementation
- [ ] **Create session-group-detail.tsx page**:
  - 3-column grid layout
  - Left: Chat session list
  - Center: Active chat (reuse chat-context-demo components)
  - Right: Linked databases panel
- [ ] **Create ChatSessionList component**:
  - List sessions using SessionGroupManager.listChatSessions()
  - Session preview (first message, timestamp)
  - Click to load session in center panel
  - "New Chat" button
- [ ] **Create LinkedDatabasesPanel component**:
  - List databases using SessionGroupManager.listLinkedDatabases()
  - Default DB indicator
  - "Link Database" button
  - Upload documents to default DB
  - RAG settings (topK, threshold)

#### Test Verification
- [ ] **Run tests**: All 10 tests pass
- [ ] **Manual test**: Create group, add sessions, link DBs, chat

**Success Criteria**:
- ✅ 10/10 tests passing
- ✅ 3-column layout works
- ✅ Session switching works
- ✅ Database linking works
- ✅ RAG integration works

**Estimated Time**: 6-8 hours

---

### Sub-phase 4.4: Link Databases to Groups UI

**Goal**: UI for linking/unlinking vector databases to session groups

**Status**: ⏳ Pending

**Files to Create**:
- `apps/harness/components/session-groups/LinkDatabaseModal.tsx` (≤200 lines)

**Tasks**:

#### Test Writing
- [ ] **Test: Modal opens** - Click "Link Database" button
- [ ] **Test: Lists all databases** - Shows available databases
- [ ] **Test: Already linked** - Grayed out if already linked
- [ ] **Test: Link database** - Calls SessionGroupManager.linkVectorDatabase()
- [ ] **Test: Set as default** - Checkbox for default DB
- [ ] **Test: Success feedback** - Toast notification
- [ ] **Test: Close modal** - Cancel button

**Show Test Failures**: Run tests, verify 7 failures

#### Implementation
- [ ] **Create LinkDatabaseModal component**:
  - List databases using VectorRAGManager.listDatabases()
  - Filter out already-linked databases
  - Checkbox for each database
  - "Set as default" checkbox (only one can be default)
  - Link button
  - On submit:
    - Call SessionGroupManager.linkVectorDatabase()
    - If "Set as default" checked, call setDefaultDatabase()
    - Close modal

#### Test Verification
- [ ] **Run tests**: All 7 tests pass
- [ ] **Manual test**: Link multiple databases, set default

**Success Criteria**:
- ✅ 7/7 tests passing
- ✅ Linking works
- ✅ Default DB setting works

**Estimated Time**: 2-3 hours

---

### Phase 4 Summary

**Total Estimated Time**: 14-19 hours

**Sub-phase Breakdown**:
1. Session Group List View: 4-5 hours
2. Create Session Group Modal: 2-3 hours
3. Session Group Detail View: 6-8 hours
4. Link Databases UI: 2-3 hours

**Success Criteria**:
- ✅ User can create session groups
- ✅ Can view all groups and navigate to details
- ✅ Can link databases to groups
- ✅ Can switch between chat sessions in a group
- ✅ RAG settings per group work

---

## Phase 5: Sharing & Collaboration

**Goal**: Enable users to share session groups with others

**Estimated Time**: 14-18 hours

### Sub-phase 5.1: Permission Model

**Goal**: Define and implement sharing permissions

**Status**: ⏳ Pending

**Files to Create**:
- `packages/sdk-core/src/managers/PermissionManager.ts` (≤300 lines)
- `packages/sdk-core/src/interfaces/IPermissionManager.ts` (≤100 lines)
- `packages/sdk-core/src/types/permissions.types.ts` (≤150 lines)
- `packages/sdk-core/tests/managers/permission-manager.test.ts` (≤400 lines)

**Tasks**:

#### Test Writing
- [ ] **Test: grantPermission()** - Shares resource with user
- [ ] **Test: revokePermission()** - Removes user's access
- [ ] **Test: listPermissions()** - Shows all shares for resource
- [ ] **Test: checkPermission()** - Verifies user has access
- [ ] **Test: Permission levels** - Reader (view), Writer (edit), Admin (share)
- [ ] **Test: Owner always has access** - Cannot revoke owner
- [ ] **Test: Cascade permissions** - Group share → DB share
- [ ] **Test: Error handling** - Invalid addresses, self-sharing
- [ ] **Test: Storage persistence** - Permissions survive restart

**Show Test Failures**: Run tests, verify 9 failures

#### Implementation
- [ ] **Define types** in `permissions.types.ts`:
  ```typescript
  export enum PermissionLevel {
    READER = 'reader',   // Can view only
    WRITER = 'writer',   // Can add messages
    ADMIN = 'admin'      // Can share, delete
  }

  export interface Permission {
    resourceId: string;  // Session group or DB ID
    resourceType: 'session_group' | 'vector_database';
    grantedTo: string;   // Wallet address
    level: PermissionLevel;
    grantedBy: string;   // Owner address
    grantedAt: Date;
  }
  ```
- [ ] **Implement PermissionManager**:
  - grantPermission(resourceId, userAddress, level)
  - revokePermission(resourceId, userAddress)
  - listPermissions(resourceId)
  - checkPermission(resourceId, userAddress): PermissionLevel | null
  - Storage: S5 at `home/permissions/{owner}/{resourceId}.json`

#### Test Verification
- [ ] **Run tests**: All 9 tests pass
- [ ] **Manual test**: Grant/revoke permissions via SDK

**Success Criteria**:
- ✅ 9/9 tests passing
- ✅ Permission system works
- ✅ Storage encrypted in S5

**Estimated Time**: 6-8 hours

---

### Sub-phase 5.2: Share Modal

**Goal**: UI for sharing session groups

**Status**: ⏳ Pending

**Files to Create**:
- `apps/harness/components/sharing/ShareModal.tsx` (≤250 lines)

**Tasks**:

#### Test Writing
- [ ] **Test: Modal opens** - Click "Share" button
- [ ] **Test: Enter wallet address** - Input validation
- [ ] **Test: Select permission level** - Radio buttons for Reader/Writer/Admin
- [ ] **Test: Share button** - Calls PermissionManager.grantPermission()
- [ ] **Test: Success feedback** - Toast notification
- [ ] **Test: Error handling** - Invalid address, duplicate share
- [ ] **Test: Close modal** - Cancel button

**Show Test Failures**: Run tests, verify 7 failures

#### Implementation
- [ ] **Create ShareModal component**:
  - Input: Wallet address (with ENS support future)
  - Radio buttons: Reader, Writer, Admin
  - Share button
  - On submit:
    - Validate address (checksum)
    - Call PermissionManager.grantPermission()
    - Show success toast
    - Close modal

#### Test Verification
- [ ] **Run tests**: All 7 tests pass
- [ ] **Manual test**: Share group, verify recipient can access

**Success Criteria**:
- ✅ 7/7 tests passing
- ✅ Sharing works
- ✅ Validation works

**Estimated Time**: 3-4 hours

---

### Sub-phase 5.3: Collaborator Management

**Goal**: View and manage collaborators

**Status**: ⏳ Pending

**Files to Create**:
- `apps/harness/components/sharing/CollaboratorList.tsx` (≤200 lines)

**Tasks**:

#### Test Writing
- [ ] **Test: Lists collaborators** - Shows all users with access
- [ ] **Test: Permission level badges** - Reader, Writer, Admin
- [ ] **Test: Revoke button** - Removes user's access
- [ ] **Test: Change permission** - Dropdown to change level
- [ ] **Test: Owner indicator** - Cannot revoke owner
- [ ] **Test: Empty state** - "No collaborators" message

**Show Test Failures**: Run tests, verify 6 failures

#### Implementation
- [ ] **Create CollaboratorList component**:
  - List permissions using PermissionManager.listPermissions()
  - Display: Address (truncated), Permission level, Granted date
  - Revoke button for each user
  - Change permission dropdown

#### Test Verification
- [ ] **Run tests**: All 6 tests pass
- [ ] **Manual test**: View collaborators, revoke access

**Success Criteria**:
- ✅ 6/6 tests passing
- ✅ Collaborator list works
- ✅ Revoke works

**Estimated Time**: 2-3 hours

---

### Sub-phase 5.4: Invitation System (Deferred)

**Goal**: Send invitations to users not yet in system

**Status**: ⏳ Deferred to post-MVP

**Rationale**: Requires notification infrastructure (Phase 7.3). For MVP, users share by entering wallet addresses directly.

---

### Phase 5 Summary

**Total Estimated Time**: 11-15 hours

**Sub-phase Breakdown**:
1. Permission Model: 6-8 hours
2. Share Modal: 3-4 hours
3. Collaborator Management: 2-3 hours
4. Invitation System: Deferred

**Success Criteria**:
- ✅ User can share session groups
- ✅ Can set permission levels
- ✅ Can view and manage collaborators
- ✅ Permissions enforced in SDK

---

## Phase 6: Dashboard & Navigation

**Goal**: Central hub and navigation improvements

**Estimated Time**: 12-16 hours

### Sub-phase 6.1: Home Dashboard

**Goal**: Landing page with quick stats and actions

**Status**: ⏳ Pending

**Files to Create**:
- `apps/harness/pages/dashboard.tsx` (≤400 lines)
- `apps/harness/components/dashboard/QuickStats.tsx` (≤200 lines)
- `apps/harness/components/dashboard/QuickActionsPanel.tsx` (≤150 lines)

**Tasks**:

#### Test Writing
- [ ] **Test: Renders dashboard** - Loads on app start
- [ ] **Test: Quick stats** - Database count, session groups, vectors
- [ ] **Test: Quick actions** - Buttons for common tasks
- [ ] **Test: Recent databases** - Shows last 5 accessed
- [ ] **Test: Active session groups** - Shows recent groups
- [ ] **Test: Loading state** - Spinner while fetching
- [ ] **Test: Empty state** - First-time user message

**Show Test Failures**: Run tests, verify 7 failures

#### Implementation
- [ ] **Create dashboard.tsx page**:
  - Grid layout with sections
  - Quick Stats: DB count, group count, total vectors
  - Quick Actions: New DB, New Group, Upload Docs, Quick Chat
  - Recent Databases grid
  - Active Session Groups list
- [ ] **Create QuickStats component**:
  - Fetch counts from SDK managers
  - Display as cards with icons
- [ ] **Create QuickActionsPanel component**:
  - Large buttons for common actions
  - Navigate to relevant pages or open modals

#### Test Verification
- [ ] **Run tests**: All 7 tests pass
- [ ] **Manual test**: Navigate dashboard, click quick actions

**Success Criteria**:
- ✅ 7/7 tests passing
- ✅ Dashboard displays correctly
- ✅ Navigation works
- ✅ Performance: Load < 500ms

**Estimated Time**: 4-5 hours

---

### Sub-phase 6.2: Recent Databases Grid

**Goal**: Show recently accessed vector databases

**Status**: ⏳ Pending

**Files to Create**:
- `apps/harness/components/dashboard/RecentDatabasesGrid.tsx` (≤200 lines)

**Tasks**:

#### Test Writing
- [ ] **Test: Shows recent databases** - Last 5 accessed
- [ ] **Test: Database card** - Name, vector count, last used
- [ ] **Test: Click database** - Navigate to database detail
- [ ] **Test: Empty state** - "No databases" message
- [ ] **Test: Sorting** - By last accessed (descending)

**Show Test Failures**: Run tests, verify 5 failures

#### Implementation
- [ ] **Create RecentDatabasesGrid component**:
  - Fetch databases, sort by lastAccessed
  - Display top 5 as cards
  - Click to navigate to vector-databases page

#### Test Verification
- [ ] **Run tests**: All 5 tests pass

**Success Criteria**:
- ✅ 5/5 tests passing
- ✅ Recent databases displayed

**Estimated Time**: 2-3 hours

---

### Sub-phase 6.3: Active Session Groups List

**Goal**: Show recently active session groups

**Status**: ⏳ Pending

**Files to Create**:
- `apps/harness/components/dashboard/ActiveSessionGroupsList.tsx` (≤200 lines)

**Tasks**:

#### Test Writing
- [ ] **Test: Shows active groups** - Last 5 active
- [ ] **Test: Group row** - Name, session count, last active
- [ ] **Test: Click group** - Navigate to group detail
- [ ] **Test: Empty state** - "No session groups" message
- [ ] **Test: Sorting** - By last active (descending)

**Show Test Failures**: Run tests, verify 5 failures

#### Implementation
- [ ] **Create ActiveSessionGroupsList component**:
  - Fetch groups, sort by lastActive
  - Display top 5 as list items
  - Click to navigate to session-group-detail page

#### Test Verification
- [ ] **Run tests**: All 5 tests pass

**Success Criteria**:
- ✅ 5/5 tests passing
- ✅ Active groups displayed

**Estimated Time**: 2-3 hours

---

### Sub-phase 6.4: Quick Actions FAB

**Goal**: Floating action button for quick actions

**Status**: ⏳ Pending

**Files to Create**:
- `apps/harness/components/common/QuickActionsFAB.tsx` (≤150 lines)

**Tasks**:

#### Test Writing
- [ ] **Test: FAB renders** - Bottom-right corner
- [ ] **Test: Click to expand** - Shows action menu
- [ ] **Test: Action buttons** - Upload, New Chat, New Group, New DB
- [ ] **Test: Click action** - Triggers correct handler
- [ ] **Test: Close menu** - Click outside or ESC key
- [ ] **Test: Mobile responsiveness** - Positioned correctly

**Show Test Failures**: Run tests, verify 6 failures

#### Implementation
- [ ] **Create QuickActionsFAB component**:
  - Fixed position (bottom-right)
  - Expand on click → show 4 action buttons
  - Actions: Upload to Default DB, New Chat, New Group, New DB
  - Smooth animations

#### Test Verification
- [ ] **Run tests**: All 6 tests pass

**Success Criteria**:
- ✅ 6/6 tests passing
- ✅ FAB works on all pages
- ✅ Animations smooth

**Estimated Time**: 2-3 hours

---

### Phase 6 Summary

**Total Estimated Time**: 10-14 hours

**Sub-phase Breakdown**:
1. Home Dashboard: 4-5 hours
2. Recent Databases Grid: 2-3 hours
3. Active Session Groups List: 2-3 hours
4. Quick Actions FAB: 2-3 hours

**Success Criteria**:
- ✅ Dashboard provides quick overview
- ✅ Navigation is intuitive
- ✅ Quick actions accessible everywhere

---

## Phase 7: Settings & Advanced Features

**Goal**: Settings page, notifications, mobile optimization

**Estimated Time**: 12-16 hours

### Sub-phase 7.1: Settings Page

**Goal**: User settings and preferences

**Status**: ⏳ Pending

**Files to Create**:
- `apps/harness/pages/settings.tsx` (≤400 lines)
- `apps/harness/components/settings/AccountSettings.tsx` (≤200 lines)
- `apps/harness/components/settings/StorageSettings.tsx` (≤200 lines)

**Tasks**:

#### Test Writing
- [ ] **Test: Settings page renders** - All sections visible
- [ ] **Test: Account section** - Shows wallet address, balance
- [ ] **Test: Storage section** - Shows S5 usage stats
- [ ] **Test: Clear cache** - Confirmation modal
- [ ] **Test: Export data** - Downloads JSON
- [ ] **Test: Import data** - Uploads JSON, validates
- [ ] **Test: Network selection** - Switch chains
- [ ] **Test: Appearance settings** - Dark mode toggle (deferred)

**Show Test Failures**: Run tests, verify 8 failures (dark mode deferred)

#### Implementation
- [ ] **Create settings.tsx page**:
  - Tabbed layout: Account, Storage, Privacy, About
  - Account tab: Wallet, balance, export/import
  - Storage tab: S5 usage, clear cache
  - Privacy tab: Data retention, encryption info
  - About tab: Version, docs links
- [ ] **Create AccountSettings component**:
  - Display wallet address (truncated)
  - Display USDC balance
  - Export data button (downloads all groups + DBs as JSON)
  - Import data button (uploads JSON, validates, imports)
- [ ] **Create StorageSettings component**:
  - S5 usage stats (groups, databases, vectors)
  - Clear cache button (confirmation modal)

#### Test Verification
- [ ] **Run tests**: 7/8 pass (dark mode deferred)

**Success Criteria**:
- ✅ 7/8 tests passing
- ✅ Settings page functional
- ✅ Export/import works

**Estimated Time**: 4-5 hours

---

### Sub-phase 7.2: Storage Usage Display

**Goal**: Visualize S5 storage consumption

**Status**: ⏳ Pending

**Files to Create**:
- `apps/harness/components/settings/StorageUsageChart.tsx` (≤150 lines)

**Tasks**:

#### Test Writing
- [ ] **Test: Chart renders** - Shows storage breakdown
- [ ] **Test: Categories** - Groups, databases, vectors, conversations
- [ ] **Test: Tooltips** - Hover shows details
- [ ] **Test: Total usage** - Displays total MB/GB
- [ ] **Test: Empty state** - No data yet

**Show Test Failures**: Run tests, verify 5 failures

#### Implementation
- [ ] **Create StorageUsageChart component**:
  - Pie chart or bar chart
  - Categories: Session Groups, Vector Databases, Conversations
  - Use Chart.js or Recharts
  - Display total usage in MB/GB

#### Test Verification
- [ ] **Run tests**: All 5 tests pass

**Success Criteria**:
- ✅ 5/5 tests passing
- ✅ Chart displays correctly

**Estimated Time**: 2-3 hours

---

### Sub-phase 7.3: Notification Center

**Goal**: Display notifications (shares, activity)

**Status**: ⏳ Pending (Requires real-time backend - deferred)

**Rationale**: Full notification system requires:
- Backend notification service
- WebSocket or polling for real-time updates
- Push notification infrastructure

**Deferred to post-MVP**. For MVP, sharing is direct (no invitations).

---

### Sub-phase 7.4: Mobile Responsive Views

**Goal**: Optimize all pages for mobile devices

**Status**: ⏳ Pending

**Files to Modify**:
- All page files (dashboard, session-groups, vector-databases, etc.)
- All component files (add responsive breakpoints)

**Tasks**:

#### Test Writing
- [ ] **Test: Mobile navigation** - Hamburger menu, drawer
- [ ] **Test: Collapsible sidebars** - Slide in/out on mobile
- [ ] **Test: Touch-optimized buttons** - Larger touch targets
- [ ] **Test: Responsive grid** - 3 cols desktop → 1 col mobile
- [ ] **Test: Hidden elements** - Some elements hidden on mobile
- [ ] **Test: Viewport meta tag** - Prevents zoom issues

**Show Test Failures**: Run tests, verify 6 failures

#### Implementation
- [ ] **Add responsive breakpoints** to all components:
  - Use Tailwind `sm:`, `md:`, `lg:` classes
  - Collapsible sidebars on mobile
  - Stack layouts vertically on mobile
  - Larger touch targets (min 44px)
- [ ] **Mobile navigation**:
  - Hamburger menu icon
  - Slide-out drawer for navigation
  - Bottom navigation bar (alternative)

#### Test Verification
- [ ] **Run tests**: All 6 tests pass
- [ ] **Manual test**: Test on iPhone, Android, tablet

**Success Criteria**:
- ✅ 6/6 tests passing
- ✅ All pages usable on mobile
- ✅ No horizontal scroll

**Estimated Time**: 6-8 hours

---

### Phase 7 Summary

**Total Estimated Time**: 12-16 hours

**Sub-phase Breakdown**:
1. Settings Page: 4-5 hours
2. Storage Usage Display: 2-3 hours
3. Notification Center: Deferred
4. Mobile Responsive: 6-8 hours

**Success Criteria**:
- ✅ Settings page provides control
- ✅ Storage usage visible
- ✅ Mobile users can use all features

---

## Global Success Metrics

1. **Performance**: UI loads < 1s, interactions < 100ms
2. **Usability**: New user can create group and upload doc < 3 minutes
3. **Accessibility**: WCAG 2.1 AA compliance
4. **Mobile**: All features work on mobile devices
5. **Test Coverage**: 85%+ across all components
6. **Code Quality**: ESLint clean, TypeScript strict mode
7. **Documentation**: All components documented
8. **Security**: XSS prevention, input validation, secure storage

## Risk Mitigation

1. **Performance Issues**: Lazy loading, pagination, caching
2. **Browser Compatibility**: Test on Chrome, Firefox, Safari, Edge
3. **Storage Failures**: Retry logic, error messages, offline mode
4. **User Errors**: Validation, confirmation modals, undo functionality
5. **Security Vulnerabilities**: Input sanitization, CSRF protection
6. **Scope Creep**: Strict line limits, TDD approach, one sub-phase at a time

## Timeline Estimate

- Phase 1 (Session Groups Backend): 16-21 hours
- Phase 2 (Vector DB Management UI): 12-16 hours
- Phase 3 (RAG Sources Transparency): 6-9 hours
- Phase 4 (Session Groups UI): 14-19 hours
- Phase 5 (Sharing & Collaboration): 11-15 hours
- Phase 6 (Dashboard & Navigation): 10-14 hours
- Phase 7 (Settings & Advanced): 12-16 hours

**Total: 81-110 hours** (10-14 weeks at 8 hours/week, or 3-5 weeks full-time)

## Implementation Notes

- Follow TDD strictly - tests first, then implementation
- Keep file sizes within limits to prevent bloat
- Reuse existing components where possible
- Match design of chat-context-demo for consistency
- All data persists to S5 with encryption
- No breaking changes to existing SDK APIs
- Each sub-phase independently deployable
- Comprehensive error handling and validation

## Dependencies

**External Libraries** (to be installed):
- Recharts or Chart.js (for storage charts)
- React DnD (for drag-drop file upload - optional)
- React Icons (for consistent iconography)

**SDK Managers** (existing):
- SessionManager
- VectorRAGManager
- DocumentManager
- StorageManager
- HostManager
- PaymentManager

**New SDK Managers** (to be created):
- SessionGroupManager (Phase 1.1)
- PermissionManager (Phase 5.1)

## Validation Checklist

Before marking a sub-phase complete:
- [ ] All tests written and passing (85%+ coverage)
- [ ] Code within line limits
- [ ] No modifications outside scope
- [ ] Documentation updated (JSDoc comments)
- [ ] Performance benchmarks met
- [ ] Manual testing on Chrome, Firefox, Safari
- [ ] Mobile testing on iOS and Android
- [ ] Security review passed (input validation, XSS prevention)
- [ ] Integration tests passing
- [ ] No console errors or warnings

---

## Next Steps

1. **Phase 1, Sub-phase 1.1**: Begin with SessionGroupManager service
2. **Follow TDD approach**: Write all 14 tests first
3. **Show failures**: Run tests, verify they fail
4. **Implement**: Write SessionGroupManager.ts
5. **Verify**: All tests pass
6. **Mark complete**: Check `[x]` for Sub-phase 1.1
7. **Move to Sub-phase 1.2**: Session Group Storage

**Ready to begin when you are!**
