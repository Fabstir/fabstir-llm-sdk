/**
 * HostManagerMock
 *
 * Mock implementation of IHostManager for UI development
 * Simulates host discovery and management
 */

import type { IHostManager } from '../types';
import type { HostInfo, ModelSpec } from '../types';
import { MockStorage } from '../storage/MockStorage';

export class HostManagerMock implements IHostManager {
  private storage: MockStorage;
  private mockHosts: Map<string, HostInfo>;

  constructor() {
    this.storage = new MockStorage('hosts');
    this.mockHosts = new Map();

    // Initialize with mock hosts
    this.initializeMockHosts();
  }

  private initializeMockHosts(): void {
    const hosts: HostInfo[] = [
      {
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        apiUrl: 'http://localhost:8080',
        stake: BigInt('1000000000000000000'), // 1 ETH
        active: true,
        supportedModels: [
          '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced' // TinyVicuna
        ],
        minPricePerTokenNative: BigInt('2272727273'), // ~0.0025 USDC equivalent in wei
        minPricePerTokenStable: BigInt('2000'), // 0.002 USDC
        metadata: {
          name: 'Primary Test Host',
          description: 'Fast and reliable LLM inference',
          region: 'us-east-1'
        },
        reputation: 95
      },
      {
        address: '0x123d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        apiUrl: 'http://localhost:8081',
        stake: BigInt('500000000000000000'), // 0.5 ETH
        active: true,
        supportedModels: [
          '0x14843424179fbcb9aeb7fd446fa97143300609757bd49ffb3ec7fb2f75aed1ca' // TinyLlama
        ],
        minPricePerTokenNative: BigInt('1818181818'), // ~0.002 USDC equivalent
        minPricePerTokenStable: BigInt('1500'), // 0.0015 USDC
        metadata: {
          name: 'Secondary Test Host',
          description: 'Budget-friendly inference',
          region: 'us-west-2'
        },
        reputation: 88
      }
    ];

    hosts.forEach(host => {
      this.mockHosts.set(host.address, host);
      this.storage.set(host.address, host);
    });
  }

  async registerHostWithModels(request: any): Promise<string> {
    await this.delay(800);
    console.log('[Mock] Registered host with models:', request);
    return '0x' + Math.random().toString(16).substring(2);
  }

  async unregisterHost(): Promise<string> {
    await this.delay(600);
    console.log('[Mock] Unregistered host');
    return '0x' + Math.random().toString(16).substring(2);
  }

  async updateMetadata(metadata: string): Promise<string> {
    await this.delay(400);
    console.log('[Mock] Updated host metadata');
    return '0x' + Math.random().toString(16).substring(2);
  }

  async updateApiUrl(apiUrl: string): Promise<string> {
    await this.delay(400);
    console.log('[Mock] Updated API URL to:', apiUrl);
    return '0x' + Math.random().toString(16).substring(2);
  }

  async addStake(amount: string): Promise<string> {
    await this.delay(800);
    console.log('[Mock] Added stake:', amount);
    return '0x' + Math.random().toString(16).substring(2);
  }

  async removeStake(amount: string): Promise<string> {
    await this.delay(800);
    console.log('[Mock] Removed stake:', amount);
    return '0x' + Math.random().toString(16).substring(2);
  }

  async withdrawStake(amount: string): Promise<string> {
    return this.removeStake(amount);
  }

  async getHostInfo(address: string): Promise<HostInfo> {
    await this.delay(200);

    const host = this.mockHosts.get(address);
    if (!host) {
      throw new Error(`[Mock] Host not found: ${address}`);
    }

    return host;
  }

  async getHostPublicKey(hostAddress: string, hostApiUrl?: string): Promise<string> {
    await this.delay(150);
    // Return a mock compressed public key (66 chars)
    return '0x02' + '1'.repeat(64);
  }

