# User Settings Storage via S5 - Implementation Plan

## Overview

This implementation plan extends the SDK's `StorageManager` to support persistent user settings storage via S5 decentralized storage. The feature enables cross-device preference sync, data sovereignty, and offline support for UI state management.

**Current System:**
- `StorageManager` (packages/sdk-core/src/managers/StorageManager.ts) - ~150 lines
- Existing methods: `storeConversation()`, `retrieveConversation()`, `listConversations()`
- Uses S5.js path-based API with CBOR/JSON encoding
- S5 paths: `/conversations/{sessionId}.json` for conversations

**Goal:**
Add user settings storage to `StorageManager` with:
- New methods: `saveUserSettings()`, `getUserSettings()`, `updateUserSettings()`, `clearUserSettings()`
- S5 storage path: `/user/{userId}/settings.json`
- In-memory cache with 5-minute TTL
- Schema versioning for future migrations
- Graceful offline handling

**Requirements from Spec:**
- UserSettings interface with model/host/payment/UI preferences
- Last-write-wins conflict resolution
- No encryption required (non-sensitive data)
- Cross-device sync via S5
- Cache invalidation on save
- Integration with existing S5 authentication flow

## Key Principles

1. **Test-Driven Development (TDD)**
   - Write ALL tests for a sub-phase BEFORE implementing
   - Show test failures first
   - Implement minimally to pass tests

2. **Bounded Autonomy**
   - Strict line limits per file
   - No modifications outside specified scope
   - Each sub-phase is independent

3. **Incremental Progress**
   - Small, verifiable steps
   - Each sub-phase builds on previous work
   - Can pause/resume at sub-phase boundaries

4. **S5-First Design**
   - Use S5.js path-based API (`s5.fs.put()`, `s5.fs.get()`)
   - Follow existing StorageManager patterns
   - Browser-compatible (no Node.js-specific code)

5. **No Fallbacks Policy**
   - Error on invalid state, don't fall back to defaults
   - Fail fast with clear error messages
   - Pre-MVP: breaking changes allowed

## Progress Tracking

| Phase | Sub-phase | Status | Description |
|-------|-----------|--------|-------------|
| 1 | 1.1 | ✅ Complete | UserSettings interface and types |
| 1 | 1.2 | ✅ Complete | IStorageManager extension |
| 2 | 2.1 | ✅ Complete | saveUserSettings() implementation |
| 2 | 2.2 | ✅ Complete | getUserSettings() implementation |
| 2 | 2.3 | ✅ Complete | updateUserSettings() implementation |
| 2 | 2.4 | ✅ Complete | clearUserSettings() implementation |
| 3 | 3.1 | ✅ Complete | In-memory cache with TTL |
| 3 | 3.2 | ✅ Complete | Cache invalidation strategy |
| 4 | 4.1 | ✅ Complete | S5 unavailable error handling |
| 4 | 4.2 | ✅ Complete | Offline mode support |
| 5 | 5.1 | ✅ Complete | Version migration system |
| 5 | 5.2 | ⏳ Pending | Migration tests |
| 6 | 6.1 | ⏳ Pending | SDK integration tests |
| 6 | 6.2 | ⏳ Pending | Cross-device sync tests |
| 7 | 7.1 | ⏳ Pending | API documentation |
| 7 | 7.2 | ⏳ Pending | UI integration examples |

**Legend:**
- ⏳ Pending - Not started
- 🔄 In Progress - Currently working
- ✅ Complete - Tests passing, code reviewed
- ❌ Blocked - Waiting on dependency

---

## Phase 1: Types and Interfaces

### Sub-phase 1.1: UserSettings Interface and Types

**Goal:** Define TypeScript interfaces for user settings with schema versioning support.

**Files to Create/Modify:**
- `packages/sdk-core/src/types/settings.types.ts` (NEW, max 80 lines)

**Dependencies:** None

**Tasks:**

- [x] Create `packages/sdk-core/src/types/settings.types.ts`
- [x] Define `UserSettings` interface (model, host, payment, UI prefs)
- [x] Define `UserSettingsVersion` enum (starting with V1)
- [x] Add JSDoc comments for all fields
- [x] Export types from `packages/sdk-core/src/types/index.ts`

**Test Requirements (WRITE FIRST):**

Create `packages/sdk-core/tests/types/settings.test.ts` (max 60 lines):
- [x] Test UserSettings type structure
- [x] Test version enum values
- [x] Test partial settings type
- [x] Test schema validation (runtime check)

**Expected Interface Structure:**

```typescript
// packages/sdk-core/src/types/settings.types.ts
export enum UserSettingsVersion {
  V1 = 1
}

export interface UserSettings {
  // Metadata
  version: UserSettingsVersion;
  lastUpdated: number; // Unix timestamp (milliseconds)

  // Model preferences
  selectedModel: string; // e.g., "tiny-vicuna-1b.q4_k_m.gguf"
  lastUsedModels?: string[]; // Recently used (max 5)

  // Host preferences
  lastHostAddress?: string; // Last successfully used host
  preferredHosts?: string[]; // User-favorited hosts

  // Payment preferences
  preferredPaymentToken?: 'USDC' | 'ETH';
  autoApproveAmount?: string; // Auto-approve amount (e.g., "10.0")

  // UI preferences
  advancedSettingsExpanded?: boolean;
  theme?: 'light' | 'dark' | 'auto';
}

export type PartialUserSettings = Partial<Omit<UserSettings, 'version' | 'lastUpdated'>>;
```

**Acceptance Criteria:**
- All types compile without errors
- Tests verify type structure
- JSDoc comments explain each field
- No dependencies on other SDK modules

