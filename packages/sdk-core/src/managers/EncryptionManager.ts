// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Encryption Manager
 *
 * Manages end-to-end encryption for:
 * - Session initialization (full signature)
 * - Streaming messages (symmetric encryption)
 * - Storage operations (full signature)
 *
 * Integrates with ethers.js Wallet for key management and uses
 * Phase 1 crypto primitives for all operations.
 */

import type { Wallet } from 'ethers';
import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { bytesToHex, hexToBytes } from '../crypto/utilities';
import { encryptForEphemeral, decryptFromEphemeral } from '../crypto/encryption';
import { recoverSenderAddress } from '../crypto/recovery';
import type {
  IEncryptionManager,
  SessionInitPayload,
  EncryptedSessionInit,
  EncryptedMessage,
  EncryptedStorage
} from '../interfaces/IEncryptionManager';

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * EncryptionManager class
 *
 * Provides high-level encryption operations using the client's wallet keys.
 * All encryption uses ephemeral-static ECDH with ECDSA signature recovery
 * for sender authentication.
 */
export class EncryptionManager implements IEncryptionManager {
  private clientPrivateKey: string;
  private clientPublicKey: string;
  private clientAddress: string;

  /**
   * Create EncryptionManager
   *
   * @param wallet - ethers.js Wallet instance (from AuthManager)
   * @throws Error if wallet not provided
   */
  constructor(private wallet: Wallet) {
    if (!wallet) {
      throw new Error('Wallet required for EncryptionManager');
    }

    // Extract private key (strip 0x prefix for crypto operations)
    this.clientPrivateKey = wallet.privateKey.replace(/^0x/, '');

    // Store client address (EIP-55 checksummed)
    this.clientAddress = wallet.address;

    // Derive compressed public key from private key
    const pubKeyBytes = secp.getPublicKey(this.clientPrivateKey, true); // true = compressed (33 bytes)
    this.clientPublicKey = bytesToHex(pubKeyBytes);
  }

  /**
   * Create EncryptionManager from wallet signature (for browser wallets like MetaMask)
   * Uses deterministic key derivation from signature
   *
   * @param signature - Wallet signature (hex string)
   * @param address - Wallet address (checksummed)
   * @returns EncryptionManager instance
   */
  static fromSignature(signature: string, address: string): EncryptionManager {
    // Use signature as seed for deterministic private key
    const sigBytes = hexToBytes(signature.replace(/^0x/, ''));
    const hash = sha256(sigBytes);
    const privateKey = bytesToHex(hash);

    // Create minimal wallet-like object
    const wallet = {
      privateKey: '0x' + privateKey,
      address: address
    } as Wallet;

    return new EncryptionManager(wallet);
  }

  /**
   * Create EncryptionManager from address only (for Base Account Kit / passkey wallets)
   * Uses deterministic key derivation from address with domain separation
   * No signature required - works across sessions since address is deterministic
   *
   * @param address - Wallet address (checksummed)
   * @param chainId - Chain ID for domain separation
   * @returns EncryptionManager instance
   */
  static fromAddress(address: string, chainId: number): EncryptionManager {
    // Derive key from address with domain separation
    // Format: sha256(address + domainSeparator + chainId)
    const DOMAIN_SEPARATOR = 'fabstir-encryption-key-v1';
    const seedInput = address.toLowerCase() + DOMAIN_SEPARATOR + chainId.toString();
    const seedBytes = new TextEncoder().encode(seedInput);
    const hash = sha256(seedBytes);
    const privateKey = bytesToHex(hash);

    // Create minimal wallet-like object
    const wallet = {
      privateKey: '0x' + privateKey,
      address: address
    } as Wallet;

    return new EncryptionManager(wallet);
  }

  /**
   * Get client's private key (for internal use)
   * @private
   */
  private getClientPrivateKey(): string {
    return this.clientPrivateKey;
  }

  /**
   * Get client's public key (for sending to host in session_init)
   * Returns compressed secp256k1 public key in hex format (0x-prefixed)
   */
  getPublicKey(): string {
    return '0x' + this.clientPublicKey;
  }

