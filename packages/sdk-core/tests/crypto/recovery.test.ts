// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, test, expect, beforeAll } from 'vitest';
import * as secp from '@noble/secp256k1';
import { encryptForEphemeral } from '../../src/crypto/encryption';
import { recoverSenderAddress } from '../../src/crypto/recovery';
import { pubkeyToAddress, toChecksumAddress, bytesToHex } from '../../src/crypto/utilities';

describe('Address Recovery', () => {
  // Generate test keypairs once
  let alicePriv: Uint8Array;
  let alicePub: Uint8Array;
  let alicePrivHex: string;
  let alicePubHex: string;
  let aliceAddress: string;

  let bobPriv: Uint8Array;
  let bobPub: Uint8Array;
  let bobPrivHex: string;
  let bobPubHex: string;

  beforeAll(() => {
    alicePriv = secp.utils.randomPrivateKey();
    alicePub = secp.getPublicKey(alicePriv, true);
    alicePrivHex = bytesToHex(alicePriv);
    alicePubHex = bytesToHex(alicePub);
    aliceAddress = pubkeyToAddress(alicePub);

    bobPriv = secp.utils.randomPrivateKey();
    bobPub = secp.getPublicKey(bobPriv, true);
    bobPrivHex = bytesToHex(bobPriv);
    bobPubHex = bytesToHex(bobPub);
  });

  test('should recover sender address from encrypted payload', async () => {
    const payload = await encryptForEphemeral(
      bobPubHex,
      alicePrivHex,
      'Secret message'
    );

    const recoveredAddress = recoverSenderAddress(payload, bobPubHex);

    // Compare lowercase (checksums might differ)
    expect(recoveredAddress.toLowerCase()).toBe(aliceAddress.toLowerCase());
  });

  test('recovered address matches sender actual address exactly', async () => {
    const plaintext = 'Test message for address recovery';
    const payload = await encryptForEphemeral(bobPubHex, alicePrivHex, plaintext);

    const recoveredAddress = recoverSenderAddress(payload, bobPubHex);

    // Should match exactly (both checksummed)
    expect(recoveredAddress).toBe(aliceAddress);
  });

  test('should return checksummed address (EIP-55)', async () => {
    const payload = await encryptForEphemeral(bobPubHex, alicePrivHex, 'Test');
    const recoveredAddress = recoverSenderAddress(payload, bobPubHex);

    // Verify EIP-55 format (0x + 40 hex chars with mixed case)
    expect(recoveredAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);

    // Verify it's properly checksummed (idempotent)
    expect(recoveredAddress).toBe(toChecksumAddress(recoveredAddress));
  });

  test('should fail with invalid signature (mathematically invalid)', async () => {
    const payload = await encryptForEphemeral(bobPubHex, alicePrivHex, 'Secret');

    // Create mathematically invalid signature (all zeros won't parse)
    const tampered = { ...payload, signatureHex: '00'.repeat(64) };

    expect(() => recoverSenderAddress(tampered, bobPubHex))
      .toThrow(/recovery failed|signature verification failed|invalid signature length/i);
  });

  test('integration: works with AAD in payload', async () => {
    const aad = new TextEncoder().encode('session-metadata');
    const payload = await encryptForEphemeral(
      bobPubHex,
      alicePrivHex,
      'Secret with AAD',
      { aad }
    );

    const recoveredAddress = recoverSenderAddress(payload, bobPubHex);

    expect(recoveredAddress).toBe(aliceAddress);
  });

  test('multiple encryptions recover same sender address', async () => {
    const payload1 = await encryptForEphemeral(bobPubHex, alicePrivHex, 'Message 1');
    const payload2 = await encryptForEphemeral(bobPubHex, alicePrivHex, 'Message 2');

    const address1 = recoverSenderAddress(payload1, bobPubHex);
    const address2 = recoverSenderAddress(payload2, bobPubHex);

    // Same sender → same address
    expect(address1).toBe(address2);
    expect(address1).toBe(aliceAddress);
  });
});
