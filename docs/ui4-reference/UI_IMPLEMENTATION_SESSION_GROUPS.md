# UI Implementation Plan: Session Groups & RAG

**Document Purpose**: UI development tasks for Session Groups and RAG features

**Target Audience**: UI Developer

**Prerequisites**:
- SDK backend complete (Session Groups, VectorDatabaseManager, PermissionManager)
- Reference UI: `apps/harness/pages/chat-context-demo.tsx`
- Design system: Tailwind CSS matching chat-context-demo style

---

## Overview

This document contains all UI implementation tasks extracted from the Session Groups RAG implementation plan.

**Note**: These tasks depend on SDK backend work being completed first. Check `docs/IMPLEMENTATION_RAG_MISSING.md` for SDK backend status.

**Phases Covered**:
- Phase 2: Vector Database Management UI
- Phase 3: RAG Sources Transparency UI
- Phase 4: Session Groups UI
- Phase 6: Dashboard & Navigation
- Phase 7: Settings & Advanced Features

---

## Phase 2: Vector Database Management UI

**Goal**: Build UI for browsing, organizing, and searching vector databases

**Estimated Time**: 12-16 hours

**SDK Backend Status**: ⏳ Blocked - VectorDatabaseManager not yet implemented

### Sub-phase 2.1: Database List View

**Goal**: Display all vector databases with stats and actions

**Status**: ⏳ Blocked on SDK backend

**SDK Dependencies Required**:
- `VectorDatabaseManager.listDatabases()` - List all databases for user
- `VectorDatabaseManager.createDatabase()` - Create new database
- `VectorDatabaseManager.deleteDatabase()` - Delete database
- `VectorDatabaseManager.getDatabaseStats()` - Get vector count, storage size

**Files to Create**:
- `apps/harness/pages/vector-databases.tsx` (≤400 lines)
- `apps/harness/components/vector-databases/DatabaseList.tsx` (≤250 lines)
- `apps/harness/components/vector-databases/DatabaseCard.tsx` (≤200 lines)
- `apps/harness/components/vector-databases/CreateDatabaseModal.tsx` (≤150 lines)

**Component Tests**:
- [ ] Renders database list - Shows all databases for user
- [ ] Database card displays stats - Vectors count, storage size, last updated
- [ ] Create database button - Opens modal
- [ ] Create database modal - Name, description validation
- [ ] Delete database - Confirmation modal, removes database
- [ ] Search databases - Filter by name
- [ ] Sort databases - By name, date, vector count
- [ ] Empty state - Shows "No databases" message
- [ ] Loading state - Spinner while fetching
- [ ] Error state - Shows error message

**Implementation Details**:

1. **vector-databases.tsx page**:
   - Fetch databases: `sdk.getVectorDatabaseManager().listDatabases()`
   - Display stats: vector count, storage size, last updated
   - Search/filter functionality
   - Sort options (name, date, count)
   - "Create Database" button

2. **DatabaseCard component**:
   - Database name, description
   - Vector count badge
   - Storage size (formatted as KB/MB)
   - Last updated timestamp (relative: "2 hours ago")
   - Actions: Open, Delete

3. **CreateDatabaseModal component**:
   - Form fields: name (required), description (optional)
   - Validation: unique name, max length
   - Submit: `sdk.getVectorDatabaseManager().createDatabase()`

4. **Styling**: Tailwind CSS, match chat-context-demo design

**Manual Testing Checklist**:
- [ ] Create database with valid name
- [ ] View database list with 10+ databases
- [ ] Delete database with confirmation
- [ ] Search and filter databases
- [ ] Sort by different criteria
- [ ] Test empty state (no databases)
- [ ] Test error handling (duplicate names, invalid input)

**Success Criteria**:
- ✅ 10/10 component tests passing
- ✅ Database list displays correctly
- ✅ Create/delete operations work
- ✅ Performance: List 50 databases < 500ms

**Estimated Time**: 4-5 hours

---

### Sub-phase 2.2: Folder Tree Navigation

**Goal**: Hierarchical folder navigation within vector databases

