// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { ethers } from 'ethers';
import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { kadDHT } from '@libp2p/kad-dht';
import { identify } from '@libp2p/identify';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NodeRegistryABI = JSON.parse(
  readFileSync(path.join(__dirname, '../../docs/compute-contracts-reference/client-abis/NodeRegistryFAB-CLIENT-ABI.json'), 'utf-8')
);
const JobMarketplaceABI = JSON.parse(
  readFileSync(path.join(__dirname, '../../docs/compute-contracts-reference/client-abis/JobMarketplaceFABWithS5-CLIENT-ABI.json'), 'utf-8')
);

export class TestHostNode {
  private signer: ethers.Wallet;
  private provider: ethers.providers.JsonRpcProvider;
  private contracts: { nodeRegistry?: ethers.Contract; jobMarketplace?: ethers.Contract } = {};
  private config: any;
  private p2pNode: any;
  private listening: boolean = false;

  constructor(config: any, privateKey: string) {
    this.config = config;
    const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA || 'https://base-sepolia.g.alchemy.com/v2/demo';
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);
    const nodeRegistryAddress = process.env.CONTRACT_NODE_REGISTRY || '0x87516C13Ea2f99de598665e14cab64E191A0f8c4';
    const jobMarketplaceAddress = process.env.CONTRACT_JOB_MARKETPLACE || '0x445882e14b22E921c7d4Fe32a7736a32197578AF';
    this.contracts.nodeRegistry = new ethers.Contract(nodeRegistryAddress, NodeRegistryABI, this.signer);
    this.contracts.jobMarketplace = new ethers.Contract(jobMarketplaceAddress, JobMarketplaceABI, this.signer);
  }

  async getAddress(): Promise<string> { return this.signer.address; }

  async start(): Promise<void> {
    this.p2pNode = await createLibp2p({
      addresses: { listen: this.config.p2p.listenAddresses },
      transports: [tcp()],
      connectionEncryption: [noise()],
      streamMuxers: [yamux()],
      services: {
        identify: identify(),
        dht: kadDHT({ protocolPrefix: '/fabstir', clientMode: false })
      }
    });
    await this.p2pNode.start();
    this.listening = true;
    console.log(`P2P node started with ID: ${this.p2pNode.peerId.toString()}`);
    for (const addr of this.config.p2p.bootstrapNodes) {
      try {
        await this.p2pNode.dial(addr);
        console.log(`Connected to bootstrap: ${addr}`);
      } catch (err) {
        console.warn(`Failed to connect to ${addr}:`, err);
      }
    }
  }

  async stop(): Promise<void> {
    if (this.p2pNode) { await this.p2pNode.stop(); this.listening = false; console.log('P2P node stopped'); }
  }

  isListening(): boolean { return this.listening; }

  async registerOnChain(): Promise<string> {
    const nodeRegistry = this.contracts.nodeRegistry!;
    const isRegistered = await nodeRegistry.isRegistered(this.signer.address);
    if (isRegistered) {
      console.log('Node already registered');
      return '0x' + '0'.repeat(64);
    }
    const tx = await nodeRegistry.registerNode(
      this.config.models,
      ethers.utils.parseEther(this.config.pricePerToken),
      ethers.utils.parseEther(this.config.stakeAmount || '1.0'),
      { gasLimit: this.config.gasLimit }
    );
    await tx.wait();
    console.log(`Host registered: ${tx.hash}`);
    return tx.hash;
  }

  async listenForJobs(): Promise<void> {
    const jobMarketplace = this.contracts.jobMarketplace!;
    jobMarketplace.on('JobPosted', async (jobId, requester, modelName, maxTokens) => {
      console.log(`New job posted: ${jobId} for model ${modelName}`);
      if (this.config.autoClaim && this.config.models.includes(modelName)) {
        try { await this.claimJob(jobId.toNumber()); } catch (err) { console.error(`Failed to claim job ${jobId}:`, err); }
      }
    });
    console.log('Listening for jobs...');
  }

  async claimJob(jobId: number): Promise<string> {
    const jobMarketplace = this.contracts.jobMarketplace!;
    const tx = await jobMarketplace.claimJob(jobId, { gasLimit: this.config.gasLimit });
    await tx.wait();
    console.log(`Job ${jobId} claimed: ${tx.hash}`);
    return tx.hash;
  }

  async processJob(jobId: number): Promise<string> {
    console.log(`Processing job ${jobId}...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const result = `Processed job ${jobId} with model ${this.config.models[0]}. Result: Success`;
    console.log(`Job ${jobId} processed: ${result}`);
    return result;
  }

  async submitResult(jobId: number, result: string): Promise<string> {
    const jobMarketplace = this.contracts.jobMarketplace!;
    const tx = await jobMarketplace.submitResult(jobId, result, 100, { gasLimit: this.config.gasLimit });
    await tx.wait();
    console.log(`Result submitted for job ${jobId}: ${tx.hash}`);
    return tx.hash;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = JSON.parse(readFileSync(path.join(__dirname, 'host-config.json'), 'utf-8'));
  const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY || '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2';
  const hostNode = new TestHostNode(config, privateKey);
  (async () => {
    try {
      console.log('Starting Test Host Node...');
      const address = await hostNode.getAddress();
      console.log(`Host address: ${address}`);
      console.log('Host node initializing...');
      // Uncomment below to enable full functionality:
      // await hostNode.start();  // Start P2P listener
      // await hostNode.registerOnChain();  // Register on blockchain
      // await hostNode.listenForJobs();  // Listen for job events
      process.on('SIGINT', async () => { console.log('\nShutting down...'); await hostNode.stop(); process.exit(0); });
    } catch (err) { console.error('Error:', err); process.exit(1); }
  })();
}