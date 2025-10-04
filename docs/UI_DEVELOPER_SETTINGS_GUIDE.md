# User Settings Integration Guide for UI Developers

## 📋 Overview

This guide shows you how to integrate **persistent user settings** into your Fabstir chat application using `@fabstir/sdk-core`. User preferences are automatically synced across devices via S5 decentralized storage.

**Key Features**:
- ✅ Cross-device synchronization via S5
- ✅ 5-minute in-memory cache for performance
- ✅ Offline mode with stale cache fallback
- ✅ Automatic schema migrations
- ✅ React hooks for easy integration
- ✅ First-time user detection

**Reference**: See `docs/SDK_API.md` for complete API documentation.

---

## 🎯 What User Settings Store

User preferences managed by the SDK:

**Model Preferences**:
- `selectedModel` - Currently selected model (e.g., "tiny-vicuna-1b.q4_k_m.gguf")
- `lastUsedModels` - Recently used models (max 5)

**Host Preferences**:
- `lastHostAddress` - Last successfully used host
- `preferredHosts` - User-favorited hosts

**Payment Preferences**:
- `preferredPaymentToken` - 'USDC' or 'ETH'
- `autoApproveAmount` - Auto-approve threshold

**UI Preferences**:
- `theme` - 'light', 'dark', or 'auto'
- `advancedSettingsExpanded` - Show/hide advanced options

---

## 📦 Part 1: React Hook

### 1.1 Create `useUserSettings` Hook

Create `hooks/useUserSettings.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { UserSettings, PartialUserSettings, UserSettingsVersion } from '@fabstir/sdk-core';
import type { IStorageManager } from '@fabstir/sdk-core';

interface UseUserSettingsReturn {
  settings: UserSettings | null;
  loading: boolean;
  error: Error | null;
  updateSettings: (partial: PartialUserSettings) => Promise<void>;
  resetSettings: () => Promise<void>;
  refreshSettings: () => Promise<void>;
}

export function useUserSettings(
  storageManager: IStorageManager | null
): UseUserSettingsReturn {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load settings on mount
  const loadSettings = useCallback(async () => {
    if (!storageManager) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const userSettings = await storageManager.getUserSettings();
      setSettings(userSettings);
    } catch (err: any) {
      console.error('Failed to load user settings:', err);
      setError(err);
      // On error, settings remain null (treated as first-time user)
    } finally {
      setLoading(false);
    }
  }, [storageManager]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Update specific settings
  const updateSettings = useCallback(async (partial: PartialUserSettings) => {
    if (!storageManager) {
      throw new Error('StorageManager not initialized');
    }

    try {
      setError(null);
      await storageManager.updateUserSettings(partial);

      // Reload to get updated settings (including auto-updated timestamp)
      const updated = await storageManager.getUserSettings();
      setSettings(updated);
    } catch (err: any) {
      console.error('Failed to update user settings:', err);
      setError(err);
      throw err; // Re-throw so UI can handle
    }
  }, [storageManager]);

  // Reset all settings
  const resetSettings = useCallback(async () => {
    if (!storageManager) {
      throw new Error('StorageManager not initialized');
    }

    try {
      setError(null);
      await storageManager.clearUserSettings();
      setSettings(null);
    } catch (err: any) {
      console.error('Failed to reset user settings:', err);
      setError(err);
      throw err;
    }
  }, [storageManager]);

  // Manual refresh (bypass cache)
  const refreshSettings = useCallback(async () => {
    await loadSettings();
  }, [loadSettings]);

  return {
    settings,
    loading,
    error,
    updateSettings,
    resetSettings,
    refreshSettings
  };
}
```

### 1.2 Hook Usage in Component

```typescript
import { useUserSettings } from '@/hooks/useUserSettings';

export function ChatPage() {
  const { storageManager } = useSDK(); // Your SDK hook
  const { settings, loading, updateSettings } = useUserSettings(storageManager);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <h1>Model: {settings?.selectedModel || 'Not selected'}</h1>
      <button onClick={() => updateSettings({ theme: 'dark' })}>
        Dark Mode
      </button>
    </div>
  );
}
```

---

## 📱 Part 2: App Initialization

### 2.1 First-Time User Detection

Detect first-time users and show setup flow:

