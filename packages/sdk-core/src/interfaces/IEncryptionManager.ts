/**
 * Encryption Manager Interface
 *
 * Provides high-level encryption/decryption operations with three modes:
 * 1. Session Init: Full ECDSA signature for session establishment
 * 2. Message: Symmetric encryption for fast streaming (no signature)
 * 3. Storage: Full ECDSA signature for long-term storage
 */

import type { EphemeralCipherPayload } from '../crypto/types';

/**
 * Session initialization payload (before encryption)
 */
export interface SessionInitPayload {
  /** Job ID from JobMarketplace contract */
  jobId: bigint;

  /** Model name requested */
  modelName: string;

  /** Hex-encoded 32-byte session key for subsequent symmetric encryption */
  sessionKey: string;

  /** Price per token in wei/smallest unit */
  pricePerToken: number;
}

/**
 * Encrypted session initialization (with full signature)
 */
export interface EncryptedSessionInit {
  type: 'encrypted_session_init';
  payload: EphemeralCipherPayload;
}

/**
 * Encrypted message (symmetric, no signature)
 */
export interface EncryptedMessage {
  type: 'encrypted_message';

  /** XChaCha20 nonce (24 bytes hex) */
  nonceHex: string;

  /** Ciphertext with Poly1305 tag (variable length hex) */
  ciphertextHex: string;

  /** Additional Authenticated Data (message index as hex) */
  aadHex: string;
}

/**
 * Encrypted storage payload (with full signature)
 */
export interface EncryptedStorage {
  /** Encrypted payload with signature */
  payload: EphemeralCipherPayload;

  /** ISO timestamp of when stored */
  storedAt: string;

  /** Unique conversation identifier */
  conversationId: string;
}

/**
 * EncryptionManager Interface
 *
 * Manages all encryption/decryption operations for the SDK:
 * - Session initialization: Full signature for mutual authentication
 * - Streaming messages: Symmetric encryption for performance
 * - Storage: Full signature for long-term security and sender verification
 */
export interface IEncryptionManager {
  /**
   * Encrypt session initialization payload with full ECDSA signature.
   *
   * Used for establishing secure sessions with LLM hosts. The signature
   * binds the client's identity to the session parameters, enabling
   * the host to verify the client via on-chain allowlists.
   *
   * @param hostPubKey - Host's static public key (compressed hex, 33 bytes)
   * @param payload - Session parameters to encrypt
   * @returns Encrypted payload with signature
   */
  encryptSessionInit(
    hostPubKey: string,
    payload: SessionInitPayload
  ): Promise<EncryptedSessionInit>;

  /**
   * Decrypt session initialization and verify sender.
   *
   * Recovers the sender's EVM address from the signature for verification
   * against contract allowlists.
   *
   * @param encrypted - Encrypted session initialization
   * @returns Decrypted payload and verified sender address
   * @throws Error if signature verification fails
   */
  decryptSessionInit(
    encrypted: EncryptedSessionInit
  ): Promise<{ data: SessionInitPayload; senderAddress: string }>;

  /**
   * Encrypt message with symmetric encryption (fast, no signature).
   *
   * Used for streaming LLM inference messages. Uses XChaCha20-Poly1305
   * with a shared session key. Message index is included as AAD to
   * prevent replay attacks.
   *
   * @param sessionKey - Shared session key (32 bytes)
   * @param message - Plain text message
   * @param messageIndex - Sequential message number (for AAD binding)
   * @returns Encrypted message
   */
  encryptMessage(
    sessionKey: Uint8Array,
    message: string,
    messageIndex: number
  ): EncryptedMessage;

  /**
   * Decrypt message with symmetric encryption.
   *
   * @param sessionKey - Shared session key (32 bytes)
   * @param encrypted - Encrypted message
   * @returns Decrypted plain text
   * @throws Error if AEAD tag verification fails
   */
  decryptMessage(
    sessionKey: Uint8Array,
    encrypted: EncryptedMessage
  ): string;

  /**
   * Encrypt data for long-term storage with full ECDSA signature.
   *
   * Used for storing conversation history in S5. The signature enables
   * sender verification when retrieving stored data, allowing content
   * moderation and authenticity checks.
   *
   * @param hostPubKey - Host's static public key (compressed hex, 33 bytes)
   * @param data - Data to encrypt (will be JSON serialized)
   * @returns Encrypted storage payload with metadata
   */
  encryptForStorage<T>(
    hostPubKey: string,
    data: T
  ): Promise<EncryptedStorage>;

  /**
   * Decrypt stored data and verify sender.
   *
   * @param encrypted - Encrypted storage payload
   * @returns Decrypted data and verified sender address
   * @throws Error if signature verification fails
   */
  decryptFromStorage<T>(
    encrypted: EncryptedStorage
  ): Promise<{ data: T; senderAddress: string }>;
}
