// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * FC1.6 session-auth — Item 1: WS client address.
 *
 * The node's FC1.6 gate serves the WebSocket only to the address it recovers
 * from the signature on `encrypted_session_init`. That signature is made with
 * the ENCRYPTION key (seed-derived under `fromSeed`), NOT the wallet key — so
 * the exposed address must be `computeAddress(getPublicKey())`, never the
 * wallet EOA held in `EncryptionManager.clientAddress`.
 */

import { describe, test, expect } from 'vitest';
import { ethers } from 'ethers';
import { EncryptionManager } from '../../src/managers/EncryptionManager';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { recoverSenderAddress } from '../../src/crypto/recovery';

// A valid-format SDK config with fresh (never-hardcoded) addresses — enough to
// construct FabstirSDKCore so the SDK-level getter's guards can be exercised.
function makeConfig() {
  const addr = () => ethers.Wallet.createRandom().address;
  return {
    mode: 'production' as const,
    rpcUrl: 'https://base-sepolia.example.com',
    chainId: 84532,
    contractAddresses: {
      jobMarketplace: addr(),
      nodeRegistry: addr(),
      proofSystem: addr(),
      hostEarnings: addr(),
      usdcToken: addr(),
    },
  };
}

const SEED = 'yield organic score bishop free juice atop village video element unless sneak care rock update';

describe('EncryptionManager.getWsClientAddress', () => {
  test('returns computeAddress(getPublicKey()) — the encryption-key EOA', () => {
    const em = new EncryptionManager(ethers.Wallet.createRandom());

    const expected = ethers.computeAddress(em.getPublicKey());
    expect(em.getWsClientAddress()).toBe(expected);
  });

  test('under fromSeed it is the seed-derived EOA, NOT the wallet address (the trap)', () => {
    const walletAddress = ethers.Wallet.createRandom().address;
    const em = EncryptionManager.fromSeed(SEED, walletAddress);

    // The wallet address held in `clientAddress` must not leak out of the getter.
    expect(em.getWsClientAddress().toLowerCase()).not.toBe(walletAddress.toLowerCase());
    // It is exactly the address of the seed-derived public key.
    expect(em.getWsClientAddress()).toBe(ethers.computeAddress(em.getPublicKey()));
  });

  test('is deterministic across instances built from the same seed', () => {
    const a = EncryptionManager.fromSeed(SEED, ethers.Wallet.createRandom().address);
    const b = EncryptionManager.fromSeed(SEED, ethers.Wallet.createRandom().address);

    expect(a.getWsClientAddress()).toBe(b.getWsClientAddress());
  });

  test("behavioral: a real encrypted_session_init signature recovers to getWsClientAddress() (the node's gate check)", async () => {
    // Client keys come from the seed (the production path), host is a static recipient.
    const client = EncryptionManager.fromSeed(SEED, ethers.Wallet.createRandom().address);
    const host = new EncryptionManager(ethers.Wallet.createRandom());
    const hostPubKey = (host as any).clientPublicKey as string; // compressed hex, no 0x

    const encrypted = await client.encryptSessionInit(hostPubKey, {
      jobId: '954',
      modelName: 'llama-3',
      sessionKey: '00'.repeat(32),
      pricePerToken: 2000,
    });

    const recovered = recoverSenderAddress(encrypted.payload, hostPubKey);
    // Both sides are EIP-55 checksummed — exact string compare is the real gate.
    expect(recovered).toBe(client.getWsClientAddress());
  });
});

describe('FabstirSDKCore.getWsClientAddress', () => {
  test('throws NOT_AUTHENTICATED before authentication', () => {
    const sdk = new FabstirSDKCore(makeConfig());
    try {
      sdk.getWsClientAddress();
      throw new Error('expected getWsClientAddress to throw');
    } catch (e: any) {
      expect(e.code).toBe('NOT_AUTHENTICATED');
    }
  });

  test('delegates to the EncryptionManager once set', () => {
    const sdk = new FabstirSDKCore(makeConfig());
    const em = EncryptionManager.fromSeed(SEED, ethers.Wallet.createRandom().address);
    (sdk as any).authenticated = true;
    (sdk as any).encryptionManager = em;

    expect(sdk.getWsClientAddress()).toBe(em.getWsClientAddress());
  });

  test('throws ENCRYPTION_NOT_AVAILABLE in host-only mode (authenticated, no EncryptionManager)', () => {
    const sdk = new FabstirSDKCore(makeConfig());
    (sdk as any).authenticated = true;
    (sdk as any).encryptionManager = undefined;

    try {
      sdk.getWsClientAddress();
      throw new Error('expected getWsClientAddress to throw');
    } catch (e: any) {
      expect(e.code).toBe('ENCRYPTION_NOT_AVAILABLE');
    }
  });
});