  /**
   * Encrypt session initialization payload with full ECDSA signature.
   *
   * Algorithm:
   * 1. Serialize payload to JSON (with BigInt support)
   * 2. Encrypt with ephemeral-static ECDH
   * 3. Return wrapped payload
   *
   * @param hostPubKey - Host's static public key (compressed hex)
   * @param payload - Session parameters to encrypt
   * @returns Encrypted payload with signature
   */
  async encryptSessionInit(
    hostPubKey: string,
    payload: SessionInitPayload
  ): Promise<EncryptedSessionInit> {
    // Serialize payload with BigInt support
    const json = JSON.stringify(payload, (key, value) =>
      typeof value === 'bigint' ? value.toString() + 'n' : value
    );

    // Encrypt with ephemeral-static ECDH
    const encryptedPayload = await encryptForEphemeral(
      hostPubKey,
      this.clientPrivateKey,
      json
    );

    return {
      type: 'encrypted_session_init',
      payload: encryptedPayload
    };
  }

  /**
   * Decrypt session initialization and verify sender.
   *
   * Algorithm:
   * 1. Decrypt ciphertext with ECDH
   * 2. Recover sender's EVM address from signature
   * 3. Parse JSON and restore BigInt values
   * 4. Return data and sender address
   *
   * @param encrypted - Encrypted session initialization
   * @returns Decrypted payload and verified sender address
   * @throws Error if signature verification fails or decryption fails
   */
  async decryptSessionInit(
    encrypted: EncryptedSessionInit
  ): Promise<{ data: SessionInitPayload; senderAddress: string }> {
    // Decrypt with ephemeral-static ECDH
    const json = decryptFromEphemeral(
      this.clientPrivateKey,
      this.clientPublicKey,
      encrypted.payload
    );

    // Recover sender address from signature
    const senderAddress = recoverSenderAddress(
      encrypted.payload,
      this.clientPublicKey
    );

    // Parse JSON with BigInt restoration
    const data = JSON.parse(json, (key, value) => {
      if (typeof value === 'string' && value.endsWith('n')) {
        const numStr = value.slice(0, -1);
        try {
          return BigInt(numStr);
        } catch {
          return value; // Not a valid BigInt, return as-is
        }
      }
      return value;
    }) as SessionInitPayload;

    return { data, senderAddress };
  }

  /**
   * Encrypt message with symmetric encryption (fast, no signature).
   *
   * Algorithm:
   * 1. Generate random nonce (24 bytes for XChaCha20)
   * 2. Create AAD with message_index (replay protection)
   * 3. Encrypt with XChaCha20-Poly1305 AEAD
   * 4. Return encrypted payload (without wrapper)
   *
   * @param sessionKey - Shared session key (32 bytes)
   * @param message - Plain text message
   * @param messageIndex - Sequential message number (prevents replay/reordering)
   * @returns Encrypted payload (ciphertextHex, nonceHex, aadHex only)
   */
  encryptMessage(
    sessionKey: Uint8Array,
    message: string,
    messageIndex: number
  ): { ciphertextHex: string; nonceHex: string; aadHex: string } {
    // Generate fresh nonce for each message (CRITICAL: must be unique!)
    const nonce = crypto.getRandomValues(new Uint8Array(24)); // XChaCha20 uses 24-byte nonce

    // AAD includes message index for replay protection (per docs line 149)
    const aad = enc.encode(`message_${messageIndex}`);

    // Encrypt with XChaCha20-Poly1305
    const cipher = xchacha20poly1305(sessionKey, nonce, aad);
    const plaintext = enc.encode(message);
    const ciphertext = cipher.encrypt(plaintext);

    return {
      ciphertextHex: bytesToHex(ciphertext),
      nonceHex: bytesToHex(nonce),
      aadHex: bytesToHex(aad)
    };
  }

