# E2E Testing Guide with Real Wallets

**CRITICAL**: While the auth library uses mocks for unit tests, you MUST test with real wallets before production. This guide shows you how.

## Why Real Wallet Testing is Essential

### What Mocks Can't Catch
- Network latency and timeouts
- Real wallet state management quirks
- Actual gas estimation issues
- Provider-specific error messages
- Race conditions in async operations
- Mobile wallet deep-linking issues
- Browser extension conflicts
- Chain RPC endpoint failures

## Test Environment Setup

### 1. Install Testing Framework

```bash
npm install --save-dev @playwright/test
npm install --save-dev @synthetixio/synpress  # For MetaMask automation
```

### 2. Create Test Configuration

```typescript
// e2e/config/test.config.ts
export const TEST_CONFIG = {
  wallets: {
    metamask: {
      seed: process.env.TEST_METAMASK_SEED || 'test test test test test test test test test test test junk',
      password: process.env.TEST_METAMASK_PASSWORD || 'TestPassword123!',
      accounts: {
        primary: '0x...',  // Derived from seed
        secondary: '0x...'  // For multi-account tests
      }
    },
    baseAccount: {
      testUsers: {
        alice: 'test-alice-' + Date.now(),
        bob: 'test-bob-' + Date.now()
      }
    }
  },

  chains: {
    baseSepolia: {
      id: 84532,
      rpc: 'https://sepolia.base.org',
      explorer: 'https://sepolia.basescan.org'
    },
    opBNBTestnet: {
      id: 5611,
      rpc: 'https://opbnb-testnet-rpc.bnbchain.org',
      explorer: 'https://testnet.opbnbscan.com'
    }
  },

  timeouts: {
    wallet_connect: 30000,
    transaction: 60000,
    signature: 15000
  },

  retries: {
    count: 3,
    delay: 1000
  }
};
```

### 3. Set Up Test Wallets

```bash
# .env.test
TEST_METAMASK_SEED="your test seed phrase here"
TEST_METAMASK_PASSWORD="YourTestPassword123!"

# Fund test wallets with testnet tokens
# Base Sepolia: https://faucet.base.org
# opBNB Testnet: https://testnet.bnbchain.org/faucet-smart
```

## Core E2E Test Suite

### Test 1: Fresh Authentication Flow

```typescript
// e2e/tests/01-authentication.spec.ts
import { test, expect } from '@playwright/test';
import { TEST_CONFIG } from '../config/test.config';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('MetaMask - First time connection', async ({ page, context }) => {
    // Initialize auth manager
    await page.evaluate(() => {
      window.authManager = new AuthManager();
      window.authManager.registerProvider(new MetaMaskProvider());
    });

    // Start authentication
    const authPromise = page.evaluate(async () => {
      try {
        const session = await window.authManager.authenticate('metamask');
        return { success: true, session };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // Handle MetaMask popup (using Synpress)
    await metamask.acceptAccess();

    const result = await authPromise;
    expect(result.success).toBe(true);
    expect(result.session.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(result.session.provider).toBe('metamask');
  });

  test('Base Account - New user with passkey', async ({ page }) => {
    await page.evaluate(() => {
      window.authManager = new AuthManager();
      window.authManager.registerProvider(new BaseAccountProvider({
        appName: 'E2E Test',
        chainId: 84532
      }));
    });

    const username = `test-user-${Date.now()}`;
    const result = await page.evaluate(async (user) => {
      try {
        const session = await window.authManager.authenticate('base', user);
        return { success: true, session };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }, username);

    expect(result.success).toBe(true);
    expect(result.session.userId).toBe(username);
    expect(result.session.capabilities.passkey).toBe(true);
  });
});
```

### Test 2: Chain Switching

```typescript
// e2e/tests/02-chain-switching.spec.ts
test.describe('Chain Switching', () => {
  test('MetaMask - Switch between supported chains', async ({ page }) => {
    // Setup and authenticate
    await setupMetaMask(page);

    // Record initial chain
    const initialChain = await page.evaluate(() => {
      return window.authManager.getCurrentChain();
    });
    expect(initialChain).toBeDefined();

    // Switch to Base Sepolia
    const switchResult = await page.evaluate(async () => {
      try {
        await window.authManager.switchChain(84532);
        return { success: true, newChain: window.authManager.getCurrentChain() };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // Handle MetaMask confirmation
    await metamask.allowToSwitchNetwork();

    expect(switchResult.success).toBe(true);
    expect(switchResult.newChain).toBe(84532);

    // Verify events fired
    const events = await page.evaluate(() => window.capturedEvents);
    expect(events.some(e => e.type === 'chainChanged')).toBe(true);
  });

  test('Base Account - Reject chain switch appropriately', async ({ page }) => {
    await setupBaseAccount(page);

    const result = await page.evaluate(async () => {
      try {
        await window.authManager.switchChain(1);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not support chain switching');
  });
});
```