---

### Sub-phase 1.2: IStorageManager Extension

**Goal:** Extend IStorageManager interface with user settings methods.

**Files to Modify:**
- `packages/sdk-core/src/interfaces/IStorageManager.ts` (+15 lines, total ~50 lines)

**Dependencies:** Sub-phase 1.1

**Tasks:**

- [x] Add `saveUserSettings(settings: UserSettings): Promise<void>`
- [x] Add `getUserSettings(): Promise<UserSettings | null>`
- [x] Add `updateUserSettings(partial: PartialUserSettings): Promise<void>`
- [x] Add `clearUserSettings(): Promise<void>`
- [x] Add JSDoc comments for all methods

**Test Requirements (WRITE FIRST):**

Create `packages/sdk-core/tests/interfaces/storage-manager.test.ts` (max 40 lines):
- [x] Test interface has all required methods
- [x] Test method signatures match spec
- [x] Test return types are correct

**Expected Interface Addition:**

```typescript
// packages/sdk-core/src/interfaces/IStorageManager.ts
export interface IStorageManager {
  // ... existing conversation methods ...

  /**
   * Save complete user settings to S5 storage
   * @param settings - Complete UserSettings object
   * @throws Error if S5 unavailable or save fails
   */
  saveUserSettings(settings: UserSettings): Promise<void>;

  /**
   * Load user settings from S5 storage
   * @returns UserSettings object or null if no settings exist (first-time user)
   * @throws Error if S5 unavailable (network error)
   */
  getUserSettings(): Promise<UserSettings | null>;

  /**
   * Update specific settings without overwriting entire object
   * @param partial - Partial settings to merge
   * @throws Error if S5 unavailable or update fails
   */
  updateUserSettings(partial: PartialUserSettings): Promise<void>;

  /**
   * Delete all user settings from S5 storage
   * @throws Error if S5 unavailable or delete fails
   */
  clearUserSettings(): Promise<void>;
}
```

**Acceptance Criteria:**
- Interface compiles without errors
- All methods have JSDoc comments
- Return types match spec requirements
- Tests verify interface structure

---

## Phase 2: Core Storage Methods

### Sub-phase 2.1: saveUserSettings() Implementation

**Goal:** Implement method to save complete UserSettings object to S5 storage.

**Files to Modify:**
- `packages/sdk-core/src/managers/StorageManager.ts` (+25 lines, total ~175 lines)

**Dependencies:** Sub-phase 1.2

**Tasks:**

- [x] Implement `saveUserSettings(settings: UserSettings): Promise<void>`
- [x] Use S5 path: `home/user/settings.json` (follows existing pattern)
- [x] Validate settings have version and lastUpdated
- [x] Use `s5.fs.put()` with automatic CBOR encoding
- [x] Throw clear error if S5 not initialized

**Test Requirements (WRITE FIRST):**

Create `packages/sdk-core/tests/managers/storage-settings.test.ts` (max 100 lines):
- [x] Test save valid settings succeeds
- [x] Test save validates version and lastUpdated fields
- [x] Test save throws if S5 not initialized
- [x] Test save throws on network error (mock S5 failure)
- [x] Test save accepts all valid UserSettings fields

**Expected Implementation:**

```typescript
// packages/sdk-core/src/managers/StorageManager.ts
async saveUserSettings(settings: UserSettings): Promise<void> {
  if (!this.s5) {
    throw new Error('S5 storage not initialized. Call authenticate() first.');
  }

  // Validate required fields
  if (!settings.version || !settings.lastUpdated) {
    throw new Error('UserSettings must have version and lastUpdated fields');
  }

  const settingsPath = '/user/settings.json';

  try {
    // S5 automatically encodes object as CBOR
    await this.s5.fs.put(settingsPath, settings);
  } catch (error: any) {
    throw new Error(`Failed to save user settings: ${error.message}`);
  }
}
```

**Acceptance Criteria:**
- Method saves settings to S5 at `/user/settings.json`
- Settings are CBOR-encoded automatically
- Clear error messages for all failure cases
- All tests pass

---

### Sub-phase 2.2: getUserSettings() Implementation

**Goal:** Implement method to load UserSettings from S5 storage.

**Files to Modify:**
- `packages/sdk-core/src/managers/StorageManager.ts` (+20 lines, total ~195 lines)

**Dependencies:** Sub-phase 2.1

**Tasks:**

- [x] Implement `getUserSettings(): Promise<UserSettings | null>`
- [x] Use S5 path: `home/user/settings.json` (follows existing pattern)
- [x] Return `null` if settings file doesn't exist (first-time user)
- [x] Use `s5.fs.get()` with automatic CBOR decoding
- [x] Validate returned data has required fields

**Test Requirements (WRITE FIRST):**

Update `packages/sdk-core/tests/managers/storage-settings.test.ts` (+89 lines):
- [x] Test get returns saved settings
- [x] Test get returns null for first-time user
- [x] Test get throws if S5 not initialized
- [x] Test get throws on network error (non "not found" errors)
- [x] Test get validates settings structure (version and lastUpdated)

**Expected Implementation:**

```typescript
// packages/sdk-core/src/managers/StorageManager.ts
async getUserSettings(): Promise<UserSettings | null> {
  if (!this.s5) {
    throw new Error('S5 storage not initialized. Call authenticate() first.');
  }

  const settingsPath = '/user/settings.json';

  try {
    // S5 automatically decodes CBOR to object
    const settings = await this.s5.fs.get(settingsPath);

    // Return null if no settings file exists (first-time user)
    if (!settings) {
      return null;
    }

    // Validate structure
    if (!settings.version || !settings.lastUpdated) {
      throw new Error('Invalid UserSettings structure in S5 storage');
    }

    return settings as UserSettings;
  } catch (error: any) {
    if (error.message.includes('not found') || error.message.includes('does not exist')) {
      return null;
    }
    throw new Error(`Failed to load user settings: ${error.message}`);
  }
}
```

