import { ethers } from 'ethers';

export interface AuthResult {
  signer: ethers.Signer;
  userAddress: string;
  s5Seed: string;
  network?: { chainId: number; name: string };
}

export interface AuthOptions {
  privateKey?: string;
  rpcUrl?: string;
}

export default class AuthManager {
  static readonly SEED_MESSAGE = 'Generate S5 seed for Fabstir LLM';
  static readonly BASE_SEPOLIA_CHAIN_ID = 84532;
  
  private signer?: ethers.Signer;
  private provider?: ethers.providers.Provider;
  private s5Seed?: string;
  private userAddress?: string;

  constructor() {}

  async authenticate(
    provider: 'base' | 'metamask' | 'private-key',
    options?: AuthOptions
  ): Promise<AuthResult> {
    switch (provider) {
      case 'private-key':
        return this.authenticateWithPrivateKey(options);
      case 'base':
        return this.authenticateWithBase(options);
      case 'metamask':
        return this.authenticateWithMetaMask();
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  getSigner(): ethers.Signer {
    if (!this.signer) throw new Error('Not authenticated');
    return this.signer;
  }

  getS5Seed(): string {
    if (!this.s5Seed) throw new Error('Not authenticated');
    return this.s5Seed;
  }

  getUserAddress(): string {
    if (!this.userAddress) throw new Error('Not authenticated');
    return this.userAddress;
  }

  isAuthenticated(): boolean {
    return !!this.signer;
  }

  private async authenticateWithPrivateKey(options?: AuthOptions): Promise<AuthResult> {
    if (!options?.privateKey) throw new Error('Private key required');
    if (!options?.rpcUrl) throw new Error('RPC URL required');

    this.provider = new ethers.providers.JsonRpcProvider(
      options.rpcUrl,
      { chainId: AuthManager.BASE_SEPOLIA_CHAIN_ID, name: 'base-sepolia' }
    );
    
    this.signer = new ethers.Wallet(options.privateKey, this.provider);
    this.userAddress = await this.signer.getAddress();
    this.s5Seed = await this.generateS5Seed(this.signer);

    return {
      signer: this.signer,
      userAddress: this.userAddress,
      s5Seed: this.s5Seed,
      network: { chainId: AuthManager.BASE_SEPOLIA_CHAIN_ID, name: 'base-sepolia' }
    };
  }

  private async authenticateWithBase(options?: AuthOptions): Promise<AuthResult> {
    if (!options?.rpcUrl) throw new Error('RPC URL required');

    this.provider = new ethers.providers.JsonRpcProvider(
      options.rpcUrl,
      { chainId: AuthManager.BASE_SEPOLIA_CHAIN_ID, name: 'base-sepolia' }
    );

    // For base provider, generate a random wallet (for testing)
    // In production, this would connect to Base wallet
    const randomWallet = ethers.Wallet.createRandom();
    this.signer = randomWallet.connect(this.provider);
    this.userAddress = await this.signer.getAddress();
    this.s5Seed = await this.generateS5Seed(this.signer);

    return {
      signer: this.signer,
      userAddress: this.userAddress,
      s5Seed: this.s5Seed,
      network: { chainId: AuthManager.BASE_SEPOLIA_CHAIN_ID, name: 'base-sepolia' }
    };
  }

  private async authenticateWithMetaMask(): Promise<AuthResult> {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('MetaMask not available');
    }

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    
    this.provider = provider;
    this.signer = provider.getSigner();
    this.userAddress = await this.signer.getAddress();
    this.s5Seed = await this.generateS5Seed(this.signer);

    const network = await provider.getNetwork();
    
    return {
      signer: this.signer,
      userAddress: this.userAddress,
      s5Seed: this.s5Seed,
      network: { chainId: network.chainId, name: network.name }
    };
  }

  private async generateS5Seed(signer: ethers.Signer): Promise<string> {
    const signature = await signer.signMessage(AuthManager.SEED_MESSAGE);
    return this.generateSeedFromSignature(signature);
  }

  private generateSeedFromSignature(signature: string): string {
    // Generate deterministic seed phrase from signature
    const wordList = [
      'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
      'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
      'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual'
    ];
    const words = [];
    const bytes = ethers.utils.arrayify(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(signature)));
    for (let i = 0; i < 12; i++) {
      const index = bytes[i] % wordList.length;
      words.push(wordList[index]);
    }
    return words.join(' ');
  }
}