**Status**: ⏳ Blocked on SDK backend

**SDK Dependencies Required**:
- `VectorDatabaseManager.listFolders(dbId)` - Get folder hierarchy
- `VectorDatabaseManager.createFolder(dbId, path)` - Create folder
- `VectorDatabaseManager.deleteFolder(dbId, path)` - Delete folder
- `VectorDatabaseManager.renameFolder(dbId, oldPath, newPath)` - Rename folder

**Files to Create**:
- `apps/harness/components/vector-databases/FolderTree.tsx` (≤300 lines)
- `apps/harness/components/vector-databases/FolderActions.tsx` (≤150 lines)

**Component Tests**:
- [ ] Renders folder tree - Shows root folders
- [ ] Expand/collapse folders - Click to toggle
- [ ] Create folder - Modal, nested paths
- [ ] Rename folder - Inline edit
- [ ] Delete folder - Confirmation, removes folder + contents
- [ ] Move folder - Drag-and-drop (deferred to future)
- [ ] Folder selection - Highlights selected folder
- [ ] Empty folder state - Shows "No folders" message
- [ ] Performance - Render 100 folders < 200ms

**Implementation Details**:

1. **FolderTree component**:
   - Recursive tree structure
   - Expand/collapse with chevron icons
   - Right-click context menu (create, rename, delete)
   - Keyboard navigation (arrow keys, Enter, Delete)
   - Drag-and-drop support (Phase 2, deferred)

2. **FolderActions component**:
   - Create Folder modal (name input, parent selection)
   - Rename inline input
   - Delete confirmation modal

3. **SDK Integration**:
   - Fetch: `VectorDatabaseManager.listFolders(dbId)`
   - Create: `VectorDatabaseManager.createFolder(dbId, path)`
   - Delete: `VectorDatabaseManager.deleteFolder(dbId, path)`
   - Rename: `VectorDatabaseManager.renameFolder(dbId, oldPath, newPath)`

**Manual Testing Checklist**:
- [ ] Create nested folders (3+ levels deep)
- [ ] Rename folder
- [ ] Delete folder with confirmation
- [ ] Expand/collapse folders
- [ ] Test keyboard navigation
- [ ] Test right-click context menu
- [ ] Test empty folder state
- [ ] Test with 50+ folders

**Success Criteria**:
- ✅ 8/9 tests passing (move deferred)
- ✅ Folder tree renders correctly
- ✅ CRUD operations work
- ✅ Performance targets met

**Estimated Time**: 4-5 hours

---

### Sub-phase 2.3: File Browser with Metadata

**Goal**: Browse documents within folders, display metadata

**Status**: ⏳ Blocked on SDK backend

**SDK Dependencies Required**:
- `VectorDatabaseManager.getVectors(dbId, folderPath)` - List files in folder
- `VectorDatabaseManager.getDocument(dbId, docId)` - Get full document
- `VectorDatabaseManager.deleteVector(dbId, vectorId)` - Delete file

**Files to Create**:
- `apps/harness/components/vector-databases/FileBrowser.tsx` (≤350 lines)
- `apps/harness/components/vector-databases/FileRow.tsx` (≤150 lines)
- `apps/harness/components/vector-databases/FileDetailsModal.tsx` (≤200 lines)

**Component Tests**:
- [ ] Renders file list - Shows files in selected folder
- [ ] File row displays metadata - Name, size, date, vector count
- [ ] File selection - Click to select, checkbox for multi-select
- [ ] File details modal - Click file → show full metadata
- [ ] Delete file - Confirmation, removes file + vectors
- [ ] Download file metadata - Export as JSON
- [ ] Search files - Filter by name
- [ ] Sort files - By name, date, size
- [ ] Empty folder - Shows "No files" message
- [ ] Performance - Render 100 files < 300ms

**Implementation Details**:

1. **FileBrowser component**:
   - Table view: Name, Size, Date, Vectors columns
   - Multi-select checkboxes
   - Search and sort controls
   - Pagination for large folders (20 per page)

