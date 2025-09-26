# Error Handling Best Practices

Comprehensive guide for handling errors gracefully in your Fabstir Auth integration.

## Error Philosophy

1. **Fail Gracefully** - Never leave users stuck
2. **Provide Context** - Explain what went wrong
3. **Offer Solutions** - Tell users what to do next
4. **Log Everything** - But don't expose sensitive data
5. **Recover Automatically** - When possible

## Error Classification

### Critical Errors (Block User Flow)
- No wallet available
- Network completely down
- Invalid configuration

### Recoverable Errors (Can Retry)
- User rejected request
- Timeout
- Rate limiting
- Chain switch needed

### Warning Level (Degraded Experience)
- Slow network
- Backup RPC in use
- Session near expiry

## Implementation Patterns

### 1. Centralized Error Handler

```typescript
class AuthErrorHandler {
  private static errorMap = new Map<string | number, ErrorHandler>();

  static {
    // Register error handlers
    this.register(4001, this.handleUserRejection);
    this.register(4902, this.handleChainNotFound);
    this.register('TIMEOUT', this.handleTimeout);
    this.register('NO_WALLET', this.handleNoWallet);
  }

  static async handle(error: any): Promise<ErrorResponse> {
    console.error('[AuthError]', error);

    // Track error metrics
    this.trackError(error);

    // Get specific handler
    const handler = this.errorMap.get(error.code) ||
                   this.errorMap.get(error.message) ||
                   this.handleGenericError;

    return await handler(error);
  }

  private static async handleUserRejection(error: any): Promise<ErrorResponse> {
    return {
      title: 'Connection Cancelled',
      message: 'You cancelled the wallet connection.',
      actions: [
        { label: 'Try Again', action: 'retry' },
        { label: 'Use Passkey Instead', action: 'switch-provider' },
        { label: 'Learn More', action: 'help' }
      ],
      severity: 'warning',
      recoverable: true
    };
  }

  private static async handleChainNotFound(error: any): Promise<ErrorResponse> {
    const chainId = error.data?.chainId;
    return {
      title: 'Network Not Found',
      message: `Your wallet doesn't have ${getChainName(chainId)} network.`,
      actions: [
        { label: 'Add Network', action: 'add-chain', data: chainId },
        { label: 'Use Different Network', action: 'select-chain' }
      ],
      severity: 'warning',
      recoverable: true
    };
  }

  private static async handleTimeout(error: any): Promise<ErrorResponse> {
    return {
      title: 'Request Timed Out',
      message: 'The operation took too long. This might be a network issue.',
      actions: [
        { label: 'Retry', action: 'retry' },
        { label: 'Check Network', action: 'check-network' }
      ],
      severity: 'error',
      recoverable: true
    };
  }

  private static async handleNoWallet(error: any): Promise<ErrorResponse> {
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);

    return {
      title: 'Wallet Not Found',
      message: 'No crypto wallet detected.',
      actions: isMobile ? [
        { label: 'Open in Wallet', action: 'deeplink' },
        { label: 'Use Passkey', action: 'switch-provider' }
      ] : [
        { label: 'Install MetaMask', action: 'install-wallet' },
        { label: 'Use Passkey Instead', action: 'switch-provider' }
      ],
      severity: 'error',
      recoverable: false
    };
  }

  private static trackError(error: any) {
    // Send to analytics/monitoring
    if (window.analytics) {
      window.analytics.track('auth_error', {
        code: error.code,
        message: error.message,
        provider: error.provider,
        timestamp: Date.now()
      });
    }
  }
}

// Usage
try {
  await authManager.authenticate('metamask');
} catch (error) {
  const response = await AuthErrorHandler.handle(error);
  showErrorUI(response);
}
```

### 2. Retry with Exponential Backoff

```typescript
class RetryManager {
  static async withRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxAttempts?: number;
      initialDelay?: number;
      maxDelay?: number;
      backoffFactor?: number;
      retryCondition?: (error: any) => boolean;
    } = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      initialDelay = 1000,
      maxDelay = 30000,
      backoffFactor = 2,
      retryCondition = (error) => {
        // Retry on timeout, network errors, rate limiting
        return error.code === 'TIMEOUT' ||
               error.code === 429 ||
               error.message?.includes('network');
      }
    } = options;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`Attempt ${attempt}/${maxAttempts}`);
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt === maxAttempts || !retryCondition(error)) {
          throw error;
        }

        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));

        delay = Math.min(delay * backoffFactor, maxDelay);
      }
    }

    throw lastError;
  }
}