**Acceptance Criteria:**
- Method loads settings from S5
- Returns null for first-time users
- Validates settings structure
- All tests pass

---

### Sub-phase 2.3: updateUserSettings() Implementation

**Goal:** Implement method to update specific settings without overwriting entire object.

**Files to Modify:**
- `packages/sdk-core/src/managers/StorageManager.ts` (+25 lines, total ~220 lines)

**Dependencies:** Sub-phase 2.2

**Tasks:**

- [x] Implement `updateUserSettings(partial: PartialUserSettings): Promise<void>`
- [x] Load current settings via getUserSettings()
- [x] Merge partial update with existing settings
- [x] Update lastUpdated timestamp
- [x] Save merged result via saveUserSettings()
- [x] Handle case where no settings exist (create new)

**Test Requirements (WRITE FIRST):**

Update `packages/sdk-core/tests/managers/storage-settings.test.ts` (+137 lines):
- [x] Test update merges with existing settings
- [x] Test update preserves unchanged fields
- [x] Test update updates lastUpdated timestamp
- [x] Test update creates new settings if none exist
- [x] Test update throws on network error
- [x] Test update handles empty partial
- [x] Test update throws if not initialized

**Expected Implementation:**

```typescript
// packages/sdk-core/src/managers/StorageManager.ts
async updateUserSettings(partial: PartialUserSettings): Promise<void> {
  if (!this.s5) {
    throw new Error('S5 storage not initialized. Call authenticate() first.');
  }

  try {
    // Load current settings
    const current = await this.getUserSettings();

    // If no settings exist, create new with defaults
    const merged: UserSettings = current
      ? { ...current, ...partial, lastUpdated: Date.now() }
      : {
          version: UserSettingsVersion.V1,
          lastUpdated: Date.now(),
          ...partial,
          selectedModel: partial.selectedModel || '', // Required field
        };

    // Save merged settings
    await this.saveUserSettings(merged);
  } catch (error: any) {
    throw new Error(`Failed to update user settings: ${error.message}`);
  }
}
```

**Acceptance Criteria:**
- Method merges partial update with existing settings
- Preserves unchanged fields
- Creates new settings if none exist
- All tests pass

---

### Sub-phase 2.4: clearUserSettings() Implementation

**Goal:** Implement method to delete all user settings from S5 storage.

**Files to Modify:**
- `packages/sdk-core/src/managers/StorageManager.ts` (+15 lines, total ~235 lines)

**Dependencies:** Sub-phase 2.3

**Tasks:**

- [x] Implement `clearUserSettings(): Promise<void>`
- [x] Use `s5.fs.delete()` to remove settings file
- [x] Don't throw if settings file doesn't exist (delete returns false)
- [x] Error handling with SDKError

**Test Requirements (WRITE FIRST):**

Update `packages/sdk-core/tests/managers/storage-settings.test.ts` (+54 lines):
- [x] Test clear removes settings file
- [x] Test subsequent get returns null after clear
- [x] Test clear doesn't throw if no settings exist
- [x] Test clear throws on network error
- [x] Test clear throws if not initialized

**Expected Implementation:**

```typescript
// packages/sdk-core/src/managers/StorageManager.ts
async clearUserSettings(): Promise<void> {
  if (!this.s5) {
    throw new Error('S5 storage not initialized. Call authenticate() first.');
  }

  const settingsPath = '/user/settings.json';

  try {
    const deleted = await this.s5.fs.delete(settingsPath);
    // Note: delete() returns false if file doesn't exist (not an error)
  } catch (error: any) {
    throw new Error(`Failed to clear user settings: ${error.message}`);
  }
}
```

**Acceptance Criteria:**
- Method deletes settings file from S5
- Doesn't throw if settings don't exist
- All tests pass

---

## Phase 3: Caching Layer

### Sub-phase 3.1: In-Memory Cache with TTL

**Goal:** Add in-memory cache with 5-minute TTL to reduce S5 calls.

**Files to Modify:**
- `packages/sdk-core/src/managers/StorageManager.ts` (+40 lines, total ~275 lines)

**Dependencies:** Sub-phase 2.4

**Tasks:**

- [x] Add private `settingsCache` property
- [x] Add private `CACHE_TTL` constant (5 minutes)
- [x] Modify `getUserSettings()` to check cache first
- [x] Update cache on successful load
- [x] Add cache hit/miss logging for debugging

**Test Requirements (WRITE FIRST):**

Update `packages/sdk-core/tests/managers/storage-settings.test.ts` (+50 lines):
- [x] Test cache returns cached value within TTL
- [x] Test cache expires after 5 minutes
- [x] Test cache hit reduces S5 calls
- [x] Test cache miss calls S5
- [x] Test concurrent calls use same cached value

**Expected Implementation:**

