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
   * Get client's private key (for internal use)
   * @private
   */
  private getClientPrivateKey(): string {
    return this.clientPrivateKey;
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
   * 2. Create AAD with message_index and timestamp (replay protection)
   * 3. Encrypt with XChaCha20-Poly1305 AEAD
   * 4. Return encrypted message
   *
   * @param sessionKey - Shared session key (32 bytes)
   * @param message - Plain text message
   * @param messageIndex - Sequential message number (prevents replay/reordering)
   * @returns Encrypted message with nonce and AAD
   */
  encryptMessage(
    sessionKey: Uint8Array,
    message: string,
    messageIndex: number
  ): EncryptedMessage {
    // Generate fresh nonce for each message
    const nonce = crypto.getRandomValues(new Uint8Array(24)); // XChaCha20 uses 24-byte nonce

    // AAD includes message index and timestamp to prevent replay/reordering
    const aad = enc.encode(JSON.stringify({
      message_index: messageIndex,
      timestamp: Date.now()
    }));

    // Encrypt with XChaCha20-Poly1305
    const cipher = xchacha20poly1305(sessionKey, nonce, aad);
    const plaintext = enc.encode(message);
    const ciphertext = cipher.encrypt(plaintext);

    return {
      type: 'encrypted_message',
      nonceHex: bytesToHex(nonce),
      ciphertextHex: bytesToHex(ciphertext),
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
   * @param encrypted - Encrypted message
   * @returns Decrypted plain text
   * @throws Error if AAD verification fails or tag is invalid
   */
  decryptMessage(
    sessionKey: Uint8Array,
    encrypted: EncryptedMessage
  ): string {
    const nonce = hexToBytes(encrypted.nonceHex);
    const ciphertext = hexToBytes(encrypted.ciphertextHex);
    const aad = hexToBytes(encrypted.aadHex);

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

    // Encrypt with ephemeral-static ECDH (includes full signature)
    const payload = await encryptForEphemeral(
      hostPubKey,
      this.clientPrivateKey,
      plaintext
    );

    // Generate unique conversation ID (simple random hex)
    const conversationId = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));

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
    // Decrypt with ephemeral-static ECDH
    const plaintext = decryptFromEphemeral(
      this.clientPrivateKey,
      this.clientPublicKey,
      encrypted.payload
    );

    // Recover sender address from signature
    const senderAddress = recoverSenderAddress(
      encrypted.payload,
      this.clientPublicKey
    );

    // Parse JSON to restore original data
    const data = JSON.parse(plaintext) as T;

    return { data, senderAddress };
  }
}