```typescript
import { useEffect, useState } from 'react';
import { useUserSettings } from '@/hooks/useUserSettings';
import { UserSettingsVersion } from '@fabstir/sdk-core';

export function ChatApp() {
  const { storageManager } = useSDK();
  const { settings, loading, updateSettings } = useUserSettings(storageManager);
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (settings === null) {
        // First-time user - show setup wizard
        setShowSetupWizard(true);
      } else {
        // Returning user - restore preferences
        console.log('Welcome back! Last model:', settings.selectedModel);
        applyUserPreferences(settings);
      }
    }
  }, [settings, loading]);

  async function completeSetup(preferences: {
    model: string;
    theme: 'light' | 'dark' | 'auto';
    paymentToken: 'USDC' | 'ETH';
  }) {
    // Save initial preferences
    await storageManager?.saveUserSettings({
      version: UserSettingsVersion.V1,
      lastUpdated: Date.now(),
      selectedModel: preferences.model,
      theme: preferences.theme,
      preferredPaymentToken: preferences.paymentToken
    });

    setShowSetupWizard(false);
  }

  function applyUserPreferences(settings: UserSettings) {
    // Apply theme
    if (settings.theme) {
      document.documentElement.classList.toggle('dark', settings.theme === 'dark');
    }

    // Pre-select model, payment token, etc.
    // Your app-specific logic here
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (showSetupWizard) {
    return <SetupWizard onComplete={completeSetup} />;
  }

  return <ChatInterface />;
}
```

### 2.2 Setup Wizard Component

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface SetupWizardProps {
  onComplete: (preferences: {
    model: string;
    theme: 'light' | 'dark' | 'auto';
    paymentToken: 'USDC' | 'ETH';
  }) => Promise<void>;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(1);
  const [model, setModel] = useState('tiny-vicuna-1b.q4_k_m.gguf');
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('auto');
  const [paymentToken, setPaymentToken] = useState<'USDC' | 'ETH'>('USDC');

  async function handleComplete() {
    await onComplete({ model, theme, paymentToken });
  }

  return (
    <Card className="max-w-md mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">Welcome to Fabstir! 🎉</h2>

      {step === 1 && (
        <div>
          <h3>Choose your default model:</h3>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="tiny-vicuna-1b.q4_k_m.gguf">TinyVicuna (Fastest)</option>
            <option value="mistral-7b.q4_k_m.gguf">Mistral 7B (Balanced)</option>
          </select>
          <Button onClick={() => setStep(2)}>Next</Button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h3>Choose theme:</h3>
          <div className="flex gap-2">
            <Button onClick={() => setTheme('light')}>Light</Button>
            <Button onClick={() => setTheme('dark')}>Dark</Button>
            <Button onClick={() => setTheme('auto')}>Auto</Button>
          </div>
          <Button onClick={() => setStep(3)}>Next</Button>
        </div>
      )}

      {step === 3 && (
        <div>
          <h3>Preferred payment token:</h3>
          <div className="flex gap-2">
            <Button onClick={() => setPaymentToken('USDC')}>USDC</Button>
            <Button onClick={() => setPaymentToken('ETH')}>ETH</Button>
          </div>
          <Button onClick={handleComplete}>Complete Setup</Button>
        </div>
      )}
    </Card>
  );
}
```

---

## 🎨 Part 3: Component Examples

### 3.1 Model Selector with Auto-Save

```typescript
import { useState, useEffect } from 'react';
import { useUserSettings } from '@/hooks/useUserSettings';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

interface Model {
  id: string;
  name: string;
  description: string;
}

const AVAILABLE_MODELS: Model[] = [
  {
    id: 'tiny-vicuna-1b.q4_k_m.gguf',
    name: 'TinyVicuna 1B',
    description: 'Fastest, lowest cost'
  },
  {
    id: 'mistral-7b.q4_k_m.gguf',
    name: 'Mistral 7B',
    description: 'Balanced performance'
  }
];