```typescript
// packages/sdk-core/src/managers/StorageManager.ts
export class StorageManager implements IStorageManager {
  private s5: S5 | null = null;

  // User settings cache
  private settingsCache: {
    data: UserSettings | null;
    timestamp: number;
  } | null = null;

  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // ... existing code ...

  async getUserSettings(): Promise<UserSettings | null> {
    if (!this.s5) {
      throw new Error('S5 storage not initialized. Call authenticate() first.');
    }

    // Check cache first
    if (this.settingsCache) {
      const age = Date.now() - this.settingsCache.timestamp;
      if (age < this.CACHE_TTL) {
        console.log('[StorageManager] Cache hit for user settings');
        return this.settingsCache.data;
      }
      console.log('[StorageManager] Cache expired, fetching from S5');
    }

    const settingsPath = '/user/settings.json';

    try {
      const settings = await this.s5.fs.get(settingsPath);

      if (!settings) {
        // Update cache with null (first-time user)
        this.settingsCache = {
          data: null,
          timestamp: Date.now(),
        };
        return null;
      }

      if (!settings.version || !settings.lastUpdated) {
        throw new Error('Invalid UserSettings structure in S5 storage');
      }

      // Update cache
      this.settingsCache = {
        data: settings as UserSettings,
        timestamp: Date.now(),
      };

      return settings as UserSettings;
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('does not exist')) {
        // Update cache with null
        this.settingsCache = {
          data: null,
          timestamp: Date.now(),
        };
        return null;
      }
      throw new Error(`Failed to load user settings: ${error.message}`);
    }
  }
}
```

**Acceptance Criteria:**
- Cache reduces S5 calls
- Cache expires after 5 minutes
- All tests pass

---

### Sub-phase 3.2: Cache Invalidation Strategy

**Goal:** Invalidate cache when settings are saved or updated.

**Files to Modify:**
- `packages/sdk-core/src/managers/StorageManager.ts` (+15 lines, total ~290 lines)

**Dependencies:** Sub-phase 3.1

**Tasks:**

- [x] Modify `saveUserSettings()` to update cache
- [x] Modify `updateUserSettings()` to update cache
- [x] Modify `clearUserSettings()` to invalidate cache
- [x] Add cache invalidation logging

**Test Requirements (WRITE FIRST):**

Update `packages/sdk-core/tests/managers/storage-settings.test.ts` (+40 lines):
- [x] Test save invalidates cache
- [x] Test update invalidates cache
- [x] Test clear invalidates cache
- [x] Test subsequent get uses new cache

**Expected Implementation:**

```typescript
// packages/sdk-core/src/managers/StorageManager.ts
async saveUserSettings(settings: UserSettings): Promise<void> {
  if (!this.s5) {
    throw new Error('S5 storage not initialized. Call authenticate() first.');
  }

  if (!settings.version || !settings.lastUpdated) {
    throw new Error('UserSettings must have version and lastUpdated fields');
  }

  const settingsPath = '/user/settings.json';

  try {
    await this.s5.fs.put(settingsPath, settings);

    // Update cache
    this.settingsCache = {
      data: settings,
      timestamp: Date.now(),
    };
    console.log('[StorageManager] Cache updated after save');
  } catch (error: any) {
    throw new Error(`Failed to save user settings: ${error.message}`);
  }
}

async clearUserSettings(): Promise<void> {
  if (!this.s5) {
    throw new Error('S5 storage not initialized. Call authenticate() first.');
  }

  const settingsPath = '/user/settings.json';

  try {
    await this.s5.fs.delete(settingsPath);

    // Invalidate cache
    this.settingsCache = null;
    console.log('[StorageManager] Cache invalidated after clear');
  } catch (error: any) {
    throw new Error(`Failed to clear user settings: ${error.message}`);
  }
}
```

**Acceptance Criteria:**
- Save updates cache immediately
- Update updates cache immediately
- Clear invalidates cache
- All tests pass

---

## Phase 4: Error Handling

### Sub-phase 4.1: S5 Unavailable Error Handling

**Goal:** Handle S5 unavailable errors gracefully with clear error codes.

**Files to Modify:**
- `packages/sdk-core/src/types/settings.types.ts` (+15 lines, total ~95 lines)
- `packages/sdk-core/src/managers/StorageManager.ts` (+20 lines, total ~310 lines)

**Dependencies:** Sub-phase 3.2

**Tasks:**

- [x] Define error codes enum (S5_UNAVAILABLE, NETWORK_ERROR, INVALID_SETTINGS)
  - Note: Used existing SDKError with codes (STORAGE_NOT_INITIALIZED, INVALID_SETTINGS, etc.)
- [x] Wrap all S5 calls in try-catch with error code detection
- [x] Add error code to thrown errors
- [x] Document expected errors in JSDoc

**Test Requirements (WRITE FIRST):**

Update `packages/sdk-core/tests/managers/storage-settings.test.ts` (+138 lines):
- [x] Test S5 unavailable throws with STORAGE_NOT_INITIALIZED code
- [x] Test network error throws with appropriate error code
- [x] Test invalid settings throws with INVALID_SETTINGS code
- [x] Test error messages are user-friendly
- [x] Test original errors preserved in details
- [x] Test all operations (save, get, update, clear) have error codes

**Expected Error Codes:**

```typescript
// packages/sdk-core/src/types/settings.types.ts
export enum UserSettingsErrorCode {
  S5_UNAVAILABLE = 'S5_UNAVAILABLE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_SETTINGS = 'INVALID_SETTINGS',
  PARSE_ERROR = 'PARSE_ERROR'
}

export class UserSettingsError extends Error {
  constructor(
    public code: UserSettingsErrorCode,
    message: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'UserSettingsError';
  }
}
```

**Acceptance Criteria:**
- All S5 errors have error codes
- Error messages are user-friendly
- All tests pass

---

### Sub-phase 4.2: Offline Mode Support

**Goal:** Support offline mode with cached data fallback.

**Files to Modify:**
- `packages/sdk-core/src/managers/StorageManager.ts` (+25 lines, total ~335 lines)

**Dependencies:** Sub-phase 4.1

**Tasks:**

