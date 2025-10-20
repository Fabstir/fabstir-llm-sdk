// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

// tests/setup-polyfills.ts
// Node.js polyfills for libp2p browser APIs

// CustomEvent polyfill - libp2p uses this for event dispatching
if (typeof globalThis.CustomEvent !== 'function') {
  class CustomEvent<T = any> extends Event {
    detail: T;
    constructor(type: string, params?: CustomEventInit<T>) {
      super(type, params);
      this.detail = params?.detail as T;
    }
  }
  (globalThis as any).CustomEvent = CustomEvent;
}

// Add crypto.subtle if not available (use Node's webcrypto)
import { webcrypto } from 'crypto';
if (!globalThis.crypto?.subtle) {
  (globalThis as any).crypto = webcrypto;
}

// Add TextEncoder/TextDecoder if not available (should be in Node 11+)
import { TextEncoder, TextDecoder } from 'util';
if (typeof globalThis.TextEncoder === 'undefined') {
  (globalThis as any).TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  (globalThis as any).TextDecoder = TextDecoder;
}

// Add AbortController if not available (should be in Node 15+)
if (typeof globalThis.AbortController === 'undefined') {
  (globalThis as any).AbortController = AbortController;
}

// Add Event and EventTarget if not fully compatible
if (typeof globalThis.Event === 'undefined') {
  (globalThis as any).Event = Event;
}
if (typeof globalThis.EventTarget === 'undefined') {
  (globalThis as any).EventTarget = EventTarget;
}

// Performance timing APIs that libp2p might use
if (!globalThis.performance) {
  const { performance } = require('perf_hooks');
  (globalThis as any).performance = performance;
}

// Blob polyfill for libp2p
if (typeof globalThis.Blob === 'undefined') {
  const { Blob } = require('buffer');
  (globalThis as any).Blob = Blob;
}

// Headers polyfill for fetch-like operations
if (typeof globalThis.Headers === 'undefined') {
  class Headers {
    private headers: Map<string, string> = new Map();
    
    constructor(init?: HeadersInit) {
      if (init) {
        if (init instanceof Headers) {
          init.headers.forEach((value, key) => this.headers.set(key, value));
        } else if (Array.isArray(init)) {
          init.forEach(([key, value]) => this.headers.set(key, value));
        } else {
          Object.entries(init).forEach(([key, value]) => this.headers.set(key, value));
        }
      }
    }
    
    append(key: string, value: string): void {
      this.headers.set(key.toLowerCase(), value);
    }
    
    get(key: string): string | null {
      return this.headers.get(key.toLowerCase()) ?? null;
    }
    
    has(key: string): boolean {
      return this.headers.has(key.toLowerCase());
    }
    
    set(key: string, value: string): void {
      this.headers.set(key.toLowerCase(), value);
    }
    
    delete(key: string): void {
      this.headers.delete(key.toLowerCase());
    }
    
    forEach(callback: (value: string, key: string) => void): void {
      this.headers.forEach(callback);
    }
  }
  (globalThis as any).Headers = Headers;
}

console.log('✓ Polyfills loaded for libp2p testing');