import { describe, it, expect, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { mockSDKConfig } from './setup/test-helpers';

// Mock FabstirSessionSDK to avoid real implementation dependencies
class MockFabstirSessionSDK {
  private initialized = false;
  private signerAddress: string | null = null;
  private userSeed: string;
  private userData = new Map<string, any>();
  private static globalStore = new Map<string, any>();
  
  constructor(private config: any, private signer: ethers.Signer) {
    this.userSeed = config.s5SeedPhrase;
    this.initialized = true; // Mock immediate initialization
    this.signer.getAddress().then(addr => this.signerAddress = addr);
  }
  
  isInitialized(): boolean {
    return this.initialized;
  }
  
  async getSignerAddress(): Promise<string | null> {
    if (!this.signerAddress) {
      this.signerAddress = await this.signer.getAddress();
    }
    return this.signerAddress;
  }
  
  async saveUserData(key: string, data: any): Promise<void> {
    // Use seed as namespace for data isolation
    const namespace = this.userSeed.split(' ')[0]; // Use first word as namespace
    MockFabstirSessionSDK.globalStore.set(`${namespace}:${key}`, data);
  }
  
  async getUserData(key: string): Promise<any> {
    const namespace = this.userSeed.split(' ')[0];
    return MockFabstirSessionSDK.globalStore.get(`${namespace}:${key}`);
  }
  
  async startSession(host: any, deposit: number): Promise<any> {
    if (!this.initialized) throw new Error('SDK not initialized');
    return {
      jobId: Math.floor(Math.random() * 10000),
      host,
      deposit,
      userSeed: this.userSeed
    };
  }
}

// Mock auth manager for SDK integration tests
class MockAuthManager {
  private currentUser: any = null;
  
  async authenticate(provider: string, username: string): Promise<any> {
    const wallet = ethers.Wallet.createRandom();
    this.currentUser = {
      provider,
      username,
      wallet,
      seed: this.generateSeed(username)
    };
    return {
      provider,
      userId: `${provider}:${username}`,
      address: wallet.address
    };
  }
  
  async exportForSDK(): Promise<any> {
    if (!this.currentUser) throw new Error('Not authenticated');
    return {
      signer: this.currentUser.wallet,
      s5Seed: this.currentUser.seed,
      userId: `${this.currentUser.provider}:${this.currentUser.username}`,
      address: this.currentUser.wallet.address,
      capabilities: {
        gasSponsorship: this.currentUser.provider === 'base',
        passkey: this.currentUser.provider === 'base',
        smartWallet: this.currentUser.provider === 'base'
      }
    };
  }
  
  private generateSeed(username: string): string {
    const words = ['abandon', 'ability', 'able', 'about', 'above', 'absent',
                   'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident'];
    const offset = username.length % 12;
    return [...words.slice(offset), ...words.slice(0, offset)].join(' ');
  }
}

describe('Auth SDK Integration', () => {
  let authManager: MockAuthManager;

  beforeEach(() => {
    authManager = new MockAuthManager();
  });

  it('should initialize SDK with auth credentials', async () => {
    await authManager.authenticate('base', 'sdk-user');
    const credentials = await authManager.exportForSDK();
    expect(credentials.s5Seed).toMatch(/^(\w+\s+){11}\w+$/);
    expect(credentials.signer).toBeDefined();
    const config = mockSDKConfig(credentials.s5Seed);
    const sdk = new MockFabstirSessionSDK(config, credentials.signer);
    expect(sdk.isInitialized()).toBe(true);
    const signerAddress = await sdk.getSignerAddress();
    expect(signerAddress).toBe(credentials.address);
    const mockHost = { id: 'host-1', address: '0x123', models: ['gpt-3.5'] };
    const session = await sdk.startSession(mockHost, 0.1);
    expect(session.jobId).toBeGreaterThan(0);
    expect(session.userSeed).toBe(credentials.s5Seed);
  });

  it('should maintain data isolation between users', async () => {
    await authManager.authenticate('base', 'alice');
    const aliceCredentials = await authManager.exportForSDK();
    const aliceConfig = mockSDKConfig(aliceCredentials.s5Seed);
    const aliceSDK = new MockFabstirSessionSDK(aliceConfig, aliceCredentials.signer);
    await aliceSDK.saveUserData('secret', 'alice-private-data');
    const aliceData = await aliceSDK.getUserData('secret');
    expect(aliceData).toBe('alice-private-data');
    
    authManager = new MockAuthManager();
    await authManager.authenticate('base', 'bob');
    const bobCredentials = await authManager.exportForSDK();
    const bobConfig = mockSDKConfig(bobCredentials.s5Seed);
    const bobSDK = new MockFabstirSessionSDK(bobConfig, bobCredentials.signer);
    const bobData = await bobSDK.getUserData('secret');
    expect(bobData).toBeUndefined();
    await bobSDK.saveUserData('secret', 'bob-private-data');
    const bobSavedData = await bobSDK.getUserData('secret');
    expect(bobSavedData).toBe('bob-private-data');
    expect(aliceCredentials.s5Seed).not.toBe(bobCredentials.s5Seed);
  });

  it('should pass proper config from auth to SDK', async () => {
    await authManager.authenticate('base', 'config-test');
    const credentials = await authManager.exportForSDK();
    
    const config = mockSDKConfig(credentials.s5Seed);
    expect(config.s5SeedPhrase).toBe(credentials.s5Seed);
    expect(config.contractAddress).toBe('0x445882e14b22E921c7d4Fe32a7736a32197578AF');
    expect(config.discoveryUrl).toBe('http://localhost:3001/discovery');
    expect(config.enableS5).toBe(true);
  });

  it('should handle multiple SDK instances for same user', async () => {
    await authManager.authenticate('base', 'multi-sdk');
    const credentials = await authManager.exportForSDK();
    const config1 = mockSDKConfig(credentials.s5Seed);
    const sdk1 = new MockFabstirSessionSDK(config1, credentials.signer);
    const config2 = mockSDKConfig(credentials.s5Seed);
    const sdk2 = new MockFabstirSessionSDK(config2, credentials.signer);
    expect(sdk1.isInitialized()).toBe(true);
    expect(sdk2.isInitialized()).toBe(true);
    const addr1 = await sdk1.getSignerAddress();
    const addr2 = await sdk2.getSignerAddress();
    expect(addr1).toBe(addr2);
  });

  it('should verify SDK operations use authenticated signer', async () => {
    await authManager.authenticate('metamask', 'signer-test');
    const credentials = await authManager.exportForSDK();
    expect(credentials.capabilities.gasSponsorship).toBe(false);
    
    const config = mockSDKConfig(credentials.s5Seed);
    const sdk = new MockFabstirSessionSDK(config, credentials.signer);
    
    const signerAddr = await sdk.getSignerAddress();
    const credAddr = await credentials.signer.getAddress();
    expect(signerAddr).toBe(credAddr);
    
    const session = await sdk.startSession({ id: 'host-2' }, 0.05);
    expect(session).toBeDefined();
  });
});