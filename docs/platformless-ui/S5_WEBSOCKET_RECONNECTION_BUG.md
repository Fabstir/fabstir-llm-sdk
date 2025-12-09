# Critical Bug: S5 WebSocket Dies on Mobile, Causing Message Loss

## Summary

The S5 WebSocket connection dies unexpectedly (especially on mobile Chrome/Safari), but the SDK continues trying to use it instead of handling the failure gracefully. This causes all subsequent S5 operations to fail silently, resulting in **data loss**.

---

## Architecture & Responsibility

```
┌─────────────────────────────────────────────┐
│  UI (fabstir-platformless-ui)               │
├─────────────────────────────────────────────┤
│  SDK (@fabstir/sdk-core)                    │  ← Should handle retry logic
│  - SessionManager                           │
│  - SessionGroupManager                      │
│  - StorageManager                           │
├─────────────────────────────────────────────┤
│  Enhanced S5.js                             │  ← Exposes API + connection status
│  - get(), put(), delete()                   │
│  - Connection status events                 │
└─────────────────────────────────────────────┘
```

| Component | Responsibility |
|-----------|----------------|
| **Enhanced S5.js** | Expose storage API + connection status |
| **SDK** | Check connection, retry operations, queue during reconnect |
| **UI** | Display sync status to user |

---

## Problem Description

### Symptoms

- Console shows: `WebSocket is already in CLOSING or CLOSED state`
- S5 save/load operations hang indefinitely or fail silently
- Messages appear in UI but are **not persisted** to S5 storage
- User loses messages on page refresh
- Happens frequently after 2-3 messages on mobile browsers

### Stack Trace

```
sendPromptStreaming
  └─> appendMessage
        └─> loadConversation
              └─> get
                    └─> _loadDirectory
                          └─> getKeySet
                                └─> _getDirectoryMetadata
                                      └─> downloadBlobAsBytes
                                            └─> sendHashRequest
                                                  └─> send  ← ERROR: WebSocket is CLOSING/CLOSED
```

### Console Output Example

```
[Enhanced S5.js] Portal: Starting upload {blobSize: 78376, portalsAvailable: 1, retriesPerPortal: 3, expectedHash: '28d17b97f259dd38'}
WebSocket is already in CLOSING or CLOSED state.
    at send
    at sendHashRequest
    at downloadBlobAsBytes
    ...
[Enhanced S5.js] Portal: Download requested {hash: 'H-Y3vmDV842Y0e3k...', network: 'P2P', discovering: true}
```

---

## Root Cause Analysis

### Why WebSockets Close on Mobile Browsers

1. **Browser Throttling**: Mobile browsers aggressively throttle/kill WebSocket connections in background tabs
2. **Device Sleep**: OS closes network connections when device sleeps momentarily
3. **Network Switching**: WiFi ↔ cellular transitions drop connections
4. **Idle Timeout**: No activity for extended period triggers server/client timeout
5. **Memory Pressure**: Browser reclaims resources under memory pressure
6. **Page Visibility**: Browser may close connections when tab is not visible

### Current SDK Behavior (Problem)

The S5 SDK currently:
1. Opens WebSocket connection on initialization
2. **Does NOT detect** when WebSocket enters CLOSING/CLOSED state
3. **Does NOT auto-reconnect** when connection dies
4. **Continues attempting operations** on dead WebSocket
5. Operations either hang forever or fail silently

---

## Requested Fix

### What Enhanced S5.js Needs to Provide

Enhanced S5.js is a storage API wrapper. It should expose connection status so the SDK can make decisions:

```javascript
class EnhancedS5 {
  // Expose current connection status
  getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' {
    if (!this.ws) return 'disconnected';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      default: return 'disconnected';
    }
  }

  // Expose connection change events
  onConnectionChange(callback: (status: string) => void): () => void {
    this.connectionListeners.push(callback);
    return () => {
      this.connectionListeners = this.connectionListeners.filter(cb => cb !== callback);
    };
  }

  // Optional: Method to force reconnect
  reconnect(): Promise<void> {
    // Close existing connection and create new one
  }
}
```

**That's it for Enhanced S5.js** - just expose status and events. The retry/queue logic belongs in the SDK.

---

### What SDK Needs to Implement

The SDK (@fabstir/sdk-core) should handle all retry and queue logic:

#### 1. Check Connection Before Operations

```javascript
class StorageManager {
  async saveToS5(path: string, data: any): Promise<void> {
    // Check connection status first
    const status = this.s5Client.getConnectionStatus();

    if (status === 'disconnected') {
      console.warn('[SDK] S5 disconnected, queueing operation...');
      return this.queueOperation({ type: 'save', path, data });
    }

    return this.s5Client.put(path, data);
  }
}
```

#### 2. Retry with Exponential Backoff