2. **FileRow component**:
   - File icon (PDF, TXT, MD based on extension)
   - Truncated name with tooltip on hover
   - Formatted size (KB/MB)
   - Relative date ("2 hours ago")
   - Actions dropdown: View Details, Delete

3. **FileDetailsModal component**:
   - Full metadata display
   - Vector IDs list
   - Chunk preview (first 500 chars)
   - Download button (export metadata as JSON)

4. **SDK Integration**:
   - List: `VectorDatabaseManager.getVectors(dbId, folderPath)`
   - Delete: `VectorDatabaseManager.deleteVector(dbId, vectorId)`
   - Details: `VectorDatabaseManager.getDocument(dbId, docId)`

**Manual Testing Checklist**:
- [ ] Browse folder with 20+ files
- [ ] View file details modal
- [ ] Delete file with confirmation
- [ ] Search files by name
- [ ] Sort by different criteria
- [ ] Test pagination with 50+ files
- [ ] Multi-select and bulk delete
- [ ] Download file metadata
- [ ] Test empty folder state

**Success Criteria**:
- ✅ 10/10 tests passing
- ✅ File browser works smoothly
- ✅ Metadata displayed correctly
- ✅ Performance targets met

**Estimated Time**: 4-6 hours

---

## Phase 3: RAG Sources Transparency UI

**Goal**: Show users which documents were used to generate responses

**Estimated Time**: 8-12 hours

**SDK Backend Status**: ✅ Complete (SessionManager returns sources in response)

### Sub-phase 3.1: Sources Citation in Chat

**Goal**: Display source citations alongside AI responses

**Status**: ⏳ Ready for UI development

**SDK Response Format** (already implemented):
```typescript
interface SessionResponse {
  text: string;
  sources?: {
    documentName: string;
    chunkText: string;
    similarityScore: number;
    filePath: string;
    vectorId: string;
  }[];
  usage: { total_tokens: number };
}
```

**Files to Modify/Create**:
- Modify: `apps/harness/pages/chat-context-demo.tsx`
- Create: `apps/harness/components/chat/SourceCitation.tsx` (≤200 lines)
- Create: `apps/harness/components/chat/SourcesList.tsx` (≤150 lines)

**Component Tests**:
- [ ] Sources displayed - Shows source citations after response
- [ ] Source preview - Hover shows full chunk text
- [ ] Source click - Opens document viewer
- [ ] Multiple sources - Handles 1-10 sources per response
- [ ] No sources - Shows "General knowledge" message
- [ ] Similarity scores - Color-coded by relevance (green >0.8, yellow >0.6, gray <0.6)
- [ ] Collapsible sources - Toggle visibility

**Implementation Details**:

1. **Update chat-context-demo.tsx**:
   - Parse `sources` array from response metadata
   - Pass sources to SourcesList component
   - Display after each assistant message

2. **SourceCitation component**:
   - Document name with file icon
   - Similarity score badge (color-coded)
   - Truncated chunk preview
   - Hover tooltip showing full chunk (300 chars max)
   - Click handler to open document viewer

3. **SourcesList component**:
   - List of 1-10 source citations
   - Collapsible/expandable section
   - Sorted by similarity score (descending)
   - "No sources" message for general knowledge responses

**Manual Testing Checklist**:
- [ ] Send query that matches documents
- [ ] Verify sources appear below response
- [ ] Hover to see chunk preview
- [ ] Click source to open document viewer (Sub-phase 3.2)
- [ ] Test with query matching no documents
- [ ] Test with query matching 10+ documents
- [ ] Test collapse/expand sources

**Success Criteria**:
- ✅ 7/7 tests passing
- ✅ Sources displayed correctly
- ✅ Color coding accurate
- ✅ Performance: Render 10 sources < 100ms

**Estimated Time**: 4-5 hours

---

### Sub-phase 3.2: Document Viewer Modal

**Goal**: Full-text document viewer with chunk highlighting

**Status**: ⏳ Blocked on SDK backend