- [x] Add `getOfflineMode` configuration option
  - Note: Implemented as automatic fallback behavior, not a config option
- [x] Return cached data if available when S5 unavailable
- [ ] Queue settings changes for sync when back online
  - Note: Deferred to post-MVP (adds complexity, not critical for core functionality)
- [x] Add offline status logging

**Test Requirements (WRITE FIRST):**

Update `packages/sdk-core/tests/managers/storage-settings.test.ts` (+104 lines):
- [x] Test offline mode returns cached data (stale cache)
- [x] Test offline mode throws if no cache
- [x] Test network errors return stale cache
- [x] Test null cached for first-time user
- [x] Test fresh cache prioritized over network error fallback

**Expected Implementation:**

```typescript
// packages/sdk-core/src/managers/StorageManager.ts
async getUserSettings(): Promise<UserSettings | null> {
  if (!this.s5) {
    throw new UserSettingsError(
      UserSettingsErrorCode.S5_UNAVAILABLE,
      'S5 storage not initialized. Call authenticate() first.'
    );
  }

  // Check cache first (always)
  if (this.settingsCache) {
    const age = Date.now() - this.settingsCache.timestamp;
    if (age < this.CACHE_TTL) {
      return this.settingsCache.data;
    }
  }

  const settingsPath = '/user/settings.json';

  try {
    const settings = await this.s5.fs.get(settingsPath);

    // ... existing logic ...

  } catch (error: any) {
    // Network error - return cached data if available
    if (error.message.includes('network') || error.message.includes('timeout')) {
      if (this.settingsCache) {
        console.warn('[StorageManager] Using stale cache due to network error');
        return this.settingsCache.data;
      }
      throw new UserSettingsError(
        UserSettingsErrorCode.NETWORK_ERROR,
        'Network error and no cached data available',
        error
      );
    }

    // ... existing error handling ...
  }
}
```

**Acceptance Criteria:**
- Offline mode returns cached data
- Clear error messages for offline scenarios
- All tests pass

---

## Phase 5: Schema Versioning

### Sub-phase 5.1: Version Migration System

**Goal:** Support schema migrations for future UserSettings versions.

**Files to Create/Modify:**
- `packages/sdk-core/src/managers/migrations/user-settings.ts` (NEW, max 60 lines)
- `packages/sdk-core/src/managers/StorageManager.ts` (+20 lines, total ~355 lines)

**Dependencies:** Sub-phase 4.2

**Tasks:**

- [x] Create migration system for UserSettings
- [x] Add `migrateUserSettings(settings: any): UserSettings` method
- [x] Implement V1 → current version migration
- [x] Call migration in `getUserSettings()`

**Test Requirements (WRITE FIRST):**

Create `packages/sdk-core/tests/managers/settings-migration.test.ts` (118 lines):
- [x] Test V1 settings pass through unchanged
- [x] Test unknown version throws error
- [x] Test migration preserves all V1 fields
- [x] Test missing version field throws error
- [x] Test clear error message for unsupported version
- [x] Test migration doesn't modify original object
- [x] Test handles minimal V1 settings

**Expected Implementation:**

```typescript
// packages/sdk-core/src/managers/migrations/user-settings.ts
import { UserSettings, UserSettingsVersion } from '../../types/settings.types';

export function migrateUserSettings(settings: any): UserSettings {
  if (!settings.version) {
    throw new Error('UserSettings missing version field');
  }

  // Currently only V1 exists
  if (settings.version === UserSettingsVersion.V1) {
    return settings as UserSettings;
  }

  // Future migrations will go here
  // Example for V2:
  // if (settings.version === UserSettingsVersion.V1) {
  //   return migrateV1toV2(settings);
  // }

  throw new Error(`Unsupported UserSettings version: ${settings.version}`);
}

// Modify StorageManager to use migration
async getUserSettings(): Promise<UserSettings | null> {
  // ... existing cache check ...

  try {
    const rawSettings = await this.s5.fs.get(settingsPath);

    if (!rawSettings) {
      // ... existing null handling ...
    }

    // Migrate to current version
    const settings = migrateUserSettings(rawSettings);

    // Update cache with migrated settings
    this.settingsCache = {
      data: settings,
      timestamp: Date.now(),
    };

    return settings;
  } catch (error: any) {
    // ... existing error handling ...
  }
}
```

**Acceptance Criteria:**
- Migration system supports V1
- Unknown versions throw clear errors
- All tests pass

---

### Sub-phase 5.2: Migration Tests

**Goal:** Comprehensive tests for future migration scenarios.

**Files to Modify:**
- `packages/sdk-core/tests/managers/settings-migration.test.ts` (+40 lines, total ~120 lines)

**Dependencies:** Sub-phase 5.1

**Tasks:**

- [ ] Test V1 to V2 migration (future)
- [ ] Test migration preserves all fields
- [ ] Test migration updates version
- [ ] Test migration with missing fields
- [ ] Test migration error handling

**Test Requirements (WRITE FIRST):**

```typescript
// packages/sdk-core/tests/managers/settings-migration.test.ts
describe('UserSettings Migration', () => {
  it('should pass V1 settings through unchanged', () => {
    const v1Settings = {
      version: UserSettingsVersion.V1,
      lastUpdated: Date.now(),
      selectedModel: 'test-model',
    };

    const migrated = migrateUserSettings(v1Settings);
    expect(migrated).toEqual(v1Settings);
  });

  it('should throw on missing version field', () => {
    const invalidSettings = { selectedModel: 'test' };
    expect(() => migrateUserSettings(invalidSettings)).toThrow('missing version field');
  });

  it('should throw on unknown version', () => {
    const unknownVersion = {
      version: 999,
      lastUpdated: Date.now(),
    };
    expect(() => migrateUserSettings(unknownVersion)).toThrow('Unsupported UserSettings version');
  });

  // Future test for V2 migration
  it.skip('should migrate V1 to V2 adding new fields', () => {
    const v1Settings = {
      version: UserSettingsVersion.V1,
      lastUpdated: Date.now(),
      selectedModel: 'test-model',
    };

    const v2Settings = migrateUserSettings(v1Settings);
    expect(v2Settings.version).toBe(UserSettingsVersion.V2);
    expect(v2Settings.newField).toBeDefined(); // V2 field
  });
});
```

