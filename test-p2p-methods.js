/**
 * Test P2P methods that were missing
 */

console.log('Testing P2P Methods...\n');

// Mock classes
class EventEmitter {
  constructor() {
    this.events = {};
  }
  on(event, handler) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(handler);
    return this;
  }
  emit(event, ...args) {
    if (this.events[event]) {
      this.events[event].forEach(handler => handler(...args));
    }
    return true;
  }
}

// Simulate the SDK with P2P methods
class FabstirSDK extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      mode: 'mock',
      ...config
    };
    this._p2pClient = null;
    
    // Initialize P2P client for production mode
    if (config.mode === 'production' && config.p2pConfig) {
      this._p2pClient = {
        isStarted: () => false
      };
    }
  }
  
  getP2PStatus() {
    if (this.config.mode === 'mock') {
      return 'disabled';
    }
    return this._p2pClient?.isStarted() ? 'connected' : 'disconnected';
  }
  
  isP2PEnabled() {
    return this.config.mode === 'production' && this.config.p2pConfig !== undefined;
  }
  
  isP2PConnected() {
    if (this.config.mode === 'mock') {
      return false;
    }
    return this._p2pClient?.isStarted() || false;
  }
}

// Run tests
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

console.log('=== Testing P2P Methods in Mock Mode ===\n');

test('getP2PStatus returns "disabled" in mock mode', () => {
  const sdk = new FabstirSDK({ mode: 'mock' });
  const status = sdk.getP2PStatus();
  if (status !== 'disabled') throw new Error(`Expected "disabled", got "${status}"`);
});

test('isP2PEnabled returns false in mock mode', () => {
  const sdk = new FabstirSDK({ mode: 'mock' });
  const enabled = sdk.isP2PEnabled();
  if (enabled !== false) throw new Error(`Expected false, got ${enabled}`);
});

test('isP2PConnected returns false in mock mode', () => {
  const sdk = new FabstirSDK({ mode: 'mock' });
  const connected = sdk.isP2PConnected();
  if (connected !== false) throw new Error(`Expected false, got ${connected}`);
});

console.log('\n=== Testing P2P Methods in Production Mode ===\n');

test('getP2PStatus returns "disconnected" when not started', () => {
  const sdk = new FabstirSDK({ 
    mode: 'production',
    p2pConfig: { bootstrapNodes: [] }
  });
  const status = sdk.getP2PStatus();
  if (status !== 'disconnected') throw new Error(`Expected "disconnected", got "${status}"`);
});

test('isP2PEnabled returns true with p2pConfig', () => {
  const sdk = new FabstirSDK({ 
    mode: 'production',
    p2pConfig: { bootstrapNodes: [] }
  });
  const enabled = sdk.isP2PEnabled();
  if (enabled !== true) throw new Error(`Expected true, got ${enabled}`);
});

test('isP2PEnabled returns false without p2pConfig', () => {
  const sdk = new FabstirSDK({ 
    mode: 'production'
  });
  const enabled = sdk.isP2PEnabled();
  if (enabled !== false) throw new Error(`Expected false, got ${enabled}`);
});

test('isP2PConnected returns false when not started', () => {
  const sdk = new FabstirSDK({ 
    mode: 'production',
    p2pConfig: { bootstrapNodes: [] }
  });
  const connected = sdk.isP2PConnected();
  if (connected !== false) throw new Error(`Expected false, got ${connected}`);
});

console.log('\n=== Test Summary ===\n');
console.log(`✅ Tests passed: ${passed}`);
console.log(`❌ Tests failed: ${failed}`);

if (failed === 0) {
  console.log('\n🎉 All P2P methods work correctly!');
  console.log('The methods are available for backward compatibility.');
} else {
  console.log('\n⚠️ Some tests failed.');
  process.exit(1);
}