**SDK Dependencies Required**:
- `VectorDatabaseManager.getDocument(dbId, docId)` - Get full document text
- `VectorDatabaseManager.getChunks(dbId, docId)` - Get all chunks for document

**Files to Create**:
- `apps/harness/components/chat/DocumentViewerModal.tsx` (≤400 lines)

**Component Tests**:
- [ ] Renders document - Shows full text
- [ ] Highlights matched chunks - Yellow background for relevant chunks
- [ ] Scroll to chunk - Auto-scrolls to first matched chunk on open
- [ ] Chunk navigation - Next/previous buttons for multiple chunks
- [ ] Close modal - Click outside or X button
- [ ] Loading state - Spinner while fetching document
- [ ] Error state - Shows error message if document not found

**Implementation Details**:

1. **DocumentViewerModal component**:
   - Modal overlay (full screen)
   - Document text display (scrollable)
   - Highlight matched chunks (yellow background)
   - Chunk navigation (prev/next buttons if multiple chunks)
   - Auto-scroll to first chunk on open
   - Close button (X in corner)
   - Click outside to close

2. **SDK Integration**:
   - Fetch document: `VectorDatabaseManager.getDocument(dbId, docId)`
   - Fetch chunks: `VectorDatabaseManager.getChunks(dbId, docId)`
   - Match chunk positions in full text

3. **Highlighting Logic**:
   - Parse chunk text from document
   - Find chunk positions in full text
   - Apply yellow background to matched chunks
   - Add scroll-to anchors for navigation

**Manual Testing Checklist**:
- [ ] Open document from source citation
- [ ] Verify full text renders correctly
- [ ] Check chunk highlighting (yellow background)
- [ ] Navigate between multiple chunks
- [ ] Test auto-scroll to first chunk
- [ ] Close modal (X button and click outside)
- [ ] Test error handling (missing document)
- [ ] Test with large document (50KB+)

**Success Criteria**:
- ✅ 7/7 tests passing
- ✅ Document viewer works smoothly
- ✅ Chunk highlighting accurate
- ✅ Performance: Render 50KB doc < 500ms

**Estimated Time**: 4-6 hours

---

## Phase 4: Session Groups UI

**Goal**: UI for managing session groups

**Estimated Time**: 10-14 hours

**SDK Backend Status**: ✅ Complete (SessionGroupManager fully implemented)

### Sub-phase 4.1: Group Selector Dropdown

**Goal**: Dropdown to select active session group

**Status**: ✅ Ready for UI development

**SDK Methods Available** (already implemented):
- `sessionGroupManager.listSessionGroups(owner)` - List all groups
- `sessionGroupManager.createSessionGroup(input)` - Create new group
- `sessionGroupManager.getSessionGroup(groupId, requestor)` - Get group details

**Files to Modify/Create**:
- Modify: `apps/harness/pages/chat-context-demo.tsx`
- Create: `apps/harness/components/session-groups/GroupSelector.tsx` (≤250 lines)

**Component Tests**:
- [ ] Renders group list - Shows all user's groups
- [ ] Select group - Click to activate group
- [ ] Create new group - Opens modal
- [ ] Active group highlighted - Visual indicator (blue background)
- [ ] Search groups - Filter by name
- [ ] Empty state - Shows "No groups" message

**Implementation Details**:

1. **GroupSelector component**:
   - Dropdown button showing current group name
   - List of all groups (fetched from SDK)
   - "Create New Group" option at bottom
   - Search bar (filters groups by name)
   - Active group indicator (checkmark icon)

2. **Update chat-context-demo.tsx**:
   - Add GroupSelector to page header
   - Pass active `groupId` to `sessionManager.startSession()`
   - Store selected group in React state + localStorage
   - Load saved group on page mount

3. **SDK Integration**:
   - Fetch groups: `sessionGroupManager.listSessionGroups(userAddress)`
   - Create group: `sessionGroupManager.createSessionGroup({ name, description, owner })`
   - Select group: Store `groupId` in state