// Usage
const session = await RetryManager.withRetry(
  () => authManager.authenticate('metamask'),
  {
    maxAttempts: 3,
    retryCondition: (error) => error.code === 4001 // User rejection
  }
);
```

### 3. Fallback Chain Strategy

```typescript
class ChainFallbackManager {
  private static readonly CHAIN_PRIORITY = [
    { id: 84532, name: 'Base Sepolia', type: 'primary' },
    { id: 5611, name: 'opBNB Testnet', type: 'fallback' },
    { id: 1, name: 'Ethereum Mainnet', type: 'last-resort' }
  ];

  static async connectWithFallback(authManager: AuthManager): Promise<AuthSession> {
    const errors = [];

    for (const chain of this.CHAIN_PRIORITY) {
      try {
        console.log(`Trying ${chain.name}...`);

        // Attempt connection on this chain
        const session = await authManager.authenticate('metamask');

        // Try to switch to preferred chain
        if (session.chainId !== chain.id && session.capabilities.chainSwitching) {
          try {
            await authManager.switchChain(chain.id);
          } catch (switchError) {
            console.warn(`Could not switch to ${chain.name}, using current chain`);
          }
        }

        return session;
      } catch (error) {
        errors.push({ chain, error });
        console.warn(`Failed on ${chain.name}:`, error.message);
      }
    }

    // All chains failed
    throw new AggregateError(errors, 'Failed to connect on any chain');
  }
}
```

### 4. User-Friendly Error Messages

```typescript
class ErrorMessageFormatter {
  static format(error: any): UserMessage {
    // Technical error -> Human readable message
    const messageMap: Record<string, string> = {
      'User denied transaction signature':
        'You cancelled the transaction. No changes were made.',

      'insufficient funds':
        'You don\'t have enough funds for this transaction. Please add funds to your wallet.',

      'nonce too low':
        'This transaction was already processed. Please refresh and try again.',

      'replacement fee too low':
        'Gas price increased. Please try again with higher gas.',

      'execution reverted':
        'The transaction cannot be completed. This often happens when conditions aren\'t met.',

      'network timeout':
        'The network is slow right now. Your transaction may still go through.',

      'rate limit exceeded':
        'Too many requests. Please wait a moment and try again.'
    };

    // Find matching message
    const errorStr = error.message?.toLowerCase() || '';
    for (const [key, message] of Object.entries(messageMap)) {
      if (errorStr.includes(key.toLowerCase())) {
        return {
          title: 'Transaction Issue',
          message,
          technical: error.message // Keep technical details for support
        };
      }
    }

    // Generic message
    return {
      title: 'Something Went Wrong',
      message: 'We encountered an unexpected issue. Please try again or contact support.',
      technical: error.message
    };
  }
}
```

### 5. Error Recovery Strategies

```typescript
class ErrorRecovery {
  static async recover(error: any, context: any): Promise<boolean> {
    console.log('Attempting recovery for:', error.code);

    switch (error.code) {
      case 4001: // User rejected
        return await this.recoverFromRejection(context);

      case 4902: // Chain not found
        return await this.addMissingChain(error, context);

      case 'INSUFFICIENT_FUNDS':
        return await this.handleInsufficientFunds(context);

      case 'NONCE_EXPIRED':
        return await this.refreshNonce(context);

      case 'NETWORK_ERROR':
        return await this.switchRpcEndpoint(context);

      default:
        return false;
    }
  }