```javascript
class StorageManager {
  private readonly MAX_RETRIES = 5;
  private readonly BASE_DELAY = 1000;

  async saveWithRetry(path: string, data: any): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        await this.s5Client.put(path, data);
        return; // Success
      } catch (error) {
        lastError = error as Error;
        console.warn(`[SDK] S5 save failed (attempt ${attempt + 1}):`, error);

        // Check if it's a connection error
        if (this.isConnectionError(error)) {
          // Wait with exponential backoff
          const delay = this.BASE_DELAY * Math.pow(2, attempt);
          await this.sleep(delay);

          // Try to reconnect
          await this.s5Client.reconnect?.();
        } else {
          throw error; // Non-connection error, don't retry
        }
      }
    }

    throw new Error(`S5 save failed after ${this.MAX_RETRIES} attempts: ${lastError?.message}`);
  }

  private isConnectionError(error: any): boolean {
    return error?.message?.includes('WebSocket') ||
           error?.message?.includes('CLOSING') ||
           error?.message?.includes('CLOSED');
  }
}
```

#### 3. Operation Queue During Disconnection

```javascript
class StorageManager {
  private operationQueue: Array<QueuedOperation> = [];
  private isProcessingQueue = false;

  constructor(s5Client: EnhancedS5) {
    this.s5Client = s5Client;

    // Listen for reconnection to flush queue
    s5Client.onConnectionChange((status) => {
      if (status === 'connected') {
        this.flushQueue();
      }
    });
  }

  private queueOperation(op: QueuedOperation): Promise<void> {
    return new Promise((resolve, reject) => {
      this.operationQueue.push({ ...op, resolve, reject });
      console.log(`[SDK] Queued operation: ${op.type} (queue size: ${this.operationQueue.length})`);
    });
  }

  private async flushQueue(): Promise<void> {
    if (this.isProcessingQueue || this.operationQueue.length === 0) return;

    this.isProcessingQueue = true;
    console.log(`[SDK] Flushing ${this.operationQueue.length} queued operations`);

    while (this.operationQueue.length > 0) {
      const op = this.operationQueue.shift()!;
      try {
        const result = await this.executeOperation(op);
        op.resolve(result);
      } catch (error) {
        op.reject(error);
      }
    }

    this.isProcessingQueue = false;
  }
}
```

#### 4. Visibility & Network Handlers (SDK Level)

```javascript
class StorageManager {
  setupAutoReconnect() {
    // Reconnect when tab becomes visible
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          const status = this.s5Client.getConnectionStatus();
          if (status === 'disconnected') {
            console.log('[SDK] Tab visible, reconnecting S5...');
            this.s5Client.reconnect?.();
          }
        }
      });
    }

    // Reconnect when network comes online
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[SDK] Network online, reconnecting S5...');
        this.s5Client.reconnect?.();
      });
    }
  }
}
```

#### 5. Expose Sync Status to UI

```javascript
class StorageManager {
  private syncStatus: 'synced' | 'syncing' | 'pending' | 'error' = 'synced';
  private syncListeners: Array<(status: string) => void> = [];

  getSyncStatus(): string {
    return this.syncStatus;
  }

  onSyncStatusChange(callback: (status: string) => void): () => void {
    this.syncListeners.push(callback);
    return () => {
      this.syncListeners = this.syncListeners.filter(cb => cb !== callback);
    };
  }

  getPendingOperationCount(): number {
    return this.operationQueue.length;
  }
}

---

## Summary of Required Changes

### Enhanced S5.js (Minimal Changes)

| Requirement | Description |
|-------------|-------------|
| `getConnectionStatus()` | Return current WebSocket state |
| `onConnectionChange(cb)` | Event listener for connection changes |
| `reconnect()` | Optional method to force reconnection |

### SDK (Main Logic)

| Requirement | Description |
|-------------|-------------|
| Connection check | Check S5 status before operations |
| Retry logic | Exponential backoff on connection errors |
| Operation queue | Buffer operations during disconnection |
| Auto-reconnect triggers | Visibility API + network change handlers |
| Sync status API | Expose sync status to UI |

---

## Impact of Not Fixing

| Scenario | Result |
|----------|--------|
| User sends message on mobile | Message may not save to S5 |
| User refreshes page | Messages lost |
| User switches apps briefly | WebSocket dies, subsequent operations fail |
| Long chat session | Higher probability of connection death |

---

## Current UI Workaround

We've implemented fire-and-forget pattern for S5 saves to prevent UI freezes:

```typescript
// Non-blocking S5 save (UI doesn't wait)
sdkAddMessage(groupId, sessionId, message)
  .then(() => console.log('Saved to S5'))
  .catch(err => console.warn('S5 save failed:', err));
```

**Problem**: This means failed saves are silent - user doesn't know their data didn't persist.

**What we need**:
- **From Enhanced S5.js**: Connection status API
- **From SDK**: Retry/queue logic using that status

---

## Testing Recommendations

To reproduce the issue:
1. Open app on mobile Chrome/Safari
2. Send 2-3 messages
3. Switch to another app briefly (5-10 seconds)
4. Return to the app
5. Try to send another message
6. Check console for "WebSocket is already in CLOSING or CLOSED state"

---

## Priority

**Critical** - This causes silent data loss for users, especially on mobile devices which are a primary use case.

---

## Action Items

1. **Enhanced S5.js Developer**: Add `getConnectionStatus()`, `onConnectionChange()`, and optional `reconnect()` methods
2. **SDK Developer**: Implement retry logic, operation queue, and auto-reconnect triggers using the Enhanced S5.js connection API

---

## Questions?

Please reach out if you need:
- More detailed console logs
- Screen recordings of the issue
- Access to test environment
- Any clarification on the above