**Acceptance Criteria:**
- Migration tests cover all scenarios
- Future migrations can be added easily
- All tests pass

---

## Phase 6: Integration

### Sub-phase 6.1: SDK Integration Tests

**Goal:** End-to-end tests with real SDK instance and S5 storage.

**Files to Create:**
- `packages/sdk-core/tests/integration/user-settings-flow.test.ts` (NEW, max 150 lines)

**Dependencies:** Sub-phase 5.2

**Tasks:**

- [ ] Create integration test with real S5 instance
- [ ] Test full workflow: save → get → update → clear
- [ ] Test cross-device sync simulation
- [ ] Test cache behavior
- [ ] Test error scenarios

**Test Requirements (WRITE FIRST):**

```typescript
// packages/sdk-core/tests/integration/user-settings-flow.test.ts
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { UserSettings, UserSettingsVersion } from '../../src/types/settings.types';

describe('User Settings Integration', () => {
  let sdk: FabstirSDKCore;
  let storageManager: IStorageManager;

  beforeAll(async () => {
    // Initialize SDK with test credentials
    sdk = new FabstirSDKCore({ mode: 'test' });
    await sdk.authenticate(process.env.TEST_USER_1_PRIVATE_KEY!);
    storageManager = await sdk.getStorageManager();

    // Clear any existing settings
    await storageManager.clearUserSettings();
  });

  it('should save and retrieve user settings', async () => {
    const settings: UserSettings = {
      version: UserSettingsVersion.V1,
      lastUpdated: Date.now(),
      selectedModel: 'tiny-vicuna-1b.q4_k_m.gguf',
      preferredPaymentToken: 'USDC',
      theme: 'dark',
    };

    await storageManager.saveUserSettings(settings);
    const retrieved = await storageManager.getUserSettings();

    expect(retrieved).not.toBeNull();
    expect(retrieved!.selectedModel).toBe(settings.selectedModel);
    expect(retrieved!.preferredPaymentToken).toBe('USDC');
  });

  it('should update specific settings', async () => {
    await storageManager.updateUserSettings({
      selectedModel: 'mistral-7b.q4_k_m.gguf',
    });

    const updated = await storageManager.getUserSettings();
    expect(updated!.selectedModel).toBe('mistral-7b.q4_k_m.gguf');
    expect(updated!.preferredPaymentToken).toBe('USDC'); // Unchanged
  });

  it('should use cache within 5 minutes', async () => {
    const firstCall = await storageManager.getUserSettings();
    const secondCall = await storageManager.getUserSettings();

    // Should be same instance (from cache)
    expect(firstCall).toBe(secondCall);
  });

  it('should clear settings completely', async () => {
    await storageManager.clearUserSettings();
    const cleared = await storageManager.getUserSettings();

    expect(cleared).toBeNull();
  });
});
```

**Acceptance Criteria:**
- Integration tests pass with real S5
- Tests verify end-to-end workflow
- All tests pass

---

### Sub-phase 6.2: Cross-Device Sync Tests

**Goal:** Test settings sync across multiple SDK instances (simulating devices).

**Files to Modify:**
- `packages/sdk-core/tests/integration/user-settings-flow.test.ts` (+50 lines, total ~200 lines)

**Dependencies:** Sub-phase 6.1

**Tasks:**

- [ ] Create two SDK instances with same credentials
- [ ] Test settings saved on Device A appear on Device B
- [ ] Test last-write-wins conflict resolution
- [ ] Test cache expiry triggers reload

**Test Requirements (WRITE FIRST):**

```typescript
// packages/sdk-core/tests/integration/user-settings-flow.test.ts
describe('Cross-Device Sync', () => {
  let deviceA: FabstirSDKCore;
  let deviceB: FabstirSDKCore;
  let storageA: IStorageManager;
  let storageB: IStorageManager;

  beforeAll(async () => {
    // Initialize two SDK instances with same credentials
    deviceA = new FabstirSDKCore({ mode: 'test' });
    deviceB = new FabstirSDKCore({ mode: 'test' });

    await deviceA.authenticate(process.env.TEST_USER_1_PRIVATE_KEY!);
    await deviceB.authenticate(process.env.TEST_USER_1_PRIVATE_KEY!);

    storageA = await deviceA.getStorageManager();
    storageB = await deviceB.getStorageManager();

    // Clear settings
    await storageA.clearUserSettings();
  });

  it('should sync settings from Device A to Device B', async () => {
    // Save on Device A
    await storageA.saveUserSettings({
      version: UserSettingsVersion.V1,
      lastUpdated: Date.now(),
      selectedModel: 'device-a-model',
      theme: 'light',
    });

    // Wait for S5 propagation
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Load on Device B
    const settingsB = await storageB.getUserSettings();
    expect(settingsB!.selectedModel).toBe('device-a-model');
    expect(settingsB!.theme).toBe('light');
  });

  it('should implement last-write-wins on conflict', async () => {
    // Device A saves
    await storageA.updateUserSettings({ selectedModel: 'model-a' });

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));

    // Device B saves (should win)
    await storageB.updateUserSettings({ selectedModel: 'model-b' });

    // Wait for propagation
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Both devices should see Device B's value
    const settingsA = await storageA.getUserSettings();
    const settingsB = await storageB.getUserSettings();

    expect(settingsA!.selectedModel).toBe('model-b');
    expect(settingsB!.selectedModel).toBe('model-b');
  });
});
```