  private static async recoverFromRejection(context: any): Promise<boolean> {
    // Offer alternative authentication
    const useAlternative = await context.ui.confirm(
      'Would you like to try passwordless login instead?'
    );

    if (useAlternative) {
      try {
        await context.authManager.authenticate('base', generateUsername());
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  private static async addMissingChain(error: any, context: any): Promise<boolean> {
    try {
      const chainId = error.data?.chainId;
      await addChainToWallet(chainId);
      return true;
    } catch {
      return false;
    }
  }

  private static async handleInsufficientFunds(context: any): Promise<boolean> {
    // Show funding options
    const fundingOptions = [
      { label: 'Use Testnet Faucet', url: 'https://faucet.base.org' },
      { label: 'Bridge Funds', url: 'https://bridge.base.org' }
    ];

    context.ui.showFundingOptions(fundingOptions);
    return false; // Can't auto-recover
  }
}
```

### 6. Error Monitoring & Alerting

```typescript
class ErrorMonitor {
  private static errorCounts = new Map<string, number>();
  private static readonly ALERT_THRESHOLD = 5;
  private static readonly WINDOW_MS = 60000; // 1 minute

  static track(error: any) {
    const key = `${error.code}-${error.message}`;
    const count = (this.errorCounts.get(key) || 0) + 1;
    this.errorCounts.set(key, count);

    // Check threshold
    if (count >= this.ALERT_THRESHOLD) {
      this.sendAlert({
        error: key,
        count,
        window: this.WINDOW_MS,
        severity: 'high'
      });
    }

    // Clear old counts
    setTimeout(() => {
      this.errorCounts.delete(key);
    }, this.WINDOW_MS);

    // Log to service
    this.logToService(error);
  }

  private static logToService(error: any) {
    // Send to Sentry, LogRocket, etc.
    if (window.Sentry) {
      window.Sentry.captureException(error, {
        tags: {
          component: 'auth',
          provider: error.provider
        },
        extra: {
          code: error.code,
          chainId: error.chainId
        }
      });
    }
  }

  private static sendAlert(alert: any) {
    // Send to monitoring service
    fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert)
    });
  }
}
```

## React Error Boundary Example

```typescript
import { ErrorBoundary } from 'react-error-boundary';

function AuthErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div className="error-container">
      <h2>Authentication Error</h2>
      <p>{ErrorMessageFormatter.format(error).message}</p>

      <details>
        <summary>Technical Details</summary>
        <pre>{error.message}</pre>
      </details>

      <div className="error-actions">
        <button onClick={resetErrorBoundary}>Try Again</button>
        <button onClick={() => switchToPasskey()}>Use Passkey</button>
        <button onClick={() => contactSupport(error)}>Get Help</button>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary
      FallbackComponent={AuthErrorFallback}
      onError={(error, info) => {
        ErrorMonitor.track(error);
      }}
      onReset={() => {
        // Clear auth state
        authManager.logout();
      }}
    >
      <AuthenticatedApp />
    </ErrorBoundary>
  );
}
```

## Error Prevention Strategies

### 1. Validate Before Operations

```typescript
async function safeAuthenticate(provider: string, username?: string) {
  // Pre-flight checks
  if (provider === 'metamask' && !window.ethereum) {
    throw new Error('NO_WALLET');
  }

  if (provider === 'base' && !username) {
    throw new Error('USERNAME_REQUIRED');
  }

  // Check network connectivity
  if (!navigator.onLine) {
    throw new Error('OFFLINE');
  }

  // Check if already authenticated
  if (authManager.isAuthenticated()) {
    console.log('Already authenticated, returning existing session');
    return authManager.getCurrentSession();
  }

  // Proceed with authentication
  return await authManager.authenticate(provider, username);
}
```

### 2. Graceful Degradation

```typescript
class GracefulAuth {
  static async initialize(): Promise<AuthManager> {
    const authManager = new AuthManager();

    // Try advanced features first, fall back gracefully
    try {
      // Try MetaMask
      if (window.ethereum) {
        authManager.registerProvider(new MetaMaskProvider());
      }
    } catch (error) {
      console.warn('MetaMask not available:', error);
    }

    // Always provide Base Account as fallback
    authManager.registerProvider(new BaseAccountProvider({
      appName: 'App',
      chainId: 84532
    }));

    return authManager;
  }
}
```

## Testing Error Scenarios

```typescript
describe('Error Handling', () => {
  it('should handle user rejection gracefully', async () => {
    mockMetaMask.setRejectNext(true);

    const result = await tryAuthenticate();

    expect(result.error).toBeDefined();
    expect(result.error.code).toBe(4001);
    expect(result.fallbackOffered).toBe(true);
  });

  it('should retry on timeout', async () => {
    let attempts = 0;
    mockNetwork.setTimeoutNext(2);

    const result = await RetryManager.withRetry(() => {
      attempts++;
      return authenticate();
    });

    expect(attempts).toBe(3);
    expect(result).toBeDefined();
  });
});
```

## Quick Reference

| Scenario | Strategy | Code |
|----------|----------|------|
| User rejects | Offer alternative | `catch (e) if (e.code === 4001) { offerPasskey() }` |
| Network timeout | Retry with backoff | `RetryManager.withRetry()` |
| Wrong chain | Auto-switch or guide | `authManager.switchChain()` |
| No wallet | Fallback provider | `use BaseAccountProvider` |
| Rate limited | Queue and delay | `OperationQueue.add()` |
| Unknown error | Log and generic message | `ErrorHandler.handle()` |

Remember: **Every error is an opportunity to help the user succeed!**