# SDK Feature Request: User Settings Storage via S5

**Date:** 2025-10-03
**Requested By:** UI Team
**Priority:** High
**Target SDK Version:** 1.2.0+

---

## Executive Summary

The UI needs to persist user preferences (selected model, host preferences, UI state) across sessions and devices. Currently, conversation history is stored in S5, but user settings are not. We propose adding user settings storage to the SDK's `StorageManager` to provide:

- **Cross-device sync**: Settings persist across user's devices
- **Data sovereignty**: User owns their preferences (stored in their S5 space)
- **Consistency**: Settings stored alongside conversations
- **Offline support**: Graceful degradation when S5 unavailable

---

## Background & Motivation

### Current UI Flow Issues

1. **User picks model every time**: No persistence of model choice
2. **Host re-discovery**: Must browse/select host on every page load
3. **Lost preferences**: Browser cache clear = lost settings
4. **No cross-device**: Desktop settings don't sync to mobile

### Business Value

- **Better UX**: Returning users see chat immediately (no setup screens)
- **Faster onboarding**: Remember first-time setup choices
- **Data ownership**: User controls their preferences (Web3 principle)
- **Future-proof**: Foundation for advanced personalization

---

## API Specification

### New Methods for `StorageManager`

#### 1. `saveUserSettings(settings: UserSettings): Promise<void>`

**Purpose:** Save complete user settings object to S5

**Parameters:**
```typescript
interface UserSettings {
  // Model preferences
  selectedModel: string;                    // e.g., "tiny-vicuna-1b.q4_k_m.gguf"
  lastUsedModels?: string[];               // Recently used models (max 5)

  // Host preferences
  lastHostAddress?: string;                // Last successfully used host
  preferredHosts?: string[];               // User-favorited hosts

  // Payment preferences
  preferredPaymentToken?: 'USDC' | 'ETH'; // Default payment method
  autoApproveAmount?: string;              // Auto-approve USDC amount (e.g., "10.0")

  // UI preferences
  advancedSettingsExpanded?: boolean;      // Show/hide advanced panel
  theme?: 'light' | 'dark' | 'auto';      // UI theme

  // Metadata
  version: number;                         // Schema version (for migrations)
  lastUpdated: number;                     // Unix timestamp
}
```

**Example:**
```typescript
await storageManager.saveUserSettings({
  selectedModel: "tiny-vicuna-1b.q4_k_m.gguf",
  preferredPaymentToken: "USDC",
  advancedSettingsExpanded: false,
  version: 1,
  lastUpdated: Date.now()
});
```

**Storage Location:** `/user/{userId}/settings.json` in S5

**Returns:** `Promise<void>` - Resolves when saved, rejects on error

---

#### 2. `getUserSettings(): Promise<UserSettings | null>`

**Purpose:** Load user settings from S5

**Example:**
```typescript
const settings = await storageManager.getUserSettings();
if (settings) {
  console.log('Last used model:', settings.selectedModel);
} else {
  console.log('No settings found (first-time user)');
}
```

**Returns:**
- `UserSettings` object if found
- `null` if no settings exist (first-time user)

**Caching:**
- Cache settings in memory for 5 minutes
- Subsequent calls within cache window return cached value
- Invalidate cache on `saveUserSettings()` call

---

#### 3. `updateUserSettings(partial: Partial<UserSettings>): Promise<void>`

**Purpose:** Update specific settings without overwriting entire object

**Example:**
```typescript
// User changes model → update only selectedModel
await storageManager.updateUserSettings({
  selectedModel: "mistral-7b.q4_k_m.gguf",
  lastUpdated: Date.now()
});

// Existing settings (theme, payment prefs, etc.) remain unchanged
```

**Implementation:**
1. Load current settings
2. Merge partial update
3. Save merged result
4. Update cache

---

#### 4. `clearUserSettings(): Promise<void>` (Optional)

**Purpose:** Delete all user settings (e.g., user clicks "Reset Preferences")

**Example:**
```typescript
await storageManager.clearUserSettings();
```

---

## Storage Implementation Details

### S5 Storage Path

```
/user/{userId}/settings.json
```

**Where:**
- `{userId}`: Derived from authenticated user's identity (S5 seed)
- Same identity used for conversation storage

**File Format:**
```json
{
  "selectedModel": "tiny-vicuna-1b.q4_k_m.gguf",
  "lastUsedModels": [
    "tiny-vicuna-1b.q4_k_m.gguf",
    "mistral-7b.q4_k_m.gguf"
  ],
  "preferredPaymentToken": "USDC",
  "advancedSettingsExpanded": false,
  "version": 1,
  "lastUpdated": 1696320000000
}
```

### Encryption (Optional Enhancement)

Settings contain no sensitive data (just preferences), so encryption is optional. However, if implemented:
- Use same encryption as conversation storage
- Symmetric key derived from user's S5 seed
- Transparent to UI (SDK handles encryption/decryption)

