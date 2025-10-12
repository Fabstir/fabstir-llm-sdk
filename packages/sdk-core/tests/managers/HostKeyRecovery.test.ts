import { describe, test, expect, beforeAll } from 'vitest';
import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import { verifyHostSignature } from '../../src/managers/HostKeyRecovery';
import { bytesToHex, pubkeyToAddress } from '../../src/crypto/utilities';

// Set up HMAC for secp256k1 v2.x
beforeAll(() => {
  secp.etc.hmacSha256Sync = (key: Uint8Array, ...msgs: Uint8Array[]) => {
    return hmac(sha256, key, secp.etc.concatBytes(...msgs));
  };
});

describe('HostKeyRecovery - Signature-Based Key Recovery', () => {
  test('should recover host public key from signature', () => {
    // Generate host keypair
    const hostPriv = secp.utils.randomPrivateKey();
    const hostPub = secp.getPublicKey(hostPriv, true); // compressed
    const hostAddress = pubkeyToAddress(hostPub);

    // Generate challenge (what client would send)
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    // Host signs the challenge hash
    const challengeHash = sha256(challenge);
    const signature = secp.sign(challengeHash, hostPriv);
    const sig = signature.toCompactRawBytes();
    const recid = signature.recovery!;
    const sigHex = bytesToHex(sig);

    // Client verifies and recovers public key
    const recoveredPubKey = verifyHostSignature(challenge, sigHex, recid, hostAddress);

    // Verify recovered key matches host's actual public key
    expect(bytesToHex(recoveredPubKey)).toBe(bytesToHex(hostPub));
    expect(recoveredPubKey.length).toBe(33); // compressed format
  });

  test('should reject signature from wrong host address', () => {
    // Generate host keypair
    const hostPriv = secp.utils.randomPrivateKey();
    const hostPub = secp.getPublicKey(hostPriv, true);
    const realHostAddress = pubkeyToAddress(hostPub);

    // Generate challenge
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const challengeHash = sha256(challenge);
    const signature = secp.sign(challengeHash, hostPriv);
    const sig = signature.toCompactRawBytes();
    const recid = signature.recovery!;
    const sigHex = bytesToHex(sig);

    // Try to verify with wrong expected address
    const wrongAddress = '0x0000000000000000000000000000000000000001';

    expect(() => verifyHostSignature(challenge, sigHex, recid, wrongAddress))
      .toThrow(/address mismatch/i);
  });

  test('should reject invalid signature', () => {
    const hostAddress = '0x1234567890123456789012345678901234567890';
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    // Create invalid signature (all zeros)
    const invalidSig = '0'.repeat(128);
    const recid = 0;

    expect(() => verifyHostSignature(challenge, invalidSig, recid, hostAddress))
      .toThrow();
  });

  test('should handle different recovery IDs correctly', () => {
    // Test that different recid values work correctly
    const hostPriv = secp.utils.randomPrivateKey();
    const hostPub = secp.getPublicKey(hostPriv, true);
    const hostAddress = pubkeyToAddress(hostPub);

    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const challengeHash = sha256(challenge);
    const signature = secp.sign(challengeHash, hostPriv);
    const sig = signature.toCompactRawBytes();
    const recid = signature.recovery!;
    const sigHex = bytesToHex(sig);

    // Should work with correct recid
    const recoveredPubKey = verifyHostSignature(challenge, sigHex, recid, hostAddress);
    expect(bytesToHex(recoveredPubKey)).toBe(bytesToHex(hostPub));

    // Should fail with wrong recid (unless it happens to also recover correctly)
    const wrongRecid = (recid + 1) % 4;
    try {
      const wrongRecovered = verifyHostSignature(challenge, sigHex, wrongRecid, hostAddress);
      // If it doesn't throw, the recovered address must not match
      const wrongAddress = pubkeyToAddress(wrongRecovered);
      expect(wrongAddress.toLowerCase()).not.toBe(hostAddress.toLowerCase());
    } catch (error) {
      // Expected to throw address mismatch or recovery failure
      expect(error.message).toMatch(/address mismatch|failed to recover/i);
    }
  });

  test('should verify signature with secp256k1.verify', () => {
    // Ensure we're using proper signature verification
    const hostPriv = secp.utils.randomPrivateKey();
    const hostPub = secp.getPublicKey(hostPriv, true);
    const hostAddress = pubkeyToAddress(hostPub);

    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const challengeHash = sha256(challenge);
    const signature = secp.sign(challengeHash, hostPriv);
    const sig = signature.toCompactRawBytes();
    const recid = signature.recovery!;
    const sigHex = bytesToHex(sig);

    // This should succeed (valid signature)
    const recoveredPubKey = verifyHostSignature(challenge, sigHex, recid, hostAddress);

    // Verify the recovered key can verify the signature
    const isValid = secp.verify(sigHex, challengeHash, recoveredPubKey);
    expect(isValid).toBe(true);
  });

  test('should reject tampered challenge', () => {
    const hostPriv = secp.utils.randomPrivateKey();
    const hostPub = secp.getPublicKey(hostPriv, true);
    const hostAddress = pubkeyToAddress(hostPub);

    // Original challenge
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const challengeHash = sha256(challenge);
    const signature = secp.sign(challengeHash, hostPriv);
    const sig = signature.toCompactRawBytes();
    const recid = signature.recovery!;
    const sigHex = bytesToHex(sig);

    // Tamper with challenge
    const tamperedChallenge = new Uint8Array(challenge);
    tamperedChallenge[0] = (tamperedChallenge[0] + 1) % 256;

    // Should fail verification because hash won't match
    expect(() => verifyHostSignature(tamperedChallenge, sigHex, recid, hostAddress))
      .toThrow(/invalid.*signature|address mismatch/i);
  });

  test('should handle case-insensitive address comparison', () => {
    const hostPriv = secp.utils.randomPrivateKey();
    const hostPub = secp.getPublicKey(hostPriv, true);
    const hostAddress = pubkeyToAddress(hostPub);

    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const challengeHash = sha256(challenge);
    const signature = secp.sign(challengeHash, hostPriv);
    const sig = signature.toCompactRawBytes();
    const recid = signature.recovery!;
    const sigHex = bytesToHex(sig);

    // Test with different case variations
    const lowercaseAddress = hostAddress.toLowerCase();
    const uppercaseAddress = hostAddress.toUpperCase();

    // All should work
    expect(() => verifyHostSignature(challenge, sigHex, recid, lowercaseAddress)).not.toThrow();
    expect(() => verifyHostSignature(challenge, sigHex, recid, uppercaseAddress)).not.toThrow();
    expect(() => verifyHostSignature(challenge, sigHex, recid, hostAddress)).not.toThrow();
  });
});