  /**
   * Decrypt message with symmetric encryption.
   *
   * Algorithm:
   * 1. Parse nonce, ciphertext, and AAD from hex
   * 2. Decrypt with XChaCha20-Poly1305 (verifies AAD and tag)
   * 3. Return plaintext
   *
   * @param sessionKey - Shared session key (32 bytes)
   * @param encrypted - Encrypted payload object
   * @returns Decrypted plain text
   * @throws Error if AAD verification fails or tag is invalid
   */
  decryptMessage(
    sessionKey: Uint8Array,
    encrypted: { ciphertextHex: string; nonceHex: string; aadHex: string }
  ): string {
    const nonce = hexToBytes(encrypted.nonceHex);
    const ciphertext = hexToBytes(encrypted.ciphertextHex);
    const aad = hexToBytes(encrypted.aadHex);

    // Decrypt with XChaCha20-Poly1305
    const cipher = xchacha20poly1305(sessionKey, nonce, aad);
    const plaintext = cipher.decrypt(ciphertext); // Throws if tag verification fails

    return dec.decode(plaintext);
  }

  /**
   * Encrypt data for long-term storage with full ECDSA signature.
   *
   * Algorithm:
   * 1. Serialize data to JSON
   * 2. Encrypt with ephemeral-static ECDH (includes signature)
   * 3. Generate unique conversation ID
   * 4. Add storage metadata (timestamp, conversationId)
   * 5. Return wrapped payload
   *
   * @param hostPubKey - Host's static public key (compressed hex)
   * @param data - Data to encrypt (any JSON-serializable type)
   * @returns Encrypted storage payload with metadata
   */
  async encryptForStorage<T>(
    hostPubKey: string,
    data: T
  ): Promise<EncryptedStorage> {
    // Serialize data to JSON
    const plaintext = JSON.stringify(data);
    const plaintextSize = plaintext.length;

    console.log(`[Enhanced S5.js] 🔐 Encrypting data for storage (${plaintextSize} bytes)`);
    console.log(`[Enhanced S5.js] Algorithm: XChaCha20-Poly1305 AEAD with ephemeral-static ECDH`);

    // Encrypt with ephemeral-static ECDH (includes full signature)
    const startTime = performance.now();
    const payload = await encryptForEphemeral(
      hostPubKey,
      this.clientPrivateKey,
      plaintext
    );
    const duration = Math.round(performance.now() - startTime);

    // Generate unique conversation ID (simple random hex)
    const conversationId = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));

    const encryptedSize = JSON.stringify(payload).length;
    console.log(`[Enhanced S5.js] ✅ Encryption complete: ${plaintextSize} → ${encryptedSize} bytes (+${Math.round((encryptedSize - plaintextSize) / plaintextSize * 100)}% overhead) in ${duration}ms`);

    return {
      payload,
      storedAt: new Date().toISOString(),
      conversationId
    };
  }

  /**
   * Decrypt stored data and verify sender.
   *
   * Algorithm:
   * 1. Decrypt payload with ECDH
   * 2. Recover sender address from signature
   * 3. Parse JSON to restore original data type
   * 4. Return data and sender address
   *
   * @param encrypted - Encrypted storage payload
   * @returns Decrypted data and verified sender address
   * @throws Error if signature verification fails or decryption fails
   */
  async decryptFromStorage<T>(
    encrypted: EncryptedStorage
  ): Promise<{ data: T; senderAddress: string }> {
    const encryptedSize = JSON.stringify(encrypted.payload).length;
    console.log(`[Enhanced S5.js] 🔓 Decrypting data from storage (${encryptedSize} bytes encrypted)`);
    console.log(`[Enhanced S5.js] Algorithm: XChaCha20-Poly1305 AEAD with ephemeral-static ECDH`);

    // Decrypt with ephemeral-static ECDH
    const startTime = performance.now();
    const plaintext = decryptFromEphemeral(
      this.clientPrivateKey,
      this.clientPublicKey,
      encrypted.payload
    );
    const duration = Math.round(performance.now() - startTime);

    // Recover sender address from signature
    const senderAddress = recoverSenderAddress(
      encrypted.payload,
      this.clientPublicKey
    );

    // Parse JSON to restore original data
    const data = JSON.parse(plaintext) as T;

    const plaintextSize = plaintext.length;
    console.log(`[Enhanced S5.js] ✅ Decryption complete: ${encryptedSize} → ${plaintextSize} bytes in ${duration}ms`);
    console.log(`[Enhanced S5.js] Verified sender: ${senderAddress.substring(0, 10)}...${senderAddress.substring(senderAddress.length - 8)}`);

    return { data, senderAddress };
  }
}
