import { ethers } from 'ethers';
export interface TestAccount {
  address: string;
  privateKey: string;
  signer: ethers.Signer;
  s5Seed: string;
  userId: string;
  role: 'user' | 'host' | 'treasury';
  capabilities: { gasSponsorship: boolean; passkey: boolean; smartWallet: boolean; };
}

class MockAuthManager {
  private provider: string;
  private username?: string;
  async authenticate(provider: string, username?: string) {
    this.provider = provider; this.username = username;
    return { provider, userId: `${provider}:${username || '0x' + '1'.repeat(40)}` };
  }
  async exportForSDK() {
    const wallet = ethers.Wallet.createRandom();
    // Add mock provider for testing
    const mockProvider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
    wallet._provider = mockProvider;
    const words = ['abandon', 'ability', 'able', 'about', 'above', 'absent', 
                   'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident'];
    const seed = words.sort(() => Math.random() - 0.5).slice(0, 12).join(' ');
    return { signer: wallet.connect(mockProvider), s5Seed: seed,
      userId: `${this.provider}:${this.username || wallet.address.toLowerCase()}`,
      capabilities: { gasSponsorship: this.provider === 'base',
        passkey: this.provider === 'base', smartWallet: this.provider === 'base' }
    };
  }
}

export async function getTestUser(): Promise<TestAccount> {
  const authManager = new MockAuthManager();
  await authManager.authenticate('base', `alice${Date.now()}`);
  const creds = await authManager.exportForSDK();
  return {
    address: await creds.signer.getAddress(),
    privateKey: (creds.signer as ethers.Wallet).privateKey,
    signer: creds.signer,
    s5Seed: creds.s5Seed,
    userId: creds.userId,
    role: 'user',
    capabilities: creds.capabilities
  };
}

export async function getTestHost(): Promise<TestAccount> {
  const authManager = new MockAuthManager();
  await authManager.authenticate('metamask');
  const creds = await authManager.exportForSDK();
  return { address: await creds.signer.getAddress(), privateKey: (creds.signer as ethers.Wallet).privateKey,
    signer: creds.signer, s5Seed: creds.s5Seed, userId: creds.userId, role: 'host', capabilities: creds.capabilities };
}

export function getTreasury(): TestAccount {
  const wallet = new ethers.Wallet('0x' + '2'.repeat(64));
  return { address: wallet.address, privateKey: wallet.privateKey, signer: wallet, s5Seed: '', 
    userId: 'treasury:main', role: 'treasury', capabilities: { gasSponsorship: false, passkey: false, smartWallet: false } };
}

export async function fundAccount(account: TestAccount, amount: bigint): Promise<void> {}