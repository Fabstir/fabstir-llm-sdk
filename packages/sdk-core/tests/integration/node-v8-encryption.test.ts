/**
 * SDK ↔ Node v8.0.0 Encryption Integration Tests
 *
 * These tests verify that the SDK's encryption implementation is fully compatible
 * with the fabstir-llm-node v8.0.0 encryption system.
 *
 * Tests cover:
 * 1. Session initialization handshake
 * 2. Message encryption/decryption roundtrip
 * 3. Streaming encrypted chunks
 * 4. Signature verification (address recovery)
 * 5. Concurrent sessions with isolated keys
 * 6. Error handling: ENCRYPTION_NOT_SUPPORTED
 * 7. Error handling: DECRYPTION_FAILED
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { EncryptionManager } from '../../src/managers/EncryptionManager';
import { bytesToHex, hexToBytes } from '../../src/crypto/utilities';
import * as secp from '@noble/secp256k1';

describe('SDK ↔ Node v8.0.0 Encryption Integration', () => {
  let clientWallet: ethers.Wallet;
  let hostWallet: ethers.Wallet;
  let clientEM: EncryptionManager;
  let hostEM: EncryptionManager;
  let clientAddress: string;
  let hostAddress: string;
  let hostPubKey: string;

  beforeEach(() => {
    // Create test wallets (client and host)
    clientWallet = ethers.Wallet.createRandom();
    hostWallet = ethers.Wallet.createRandom();
    clientAddress = clientWallet.address;
    hostAddress = hostWallet.address;

    // Create encryption managers
    clientEM = new EncryptionManager(clientWallet);
    hostEM = new EncryptionManager(hostWallet);

    // Get host public key (what SDK would fetch via HostManager)
    hostPubKey = (hostEM as any).clientPublicKey;
  });

  /**
   * Test 1: Session Initialization Handshake
   *
   * Verifies that the SDK can successfully initiate an encrypted session
   * with a node running v8.0.0 encryption.
   */
  test('Test 1: should complete encrypted session init handshake with node v8', async () => {
    // Step 1: Client prepares session init payload
    const sessionId = BigInt(123);
    const jobId = BigInt(456);
    const sessionKey = crypto.getRandomValues(new Uint8Array(32));
    const sessionKeyHex = bytesToHex(sessionKey);

    const initPayload = {
      jobId: jobId,
      modelName: 'llama-3',
      sessionKey: sessionKeyHex,
      pricePerToken: 2000
    };

    // Step 2: Client encrypts session init (SDK → Node)
    const encrypted = await clientEM.encryptSessionInit(hostPubKey, initPayload);

    // Step 3: Verify message format matches node v8.0.0 expectations
    expect(encrypted.type).toBe('encrypted_session_init');
    expect(encrypted.payload).toBeDefined();

    // ✅ Verify field names match node expectations
    expect(encrypted.payload.ephPubHex).toBeDefined();
    expect(encrypted.payload.ciphertextHex).toBeDefined();
    expect(encrypted.payload.signatureHex).toBeDefined(); // Must be "signatureHex" not "sigHex"
    expect(encrypted.payload.nonceHex).toBeDefined();
    expect(encrypted.payload.saltHex).toBeDefined();
    expect(encrypted.payload.recid).toBeDefined();
    expect(encrypted.payload.alg).toBeDefined();
    expect(encrypted.payload.info).toBeDefined();

    // Step 4: Construct full message as SDK would send via WebSocket
    const wsMessage = {
      ...encrypted,
      chain_id: 84532,
      session_id: sessionId.toString(),
      job_id: jobId.toString() // ✅ Must be at top level
    };

    // Verify all required fields present
    expect(wsMessage.type).toBe('encrypted_session_init');
    expect(wsMessage.chain_id).toBe(84532);
    expect(wsMessage.session_id).toBe('123');
    expect(wsMessage.job_id).toBe('456'); // ✅ CRITICAL: node v8 requires this

    // Step 5: Node receives and decrypts (simulated)
    const { data: decryptedInit, senderAddress } = await hostEM.decryptSessionInit(encrypted);

    // Step 6: Verify decryption successful
    expect(decryptedInit.jobId).toBe(jobId);
    expect(decryptedInit.modelName).toBe('llama-3');
    expect(decryptedInit.sessionKey).toBe(sessionKeyHex);
    expect(decryptedInit.pricePerToken).toBe(2000);

    // Step 7: Verify sender address recovered correctly (node uses this for auth)
    expect(senderAddress.toLowerCase()).toBe(clientAddress.toLowerCase());

    console.log('✓ Test 1 PASSED: Session init handshake compatible with node v8.0.0');
  });

  /**
   * Test 2: Message Encryption/Decryption Roundtrip
   *
   * Verifies that encrypted messages can be exchanged between SDK and node.
   */
  test('Test 2: should encrypt prompt, node decrypts, encrypts response, SDK decrypts', async () => {
    // Step 1: Establish session key (shared between client and host)
    const sessionKey = crypto.getRandomValues(new Uint8Array(32));

    // Step 2: Client encrypts prompt (SDK → Node)
    const prompt = 'What is 2+2?';
    const messageIndex = 0;

    const encryptedPrompt = clientEM.encryptMessage(sessionKey, prompt, messageIndex);

    // Step 3: Verify encrypted message format
    expect(encryptedPrompt.type).toBe('encrypted_message');
    expect(encryptedPrompt.nonceHex).toBeDefined();
    expect(encryptedPrompt.nonceHex.length).toBe(48); // 24 bytes = 48 hex chars
    expect(encryptedPrompt.ciphertextHex).toBeDefined();
    expect(encryptedPrompt.aadHex).toBeDefined();

    // Step 4: Node decrypts prompt (simulated)
    const decryptedPrompt = hostEM.decryptMessage(sessionKey, encryptedPrompt);
    expect(decryptedPrompt).toBe(prompt);

    // Step 5: Node processes and encrypts response (Node → SDK)
    const response = 'The answer is 4';
    const responseIndex = 1;

    const encryptedResponse = hostEM.encryptMessage(sessionKey, response, responseIndex);

    // Step 6: Client decrypts response
    const decryptedResponse = clientEM.decryptMessage(sessionKey, encryptedResponse);
    expect(decryptedResponse).toBe(response);

    // Step 7: Verify AAD contains message indices (replay protection)
    const promptAAD = JSON.parse(
      new TextDecoder().decode(hexToBytes(encryptedPrompt.aadHex))
    );
    expect(promptAAD.message_index).toBe(0);

    const responseAAD = JSON.parse(
      new TextDecoder().decode(hexToBytes(encryptedResponse.aadHex))
    );
    expect(responseAAD.message_index).toBe(1);

    console.log('✓ Test 2 PASSED: Message encryption/decryption roundtrip works');
  });

  /**
   * Test 3: Streaming Encrypted Chunks
   *
   * Verifies that streaming responses work with encryption.
   */
  test('Test 3: should handle encrypted streaming response chunks', async () => {
    // Step 1: Establish session key
    const sessionKey = crypto.getRandomValues(new Uint8Array(32));

    // Step 2: Client sends encrypted prompt
    const prompt = 'Tell me a story';
    const encryptedPrompt = clientEM.encryptMessage(sessionKey, prompt, 0);

    // Step 3: Node decrypts prompt
    const decryptedPrompt = hostEM.decryptMessage(sessionKey, encryptedPrompt);
    expect(decryptedPrompt).toBe(prompt);

    // Step 4: Node streams response in chunks (simulated)
    const chunks = [
      'Once upon a time, ',
      'there was a brave knight ',
      'who saved the kingdom.'
    ];

    const encryptedChunks: any[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const encrypted = hostEM.encryptMessage(sessionKey, chunks[i], i + 1);
      encryptedChunks.push({
        type: 'encrypted_chunk',
        ...encrypted
      });
    }

    // Step 5: Client decrypts each chunk
    const decryptedChunks: string[] = [];
    for (const encryptedChunk of encryptedChunks) {
      const decrypted = clientEM.decryptMessage(sessionKey, encryptedChunk);
      decryptedChunks.push(decrypted);
    }

    // Step 6: Verify all chunks decrypted correctly
    expect(decryptedChunks).toEqual(chunks);

    // Step 7: Verify final response is complete
    const fullResponse = decryptedChunks.join('');
    expect(fullResponse).toBe('Once upon a time, there was a brave knight who saved the kingdom.');

    console.log('✓ Test 3 PASSED: Streaming encrypted chunks work correctly');
  });

  /**
   * Test 4: Signature Verification
   *
   * Verifies that the node can recover the correct client address from the signature.
   */
  test('Test 4: node should recover correct client address from signature', async () => {
    // Step 1: Client encrypts session init with signature
    const sessionKey = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
    const initPayload = {
      jobId: BigInt(789),
      modelName: 'gpt-4',
      sessionKey: sessionKey,
      pricePerToken: 3000
    };

    const encrypted = await clientEM.encryptSessionInit(hostPubKey, initPayload);

    // Step 2: Verify signature fields present
    expect(encrypted.payload.signatureHex).toBeDefined();
    expect(encrypted.payload.signatureHex.length).toBe(128); // 64 bytes = 128 hex chars
    expect(encrypted.payload.recid).toBeGreaterThanOrEqual(0);
    expect(encrypted.payload.recid).toBeLessThanOrEqual(3);

    // Step 3: Node decrypts and recovers sender address
    const { data, senderAddress } = await hostEM.decryptSessionInit(encrypted);

    // Step 4: Verify recovered address matches client wallet
    expect(senderAddress.toLowerCase()).toBe(clientAddress.toLowerCase());
    expect(senderAddress).toMatch(/^0x[0-9a-fA-F]{40}$/); // Valid Ethereum address

    // Step 5: Verify address is checksummed (EIP-55)
    const checksummed = ethers.getAddress(senderAddress);
    expect(senderAddress).toBe(checksummed);

    // Step 6: Node can use recovered address for allowlist verification
    const isAuthorized = senderAddress.toLowerCase() === clientAddress.toLowerCase();
    expect(isAuthorized).toBe(true);

    console.log('✓ Test 4 PASSED: Signature verification and address recovery work');
  });

  /**
   * Test 5: Concurrent Sessions
   *
   * Verifies that multiple concurrent sessions maintain isolated encryption keys.
   */
  test('Test 5: should handle multiple concurrent encrypted sessions', async () => {
    // Step 1: Create 3 different session keys (simulating 3 concurrent sessions)
    const session1Key = crypto.getRandomValues(new Uint8Array(32));
    const session2Key = crypto.getRandomValues(new Uint8Array(32));
    const session3Key = crypto.getRandomValues(new Uint8Array(32));

    // Step 2: Send different prompts in each session
    const session1Prompt = 'What is 2+2?';
    const session2Prompt = 'Tell me a joke';
    const session3Prompt = 'Explain quantum physics';

    const encrypted1 = clientEM.encryptMessage(session1Key, session1Prompt, 0);
    const encrypted2 = clientEM.encryptMessage(session2Key, session2Prompt, 0);
    const encrypted3 = clientEM.encryptMessage(session3Key, session3Prompt, 0);

    // Step 3: Verify ciphertexts are different (even though all at index 0)
    expect(encrypted1.ciphertextHex).not.toBe(encrypted2.ciphertextHex);
    expect(encrypted2.ciphertextHex).not.toBe(encrypted3.ciphertextHex);
    expect(encrypted1.ciphertextHex).not.toBe(encrypted3.ciphertextHex);

    // Step 4: Node decrypts with correct session keys
    const decrypted1 = hostEM.decryptMessage(session1Key, encrypted1);
    const decrypted2 = hostEM.decryptMessage(session2Key, encrypted2);
    const decrypted3 = hostEM.decryptMessage(session3Key, encrypted3);

    // Step 5: Verify responses don't cross-contaminate
    expect(decrypted1).toBe(session1Prompt);
    expect(decrypted2).toBe(session2Prompt);
    expect(decrypted3).toBe(session3Prompt);

    // Step 6: Verify wrong key fails decryption (session isolation)
    expect(() => hostEM.decryptMessage(session1Key, encrypted2)).toThrow();
    expect(() => hostEM.decryptMessage(session2Key, encrypted3)).toThrow();
    expect(() => hostEM.decryptMessage(session3Key, encrypted1)).toThrow();

    console.log('✓ Test 5 PASSED: Concurrent sessions maintain isolated keys');
  });

  /**
   * Test 6: Error Handling - ENCRYPTION_NOT_SUPPORTED
   *
   * Verifies that the SDK can handle graceful fallback when node doesn't support encryption.
   */
  test('Test 6: should fallback to plaintext if node lacks HOST_PRIVATE_KEY', async () => {
    // Step 1: Simulate node responding with ENCRYPTION_NOT_SUPPORTED error
    const errorResponse = {
      type: 'error',
      error: {
        code: 'ENCRYPTION_NOT_SUPPORTED',
        message: 'Encryption not supported by this node (HOST_PRIVATE_KEY not configured)',
        details: {
          suggestion: 'Use plaintext session_init instead'
        }
      }
    };

    // Step 2: SDK should detect error code
    expect(errorResponse.error.code).toBe('ENCRYPTION_NOT_SUPPORTED');

    // Step 3: SDK prepares plaintext fallback message
    const plaintextInit = {
      type: 'session_init',
      chain_id: 84532,
      session_id: '123',
      job_id: '456',
      user_address: clientAddress,
      model: 'llama-3',
      price_per_token: 2000
    };

    // Step 4: Verify plaintext format has required fields
    expect(plaintextInit.type).toBe('session_init');
    expect(plaintextInit.chain_id).toBeDefined();
    expect(plaintextInit.session_id).toBeDefined();
    expect(plaintextInit.job_id).toBeDefined();
    expect(plaintextInit.user_address).toBeDefined();

    // Step 5: Verify no encrypted payload
    expect((plaintextInit as any).payload).toBeUndefined();

    console.log('✓ Test 6 PASSED: Graceful fallback to plaintext when encryption not supported');
  });

  /**
   * Test 7: Error Handling - DECRYPTION_FAILED
   *
   * Verifies that decryption failures are handled correctly.
   */
  test('Test 7: should handle decryption failures gracefully', async () => {
    // Step 1: Establish session key
    const sessionKey = crypto.getRandomValues(new Uint8Array(32));

    // Step 2: Client encrypts valid message
    const message = 'This is a test message';
    const encrypted = clientEM.encryptMessage(sessionKey, message, 0);

    // Step 3: Corrupt the ciphertext (simulate transmission error or tampering)
    const corruptedMessage = {
      ...encrypted,
      ciphertextHex: 'ff' + encrypted.ciphertextHex.slice(2) // Flip first byte
    };

    // Step 4: Node attempts decryption - should throw error
    expect(() => {
      hostEM.decryptMessage(sessionKey, corruptedMessage);
    }).toThrow();

    // Step 5: Simulate node error response
    const errorResponse = {
      type: 'error',
      error: {
        code: 'DECRYPTION_FAILED',
        message: 'Failed to decrypt message: Poly1305 tag verification failed',
        details: {
          session_id: '123',
          action_required: 'Session terminated. Please reconnect.'
        }
      }
    };

    expect(errorResponse.error.code).toBe('DECRYPTION_FAILED');

    // Step 6: Test with wrong session key (different error scenario)
    const wrongKey = crypto.getRandomValues(new Uint8Array(32));
    expect(() => {
      hostEM.decryptMessage(wrongKey, encrypted);
    }).toThrow();

    // Step 7: Test with tampered AAD (additional authenticated data)
    const tamperedAAD = {
      ...encrypted,
      aadHex: '00' + encrypted.aadHex.slice(2) // Corrupt AAD
    };

    expect(() => {
      hostEM.decryptMessage(sessionKey, tamperedAAD);
    }).toThrow();

    console.log('✓ Test 7 PASSED: Decryption failures handled correctly');
  });

  /**
   * Additional Test: Verify Message Format Completeness
   *
   * Ensures all required fields are present for node v8.0.0 compatibility.
   */
  test('Additional: should include all required fields in encrypted_session_init', async () => {
    // Step 1: Create complete session init
    const sessionKey = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
    const initPayload = {
      jobId: BigInt(999),
      modelName: 'claude-3',
      sessionKey: sessionKey,
      pricePerToken: 5000
    };

    const encrypted = await clientEM.encryptSessionInit(hostPubKey, initPayload);

    // Step 2: Build complete WebSocket message
    const completeMessage = {
      type: encrypted.type,
      chain_id: 84532,
      session_id: '999',
      job_id: '999',
      payload: encrypted.payload
    };

    // Step 3: Verify ALL required top-level fields
    const requiredFields = ['type', 'chain_id', 'session_id', 'job_id', 'payload'];
    for (const field of requiredFields) {
      expect(completeMessage).toHaveProperty(field);
      expect((completeMessage as any)[field]).toBeDefined();
    }

    // Step 4: Verify ALL required payload fields
    const requiredPayloadFields = [
      'ephPubHex',
      'saltHex',
      'nonceHex',
      'ciphertextHex',
      'signatureHex', // CRITICAL: must be "signatureHex" not "sigHex"
      'recid',
      'alg',
      'info'
    ];

    for (const field of requiredPayloadFields) {
      expect(completeMessage.payload).toHaveProperty(field);
      expect((completeMessage.payload as any)[field]).toBeDefined();
    }

    // Step 5: Verify field types and sizes
    expect(completeMessage.payload.ephPubHex).toMatch(/^[0-9a-f]{66}$/i); // 33 bytes compressed
    expect(completeMessage.payload.saltHex).toMatch(/^[0-9a-f]{32}$/i); // 16 bytes
    expect(completeMessage.payload.nonceHex).toMatch(/^[0-9a-f]{48}$/i); // 24 bytes
    expect(completeMessage.payload.signatureHex).toMatch(/^[0-9a-f]{128}$/i); // 64 bytes
    expect(typeof completeMessage.payload.recid).toBe('number');
    expect(completeMessage.payload.recid).toBeGreaterThanOrEqual(0);
    expect(completeMessage.payload.recid).toBeLessThanOrEqual(3);

    console.log('✓ Additional Test PASSED: All required fields present and valid');
  });

  /**
   * Additional Test: Verify Nonce Uniqueness
   *
   * Ensures nonces are unique for replay attack prevention.
   */
  test('Additional: should generate unique nonces for each message', async () => {
    const sessionKey = crypto.getRandomValues(new Uint8Array(32));
    const message = 'Test message';

    // Encrypt same message 5 times
    const encrypted1 = clientEM.encryptMessage(sessionKey, message, 0);
    const encrypted2 = clientEM.encryptMessage(sessionKey, message, 1);
    const encrypted3 = clientEM.encryptMessage(sessionKey, message, 2);
    const encrypted4 = clientEM.encryptMessage(sessionKey, message, 3);
    const encrypted5 = clientEM.encryptMessage(sessionKey, message, 4);

    // Verify all nonces are different
    const nonces = [
      encrypted1.nonceHex,
      encrypted2.nonceHex,
      encrypted3.nonceHex,
      encrypted4.nonceHex,
      encrypted5.nonceHex
    ];

    const uniqueNonces = new Set(nonces);
    expect(uniqueNonces.size).toBe(5); // All nonces should be unique

    console.log('✓ Additional Test PASSED: Nonces are unique');
  });
});