**Acceptance Criteria:**
- Cross-device sync works correctly
- Last-write-wins resolution verified
- All tests pass

---

## Phase 7: Documentation

### Sub-phase 7.1: API Documentation

**Goal:** Update SDK API documentation with user settings methods.

**Files to Modify:**
- `docs/SDK_API.md` (+80 lines in StorageManager section)
- `packages/sdk-core/src/types/settings.types.ts` (ensure JSDoc complete)

**Dependencies:** Sub-phase 6.2

**Tasks:**

- [ ] Add UserSettings section to SDK_API.md
- [ ] Document all four methods with examples
- [ ] Add error handling examples
- [ ] Document cache behavior
- [ ] Add migration notes for future versions

**Expected Documentation:**

````markdown
## StorageManager

### User Settings Storage

The StorageManager provides methods for persistent user settings storage via S5 decentralized storage. Settings are synced across devices and cached in memory for performance.

#### saveUserSettings(settings: UserSettings): Promise<void>

Save complete user settings object to S5 storage.

**Parameters:**
- `settings` (UserSettings) - Complete settings object

**Throws:**
- `UserSettingsError` with code `S5_UNAVAILABLE` if S5 not initialized
- `UserSettingsError` with code `NETWORK_ERROR` if save fails

**Example:**
```typescript
const settings: UserSettings = {
  version: UserSettingsVersion.V1,
  lastUpdated: Date.now(),
  selectedModel: 'tiny-vicuna-1b.q4_k_m.gguf',
  preferredPaymentToken: 'USDC',
  theme: 'dark'
};

await storageManager.saveUserSettings(settings);
```

#### getUserSettings(): Promise<UserSettings | null>

Load user settings from S5 storage. Returns cached value if available within 5-minute TTL.

**Returns:**
- `UserSettings` object if found
- `null` if no settings exist (first-time user)

**Throws:**
- `UserSettingsError` with code `S5_UNAVAILABLE` if S5 not initialized
- `UserSettingsError` with code `NETWORK_ERROR` if load fails and no cache available

**Example:**
```typescript
const settings = await storageManager.getUserSettings();

if (settings) {
  console.log('Last used model:', settings.selectedModel);
} else {
  console.log('First-time user, no settings found');
}
```

#### updateUserSettings(partial: PartialUserSettings): Promise<void>

Update specific settings without overwriting entire object.

**Parameters:**
- `partial` (PartialUserSettings) - Partial settings to merge

**Example:**
```typescript
// Only update model preference
await storageManager.updateUserSettings({
  selectedModel: 'mistral-7b.q4_k_m.gguf'
});

// Theme and payment preferences remain unchanged
```

#### clearUserSettings(): Promise<void>

Delete all user settings from S5 storage.

**Example:**
```typescript
await storageManager.clearUserSettings();
```

### UserSettings Interface

```typescript
interface UserSettings {
  version: UserSettingsVersion;
  lastUpdated: number; // Unix timestamp (milliseconds)
  selectedModel: string;
  lastUsedModels?: string[];
  lastHostAddress?: string;
  preferredHosts?: string[];
  preferredPaymentToken?: 'USDC' | 'ETH';
  autoApproveAmount?: string;
  advancedSettingsExpanded?: boolean;
  theme?: 'light' | 'dark' | 'auto';
}
```

### Caching Behavior

- Settings are cached in memory for 5 minutes
- Subsequent `getUserSettings()` calls within cache window return cached value
- Cache is updated on `saveUserSettings()` and `updateUserSettings()`
- Cache is invalidated on `clearUserSettings()`

### Cross-Device Sync

Settings are stored in S5 at `/user/settings.json` and synced across devices automatically. Conflict resolution uses last-write-wins strategy.

### Error Handling

```typescript
try {
  const settings = await storageManager.getUserSettings();
  return settings;
} catch (error) {
  if (error.code === 'NETWORK_ERROR') {
    console.warn('S5 unavailable, using defaults');
    return null;
  }
  throw error;
}
```
````

**Acceptance Criteria:**
- Documentation is complete and accurate
- Examples are tested and working
- All edge cases documented

---

### Sub-phase 7.2: UI Integration Examples

**Goal:** Provide React integration examples for UI developers.

**Files to Create:**
- `docs/UI_DEVELOPER_SETTINGS_GUIDE.md` (NEW, max 150 lines)

**Dependencies:** Sub-phase 7.1

**Tasks:**

- [ ] Create React hook example (`useUserSettings`)
- [ ] App initialization example
- [ ] Model selection example
- [ ] Payment preference example
- [ ] Reset preferences example

**Expected Examples:**

````markdown
# UI Developer Guide: User Settings Integration

## React Hook

```typescript
// hooks/useUserSettings.ts
import { useState, useEffect } from 'react';
import { sdk } from '../lib/sdk';

export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const storageManager = await sdk.getStorageManager();
        const userSettings = await storageManager.getUserSettings();
        setSettings(userSettings);
      } catch (err: any) {
        setError(err);
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  async function updateSettings(partial: PartialUserSettings) {
    try {
      const storageManager = await sdk.getStorageManager();
      await storageManager.updateUserSettings(partial);
      const updated = await storageManager.getUserSettings();
      setSettings(updated);
    } catch (err: any) {
      setError(err);
      throw err;
    }
  }

  return { settings, loading, error, updateSettings };
}
```

