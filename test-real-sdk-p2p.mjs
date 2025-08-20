/**
 * Test that the real SDK has P2P methods
 */

import { FabstirSDK } from './dist/index.js';

console.log('Testing Real SDK P2P Methods...\n');

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

test('SDK can be created', () => {
  const sdk = new FabstirSDK({ mode: 'mock' });
  if (!sdk) throw new Error('SDK not created');
});

test('SDK has getP2PStatus method', () => {
  const sdk = new FabstirSDK({ mode: 'mock' });
  if (typeof sdk.getP2PStatus !== 'function') {
    throw new Error('getP2PStatus method not found');
  }
});

test('SDK has isP2PEnabled method', () => {
  const sdk = new FabstirSDK({ mode: 'mock' });
  if (typeof sdk.isP2PEnabled !== 'function') {
    throw new Error('isP2PEnabled method not found');
  }
});

test('SDK has isP2PConnected method', () => {
  const sdk = new FabstirSDK({ mode: 'mock' });
  if (typeof sdk.isP2PConnected !== 'function') {
    throw new Error('isP2PConnected method not found');
  }
});

test('getP2PStatus returns correct value in mock mode', () => {
  const sdk = new FabstirSDK({ mode: 'mock' });
  const status = sdk.getP2PStatus();
  if (status !== 'disabled') {
    throw new Error(`Expected "disabled", got "${status}"`);
  }
});

test('isP2PEnabled returns false in mock mode', () => {
  const sdk = new FabstirSDK({ mode: 'mock' });
  const enabled = sdk.isP2PEnabled();
  if (enabled !== false) {
    throw new Error(`Expected false, got ${enabled}`);
  }
});

test('isP2PConnected returns false in mock mode', () => {
  const sdk = new FabstirSDK({ mode: 'mock' });
  const connected = sdk.isP2PConnected();
  if (connected !== false) {
    throw new Error(`Expected false, got ${connected}`);
  }
});

test('SDK has connect method', () => {
  const sdk = new FabstirSDK({ mode: 'mock' });
  if (typeof sdk.connect !== 'function') {
    throw new Error('connect method not found');
  }
});

test('SDK has submitJob method', () => {
  const sdk = new FabstirSDK({ mode: 'mock' });
  if (typeof sdk.submitJob !== 'function') {
    throw new Error('submitJob method not found');
  }
});

test('SDK has getJobStatus method', () => {
  const sdk = new FabstirSDK({ mode: 'mock' });
  if (typeof sdk.getJobStatus !== 'function') {
    throw new Error('getJobStatus method not found');
  }
});

console.log('\n=== Test Summary ===\n');
console.log(`✅ Tests passed: ${passed}`);
console.log(`❌ Tests failed: ${failed}`);

if (failed === 0) {
  console.log('\n🎉 All methods exist in the real SDK!');
  console.log('The SDK has all required methods for backward compatibility.');
} else {
  console.log('\n⚠️ Some methods are missing.');
  process.exit(1);
}