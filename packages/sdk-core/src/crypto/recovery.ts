/**
 * EVM address recovery from encrypted payloads.
 *
 * Enables sender verification without requiring explicit public key exchange
 * by recovering the sender's public key from the ECDSA signature and deriving
 * their Ethereum address for on-chain allowlist verification.
 */

import * as secp from '@noble/secp256k1';
import { hexToBytes, toCompressedPub, pubkeyToAddress, makeSigMessage } from './utilities';
import type { EphemeralCipherPayload } from './types';

/**
 * Recover the sender's EVM address from an encrypted payload.
 *
 * This extracts the sender's public key from the ECDSA signature
 * and derives their Ethereum address, enabling verification against
 * on-chain allowlists without requiring the sender to explicitly
 * provide their public key.
 *
 * Algorithm:
 * 1. Reconstruct the signed message from payload components
 * 2. Recover sender's public key from signature using recovery ID
 * 3. Verify signature against recovered public key (defense in depth)
 * 4. Derive EVM address from recovered public key (keccak256 + EIP-55)
 *
 * @param payload - Encrypted payload with signature and recovery ID
 * @param recipientPubHex - Recipient's static public key (compressed hex, 33 bytes)
 * @returns Checksummed EVM address (EIP-55 format, e.g., 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed)
 * @throws Error if signature recovery fails or verification fails
 *
 * @example
 * ```typescript
 * const payload = await encryptForEphemeral(recipientPub, senderPriv, 'Secret');
 * const senderAddress = recoverSenderAddress(payload, recipientPub);
 * console.log('Sender:', senderAddress); // 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
 * ```
 */
export function recoverSenderAddress(
  payload: EphemeralCipherPayload,
  recipientPubHex: string
): string {
  // Parse info from hex (empty string → empty byte array for node v8.0.0 compatibility)
  const info = payload.info && payload.info !== '' ? hexToBytes(payload.info) : new Uint8Array(0);

  // 1. Parse payload components
  const ephPub = toCompressedPub(payload.ephPubHex);
  const recipientPub = toCompressedPub(recipientPubHex);
  const salt = hexToBytes(payload.saltHex);
  const nonce = hexToBytes(payload.nonceHex);
  const aad = payload.aadHex && payload.aadHex !== '' ? hexToBytes(payload.aadHex) : new Uint8Array(0);

  // 2. Reconstruct signed message (must match what was signed during encryption)
  const msg = makeSigMessage(ephPub, recipientPub, salt, nonce, info, aad);

  // 3. Recover sender's public key from signature
  // Parse 65-byte signature: [r (32) + s (32) + recovery_id (1)]
  const sigBytes = hexToBytes(payload.signatureHex);
  if (sigBytes.length !== 65) {
    throw new Error(`Invalid signature length: expected 65 bytes, got ${sigBytes.length}`);
  }
  const compactSig = sigBytes.slice(0, 64); // First 64 bytes
  const recid = sigBytes[64]; // Last byte is recovery ID

  let senderPubCompressed: Uint8Array;
  try {
    const signature = secp.Signature.fromCompact(compactSig).addRecoveryBit(recid);
    senderPubCompressed = signature.recoverPublicKey(msg).toRawBytes(true); // compressed (33 bytes)
  } catch (error) {
    throw new Error(`Signature recovery failed: ${error instanceof Error ? error.message : 'invalid signature'}`);
  }

  // 4. Verify signature (defense in depth - ensures recovered key is correct)
  const valid = secp.verify(compactSig, msg, senderPubCompressed);
  if (!valid) {
    throw new Error('Signature verification failed: recovered public key does not validate signature');
  }

  // 5. Derive EVM address from recovered public key
  return pubkeyToAddress(senderPubCompressed);
}