### Test 3: Credential Export and SDK Integration

```typescript
// e2e/tests/03-sdk-integration.spec.ts
test.describe('SDK Integration', () => {
  test('Export credentials and use with SDK', async ({ page }) => {
    await setupMetaMask(page);

    const credentials = await page.evaluate(async () => {
      return await window.authManager.exportForSDK();
    });

    // Verify credential structure
    expect(credentials).toHaveProperty('signer');
    expect(credentials).toHaveProperty('s5Seed');
    expect(credentials.s5Seed).toMatch(/^[a-zA-Z0-9+/]+=*$/); // Base64
    expect(credentials.chainId).toBe(84532);
    expect(credentials.supportedChains).toContain(84532);

    // Test signing with exported signer
    const signature = await page.evaluate(async () => {
      const creds = await window.authManager.exportForSDK();
      const message = 'Test message for signing';

      // Simulate SDK usage
      const mockSDK = {
        signer: creds.signer,
        signMessage: async (msg) => {
          return await creds.signer.signMessage(msg);
        }
      };

      return await mockSDK.signMessage(message);
    });

    expect(signature).toMatch(/^0x[a-fA-F0-9]{130}$/);

    // Verify S5 seed is deterministic
    const credentials2 = await page.evaluate(async () => {
      await window.authManager.logout();
      await window.authManager.authenticate('metamask');
      return await window.authManager.exportForSDK();
    });

    expect(credentials2.s5Seed).toBe(credentials.s5Seed);
  });
});
```

### Test 4: Error Handling and Recovery

```typescript
// e2e/tests/04-error-handling.spec.ts
test.describe('Error Handling', () => {
  test('Handle user rejection gracefully', async ({ page }) => {
    await page.evaluate(() => {
      window.authManager = new AuthManager();
      window.authManager.registerProvider(new MetaMaskProvider());
    });

    const authPromise = page.evaluate(async () => {
      try {
        await window.authManager.authenticate('metamask');
        return { rejected: false };
      } catch (error) {
        return {
          rejected: true,
          code: error.code,
          message: error.message
        };
      }
    });

    // Reject in MetaMask
    await metamask.rejectAccess();

    const result = await authPromise;
    expect(result.rejected).toBe(true);
    expect(result.code).toBe(4001);
    expect(result.message).toContain('rejected');
  });

  test('Handle network timeouts', async ({ page }) => {
    // Simulate network issues
    await page.route('**/*', route => {
      setTimeout(() => route.abort(), 31000);
    });

    const result = await page.evaluate(async () => {
      try {
        await window.authManager.authenticate('metamask');
        return { success: true };
      } catch (error) {
        return { success: false, timeout: true };
      }
    });

    expect(result.success).toBe(false);
    expect(result.timeout).toBe(true);
  });

  test('Recover from locked wallet', async ({ page }) => {
    // Lock MetaMask
    await metamask.lock();

    const result = await page.evaluate(async () => {
      try {
        const signer = await window.authManager.getSigner();
        await signer.signMessage('test');
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('locked');
  });
});
```

### Test 5: Session Persistence

```typescript
// e2e/tests/05-session-persistence.spec.ts
test.describe('Session Persistence', () => {
  test('Session survives page reload', async ({ page }) => {
    // Authenticate first
    await setupMetaMask(page);
    const originalSession = await page.evaluate(() => {
      return window.authManager.getCurrentSession();
    });

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Recover session
    const recoveredSession = await page.evaluate(() => {
      window.authManager = new AuthManager();
      window.authManager.registerProvider(new MetaMaskProvider());
      return window.authManager.recoverSession();
    });

    expect(recoveredSession).toBeTruthy();
    expect(recoveredSession.address).toBe(originalSession.address);
    expect(recoveredSession.chainId).toBe(originalSession.chainId);
  });

  test('Session expires after timeout', async ({ page }) => {
    await setupMetaMask(page);

    // Fast-forward time (mock)
    await page.evaluate(() => {
      const futureTime = Date.now() + (25 * 60 * 60 * 1000); // 25 hours
      Date.now = () => futureTime;
    });

    const session = await page.evaluate(() => {
      return window.authManager.recoverSession();
    });

    expect(session).toBeNull();
  });
});
```

### Test 6: Multi-Provider Scenarios

