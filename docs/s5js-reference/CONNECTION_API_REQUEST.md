# Enhanced S5.js Connection API Request

## Summary

The Fabstir SDK needs connection management methods from Enhanced S5.js to handle mobile browser WebSocket issues gracefully. Currently, when the S5 WebSocket dies (common on mobile), the SDK has no way to detect this or trigger reconnection.

---

## Problem

Mobile browsers aggressively close WebSocket connections due to:
- Background tab throttling
- Device sleep
- Network switching (WiFi ↔ cellular)
- Memory pressure
- Page visibility changes

When this happens, S5 operations fail with:
```
WebSocket is already in CLOSING or CLOSED state
```

The SDK currently has no way to:
1. Detect the connection is dead before attempting operations
2. Trigger a reconnection
3. Know when connection is restored

---

## Requested API Additions

### 1. `getConnectionStatus(): 'connected' | 'connecting' | 'disconnected'`

Returns the current WebSocket connection state.

```typescript
class S5 {
  getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' {
    if (!this.ws) return 'disconnected';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING:
      case WebSocket.CLOSED:
      default: return 'disconnected';
    }
  }
}
```

**SDK Usage**:
```typescript
// Check before attempting operation
const status = s5Client.getConnectionStatus();
if (status === 'disconnected') {
  // Queue operation instead of failing
  return this.queueOperation({ type: 'save', path, data });
}
```

---

### 2. `onConnectionChange(callback): () => void`

Subscribe to connection state changes. Returns unsubscribe function.

```typescript
class S5 {
  private connectionListeners: Array<(status: string) => void> = [];

  onConnectionChange(callback: (status: 'connected' | 'connecting' | 'disconnected') => void): () => void {
    this.connectionListeners.push(callback);

    // Return unsubscribe function
    return () => {
      this.connectionListeners = this.connectionListeners.filter(cb => cb !== callback);
    };
  }

  // Call this internally when WebSocket state changes
  private notifyConnectionChange(status: string): void {
    for (const listener of this.connectionListeners) {
      try {
        listener(status);
      } catch (e) {
        console.error('[S5] Connection listener error:', e);
      }
    }
  }
}
```

**SDK Usage**:
```typescript
// Flush queued operations when connection restored
const unsubscribe = s5Client.onConnectionChange((status) => {
  if (status === 'connected') {
    console.log('[SDK] S5 reconnected, flushing queue...');
    this.flushOperationQueue();
  } else if (status === 'disconnected') {
    console.warn('[SDK] S5 disconnected, operations will be queued');
  }
});

// Later: unsubscribe();
```

---

### 3. `reconnect(): Promise<void>`

Force a reconnection attempt. Should close existing connection (if any) and establish a new one.

```typescript
class S5 {
  async reconnect(): Promise<void> {
    // Close existing connection if present
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // Ignore close errors
      }
    }

    // Re-establish connection using original config
    await this.connect(this.config);

    // Notify listeners
    this.notifyConnectionChange('connected');
  }
}
```

**SDK Usage**:
```typescript
// Reconnect when tab becomes visible
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const status = s5Client.getConnectionStatus();
    if (status === 'disconnected') {
      console.log('[SDK] Tab visible, reconnecting S5...');
      s5Client.reconnect();
    }
  }
});

// Reconnect when network comes back online
window.addEventListener('online', () => {
  console.log('[SDK] Network online, reconnecting S5...');
  s5Client.reconnect();
});
```

---

## Implementation Notes

### Where to Hook Connection Events

The `notifyConnectionChange()` should be called when:

1. **WebSocket opens**: `ws.onopen = () => this.notifyConnectionChange('connected')`
2. **WebSocket closes**: `ws.onclose = () => this.notifyConnectionChange('disconnected')`
3. **WebSocket errors**: `ws.onerror = () => this.notifyConnectionChange('disconnected')`
4. **Reconnect starts**: Before attempting reconnect, notify `'connecting'`

### Thread Safety

If S5 uses any async initialization, ensure:
- `getConnectionStatus()` returns accurate state even during initialization
- `reconnect()` doesn't create race conditions with pending operations
- Connection listeners are called synchronously or in predictable order

### Error Handling in `reconnect()`

```typescript
async reconnect(): Promise<void> {
  this.notifyConnectionChange('connecting');

  try {
    // ... reconnection logic
    this.notifyConnectionChange('connected');
  } catch (error) {
    this.notifyConnectionChange('disconnected');
    throw error; // Let SDK handle retry
  }
}
```

---

## Type Definitions

For TypeScript users, add to the S5 class interface:

```typescript
interface S5 {
  // ... existing methods ...

  /**
   * Get current WebSocket connection status
   */
  getConnectionStatus(): 'connected' | 'connecting' | 'disconnected';

  /**
   * Subscribe to connection status changes
   * @param callback Called when connection status changes
   * @returns Unsubscribe function
   */
  onConnectionChange(
    callback: (status: 'connected' | 'connecting' | 'disconnected') => void
  ): () => void;

  /**
   * Force reconnection to S5 network
   * Closes existing connection and establishes new one
   */
  reconnect(): Promise<void>;
}
```

---

## Why the SDK Can't Do This Alone

Without these methods, the SDK can only:
- Detect failures **after** they happen (by catching errors)
- Retry operations blindly (hoping S5 auto-recovers)
- Poll for connection status (wasteful)

With these methods, the SDK can:
- Check connection **before** operations (avoid unnecessary failures)
- Queue operations proactively when disconnected
- React immediately when connection is restored (event-driven)
- Trigger reconnection at appropriate times (visibility change, network online)

---

## Priority

**Critical** - Mobile users are experiencing silent data loss. Messages appear to send but are not persisted to S5 storage.

---

## Questions?

If you need:
- Console logs showing the WebSocket failures
- More context on how the SDK will use these methods
- Any clarification on the above

Please reach out. Full bug details are in `docs/platformless-ui/S5_WEBSOCKET_RECONNECTION_BUG.md`.