**Manual Testing Checklist**:
- [ ] Select group from dropdown
- [ ] Create new group via dropdown
- [ ] Verify active group persists on page reload
- [ ] Search groups (filter by name)
- [ ] Test with 10+ groups
- [ ] Test empty state (no groups)

**Success Criteria**:
- ✅ 6/6 tests passing
- ✅ Group selection works
- ✅ Create group works
- ✅ Active group persists (localStorage)

**Estimated Time**: 3-4 hours

---

### Sub-phase 4.2: Group Settings Modal

**Goal**: Manage group settings (name, description, linked databases)

**Status**: ✅ Ready for UI development

**SDK Methods Available** (already implemented):
- `sessionGroupManager.updateSessionGroup(groupId, requestor, updates)` - Update name/description
- `sessionGroupManager.linkVectorDatabase(groupId, requestor, dbId)` - Link database
- `sessionGroupManager.unlinkVectorDatabase(groupId, requestor, dbId)` - Unlink database
- `sessionGroupManager.setDefaultDatabase(groupId, requestor, dbId)` - Set default database
- `sessionGroupManager.listLinkedDatabases(groupId, requestor)` - Get linked databases (returns VectorDatabaseMetadata[])

**Files to Create**:
- `apps/harness/components/session-groups/GroupSettingsModal.tsx` (≤350 lines)
- `apps/harness/components/session-groups/DatabaseLinker.tsx` (≤200 lines)

**Component Tests**:
- [ ] Edit name - Updates group name
- [ ] Edit description - Updates description
- [ ] Link database - Adds database to group
- [ ] Unlink database - Removes database from group
- [ ] Set default database - Sets default for new documents
- [ ] Delete group - Confirmation modal, removes group
- [ ] Validation - Name required, unique name

**Implementation Details**:

1. **GroupSettingsModal component**:
   - Modal with tabs: General, Databases, Danger Zone
   - General tab: Name and description inputs
   - Databases tab: DatabaseLinker component
   - Danger Zone tab: Delete group button
   - Save button (updates group)
   - Cancel button (closes modal)

2. **DatabaseLinker component**:
   - List of all available databases (from VectorDatabaseManager)
   - Checkboxes to link/unlink databases
   - Radio buttons for default database selection
   - Shows linked databases count

3. **SDK Integration**:
   - Update: `sessionGroupManager.updateSessionGroup(groupId, requestor, { name, description })`
   - Link: `sessionGroupManager.linkVectorDatabase(groupId, requestor, dbId)`
   - Unlink: `sessionGroupManager.unlinkVectorDatabase(groupId, requestor, dbId)`
   - Set default: `sessionGroupManager.setDefaultDatabase(groupId, requestor, dbId)`
   - List linked: `sessionGroupManager.listLinkedDatabases(groupId, requestor)`
   - Delete: `sessionGroupManager.deleteSessionGroup(groupId, requestor)`

**Manual Testing Checklist**:
- [ ] Edit group name and description
- [ ] Link/unlink databases
- [ ] Set default database
- [ ] Delete group with confirmation
- [ ] Test validation (empty name, duplicate name)
- [ ] Test with 5+ linked databases

**Success Criteria**:
- ✅ 7/7 tests passing
- ✅ Settings update correctly
- ✅ Database linking works
- ✅ Delete group works

**Estimated Time**: 4-5 hours

---

### Sub-phase 4.3: Session History Sidebar

**Goal**: Browse past sessions within a group

**Status**: ✅ Ready for UI development

**SDK Methods Available** (already implemented):
- `sessionManager.getSessionHistory(groupId)` - Get all sessions in group (sorted by startTime desc)
- `sessionManager.loadSession(sessionId)` - Load session messages (if implemented)

**Files to Create**:
- `apps/harness/components/session-groups/SessionHistory.tsx` (≤300 lines)
- `apps/harness/components/session-groups/SessionCard.tsx` (≤150 lines)

**Component Tests**:
- [ ] Renders session list - Shows all sessions in group
- [ ] Session card - Title (first message), date, preview
- [ ] Load session - Click to load messages
- [ ] Search sessions - Filter by message content
- [ ] Sort sessions - By date (newest first by default)
- [ ] Empty state - Shows "No sessions" message