```typescript
// e2e/tests/06-multi-provider.spec.ts
test.describe('Multi-Provider Integration', () => {
  test('Switch between providers cleanly', async ({ page }) => {
    // Start with MetaMask
    await setupMetaMask(page);
    let session = await page.evaluate(() => window.authManager.getCurrentSession());
    expect(session.provider).toBe('metamask');

    // Logout
    await page.evaluate(() => window.authManager.logout());

    // Switch to Base Account
    await page.evaluate(async () => {
      window.authManager.registerProvider(new BaseAccountProvider({
        appName: 'Test',
        chainId: 84532
      }));
      return await window.authManager.authenticate('base', 'test-user');
    });

    session = await page.evaluate(() => window.authManager.getCurrentSession());
    expect(session.provider).toBe('base');
    expect(session.capabilities.passkey).toBe(true);
  });
});
```

## Performance Testing

```typescript
// e2e/tests/performance.spec.ts
test.describe('Performance Benchmarks', () => {
  test('Authentication completes within 5 seconds', async ({ page }) => {
    const start = Date.now();
    await setupMetaMask(page);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(5000);

    // Log for performance tracking
    console.log(`Auth took ${duration}ms`);
  });

  test('No memory leaks during extended use', async ({ page }) => {
    const initialMemory = await page.evaluate(() => {
      return performance.memory?.usedJSHeapSize;
    });

    // Perform many operations
    for (let i = 0; i < 10; i++) {
      await page.evaluate(async () => {
        await window.authManager.logout();
        await window.authManager.authenticate('metamask');
        await window.authManager.exportForSDK();
      });
    }

    const finalMemory = await page.evaluate(() => {
      return performance.memory?.usedJSHeapSize;
    });

    // Allow for some growth, but not excessive
    const growth = finalMemory - initialMemory;
    expect(growth).toBeLessThan(10 * 1024 * 1024); // 10MB max growth
  });
});
```

## Mobile Testing

```typescript
// e2e/tests/mobile.spec.ts
import { devices } from '@playwright/test';

test.use(devices['iPhone 13']);

test.describe('Mobile Wallet Testing', () => {
  test('Base Account works on mobile Safari', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const authManager = new AuthManager();
      authManager.registerProvider(new BaseAccountProvider({
        appName: 'Mobile Test',
        chainId: 84532
      }));

      const session = await authManager.authenticate('base', 'mobile-user');
      return session;
    });

    expect(result).toBeTruthy();
    expect(result.capabilities.passkey).toBe(true);
  });
});
```

## CI/CD Integration

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests with Real Wallets

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        env:
          TEST_METAMASK_SEED: ${{ secrets.TEST_METAMASK_SEED }}
          TEST_METAMASK_PASSWORD: ${{ secrets.TEST_METAMASK_PASSWORD }}
        run: npm run test:e2e

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: test-results/
```

## Test Data Management

```typescript
// e2e/helpers/test-accounts.ts
export class TestAccounts {
  private static accounts = new Map();

  static async getOrCreate(type: 'metamask' | 'base', name: string) {
    const key = `${type}-${name}`;

    if (!this.accounts.has(key)) {
      if (type === 'metamask') {
        // Use deterministic account from seed
        this.accounts.set(key, {
          address: '0x...',
          privateKey: '0x...'
        });
      } else {
        // Generate unique username for Base
        this.accounts.set(key, {
          username: `test-${name}-${Date.now()}`,
          passkey: 'auto'
        });
      }
    }

    return this.accounts.get(key);
  }

  static cleanup() {
    // Clean up test data after tests
    this.accounts.clear();
  }
}
```

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npm run test:e2e -- 01-authentication.spec.ts

# Run with UI mode for debugging
npm run test:e2e -- --ui

# Run with specific chain
CHAIN_ID=84532 npm run test:e2e

# Generate HTML report
npm run test:e2e -- --reporter=html
```

## Debugging Failed Tests

```typescript
// Add debug helpers
test('Debug authentication issues', async ({ page }) => {
  // Enable console logging
  page.on('console', msg => console.log('Browser:', msg.text()));

  // Capture network requests
  page.on('request', req => console.log('Request:', req.url()));
  page.on('response', res => console.log('Response:', res.status(), res.url()));

  // Take screenshots on failure
  try {
    await authenticate(page);
  } catch (error) {
    await page.screenshot({ path: 'error-screenshot.png' });
    throw error;
  }
});
```

## Next Steps

1. Set up test wallets with testnet funds
2. Configure CI/CD pipeline
3. Create test data fixtures
4. Implement performance benchmarks
5. Add visual regression tests
6. Monitor test flakiness

Remember: **Real wallet testing is not optional for production readiness!**