  async getHostStatus(hostAddress: string): Promise<{
    isRegistered: boolean;
    isActive: boolean;
    supportedModels: string[];
    stake: bigint;
    metadata?: any;
    apiUrl?: string;
    minPricePerTokenNative?: bigint;
    minPricePerTokenStable?: bigint;
  }> {
    await this.delay(200);

    const host = this.mockHosts.get(hostAddress);
    if (!host) {
      return {
        isRegistered: false,
        isActive: false,
        supportedModels: [],
        stake: BigInt(0)
      };
    }

    return {
      isRegistered: true,
      isActive: host.active,
      supportedModels: host.supportedModels || [],
      stake: host.stake,
      metadata: host.metadata,
      apiUrl: host.apiUrl,
      minPricePerTokenNative: host.minPricePerTokenNative,
      minPricePerTokenStable: host.minPricePerTokenStable
    };
  }

  async getActiveHosts(): Promise<HostInfo[]> {
    await this.delay(300);

    return Array.from(this.mockHosts.values())
      .filter(host => host.active)
      .sort((a, b) => (b.reputation || 0) - (a.reputation || 0));
  }

  async discoverAllActiveHosts(): Promise<Array<{nodeAddress: string; apiUrl: string}>> {
    await this.delay(400);

    return Array.from(this.mockHosts.values())
      .filter(host => host.active)
      .map(host => ({
        nodeAddress: host.address,
        apiUrl: host.apiUrl
      }));
  }

  async discoverAllActiveHostsWithModels(): Promise<HostInfo[]> {
    return this.getActiveHosts();
  }

  async findHostsByModel(model: string): Promise<HostInfo[]> {
    await this.delay(300);

    return Array.from(this.mockHosts.values())
      .filter(host => host.active && host.supportedModels?.includes(model));
  }

  async findHostsForModel(modelId: string): Promise<HostInfo[]> {
    return this.findHostsByModel(modelId);
  }

  async hostSupportsModel(hostAddress: string, modelId: string): Promise<boolean> {
    await this.delay(150);

    const host = this.mockHosts.get(hostAddress);
    return host?.supportedModels?.includes(modelId) || false;
  }

  async getHostModels(hostAddress: string): Promise<string[]> {
    await this.delay(200);

    const host = this.mockHosts.get(hostAddress);
    return host?.supportedModels || [];
  }

  async updateHostModels(newModels: ModelSpec[]): Promise<string> {
    await this.delay(600);
    console.log('[Mock] Updated host models:', newModels);
    return '0x' + Math.random().toString(16).substring(2);
  }

  async updateSupportedModels(modelIds: string[]): Promise<string> {
    await this.delay(600);
    console.log('[Mock] Updated supported models:', modelIds);
    return '0x' + Math.random().toString(16).substring(2);
  }

  async updatePricingNative(newMinPrice: string): Promise<string> {
    await this.delay(500);
    console.log('[Mock] Updated native pricing:', newMinPrice);
    return '0x' + Math.random().toString(16).substring(2);
  }

  async updatePricingStable(newMinPrice: string): Promise<string> {
    await this.delay(500);
    console.log('[Mock] Updated stable pricing:', newMinPrice);
    return '0x' + Math.random().toString(16).substring(2);
  }

  async updatePricing(newMinPrice: string): Promise<string> {
    return this.updatePricingStable(newMinPrice);
  }

  async getPricing(hostAddress: string): Promise<bigint> {
    await this.delay(150);

    const host = this.mockHosts.get(hostAddress);
    return host?.minPricePerTokenStable || BigInt(0);
  }

  async getHostEarnings(hostAddress: string, tokenAddress: string): Promise<bigint> {
    await this.delay(200);

    // Mock earnings based on address
    const mockEarnings = BigInt(Math.floor(Math.random() * 1000000)); // 0-1 USDC
    console.log(`[Mock] Host earnings for ${hostAddress}:`, mockEarnings.toString());
    return mockEarnings;
  }

  async withdrawEarnings(tokenAddress: string): Promise<string> {
    await this.delay(800);
    console.log('[Mock] Withdrew earnings for token:', tokenAddress);
    return '0x' + Math.random().toString(16).substring(2);
  }

  async setHostStatus(active: boolean): Promise<string> {
    await this.delay(400);
    console.log('[Mock] Set host status:', active);
    return '0x' + Math.random().toString(16).substring(2);
  }

  async getReputation(address: string): Promise<number> {
    await this.delay(150);

    const host = this.mockHosts.get(address);
    return host?.reputation || 0;
  }

  // Helper Methods

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