**Implementation Details**:

1. **SessionHistory component**:
   - Sidebar (left or right side)
   - List of SessionCard components
   - Search bar (filters by message content)
   - Sort dropdown (date desc/asc)
   - "New Session" button at top

2. **SessionCard component**:
   - Session title (first user message, truncated to 40 chars)
   - Date and time (relative: "2 hours ago")
   - Message preview (first assistant response, 60 chars)
   - Click to load session
   - Active session indicator (blue background)

3. **SDK Integration**:
   - Fetch sessions: `sessionManager.getSessionHistory(groupId)`
   - Load session: `sessionManager.loadSession(sessionId)` (if available)
   - Sessions already sorted by `startTime` descending

**Manual Testing Checklist**:
- [ ] View session history for group with 10+ sessions
- [ ] Load past session (if load method exists)
- [ ] Search sessions by content
- [ ] Test sort by date
- [ ] Test empty state (new group with no sessions)
- [ ] Test active session indicator

**Success Criteria**:
- ✅ 6/6 tests passing
- ✅ Session history displays correctly
- ✅ Load session works (if implemented)
- ✅ Search works

**Estimated Time**: 3-5 hours

---

## Phase 6: Dashboard & Navigation

**Goal**: Main dashboard with navigation and stats

**Estimated Time**: 8-12 hours

**SDK Backend Status**: ✅ Complete (all managers available)

### Sub-phase 6.1: Navigation Bar

**Goal**: Top navigation with breadcrumbs and search

**Status**: ✅ Ready for UI development

**Files to Create**:
- `apps/harness/components/layout/NavBar.tsx` (≤250 lines)
- `apps/harness/components/layout/Breadcrumbs.tsx` (≤150 lines)
- `apps/harness/components/layout/GlobalSearch.tsx` (≤200 lines)

**Component Tests**:
- [ ] Renders nav bar - Logo, links, search, user menu
- [ ] Breadcrumbs - Shows current location path
- [ ] Global search - Search across groups, databases, sessions
- [ ] User menu - Dropdown with settings, logout

**Implementation Details**:

1. **NavBar component**:
   - Logo (links to dashboard)
   - Navigation links: Dashboard, Groups, Databases, Settings
   - Global search bar (GlobalSearch component)
   - User avatar/menu dropdown

2. **Breadcrumbs component**:
   - Current location path (e.g., "Dashboard > Group Name > Session")
   - Clickable breadcrumb links
   - Auto-generated from route

3. **GlobalSearch component**:
   - Search input with icon
   - Results dropdown (groups, databases, sessions)
   - Recent searches (localStorage)
   - Keyboard shortcut (Cmd+K)

**Manual Testing Checklist**:
- [ ] Navigate between pages via nav links
- [ ] Test global search
- [ ] Test breadcrumbs on different pages
- [ ] Test user menu dropdown
- [ ] Test keyboard shortcut (Cmd+K)

**Success Criteria**:
- ✅ 4/4 tests passing
- ✅ Navigation works
- ✅ Search works
- ✅ Breadcrumbs accurate

**Estimated Time**: 3-4 hours

---

### Sub-phase 6.2: Dashboard Overview

**Goal**: Stats dashboard with recent activity

**Status**: ✅ Ready for UI development

**SDK Methods Available**:
- `sessionGroupManager.listSessionGroups(owner)` - Get groups count
- `VectorDatabaseManager.listDatabases()` - Get databases count (when implemented)
- `sessionManager.getSessionHistory(groupId)` - Get recent sessions

**Files to Create**:
- `apps/harness/pages/dashboard.tsx` (≤400 lines)
- `apps/harness/components/dashboard/StatsCard.tsx` (≤150 lines)
- `apps/harness/components/dashboard/RecentActivity.tsx` (≤250 lines)

**Component Tests**:
- [ ] Stats cards - Total groups, databases, sessions
- [ ] Recent activity - Shows last 10 activities
- [ ] Quick actions - New group, new database buttons
- [ ] Loading state - Spinner while fetching

