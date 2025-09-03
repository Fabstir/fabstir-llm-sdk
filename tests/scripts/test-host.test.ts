import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHostNode } from '../../scripts/test-host/run-host';
import { ethers } from 'ethers';

describe('Test Host Node - Real Integration', () => {
  let hostNode: TestHostNode;
  let provider: ethers.providers.JsonRpcProvider;
  
  // Load test private key directly from .env.test since dotenv isn't available
  const TEST_HOST_1_PRIVATE_KEY = '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2';
  const TEST_HOST_1_ADDRESS = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
  const RPC_URL_BASE_SEPOLIA = 'https://base-sepolia.g.alchemy.com/v2/demo';
  const CONTRACT_JOB_MARKETPLACE = '0x445882e14b22E921c7d4Fe32a7736a32197578AF';
  
  beforeAll(async () => {
    provider = new ethers.providers.JsonRpcProvider(RPC_URL_BASE_SEPOLIA);
  });

  it('should load configuration', () => {
    const config = require('../../scripts/test-host/host-config.json');
    expect(config.network).toBe('base-sepolia');
    expect(config.models).toContain('llama2-7b');
    expect(config.pricePerToken).toBeDefined();
  });

  it('should initialize host node with private key', () => {
    const config = require('../../scripts/test-host/host-config.json');
    hostNode = new TestHostNode(config, TEST_HOST_1_PRIVATE_KEY);
    expect(hostNode).toBeDefined();
  });

  it('should verify host address matches expected', async () => {
    const expectedAddress = TEST_HOST_1_ADDRESS;
    const actualAddress = await hostNode.getAddress();
    expect(actualAddress.toLowerCase()).toBe(expectedAddress.toLowerCase());
  });

  it.skip('should register on NodeRegistry contract', async () => {
    const txHash = await hostNode.registerOnChain();
    expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    
    // Verify on chain
    const tx = await provider.getTransaction(txHash);
    expect(tx).toBeDefined();
    expect(tx.from.toLowerCase()).toBe(TEST_HOST_1_ADDRESS.toLowerCase());
  }, 60000);

  it.skip('should start P2P listener', async () => {
    await hostNode.start();
    expect(hostNode.isListening()).toBe(true);
  });

  it.skip('should claim a job on-chain', async () => {
    // Note: Requires a real job to exist
    const jobId = 1; 
    const txHash = await hostNode.claimJob(jobId);
    expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    
    // Verify claim transaction
    const tx = await provider.getTransaction(txHash);
    expect(tx.to?.toLowerCase()).toBe(CONTRACT_JOB_MARKETPLACE.toLowerCase());
  }, 60000);

  afterAll(async () => {
    await hostNode?.stop();
  });
});