## App Initialization

```typescript
// app/chat/page.tsx
export default function ChatPage() {
  const { settings, loading } = useUserSettings();
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (settings) {
        // Returning user - restore preferences
        setSelectedModel(settings.selectedModel);
        setTheme(settings.theme || 'auto');
      } else {
        // First-time user - show setup
        setShowSetupWizard(true);
      }
    }
  }, [settings, loading]);

  if (loading) return <LoadingSpinner />;
  if (showSetupWizard) return <SetupWizard />;

  return <ChatInterface />;
}
```

## Model Selection

```typescript
// components/model-selector.tsx
import { useUserSettings } from '../hooks/useUserSettings';

export function ModelSelector() {
  const { settings, updateSettings } = useUserSettings();
  const [selectedModel, setSelectedModel] = useState(settings?.selectedModel);

  async function handleModelChange(model: string) {
    setSelectedModel(model);

    try {
      await updateSettings({ selectedModel: model });
    } catch (error) {
      console.error('Failed to save model preference:', error);
      // Non-critical - continue anyway
    }
  }

  return (
    <Select value={selectedModel} onChange={(e) => handleModelChange(e.target.value)}>
      {/* Model options */}
    </Select>
  );
}
```

## Payment Preference

```typescript
// components/payment-tabs.tsx
import { useUserSettings } from '../hooks/useUserSettings';

export function PaymentTabs() {
  const { settings, updateSettings } = useUserSettings();
  const [mode, setMode] = useState(settings?.preferredPaymentToken || 'USDC');

  async function handleModeChange(newMode: 'USDC' | 'ETH') {
    setMode(newMode);
    await updateSettings({ preferredPaymentToken: newMode });
  }

  return (
    <Tabs value={mode} onValueChange={handleModeChange}>
      <TabsList>
        <TabsTrigger value="USDC">USDC</TabsTrigger>
        <TabsTrigger value="ETH">ETH</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
```

## Reset Preferences

```typescript
// components/settings-panel.tsx
import { sdk } from '../lib/sdk';

export function SettingsPanel() {
  async function handleReset() {
    if (!confirm('Reset all preferences to defaults?')) return;

    try {
      const storageManager = await sdk.getStorageManager();
      await storageManager.clearUserSettings();
      window.location.reload();
    } catch (error) {
      console.error('Failed to reset preferences:', error);
    }
  }

  return (
    <Button variant="destructive" onClick={handleReset}>
      Reset Preferences
    </Button>
  );
}
```
````

**Acceptance Criteria:**
- UI examples are complete
- Examples follow React best practices
- All examples tested in harness

---

## Testing Strategy

### Unit Tests
- Type validation tests
- Interface compliance tests
- Method behavior tests (save, get, update, clear)
- Cache behavior tests
- Migration tests

### Integration Tests
- Full workflow tests with real S5
- Cross-device sync tests
- Error scenario tests
- Performance tests (cache hit rate)

### E2E Tests (in apps/harness)
- UI integration tests
- User flow tests (first-time user, returning user)
- Offline mode tests
- Cross-tab sync tests

## Performance Targets

- `getUserSettings()` cached: < 10ms
- `getUserSettings()` S5 fetch: < 500ms
- `saveUserSettings()`: < 500ms
- Cache hit rate: > 80%
- S5 calls per session: < 5

## Success Criteria

1. ✅ All tests pass (unit, integration, E2E)
2. ✅ StorageManager implements all four methods
3. ✅ Cache reduces S5 calls by >80%
4. ✅ Cross-device sync verified
5. ✅ Documentation complete
6. ✅ UI examples working in harness
7. ✅ No breaking changes to existing StorageManager methods
8. ✅ Line limits respected in all files

## Migration Path (Pre-MVP)

**For Existing Users:**
- First call to `getUserSettings()` returns `null` (no settings file)
- UI treats as first-time user and shows setup flow
- After setup, settings are saved
- Future sessions load persisted settings

**No Data Loss:** Existing conversations in S5 remain intact.

**No Fallbacks:** If settings fail to load, throw error - don't fall back to hardcoded defaults.

## Dependencies

**External:**
- S5.js (enhanced version from `/workspace/packages/s5js`)
- ethers.js v6 (for authentication)

**Internal:**
- AuthManager (for S5 seed generation)
- FabstirSDKCore (for SDK initialization)

**Configuration:**
- S5_SEED_PHRASE from `.env.test`
- No new environment variables required

## File Structure After Completion

```
packages/sdk-core/
├── src/
│   ├── managers/
│   │   ├── StorageManager.ts (extended, ~355 lines)
│   │   └── migrations/
│   │       └── user-settings.ts (NEW, ~60 lines)
│   ├── interfaces/
│   │   └── IStorageManager.ts (extended, ~65 lines)
│   └── types/
│       ├── settings.types.ts (NEW, ~95 lines)
│       └── index.ts (updated exports)
└── tests/
    ├── managers/
    │   ├── storage-settings.test.ts (NEW, ~200 lines)
    │   └── settings-migration.test.ts (NEW, ~120 lines)
    ├── integration/
    │   └── user-settings-flow.test.ts (NEW, ~200 lines)
    └── types/
        └── settings.test.ts (NEW, ~60 lines)
```

**Total New Lines:** ~700 (types + implementation + tests)
**Total Files Created:** 6
**Total Files Modified:** 4

---

**Next Steps:**

Start with Sub-phase 1.1 (UserSettings Interface and Types). Write tests FIRST, show failures, then implement.
