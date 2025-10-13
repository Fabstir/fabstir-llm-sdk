import { describe, test, expect, beforeAll } from 'vitest';
import * as secp from '@noble/secp256k1';
import {
  encryptForEphemeral,
  decryptFromEphemeral
} from '../../src/crypto/encryption';
import { bytesToHex } from '../../src/crypto/utilities';

describe('Ephemeral-Static Encryption', () => {
  // Generate test keypairs once
  let alicePriv: Uint8Array;
  let alicePub: Uint8Array;
  let alicePrivHex: string;
  let alicePubHex: string;
  let bobPriv: Uint8Array;
  let bobPub: Uint8Array;
  let bobPrivHex: string;
  let bobPubHex: string;

  beforeAll(() => {
    alicePriv = secp.utils.randomPrivateKey();
    alicePub = secp.getPublicKey(alicePriv, true);
    alicePrivHex = bytesToHex(alicePriv);
    alicePubHex = bytesToHex(alicePub);

    bobPriv = secp.utils.randomPrivateKey();
    bobPub = secp.getPublicKey(bobPriv, true);
    bobPrivHex = bytesToHex(bobPriv);
    bobPubHex = bytesToHex(bobPub);
  });

  describe('Basic encryption/decryption', () => {
    test('encryptForEphemeral produces valid payload', async () => {
      const plaintext = 'Secret message';

      const payload = await encryptForEphemeral(
        bobPubHex,
        alicePrivHex,
        plaintext
      );

      // Verify payload structure
      expect(payload.ephPubHex).toBeDefined();
      expect(payload.ephPubHex.length).toBe(66); // 33 bytes compressed = 66 hex chars
      expect(payload.saltHex).toBeDefined();
      expect(payload.saltHex.length).toBe(32); // 16 bytes = 32 hex chars
      expect(payload.nonceHex).toBeDefined();
      expect(payload.nonceHex.length).toBe(48); // 24 bytes = 48 hex chars
      expect(payload.ciphertextHex).toBeDefined();
      expect(payload.ciphertextHex.length).toBeGreaterThan(0);
      expect(payload.signatureHex).toBeDefined();
      expect(payload.signatureHex.length).toBe(130); // 65 bytes signature (r+s+recid) = 130 hex chars
      expect(payload.recid).toBeGreaterThanOrEqual(0);
      expect(payload.recid).toBeLessThanOrEqual(3);
      expect(payload.alg).toBeDefined();
      expect(payload.info).toBeDefined();
    });

    test('decryptFromEphemeral recovers plaintext', async () => {
      const plaintext = 'Secret message for Bob';

      const payload = await encryptForEphemeral(
        bobPubHex,
        alicePrivHex,
        plaintext
      );

      const decrypted = decryptFromEphemeral(
        bobPrivHex,
        bobPubHex,
        payload
      );

      expect(decrypted).toBe(plaintext);
    });

    test('round-trip encryption/decryption preserves data', async () => {
      const plaintext = 'The quick brown fox jumps over the lazy dog';

      const payload = await encryptForEphemeral(
        bobPubHex,
        alicePrivHex,
        plaintext
      );

      const decrypted = decryptFromEphemeral(
        bobPrivHex,
        bobPubHex,
        payload
      );

      expect(decrypted).toBe(plaintext);
    });

    test('different plaintexts produce different ciphertexts', async () => {
      const plaintext = 'Secret';
      const payload1 = await encryptForEphemeral(bobPubHex, alicePrivHex, plaintext);
      const payload2 = await encryptForEphemeral(bobPubHex, alicePrivHex, plaintext);

      // Different ephemeral keys each time
      expect(payload1.ephPubHex).not.toBe(payload2.ephPubHex);
      // Different ciphertexts (due to different nonces/ephemeral keys)
      expect(payload1.ciphertextHex).not.toBe(payload2.ciphertextHex);
      // Different signatures (message includes ephemeral key)
      expect(payload1.signatureHex).not.toBe(payload2.signatureHex);
    });
  });

  describe('Security properties', () => {
    test('decryption fails with tampered ciphertext', async () => {
      const payload = await encryptForEphemeral(bobPubHex, alicePrivHex, 'Secret');

      // Tamper with ciphertext (flip first byte)
      const tampered = { ...payload, ciphertextHex: 'ff' + payload.ciphertextHex.slice(2) };

      expect(() => decryptFromEphemeral(bobPrivHex, bobPubHex, tampered))
        .toThrow();
    });

    test('decryption fails with tampered signature', async () => {
      const payload = await encryptForEphemeral(bobPubHex, alicePrivHex, 'Secret');

      // Tamper with signature (flip first byte)
      const tampered = { ...payload, signatureHex: 'ff' + payload.signatureHex.slice(2) };

      // Signature verification should fail (may throw signature recovery or verification error)
      expect(() => decryptFromEphemeral(bobPrivHex, bobPubHex, tampered))
        .toThrow();
    });

    test('AAD binding works - decryption fails with different AAD', async () => {
      const aad = new TextEncoder().encode('metadata');
      const payload = await encryptForEphemeral(bobPubHex, alicePrivHex, 'Secret', { aad });

      // Tamper with AAD in payload (change it to wrong value)
      const wrongAad = new TextEncoder().encode('wrong-metadata');
      const tamperedPayload = {
        ...payload,
        aadHex: Array.from(wrongAad, b => b.toString(16).padStart(2, '0')).join('')
      };

      // Decryption should fail due to AEAD tag mismatch
      expect(() => decryptFromEphemeral(bobPrivHex, bobPubHex, tamperedPayload))
        .toThrow();
    });

    test('AAD binding works - decryption succeeds with correct AAD', async () => {
      const aad = new TextEncoder().encode('session-123');
      const plaintext = 'Secret with AAD';
      const payload = await encryptForEphemeral(bobPubHex, alicePrivHex, plaintext, { aad });

      const decrypted = decryptFromEphemeral(bobPrivHex, bobPubHex, payload, { aad });
      expect(decrypted).toBe(plaintext);
    });
  });
});
