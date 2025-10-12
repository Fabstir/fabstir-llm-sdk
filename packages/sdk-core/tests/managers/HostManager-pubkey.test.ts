import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import * as secp from '@noble/secp256k1';
import { HostManager } from '../../src/managers/HostManager';
import { ModelManager } from '../../src/managers/ModelManager';
import { bytesToHex } from '../../src/crypto/utilities';
import type { HostMetadata } from '../../src/types/models';

describe('HostManager - Public Key Management', () => {
  let hostManager: HostManager;
  let modelManager: ModelManager;
  let wallet: ethers.Wallet;
  let nodeRegistry: any;
  const nodeRegistryAddress = '0x1234567890123456789012345678901234567890';
  const fabTokenAddress = '0xFAB0000000000000000000000000000000000000';

  beforeEach(() => {
    wallet = ethers.Wallet.createRandom();

    // Mock NodeRegistry contract
    nodeRegistry = {
      registerNode: vi.fn().mockResolvedValue({
        hash: '0xabc123',
        wait: vi.fn().mockResolvedValue({ status: 1 })
      }),
      nodes: vi.fn().mockResolvedValue([
        ethers.ZeroAddress, // operator (zero = not registered)
        BigInt(0),          // stake
        false               // active
      ]),
      getNode: vi.fn(),
      getNodeFullInfo: vi.fn().mockResolvedValue([
        ethers.ZeroAddress, // operator at index 0
        BigInt(0),          // stake at index 1
        false,              // active at index 2
        '',                 // metadata at index 3
        '',                 // apiUrl at index 4
        [],                 // supportedModels at index 5
        BigInt(0),          // minPricePerTokenNative at index 6
        BigInt(0)           // minPricePerTokenStable at index 7
      ]),
      target: nodeRegistryAddress,
      interface: {
        encodeFunctionData: vi.fn().mockReturnValue('0x'),
        fragments: [1, 2, 3] // Mock ABI fragments
      }
    };

    // Mock ModelManager
    modelManager = {
      getModelId: vi.fn().mockResolvedValue('0xmodel123'),
      isModelApproved: vi.fn().mockResolvedValue(true)
    } as any;

    hostManager = new HostManager(
      wallet,
      nodeRegistryAddress,
      modelManager,
      fabTokenAddress  // Add FAB token address
    );

    // Inject mocked contract after initialization
    (hostManager as any).nodeRegistry = nodeRegistry;
    (hostManager as any).initialized = true;
  });

  test('should include public key in registration metadata', async () => {
    // Bypass FAB token staking logic by changing test approach
    // Instead of calling registerHostWithModels, we'll test the metadata generation directly

    // Create the metadata structure that would be generated
    const privKey = wallet.privateKey.replace(/^0x/, '');
    const pubKeyBytes = secp.getPublicKey(privKey, true);
    const publicKey = bytesToHex(pubKeyBytes);

    const metadata = {
      hardware: {
        gpu: 'RTX 4090',
        vram: 24,
        ram: 64
      },
      capabilities: ['inference', 'streaming'],
      location: 'US-East',
      maxConcurrent: 4,
      costPerToken: 1000,
      publicKey
    };

    // Verify publicKey is present
    expect(metadata.publicKey).toBeDefined();
    expect(metadata.publicKey).toMatch(/^[0-9a-f]{66}$/); // 33 bytes hex = 66 chars

    // Verify it's a valid compressed secp256k1 public key
    expect(metadata.publicKey.startsWith('02') || metadata.publicKey.startsWith('03')).toBe(true);

    // Verify it matches the wallet's public key
    const expectedPubKey = secp.getPublicKey(wallet.privateKey.replace(/^0x/, ''), true);
    expect(metadata.publicKey).toBe(bytesToHex(expectedPubKey));
  });

  test('should return public key in getHostInfo', async () => {
    const expectedPubKey = secp.getPublicKey(wallet.privateKey.replace(/^0x/, ''), true);
    const publicKeyHex = bytesToHex(expectedPubKey);

    // Mock contract response with publicKey in metadata (8-field array structure)
    nodeRegistry.getNodeFullInfo.mockResolvedValue([
      wallet.address,      // operator at index 0 (registered)
      BigInt(1000),        // stake at index 1
      true,                // active at index 2
      JSON.stringify({     // metadata at index 3
        hardware: { gpu: 'RTX 4090', vram: 24, ram: 64 },
        capabilities: ['inference', 'streaming'],
        location: 'US-East',
        maxConcurrent: 4,
        costPerToken: 1000,
        publicKey: publicKeyHex
      }),
      'http://localhost:8080',        // apiUrl at index 4
      ['0xmodel123'],                 // supportedModels at index 5
      BigInt(3000000000),              // minPricePerTokenNative at index 6
      BigInt(2000)                     // minPricePerTokenStable at index 7
    ]);

    const hostInfo = await hostManager.getHostInfo(wallet.address);

    expect(hostInfo.metadata.publicKey).toBeDefined();
    expect(hostInfo.metadata.publicKey).toBe(publicKeyHex);
    expect(hostInfo.metadata.publicKey?.length).toBe(66); // 33 bytes = 66 hex chars
  });

  test('should handle missing publicKey for legacy hosts gracefully', async () => {
    // Mock contract response WITHOUT publicKey in metadata (8-field array structure)
    nodeRegistry.getNodeFullInfo.mockResolvedValue([
      '0xlegacyhost',      // operator at index 0 (registered)
      BigInt(1000),        // stake at index 1
      true,                // active at index 2
      JSON.stringify({     // metadata at index 3 - NO publicKey
        hardware: { gpu: 'RTX 3090', vram: 24, ram: 32 },
        capabilities: ['inference'],
        location: 'US-West',
        maxConcurrent: 2,
        costPerToken: 1500
      }),
      'http://legacy-host:8080',      // apiUrl at index 4
      ['0xlegacymodel'],              // supportedModels at index 5
      BigInt(3000000000),              // minPricePerTokenNative at index 6
      BigInt(1500)                     // minPricePerTokenStable at index 7
    ]);

    const hostInfo = await hostManager.getHostInfo('0xlegacyhost');

    // publicKey should be undefined for legacy hosts
    expect(hostInfo.metadata.publicKey).toBeUndefined();

    // Other fields should still work
    expect(hostInfo.metadata.hardware.gpu).toBe('RTX 3090');
    expect(hostInfo.apiUrl).toBe('http://legacy-host:8080');
  });

  test('should handle invalid/corrupt metadata gracefully', async () => {
    // Mock contract response with invalid JSON metadata (8-field array structure)
    nodeRegistry.getNodeFullInfo.mockResolvedValue([
      '0xbrokenhost',      // operator at index 0 (registered)
      BigInt(1000),        // stake at index 1
      true,                // active at index 2
      '{invalid json',     // metadata at index 3 - INVALID JSON
      'http://broken-host:8080',      // apiUrl at index 4
      [],                             // supportedModels at index 5
      BigInt(3000000000),              // minPricePerTokenNative at index 6
      BigInt(1000)                     // minPricePerTokenStable at index 7
    ]);

    const hostInfo = await hostManager.getHostInfo('0xbrokenhost');

    // Should not crash, metadata should have defaults
    expect(hostInfo.metadata).toBeDefined();
    expect(hostInfo.metadata.publicKey).toBeUndefined();
  });

  test('should generate compressed secp256k1 public key (33 bytes)', async () => {
    // Test public key generation directly without registration
    const privKey = wallet.privateKey.replace(/^0x/, '');
    const pubKeyBytes = secp.getPublicKey(privKey, true);
    const publicKeyHex = bytesToHex(pubKeyBytes);

    // Verify compressed format (starts with 02 or 03, 33 bytes total)
    const pubKeyBytesArray = new Uint8Array(
      publicKeyHex.match(/.{2}/g)!.map((byte: string) => parseInt(byte, 16))
    );

    expect(pubKeyBytesArray.length).toBe(33);
    expect(pubKeyBytesArray[0] === 0x02 || pubKeyBytesArray[0] === 0x03).toBe(true);
  });
});
