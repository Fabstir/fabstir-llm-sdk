# Troubleshooting Guide

Common issues and their solutions when integrating Fabstir Auth with real wallets.

## Quick Diagnostics

Run this diagnostic check first:

```javascript
async function runDiagnostics() {
  console.log('🔍 Running Fabstir Auth Diagnostics...\n');

  // 1. Check environment
  console.log('Environment:', typeof window !== 'undefined' ? 'Browser' : 'Node.js');

  // 2. Check MetaMask availability
  if (typeof window !== 'undefined') {
    console.log('MetaMask installed:', !!window.ethereum);
    if (window.ethereum) {
      console.log('MetaMask locked:', !await window.ethereum._metamask.isUnlocked());
    }
  }

  // 3. Check network connectivity
  try {
    const response = await fetch('https://sepolia.base.org', { method: 'HEAD' });
    console.log('Network connectivity: ✅');
  } catch {
    console.log('Network connectivity: ❌');
  }

  // 4. Check localStorage
  console.log('localStorage available:', typeof localStorage !== 'undefined');

  // 5. Check for existing sessions
  const session = localStorage.getItem('fabstir_auth_session');
  console.log('Existing session:', session ? 'Found' : 'None');

  // 6. Version check
  console.log('Auth library version:', require('fabstir-llm-auth/package.json').version);
}
```

## Common Issues

### 1. MetaMask Not Detected

**Error**: "MetaMask is not installed"

**Solutions**:

```javascript
// Solution 1: Check and guide user
if (!window.ethereum) {
  console.log('MetaMask not found');

  // Detect mobile
  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);

  if (isMobile) {
    // Deep link to MetaMask mobile
    window.location.href = `https://metamask.app.link/dapp/${window.location.href}`;
  } else {
    // Guide to install
    window.open('https://metamask.io/download/', '_blank');
  }
  return;
}