---

## Error Handling

### Network Errors (S5 Unavailable)

**Scenario:** User is offline or S5 portal unreachable

**Behavior:**
```typescript
try {
  const settings = await storageManager.getUserSettings();
  return settings;
} catch (error) {
  if (error.code === 'NETWORK_ERROR' || error.code === 'S5_UNAVAILABLE') {
    console.warn('S5 unavailable, using defaults');
    return null; // UI will use default settings
  }
  throw error; // Re-throw other errors
}
```

**UI Handling:**
- UI should use default settings if SDK returns `null` or throws network error
- Show warning banner: "Settings could not be loaded (offline mode)"
- Queue settings changes for next sync when online

### Sync Conflicts

**Scenario:** User changes settings on Device A, then opens Device B before sync completes

**Strategy:** **Last-write-wins** (simple, no conflict resolution needed)

**Reason:** Settings changes are rare and non-critical. If user sets model on Device A then Device B, Device B's choice should win.

**Alternative (Future Enhancement):**
- Add `lastUpdated` timestamp
- Compare timestamps on load
- Merge settings if both sides changed different fields

---

## Caching Strategy

### In-Memory Cache

```typescript
class StorageManager {
  private settingsCache: {
    data: UserSettings | null;
    timestamp: number;
  } | null = null;

  private CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async getUserSettings(): Promise<UserSettings | null> {
    // Check cache first
    if (this.settingsCache &&
        Date.now() - this.settingsCache.timestamp < this.CACHE_TTL) {
      return this.settingsCache.data;
    }

    // Load from S5
    const settings = await this.loadFromS5();

    // Update cache
    this.settingsCache = {
      data: settings,
      timestamp: Date.now()
    };

    return settings;
  }

  async saveUserSettings(settings: UserSettings): Promise<void> {
    await this.saveToS5(settings);

    // Invalidate cache
    this.settingsCache = {
      data: settings,
      timestamp: Date.now()
    };
  }
}
```

**Benefits:**
- Reduces S5 calls (faster response)
- Works offline for cached duration
- Auto-refreshes every 5 minutes (picks up cross-device changes)

---

## Migration Strategy

### Existing Users

**Problem:** Users already have conversations in S5, but no settings file

**Solution:**
1. First call to `getUserSettings()` returns `null`
2. UI treats as "first-time user" and shows setup flow
3. After user makes choices, call `saveUserSettings()`
4. Future sessions load persisted settings

**No data loss:** Existing conversations remain intact

### Schema Versioning

**Current Version:** `1`

**Future Schema Changes:**
```typescript
interface UserSettings {
  version: number; // Always include version
  // ... other fields
}

// In SDK
async getUserSettings(): Promise<UserSettings | null> {
  const settings = await this.loadFromS5();

  if (!settings) return null;

  // Migrate old schemas to current
  if (settings.version === 1 && CURRENT_VERSION === 2) {
    return this.migrateV1toV2(settings);
  }

  return settings;
}
```

---

## UI Integration Examples

### Example 1: App Initialization

```typescript
// UI: app/chat/page.tsx
useEffect(() => {
  async function initializeApp() {
    try {
      const settings = await storageManager.getUserSettings();

      if (settings) {
        // Returning user - restore preferences
        setSelectedModel(settings.selectedModel);
        setPreferredPayment(settings.preferredPaymentToken || 'USDC');
        setAdvancedExpanded(settings.advancedSettingsExpanded || false);

        // Skip setup wizard, go straight to chat
        setShowChat(true);
      } else {
        // First-time user - show setup wizard
        setShowSetupWizard(true);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Fallback to defaults
      setShowSetupWizard(true);
    }
  }

  initializeApp();
}, [storageManager]);
```

### Example 2: Model Selection

```typescript
// UI: components/model-selector.tsx
async function handleModelChange(newModel: string) {
  setSelectedModel(newModel);

  // Persist immediately
  try {
    await storageManager.updateUserSettings({
      selectedModel: newModel,
      lastUpdated: Date.now()
    });
  } catch (error) {
    console.error('Failed to save model preference:', error);
    // Non-critical error - continue anyway
  }
}
```

### Example 3: Payment Token Preference

```typescript
// UI: components/payment-mode-tabs.tsx
async function handlePaymentModeChange(mode: 'USDC' | 'ETH') {
  setPaymentMode(mode);

  await storageManager.updateUserSettings({
    preferredPaymentToken: mode,
    lastUpdated: Date.now()
  });
}
```

### Example 4: Reset Preferences

```typescript
// UI: components/settings-panel.tsx
async function handleResetPreferences() {
  if (confirm('Reset all preferences to defaults?')) {
    await storageManager.clearUserSettings();

    // Reload page to re-initialize with defaults
    window.location.reload();
  }
}
```

---

## Testing Requirements

### Unit Tests