**Implementation Details**:

1. **dashboard.tsx page**:
   - Stats cards row (groups, databases, sessions counts)
   - Recent activity feed (last 10 sessions)
   - Quick action buttons (New Group, New Database)

2. **StatsCard component**:
   - Large number with label
   - Icon (group/database/chat icon)
   - Trend indicator (up/down arrow with %)
   - Click to navigate to list view

3. **RecentActivity component**:
   - Activity list (newest first)
   - Activity type icons (message, upload, etc.)
   - Relative timestamps ("2 hours ago")
   - Click to view session

**Manual Testing Checklist**:
- [ ] View dashboard with accurate stats
- [ ] Check recent activity feed
- [ ] Test quick action buttons
- [ ] Test navigation from stats cards
- [ ] Test with empty state (new user)

**Success Criteria**:
- ✅ 4/4 tests passing
- ✅ Stats accurate
- ✅ Recent activity works
- ✅ Quick actions work

**Estimated Time**: 4-6 hours

---

### Sub-phase 6.3: Keyboard Shortcuts

**Goal**: Keyboard shortcuts for common actions

**Status**: ✅ Ready for UI development

**Files to Create**:
- `apps/harness/hooks/useKeyboardShortcuts.ts` (≤200 lines)
- `apps/harness/components/layout/ShortcutsModal.tsx` (≤150 lines)

**Shortcuts to Implement**:
- `Cmd+Shift+G` - New group
- `Cmd+N` - New session
- `Cmd+K` - Global search
- `Cmd+,` - Settings
- `?` - Show shortcuts help

**Component Tests**:
- [ ] New group - Cmd+Shift+G opens create group modal
- [ ] New session - Cmd+N starts new session
- [ ] Search - Cmd+K focuses search bar
- [ ] Settings - Cmd+, opens settings page
- [ ] Help - ? opens shortcuts modal

**Implementation Details**:

1. **useKeyboardShortcuts hook**:
   - Register keyboard shortcuts
   - Handle key combinations (Cmd/Ctrl detection)
   - Prevent conflicts with browser shortcuts
   - Disable when input fields focused

2. **ShortcutsModal component**:
   - Modal showing all shortcuts
   - Grouped by category (Navigation, Actions, etc.)
   - Opens with ? key
   - Close with Esc or click outside

**Manual Testing Checklist**:
- [ ] Test each shortcut individually
- [ ] Verify Cmd on Mac, Ctrl on Windows
- [ ] Test shortcuts don't interfere with inputs
- [ ] Test shortcuts modal (? key)
- [ ] Test close shortcuts modal (Esc)

**Success Criteria**:
- ✅ 5/5 tests passing
- ✅ All shortcuts work
- ✅ Shortcuts modal accurate
- ✅ No conflicts with browser

**Estimated Time**: 2-3 hours

---

## Phase 7: Settings & Advanced Features

**Goal**: User settings and advanced features

**Estimated Time**: 6-10 hours

**SDK Backend Status**: ✅ Complete (all managers available)

### Sub-phase 7.1: User Settings Page

**Goal**: Settings for preferences, account, and data export

**Status**: ✅ Ready for UI development

**Files to Create**:
- `apps/harness/pages/settings.tsx` (≤400 lines)
- `apps/harness/components/settings/SettingsSection.tsx` (≤150 lines)
- `apps/harness/components/settings/AccountSettings.tsx` (≤200 lines)

**Component Tests**:
- [ ] Preferences - Theme (light/dark), language, notifications
- [ ] Account - Display wallet address, S5 seed (masked)
- [ ] Export data - Download all groups/sessions as JSON
- [ ] Delete account - Confirmation, removes all data

**Implementation Details**:

1. **settings.tsx page**:
   - Sidebar navigation (Preferences, Account, Advanced)
   - Settings content area
   - Save button (persists to localStorage/SDK)

2. **SettingsSection component**:
   - Section title and description
   - Settings controls (toggles, selects, inputs)
   - Save/reset buttons