// Solution 2: Wait for MetaMask to initialize
async function waitForMetaMask(timeout = 3000) {
  const start = Date.now();

  while (!window.ethereum) {
    if (Date.now() - start > timeout) {
      throw new Error('MetaMask initialization timeout');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return window.ethereum;
}

// Solution 3: Use Base Account as fallback
const authManager = new AuthManager();

if (window.ethereum) {
  authManager.registerProvider(new MetaMaskProvider());
} else {
  console.log('Using Base Account (no extension needed)');
  authManager.registerProvider(new BaseAccountProvider({
    appName: 'Your App',
    chainId: 84532
  }));
}
```

### 2. User Rejected Connection

**Error**: Error code 4001 - "User rejected the request"

**Solutions**:

```javascript
// Graceful handling with retry option
async function connectWithRetry(authManager, maxRetries = 1) {
  let retries = 0;

  while (retries <= maxRetries) {
    try {
      return await authManager.authenticate('metamask');
    } catch (error) {
      if (error.code === 4001) {
        if (retries < maxRetries) {
          const retry = confirm('Connection was rejected. Would you like to try again?');
          if (!retry) throw error;
          retries++;
        } else {
          // Offer alternative
          const useBase = confirm('Would you like to try passwordless login instead?');
          if (useBase) {
            return await authManager.authenticate('base', 'user-' + Date.now());
          }
          throw error;
        }
      } else {
        throw error;
      }
    }
  }
}
```

### 3. Wrong Network/Chain

**Error**: "Please switch to Base Sepolia network"

**Solutions**:

```javascript
// Solution 1: Auto-switch network
async function ensureCorrectChain(authManager, requiredChainId) {
  const session = authManager.getCurrentSession();

  if (session && session.chainId !== requiredChainId) {
    try {
      await authManager.switchChain(requiredChainId);
    } catch (error) {
      if (error.code === 4902) {
        // Chain not added to MetaMask
        await addChainToMetaMask(requiredChainId);
        await authManager.switchChain(requiredChainId);
      } else {
        throw error;
      }
    }
  }
}

// Solution 2: Add missing chain
async function addChainToMetaMask(chainId) {
  const chains = {
    84532: {
      chainId: '0x14a34',
      chainName: 'Base Sepolia',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: ['https://sepolia.base.org'],
      blockExplorerUrls: ['https://sepolia.basescan.org']
    },
    5611: {
      chainId: '0x15eb',
      chainName: 'opBNB Testnet',
      nativeCurrency: { name: 'BNB', symbol: 'tBNB', decimals: 18 },
      rpcUrls: ['https://opbnb-testnet-rpc.bnbchain.org'],
      blockExplorerUrls: ['https://testnet.opbnbscan.com']
    }
  };

  const chainConfig = chains[chainId];
  if (!chainConfig) throw new Error(`Unknown chain: ${chainId}`);

  await window.ethereum.request({
    method: 'wallet_addEthereumChain',
    params: [chainConfig]
  });
}
```

### 4. Session Not Persisting

**Error**: Session lost after page reload

**Solutions**:

```javascript
// Solution 1: Check localStorage is enabled
function checkLocalStorage() {
  try {
    const test = '__test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    console.error('localStorage is disabled:', e);
    return false;
  }
}

// Solution 2: Manual session recovery
class SessionManager {
  static save(session) {
    try {
      localStorage.setItem('fabstir_auth_session', JSON.stringify({
        ...session,
        savedAt: Date.now()
      }));
    } catch (e) {
      // Fallback to sessionStorage or cookies
      sessionStorage.setItem('fabstir_auth_session', JSON.stringify(session));
    }
  }

  static recover() {
    try {
      const stored = localStorage.getItem('fabstir_auth_session') ||
                    sessionStorage.getItem('fabstir_auth_session');

      if (!stored) return null;

      const session = JSON.parse(stored);

      // Check expiry (24 hours)
      if (Date.now() - session.savedAt > 24 * 60 * 60 * 1000) {
        this.clear();
        return null;
      }

      return session;
    } catch {
      return null;
    }
  }

  static clear() {
    localStorage.removeItem('fabstir_auth_session');
    sessionStorage.removeItem('fabstir_auth_session');
  }
}
```

### 5. Signature Verification Failing

**Error**: "Invalid signature" or signature mismatch

**Solutions**:

```javascript
// Solution 1: Ensure consistent message format
function prepareMessage(message) {
  // Remove any invisible characters
  message = message.trim();

  // Ensure consistent encoding
  if (message.startsWith('0x')) {
    // Already hex
    return message;
  } else {
    // Convert to hex
    return ethers.utils.hexlify(ethers.utils.toUtf8Bytes(message));
  }
}

// Solution 2: Debug signature process
async function debugSignature(signer, message) {
  console.log('Original message:', message);

  const prepared = prepareMessage(message);
  console.log('Prepared message:', prepared);

  const messageHash = ethers.utils.hashMessage(prepared);
  console.log('Message hash:', messageHash);

  const signature = await signer.signMessage(prepared);
  console.log('Signature:', signature);

  const recoveredAddress = ethers.utils.verifyMessage(prepared, signature);
  const signerAddress = await signer.getAddress();

  console.log('Signer address:', signerAddress);
  console.log('Recovered address:', recoveredAddress);
  console.log('Match:', recoveredAddress === signerAddress);

  return { signature, valid: recoveredAddress === signerAddress };
}
```

### 6. Gas Sponsorship Not Working

**Error**: Transactions failing despite gas sponsorship on Base testnet

**Solutions**:

```javascript
// Solution 1: Verify testnet and capabilities
async function checkGasSponsorship(authManager) {
  const session = authManager.getCurrentSession();

  if (!session) {
    console.error('Not authenticated');
    return false;
  }

  // Check provider
  if (session.provider !== 'base') {
    console.log('Gas sponsorship only available with Base Account provider');
    return false;
  }

  // Check chain
  if (session.chainId !== 84532) {
    console.log('Gas sponsorship only available on Base Sepolia (84532)');
    return false;
  }

  // Check capability
  if (!session.capabilities.gasSponsorship) {
    console.log('Gas sponsorship not enabled for this session');
    return false;
  }

  return true;
}

// Solution 2: Fallback for non-sponsored transactions
async function sendTransaction(authManager, tx) {
  const hasSponsorship = await checkGasSponsorship(authManager);

  if (!hasSponsorship) {
    // Add gas parameters
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const gasPrice = await provider.getGasPrice();

    tx = {
      ...tx,
      gasLimit: ethers.BigNumber.from('100000'),
      gasPrice: gasPrice.mul(110).div(100) // 10% buffer
    };
  }

  const signer = await authManager.getSigner();
  return await signer.sendTransaction(tx);
}
```

### 7. Mobile Wallet Issues

**Error**: Wallet not connecting on mobile

**Solutions**:

```javascript
// Solution 1: Detect and handle mobile environment
function getMobileStrategy() {
  const ua = navigator.userAgent;
  const isMetaMaskMobile = ua.includes('MetaMask');
  const isWalletBrowser = ua.includes('WalletLink') || ua.includes('CoinbaseWallet');

  if (isMetaMaskMobile) {
    return 'metamask-in-app';
  } else if (isWalletBrowser) {
    return 'coinbase-in-app';
  } else if (/iPhone|iPad|Android/i.test(ua)) {
    return 'mobile-browser';
  }

  return 'desktop';
}

// Solution 2: Mobile-specific initialization
async function initializeMobileAuth() {
  const strategy = getMobileStrategy();
  const authManager = new AuthManager();

  switch (strategy) {
    case 'metamask-in-app':
      // Already in MetaMask app
      authManager.registerProvider(new MetaMaskProvider());
      break;

    case 'mobile-browser':
      // Use Base Account for better mobile support
      authManager.registerProvider(new BaseAccountProvider({
        appName: 'Mobile App',
        chainId: 84532
      }));
      break;

    default:
      // Desktop or unknown
      authManager.registerProvider(new MetaMaskProvider());
      authManager.registerProvider(new BaseAccountProvider({
        appName: 'App',
        chainId: 84532
      }));
  }

  return authManager;
}
```

### 8. CORS/CSP Issues

**Error**: "Blocked by CORS policy" or Content Security Policy violations

**Solutions**:

```javascript
// Solution 1: Update CSP headers (server-side)
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "connect-src 'self' https://*.base.org https://*.infura.io https://*.alchemy.com wss://*; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline';"
  );
  next();
});

