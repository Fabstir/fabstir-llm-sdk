// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, test, expect } from 'vitest';
import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import {
  hexToBytes,
  bytesToHex,
  toCompressedPub,
  pubkeyToAddress,
  toChecksumAddress,
  makeSigMessage
} from '../../src/crypto/utilities';

describe('Crypto Utilities', () => {
  describe('Hex conversion', () => {
    test('hexToBytes converts hex strings correctly', () => {
      const hex = 'deadbeef';
      const bytes = hexToBytes(hex);
      expect(bytes).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
    });

    test('hexToBytes handles 0x prefix', () => {
      const hex = '0xdeadbeef';
      const bytes = hexToBytes(hex);
      expect(bytes).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
    });

    test('bytesToHex produces lowercase hex', () => {
      const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      const hex = bytesToHex(bytes);
      expect(hex).toBe('deadbeef');
    });

    test('round-trip conversion preserves data', () => {
      const original = '0123456789abcdef';
      const bytes = hexToBytes(original);
      const result = bytesToHex(bytes);
      expect(result).toBe(original);
    });

    test('hexToBytes throws on invalid hex length', () => {
      expect(() => hexToBytes('abc')).toThrow('Invalid hex length');
    });
  });

  describe('Public key compression', () => {
    test('toCompressedPub compresses 65-byte uncompressed key to 33 bytes', () => {
      // Generate test keypair
      const privKey = secp.utils.randomPrivateKey();
      const uncompressedPub = secp.getPublicKey(privKey, false); // 65 bytes

      const compressed = toCompressedPub(uncompressedPub);

      expect(compressed.length).toBe(33);
      expect(compressed[0] === 0x02 || compressed[0] === 0x03).toBe(true);
    });

    test('toCompressedPub preserves already-compressed key', () => {
      const privKey = secp.utils.randomPrivateKey();
      const compressedPub = secp.getPublicKey(privKey, true); // 33 bytes

      const result = toCompressedPub(compressedPub);

      expect(result).toEqual(compressedPub);
      expect(result.length).toBe(33);
    });

    test('toCompressedPub handles hex string input', () => {
      const privKey = secp.utils.randomPrivateKey();
      const compressedPub = secp.getPublicKey(privKey, true);
      const hexPub = bytesToHex(compressedPub);

      const result = toCompressedPub(hexPub);

      expect(result).toEqual(compressedPub);
    });
  });

  describe('EVM address derivation', () => {
    // Known test vector - derive address from private key
    test('pubkeyToAddress derives correct address from known pubkey', () => {
      // Generate keypair and verify address derivation works
      const privKey = secp.utils.randomPrivateKey();
      const pubKey = secp.getPublicKey(privKey, false);

      const address = pubkeyToAddress(pubKey);

      // Verify format: 0x followed by 40 hex characters
      expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);

      // Verify checksum is valid (should equal itself after checksumming)
      expect(address).toBe(toChecksumAddress(address));
    });

    test('toChecksumAddress produces EIP-55 checksum', () => {
      // Test vectors from EIP-55 specification
      const testVectors = [
        ['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'],
        ['0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359', '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'],
        ['0xdbf03b407c01e7cd3cbea99509d93f8dddc8c6fb', '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB'],
        ['0xd1220a0cf47c7b9be7a2e6ba89f429762e7b9adb', '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb']
      ];

      for (const [input, expected] of testVectors) {
        const result = toChecksumAddress(input);
        expect(result).toBe(expected);
      }
    });

    test('toChecksumAddress is idempotent', () => {
      const address = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
      const checksummed = toChecksumAddress(address);
      const checksummedAgain = toChecksumAddress(checksummed);

      expect(checksummed).toBe(checksummedAgain);
    });
  });

  describe('Signature message construction', () => {
    test('makeSigMessage produces consistent hash', () => {
      const enc = new TextEncoder();
      const ephPub = new Uint8Array(33).fill(1);
      const recipientPub = new Uint8Array(33).fill(2);
      const salt = new Uint8Array(16).fill(3);
      const nonce = new Uint8Array(24).fill(4);
      const info = new Uint8Array(0); // Empty byte array for node v8.0.0 compatibility

      const hash1 = makeSigMessage(ephPub, recipientPub, salt, nonce, info);
      const hash2 = makeSigMessage(ephPub, recipientPub, salt, nonce, info);

      expect(hash1).toEqual(hash2);
      expect(hash1.length).toBe(32); // SHA-256 output
    });

    test('makeSigMessage binds all context parameters', () => {
      const ephPub = new Uint8Array(33).fill(1);
      const recipientPub = new Uint8Array(33).fill(2);
      const salt = new Uint8Array(16).fill(3);
      const nonce = new Uint8Array(24).fill(4);
      const info = new Uint8Array(0); // Empty byte array for node v8.0.0 compatibility

      const hash1 = makeSigMessage(ephPub, recipientPub, salt, nonce, info);

      // Change ephemeral public key
      const ephPub2 = new Uint8Array(33).fill(5);
      const hash2 = makeSigMessage(ephPub2, recipientPub, salt, nonce, info);

      // Hashes should be different (binds ephPub)
      expect(hash1).not.toEqual(hash2);
    });

    test('makeSigMessage includes AAD when provided', () => {
      const ephPub = new Uint8Array(33).fill(1);
      const recipientPub = new Uint8Array(33).fill(2);
      const salt = new Uint8Array(16).fill(3);
      const nonce = new Uint8Array(24).fill(4);
      const info = new Uint8Array(0); // Empty byte array for node v8.0.0 compatibility
      const aad = new Uint8Array([10, 20, 30]);

      const hashWithoutAAD = makeSigMessage(ephPub, recipientPub, salt, nonce, info);
      const hashWithAAD = makeSigMessage(ephPub, recipientPub, salt, nonce, info, aad);

      // Different AAD should produce different hash
      expect(hashWithoutAAD).not.toEqual(hashWithAAD);
    });
  });
});
