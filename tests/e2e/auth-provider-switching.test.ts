import { describe, it, expect, beforeEach } from 'vitest';
import { ethers } from 'ethers';

// Mock auth implementation for provider switching tests
class MockAuthManagerWithSwitching {
  private providers = new Map<string, any>();
  private currentProvider: string | null = null;
  private currentUser: string | null = null;
  private sessions = new Map<string, any>();
  
  registerProvider(provider: any): void {
    this.providers.set(provider.name, provider);
  }
  
  async authenticate(providerName: string, username?: string): Promise<any> {
    if (!this.providers.has(providerName)) throw new Error(`Provider ${providerName} not found`);
    
    const sessionKey = `${providerName}:${username || 'default'}`;
    
    if (this.sessions.has(sessionKey)) {
      // Restore existing session
      const session = this.sessions.get(sessionKey);
      this.currentProvider = providerName;
      this.currentUser = username || null;
      return session;
    }
    
    // Create new session
    const wallet = ethers.Wallet.createRandom();
    const session = {
      provider: providerName,
      userId: username ? `${providerName}:${username}` : `${providerName}:${wallet.address.toLowerCase()}`,
      address: wallet.address,
      signer: wallet,
      seed: this.generateSeed(providerName, username)
    };
    
    this.sessions.set(sessionKey, session);
    this.currentProvider = providerName;
    this.currentUser = username || null;
    return session;
  }
  
  async exportForSDK(): Promise<any> {
    const sessionKey = `${this.currentProvider}:${this.currentUser || 'default'}`;
    const session = this.sessions.get(sessionKey);
    if (!session) throw new Error('Not authenticated');
    
    return {
      signer: session.signer,
      s5Seed: session.seed,
      userId: session.userId,
      address: session.address,
      capabilities: {
        gasSponsorship: session.provider === 'base',
        passkey: session.provider === 'base',
        smartWallet: session.provider === 'base'
      }
    };
  }
  
  private generateSeed(provider: string, identifier?: string): string {
    const baseWords = ['abandon', 'ability', 'able', 'about', 'above', 'absent',
                       'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident'];
    const providerOffset = provider === 'base' ? 0 : 6;
    const userOffset = identifier ? identifier.length % 6 : 0;
    const totalOffset = (providerOffset + userOffset) % 12;
    return [...baseWords.slice(totalOffset), ...baseWords.slice(0, totalOffset)].join(' ');
  }
  
  logout(): void {
    this.currentProvider = null;
    this.currentUser = null;
  }
  
  getCurrentSession(): any {
    if (!this.currentProvider) return null;
    const sessionKey = `${this.currentProvider}:${this.currentUser || 'default'}`;
    return this.sessions.get(sessionKey);
  }
  
  isAuthenticated(): boolean {
    return this.currentProvider !== null;
  }
}

describe('Provider Switching', () => {
  let authManager: MockAuthManagerWithSwitching;

  beforeEach(() => {
    authManager = new MockAuthManagerWithSwitching();
    authManager.registerProvider({ name: 'base' });
    authManager.registerProvider({ name: 'metamask' });
  });

  it('should switch between providers', async () => {
    // Start with Base
    await authManager.authenticate('base', 'switcher');
    const baseCreds = await authManager.exportForSDK();
    const baseSeed = baseCreds.s5Seed;
    expect(baseCreds.capabilities.gasSponsorship).toBe(true);
    
    // Switch to MetaMask
    await authManager.authenticate('metamask', 'switcher');
    const metamaskCreds = await authManager.exportForSDK();
    const metamaskSeed = metamaskCreds.s5Seed;
    expect(metamaskCreds.capabilities.gasSponsorship).toBe(false);
    expect(metamaskSeed).not.toBe(baseSeed);
    
    // Switch back to Base
    await authManager.authenticate('base', 'switcher');
    const baseCreds2 = await authManager.exportForSDK();
    expect(baseCreds2.s5Seed).toBe(baseSeed); // Original seed restored
  });

  it('should clear session on logout', async () => {
    await authManager.authenticate('base', 'temp-user');
    expect(authManager.isAuthenticated()).toBe(true);
    
    const session = authManager.getCurrentSession();
    expect(session).toBeDefined();
    expect(session.userId).toBe('base:temp-user');
    
    authManager.logout();
    expect(authManager.isAuthenticated()).toBe(false);
    expect(authManager.getCurrentSession()).toBeNull();
  });

  it('should maintain separate sessions per provider', async () => {
    // Create Base session
    await authManager.authenticate('base', 'multi-user');
    const baseSession = await authManager.exportForSDK();
    
    // Create MetaMask session
    await authManager.authenticate('metamask', 'multi-user');
    const metamaskSession = await authManager.exportForSDK();
    
    // Verify different seeds and capabilities
    expect(baseSession.s5Seed).not.toBe(metamaskSession.s5Seed);
    expect(baseSession.capabilities.gasSponsorship).toBe(true);
    expect(metamaskSession.capabilities.gasSponsorship).toBe(false);
  });

  it('should not allow multiple concurrent sessions in same provider', async () => {
    await authManager.authenticate('base', 'user1');
    const user1Session = authManager.getCurrentSession();
    
    await authManager.authenticate('base', 'user2');
    const user2Session = authManager.getCurrentSession();
    
    // Current session should be user2, user1 is stored but not active
    expect(user2Session.userId).toBe('base:user2');
    expect(authManager.isAuthenticated()).toBe(true);
  });

  it('should restore provider-specific features after switch', async () => {
    // Base with features
    await authManager.authenticate('base', 'feature-test');
    const baseCreds = await authManager.exportForSDK();
    expect(baseCreds.capabilities.passkey).toBe(true);
    expect(baseCreds.capabilities.smartWallet).toBe(true);
    
    // MetaMask without features
    await authManager.authenticate('metamask', 'feature-test');
    const mmCreds = await authManager.exportForSDK();
    expect(mmCreds.capabilities.passkey).toBe(false);
    expect(mmCreds.capabilities.smartWallet).toBe(false);
    
    // Back to Base - features restored
    await authManager.authenticate('base', 'feature-test');
    const baseCreds2 = await authManager.exportForSDK();
    expect(baseCreds2.capabilities.passkey).toBe(true);
    expect(baseCreds2.capabilities.smartWallet).toBe(true);
  });
});