3. **AccountSettings component**:
   - Wallet address display (read-only)
   - S5 seed display (masked with show/hide toggle)
   - Export data button (downloads JSON)
   - Delete account button (confirmation modal)

**Manual Testing Checklist**:
- [ ] Change preferences (theme, etc.)
- [ ] Verify settings persist on reload
- [ ] Export data to JSON
- [ ] Verify exported data structure
- [ ] Test delete account (use test account!)

**Success Criteria**:
- ✅ 4/4 tests passing
- ✅ Settings save correctly
- ✅ Export works
- ✅ Delete account works

**Estimated Time**: 3-5 hours

---

### Sub-phase 7.2: Bulk Operations

**Goal**: Bulk actions for sessions and documents

**Status**: ✅ Ready for UI development (SDK methods available)

**Files to Create**:
- `apps/harness/components/common/BulkActions.tsx` (≤250 lines)

**Component Tests**:
- [ ] Select all - Checkbox to select all items
- [ ] Bulk delete - Delete multiple sessions/documents
- [ ] Bulk move - Move sessions to another group
- [ ] Bulk export - Export selected sessions as JSON

**Implementation Details**:

1. **BulkActions component**:
   - Select all checkbox (table header)
   - Actions toolbar (appears when items selected)
   - Buttons: Delete, Move, Export
   - Progress indicator for bulk operations
   - Cancel button for long operations

2. **Integration Points**:
   - SessionHistory: Bulk delete/move sessions
   - FileBrowser: Bulk delete documents
   - Use SDK methods in loops with progress tracking

**Manual Testing Checklist**:
- [ ] Select multiple sessions
- [ ] Delete multiple sessions with confirmation
- [ ] Move sessions to another group
- [ ] Export sessions to JSON
- [ ] Test with 50+ items
- [ ] Test cancel during bulk operation

**Success Criteria**:
- ✅ 4/4 tests passing
- ✅ Bulk actions work
- ✅ Progress indicator accurate
- ✅ Performance: 100 items < 1s

**Estimated Time**: 3-5 hours

---

## Summary

**Total UI Work**: ~54-74 hours

**Phase Breakdown**:
- Phase 2: Vector Database Management UI: 12-16 hours (⏳ Blocked on SDK)
- Phase 3: RAG Sources Transparency UI: 8-12 hours (✅ Phase 3.1 ready, 3.2 blocked)
- Phase 4: Session Groups UI: 10-14 hours (✅ Ready - SDK complete)
- Phase 6: Dashboard & Navigation: 8-12 hours (✅ Ready)
- Phase 7: Settings & Advanced Features: 6-10 hours (✅ Ready)

**Ready to Start**:
- Phase 3.1: Sources Citation in Chat
- Phase 4: All session groups UI (3 sub-phases)
- Phase 6: All dashboard/navigation (3 sub-phases)
- Phase 7: All settings (2 sub-phases)

**Blocked on SDK Backend**:
- Phase 2: All database management UI (VectorDatabaseManager not implemented)
- Phase 3.2: Document viewer (VectorDatabaseManager.getDocument not implemented)

**Prerequisites**:
- SDK backend complete (see `docs/IMPLEMENTATION_RAG_MISSING.md`)
- VectorDatabaseManager implemented (Phase 2 blocker)

**Testing Strategy**:
- Component tests using Vitest + React Testing Library
- Manual testing checklist for each sub-phase
- Performance benchmarks for rendering large datasets
- Cross-browser testing (Chrome, Firefox, Safari)

**Design Reference**:
- `apps/harness/pages/chat-context-demo.tsx` - Reference implementation
- Tailwind CSS for styling
- Maintain consistent spacing, colors, and typography
- Ensure responsive design for mobile/tablet

**Accessibility Requirements**:
- Keyboard navigation for all interactions
- ARIA labels for screen readers
- Focus indicators on interactive elements
- Color contrast compliance (WCAG AA minimum)

---

**Document Status**: Ready for UI developer (9 sub-phases ready, 4 blocked on SDK)
**Last Updated**: 2025-11-09