// Solution 2: Proxy RPC calls (avoid CORS)
async function proxyRpcCall(method, params) {
  // Instead of direct RPC call, proxy through your backend
  const response = await fetch('/api/rpc-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params })
  });

  return await response.json();
}
```

### 9. Race Conditions

**Error**: "Cannot read property of undefined" during rapid operations

**Solutions**:

```javascript
// Solution: Implement operation queue
class OperationQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  async add(operation) {
    return new Promise((resolve, reject) => {
      this.queue.push({ operation, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const { operation, resolve, reject } = this.queue.shift();

      try {
        const result = await operation();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    this.processing = false;
  }
}

// Usage
const authQueue = new OperationQueue();

async function safeAuthenticate(provider, username) {
  return authQueue.add(async () => {
    return await authManager.authenticate(provider, username);
  });
}
```

### 10. Memory Leaks

**Error**: Application becomes slow after extended use

**Solutions**:

```javascript
// Solution: Proper cleanup
class AuthManagerWithCleanup extends AuthManager {
  private listeners: Array<{ event: string; handler: Function }> = [];

  on(event: string, handler: Function) {
    super.on(event, handler);
    this.listeners.push({ event, handler });
  }

  cleanup() {
    // Remove all event listeners
    this.listeners.forEach(({ event, handler }) => {
      this.off(event, handler);
    });
    this.listeners = [];

    // Clear session
    this.logout();

    // Remove MetaMask listeners
    if (window.ethereum) {
      window.ethereum.removeAllListeners();
    }
  }
}

// Use in React
useEffect(() => {
  const authManager = new AuthManagerWithCleanup();

  return () => {
    authManager.cleanup();
  };
}, []);
```

## Error Code Reference

| Code | Description | Solution |
|------|-------------|----------|
| 4001 | User rejected request | Show friendly message, offer alternatives |
| 4100 | Unauthorized | Request authorization first |
| 4200 | Unsupported method | Check provider capabilities |
| 4900 | Disconnected | Reconnect wallet |
| 4902 | Chain not added | Add chain to wallet |
| -32700 | Parse error | Check request format |
| -32600 | Invalid request | Validate parameters |
| -32601 | Method not found | Check method name |
| -32602 | Invalid params | Validate parameters |
| -32603 | Internal error | Retry with backoff |

## Debug Utilities

### Enable Verbose Logging

```javascript
// Add to your app initialization
if (process.env.NODE_ENV === 'development') {
  window.DEBUG_AUTH = true;

  // Intercept auth manager methods
  const originalAuth = AuthManager.prototype.authenticate;
  AuthManager.prototype.authenticate = async function(...args) {
    console.group('🔐 Authenticate');
    console.log('Arguments:', args);
    console.time('Duration');

    try {
      const result = await originalAuth.apply(this, args);
      console.log('✅ Success:', result);
      return result;
    } catch (error) {
      console.error('❌ Error:', error);
      throw error;
    } finally {
      console.timeEnd('Duration');
      console.groupEnd();
    }
  };
}
```

## Getting Help

If you're still stuck:

1. Check the [examples](../../examples/) directory
2. Search [GitHub Issues](https://github.com/fabstir/fabstir-llm-auth/issues)
3. Enable debug logging and check console
4. Try the diagnostic script above
5. Create a minimal reproduction case
6. Open an issue with:
   - Error message
   - Browser/environment
   - Auth library version
   - Provider being used
   - Reproduction steps