export function ModelSelector() {
  const { storageManager } = useSDK();
  const { settings, updateSettings } = useUserSettings(storageManager);
  const [selectedModel, setSelectedModel] = useState(settings?.selectedModel || '');
  const { toast } = useToast();

  // Update local state when settings load
  useEffect(() => {
    if (settings?.selectedModel) {
      setSelectedModel(settings.selectedModel);
    }
  }, [settings]);

  async function handleModelChange(modelId: string) {
    setSelectedModel(modelId);

    try {
      // Update recently used models list
      const recentModels = settings?.lastUsedModels || [];
      const updatedRecent = [modelId, ...recentModels.filter(m => m !== modelId)].slice(0, 5);

      await updateSettings({
        selectedModel: modelId,
        lastUsedModels: updatedRecent
      });

      toast({
        title: 'Model preference saved',
        description: `Now using ${AVAILABLE_MODELS.find(m => m.id === modelId)?.name}`
      });
    } catch (error) {
      console.error('Failed to save model preference:', error);
      toast({
        title: 'Warning',
        description: 'Model selected but preference not saved',
        variant: 'destructive'
      });
      // Non-critical - continue with selection
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Model</label>
      <Select value={selectedModel} onValueChange={handleModelChange}>
        <SelectTrigger>
          {selectedModel || 'Select model'}
        </SelectTrigger>
        <SelectContent>
          {AVAILABLE_MODELS.map(model => (
            <SelectItem key={model.id} value={model.id}>
              <div>
                <div className="font-medium">{model.name}</div>
                <div className="text-xs text-muted-foreground">{model.description}</div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Recently used models */}
      {settings?.lastUsedModels && settings.lastUsedModels.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Recently used: {settings.lastUsedModels.slice(0, 3).join(', ')}
        </div>
      )}
    </div>
  );
}
```

### 3.2 Payment Token Preference

```typescript
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUserSettings } from '@/hooks/useUserSettings';
import { Coins, DollarSign } from 'lucide-react';

export function PaymentTokenSelector() {
  const { storageManager } = useSDK();
  const { settings, updateSettings } = useUserSettings(storageManager);

  const paymentToken = settings?.preferredPaymentToken || 'USDC';

  async function handleTokenChange(token: 'USDC' | 'ETH') {
    try {
      await updateSettings({ preferredPaymentToken: token });
    } catch (error) {
      console.error('Failed to save payment preference:', error);
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Payment Token</label>
      <Tabs value={paymentToken} onValueChange={handleTokenChange}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="USDC" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            USDC
          </TabsTrigger>
          <TabsTrigger value="ETH" className="flex items-center gap-2">
            <Coins className="h-4 w-4" />
            ETH
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <p className="text-xs text-muted-foreground">
        This will be used for all future sessions
      </p>
    </div>
  );
}
```

### 3.3 Theme Selector

```typescript
import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useEffect } from 'react';

export function ThemeSelector() {
  const { storageManager } = useSDK();
  const { settings, updateSettings } = useUserSettings(storageManager);

  const theme = settings?.theme || 'auto';

  useEffect(() => {
    // Apply theme on load or change
    applyTheme(theme);
  }, [theme]);

  function applyTheme(theme: 'light' | 'dark' | 'auto') {
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefersDark);
    } else {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }

  async function handleThemeChange(newTheme: 'light' | 'dark' | 'auto') {
    applyTheme(newTheme);

    try {
      await updateSettings({ theme: newTheme });
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        variant={theme === 'light' ? 'default' : 'outline'}
        size="sm"
        onClick={() => handleThemeChange('light')}
      >
        <Sun className="h-4 w-4 mr-2" />
        Light
      </Button>
      <Button
        variant={theme === 'dark' ? 'default' : 'outline'}
        size="sm"
        onClick={() => handleThemeChange('dark')}
      >
        <Moon className="h-4 w-4 mr-2" />
        Dark
      </Button>
      <Button
        variant={theme === 'auto' ? 'default' : 'outline'}
        size="sm"
        onClick={() => handleThemeChange('auto')}
      >
        <Monitor className="h-4 w-4 mr-2" />
        Auto
      </Button>
    </div>
  );
}
```

### 3.4 Settings Panel with Reset

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useToast } from '@/components/ui/use-toast';
import { RotateCcw } from 'lucide-react';

export function SettingsPanel() {
  const { storageManager } = useSDK();
  const { settings, resetSettings } = useUserSettings(storageManager);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const { toast } = useToast();

  async function handleReset() {
    try {
      await resetSettings();

      toast({
        title: 'Settings reset',
        description: 'All preferences have been cleared'
      });

      // Reload page to re-trigger setup flow
      window.location.reload();
    } catch (error) {
      console.error('Failed to reset settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to reset settings. Please try again.',
        variant: 'destructive'
      });
    }
  }

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-4">Settings</h3>

      {settings && (
        <div className="space-y-2 mb-4 text-sm">
          <div>
            <span className="text-muted-foreground">Model:</span>{' '}
            {settings.selectedModel}
          </div>
          <div>
            <span className="text-muted-foreground">Payment:</span>{' '}
            {settings.preferredPaymentToken || 'Not set'}
          </div>
          <div>
            <span className="text-muted-foreground">Theme:</span>{' '}
            {settings.theme || 'Auto'}
          </div>
          <div className="text-xs text-muted-foreground">
            Last updated: {new Date(settings.lastUpdated).toLocaleString()}
          </div>
        </div>
      )}

      <Button
        variant="destructive"
        size="sm"
        onClick={() => setShowResetDialog(true)}
        className="w-full"
      >
        <RotateCcw className="h-4 w-4 mr-2" />
        Reset All Preferences
      </Button>

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all preferences?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear all your saved settings including model selection,
              payment preferences, and theme. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>
              Reset Settings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
```

---

## 💡 Part 4: Best Practices

### 4.1 Error Handling

```typescript
// Always wrap settings operations in try/catch
async function savePreference(preference: string) {
  try {
    await updateSettings({ selectedModel: preference });
    toast({ title: 'Saved' });
  } catch (error) {
    // Log error but don't block user
    console.error('Settings save failed:', error);

    // Show warning but continue
    toast({
      title: 'Warning',
      description: 'Preference not saved, but selection active',
      variant: 'warning'
    });
  }
}
```

### 4.2 Offline Handling

```typescript
// The SDK automatically handles offline mode
// No special handling needed - it returns stale cache

const { settings, error } = useUserSettings(storageManager);

// Error only if offline AND no cache
if (error && !settings) {
  // Show offline indicator
  return <OfflineBanner />;
}

// Otherwise settings will be available (possibly stale)
```

### 4.3 Optimistic Updates

```typescript
// Update UI immediately, then save to S5
async function quickUpdateTheme(theme: 'light' | 'dark') {
  // 1. Update UI immediately
  applyTheme(theme);
  setLocalTheme(theme);

  // 2. Save to S5 in background
  try {
    await updateSettings({ theme });
  } catch (error) {
    // Settings save failed but UI already updated
    console.error('Background save failed:', error);
  }
}
```

### 4.4 Cache Awareness

```typescript
// Settings are cached for 5 minutes
// Force refresh if needed:

async function forceRefresh() {
  await refreshSettings(); // Bypasses cache
}

// Or just wait - cache expires automatically after 5 minutes
```

---

## 🔍 Part 5: Common Patterns

### 5.1 Conditional Rendering Based on Settings

```typescript
function AdvancedOptions() {
  const { settings } = useUserSettings(storageManager);

  // Don't show until settings load
  if (!settings) return null;

  // Show/hide based on preference
  if (!settings.advancedSettingsExpanded) {
    return <Button onClick={() => updateSettings({ advancedSettingsExpanded: true })}>
      Show Advanced
    </Button>;
  }

  return <AdvancedPanel />;
}
```

### 5.2 Prefilling Forms

```typescript
function SessionCreationForm() {
  const { settings } = useUserSettings(storageManager);

  // Use saved preferences as defaults
  const [model, setModel] = useState(settings?.selectedModel || '');
  const [paymentToken, setPaymentToken] = useState(settings?.preferredPaymentToken || 'USDC');

  // ... rest of form
}
```

### 5.3 Recently Used Items

```typescript
function ModelDropdown() {
  const { settings } = useUserSettings(storageManager);

  const recentModels = settings?.lastUsedModels || [];
  const allModels = AVAILABLE_MODELS;

  return (
    <div>
      {recentModels.length > 0 && (
        <div>
          <h4>Recently Used</h4>
          {recentModels.map(model => (
            <ModelOption key={model} model={model} />
          ))}
          <Separator />
        </div>
      )}

      <h4>All Models</h4>
      {allModels.map(model => (
        <ModelOption key={model.id} model={model.id} />
      ))}
    </div>
  );
}
```

---

## ⚠️ Important Notes

### Settings Are Optional
- All settings methods can fail (network, S5 unavailable)
- **Never block the UI** waiting for settings to save
- Settings are UX enhancement, not critical functionality

### First-Time Users
- `getUserSettings()` returns `null` for first-time users
- Don't show error - this is expected behavior
- Show setup wizard or use sensible defaults

### Cross-Device Sync
- Changes sync via S5 (not instant)
- Cache may show stale data for up to 5 minutes on other devices
- This is expected - eventual consistency model

### TypeScript Types
```typescript
import {
  UserSettings,
  UserSettingsVersion,
  PartialUserSettings
} from '@fabstir/sdk-core';
```

---

## 📚 Additional Resources

- **API Documentation**: `docs/SDK_API.md` - Complete method signatures
- **Integration Tests**: `packages/sdk-core/tests/integration/user-settings-flow.test.ts`
- **Type Definitions**: `packages/sdk-core/src/types/settings.types.ts`

---

## ✅ Checklist

- [ ] Create `useUserSettings` hook
- [ ] Add first-time user detection
- [ ] Implement model selector with auto-save
- [ ] Add payment token preference
- [ ] Add theme selector
- [ ] Add settings panel with reset
- [ ] Handle errors gracefully (don't block UI)
- [ ] Test offline mode behavior
- [ ] Test cross-device sync (multiple browser tabs)
- [ ] Add toast notifications for feedback