```typescript
describe('StorageManager User Settings', () => {
  it('should save and load settings', async () => {
    const settings: UserSettings = {
      selectedModel: 'test-model',
      version: 1,
      lastUpdated: Date.now()
    };

    await storageManager.saveUserSettings(settings);
    const loaded = await storageManager.getUserSettings();

    expect(loaded).toEqual(settings);
  });

  it('should return null for first-time user', async () => {
    const settings = await storageManager.getUserSettings();
    expect(settings).toBeNull();
  });

  it('should merge partial updates', async () => {
    await storageManager.saveUserSettings({
      selectedModel: 'model-1',
      preferredPaymentToken: 'USDC',
      version: 1,
      lastUpdated: Date.now()
    });

    await storageManager.updateUserSettings({
      selectedModel: 'model-2' // Only change model
    });

    const settings = await storageManager.getUserSettings();
    expect(settings.selectedModel).toBe('model-2');
    expect(settings.preferredPaymentToken).toBe('USDC'); // Unchanged
  });

  it('should cache settings for 5 minutes', async () => {
    const settings = await storageManager.getUserSettings();

    // Mock S5 to return different data
    mockS5.setReturnValue({ selectedModel: 'different-model' });

    // Should still return cached value
    const cached = await storageManager.getUserSettings();
    expect(cached).toEqual(settings); // Same as first call
  });
});
```

### Integration Tests

1. **Cross-device sync**: Save on Device A, load on Device B
2. **Offline handling**: Save when offline, verify queued for sync
3. **Concurrent updates**: Update from two devices simultaneously
4. **Large settings**: Test with max-size settings object

---

## Performance Considerations

### Optimization Goals

- **Load time**: < 200ms to retrieve cached settings
- **Save time**: < 500ms to persist settings
- **File size**: < 5 KB settings file (JSON compressed)
- **S5 calls**: Max 1 call per 5-minute cache window

### Monitoring Metrics

Track these metrics in SDK:
```typescript
// Example metrics
{
  settingsLoadTime: 150, // ms
  settingsSaveTime: 300, // ms
  cacheHitRate: 0.85,    // 85% cache hits
  s5ErrorRate: 0.02      // 2% S5 errors
}
```

---

## Security Considerations

### Data Privacy

**Settings contain:**
- ✅ Model preferences (public models, no PII)
- ✅ Host addresses (public blockchain data)
- ✅ UI preferences (cosmetic, no PII)
- ❌ **NO** private keys, passwords, or sensitive data

**Verdict:** No encryption required (but optional for consistency)

### Access Control

**Who can access settings?**
- Only the authenticated user (owner of S5 seed)
- Settings stored in user's private S5 space
- S5 enforces access control via cryptographic identity

---

## Implementation Checklist

### SDK Developer Tasks

- [ ] Add `UserSettings` interface to SDK types
- [ ] Implement `saveUserSettings()` in StorageManager
- [ ] Implement `getUserSettings()` in StorageManager
- [ ] Implement `updateUserSettings()` in StorageManager
- [ ] Implement `clearUserSettings()` in StorageManager (optional)
- [ ] Add in-memory caching (5-minute TTL)
- [ ] Add error handling for S5 unavailable
- [ ] Write unit tests (save, load, update, cache)
- [ ] Write integration tests (cross-device, offline)
- [ ] Update SDK documentation
- [ ] Bump SDK version to 1.2.0

### UI Developer Tasks (After SDK Implementation)

- [ ] Add `useUserSettings` React hook
- [ ] Update app initialization to load settings
- [ ] Update model selector to persist choice
- [ ] Update host selector to save preferences
- [ ] Add "Reset Preferences" button
- [ ] Add offline fallback handling
- [ ] Test cross-device sync manually
- [ ] Update UI documentation

---

## Timeline Estimate

**SDK Development:** 3-5 days
- Implementation: 2 days
- Testing: 1 day
- Documentation: 1 day
- Review: 1 day

**UI Integration:** 2-3 days (after SDK ready)
- Hook implementation: 1 day
- UI updates: 1 day
- Testing: 1 day

**Total:** ~1 week

---

## Questions for SDK Developer

1. **S5 API**: Does StorageManager already have methods to read/write arbitrary files? Or do we need to add generic file operations?

2. **Identity**: How does SDK determine `userId` for S5 paths? Is it derived from authenticated signer or S5 seed?

3. **Caching**: Is there existing cache infrastructure we should use, or implement new cache?

4. **Error codes**: What error codes should we use? Should we follow existing SDK error convention?

5. **Testing**: Do you prefer mocking S5 in unit tests or using actual S5 test portal?

---

## References

- Existing conversation storage: `StorageManager.saveConversation()`
- S5 documentation: [S5 Protocol](https://docs.sfive.net/)
- UI redesign plan: `docs/UI_MILESTONE_PLAN.md`

---

## Contact

**UI Team Lead:** [Your Name]
**Questions:** Please open GitHub issue or ping in Discord
**Priority:** High - blocking UI redesign milestone
