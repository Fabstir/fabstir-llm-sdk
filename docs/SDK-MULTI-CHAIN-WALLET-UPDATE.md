# SDK Multi-Chain/Multi-Wallet Update Specification

## Overview

Update the Fabstir SDK (`@fabstir/sdk-core`) to support multiple blockchain networks and wallet providers while maintaining a consistent API. The SDK must abstract wallet and chain differences, allowing the UI to work seamlessly across different configurations.

## Supported Chains and Native Tokens

| Chain | Network Type | Native Token | Symbol | Notes |
|-------|--------------|--------------|--------|-------|
| Base Sepolia (84532) | Ethereum L2 Testnet | ETH | ETH | Ethereum's native token |
| opBNB Testnet (5611) | BNB Chain L2 Testnet | BNB | BNB | BNB Chain's native token |

**Important**: Each chain has its own native token. The SDK uses chain-agnostic function names (e.g., `depositNative()`) that work with the appropriate native token for each chain.

## Current SDK Architecture

### What We Have
- **Single Chain**: Base Sepolia hardcoded
- **Direct Signer**: Accepts ethers.Signer for authentication
- **Fixed Contracts**: All 7 contract addresses required on initialization
- **USDC/ETH Support**: Payment methods already abstracted
- **Manager Pattern**: PaymentManager, SessionManager, etc. handle operations

### What Needs Changing
- **Multi-Chain Support**: Base Sepolia (ETH) + opBNB (BNB) and more
- **Wallet Abstraction**: Support various wallet providers transparently
- **Dynamic Contracts**: Different addresses per chain
- **Deposit Pattern**: Support wallet-agnostic deposit model with chain-specific native tokens
- **Chain Detection**: Automatic or manual chain selection

## Architecture Design

### 1. Wallet Provider Interface

Create an abstraction layer that all wallet providers must implement:

```typescript
// packages/sdk-core/src/interfaces/IWalletProvider.ts
export interface IWalletProvider {
  // Core identification
  readonly type: WalletType;
  readonly chainId: number;

  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Account management
  getAddress(): Promise<string>;
  getDepositAccount(): Promise<string>; // For wallet-agnostic deposits

  // Transaction handling
  sendTransaction(tx: TransactionRequest): Promise<TransactionResponse>;
  signMessage(message: string): Promise<string>;

  // Balance queries
  getBalance(tokenAddress?: string): Promise<bigint>; // No address = native token (ETH/BNB)

  // Chain management
  switchChain(chainId: number): Promise<void>;
  getCurrentChain(): Promise<number>;

  // Capabilities
  readonly capabilities: WalletCapabilities;
}

export enum WalletType {
  EOA = 'eoa',                    // MetaMask, Rainbow, etc via RainbowKit
  BASE_ACCOUNT_KIT = 'base_account_kit',  // Base smart wallet
  PARTICLE_BICONOMY = 'particle_biconomy'  // Future support
}

export interface WalletCapabilities {
  gasless: boolean;
  batchTransactions: boolean;
  sessionKeys: boolean;
  autoSpend: boolean;
}
```

### 2. Chain Configuration Registry

```typescript
// packages/sdk-core/src/config/chains.ts
export interface ChainConfig {
  chainId: number;
  chainIdHex: string;
  name: string;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  contracts: {
    jobMarketplace: string;
    nodeRegistry: string;
    proofSystem: string;
    hostEarnings: string;
    usdcToken: string;
    fabToken: string;
    modelRegistry: string;
  };
  supportedTokens: {
    [key: string]: {
      address: string;
      decimals: number;
      symbol: string;
    };
  };
  blockExplorer?: string;
}

export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  // Base Sepolia
  84532: {
    chainId: 84532,
    chainIdHex: '0x14a34',
    name: 'Base Sepolia',
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA || '',
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18
    },
    contracts: {
      jobMarketplace: '0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944',
      nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
      proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
      hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
      usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
      modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E'
    },
    supportedTokens: {
      'USDC': {
        address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        decimals: 6,
        symbol: 'USDC'
      }
    },
    blockExplorer: 'https://sepolia.basescan.org'
  },

  // opBNB Testnet
  5611: {
    chainId: 5611,
    chainIdHex: '0x15eb',
    name: 'opBNB Testnet',
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_OPBNB_TESTNET || '',
    nativeCurrency: {
      name: 'BNB',
      symbol: 'BNB',
      decimals: 18
    },
    contracts: {
      // To be deployed
      jobMarketplace: '',
      nodeRegistry: '',
      proofSystem: '',
      hostEarnings: '',
      usdcToken: '',
      fabToken: '',
      modelRegistry: ''
    },
    supportedTokens: {
      'USDC': {
        address: '', // To be configured
        decimals: 6,
        symbol: 'USDC'
      },
      // Note: BUSD has been deprecated, using USDC as standard stablecoin
    },
    blockExplorer: 'https://testnet.bscscan.com'
  }
};
```

### 3. Wallet Provider Implementations

#### RainbowKit Provider (EOA Wallets)

```typescript
// packages/sdk-core/src/providers/RainbowKitProvider.ts
import { IWalletProvider, WalletType, WalletCapabilities } from '../interfaces/IWalletProvider';
import { ethers } from 'ethers';

export class RainbowKitProvider implements IWalletProvider {
  readonly type = WalletType.EOA;
  readonly capabilities: WalletCapabilities = {
    gasless: false,
    batchTransactions: false,
    sessionKeys: false,
    autoSpend: false
  };

  private provider: ethers.BrowserProvider;
  private signer?: ethers.Signer;
  public chainId: number;

  constructor(provider: any, chainId: number) {
    this.provider = new ethers.BrowserProvider(provider);
    this.chainId = chainId;
  }

  async connect(): Promise<void> {
    const accounts = await this.provider.send('eth_requestAccounts', []);
    if (!accounts.length) throw new Error('No accounts available');
    this.signer = await this.provider.getSigner();
  }

  async getAddress(): Promise<string> {
    if (!this.signer) throw new Error('Not connected');
    return await this.signer.getAddress();
  }

  async getDepositAccount(): Promise<string> {
    // For EOA, deposit account is the same as user account
    return await this.getAddress();
  }

  async sendTransaction(tx: any): Promise<any> {
    if (!this.signer) throw new Error('Not connected');
    return await this.signer.sendTransaction(tx);
  }

  async signMessage(message: string): Promise<string> {
    if (!this.signer) throw new Error('Not connected');
    return await this.signer.signMessage(message);
  }

  async getBalance(tokenAddress?: string): Promise<bigint> {
    const address = await this.getAddress();

    if (!tokenAddress) {
      // Native balance (ETH on Base, BNB on opBNB)
      return await this.provider.getBalance(address);
    }

    // ERC20 balance
    const contract = new ethers.Contract(
      tokenAddress,
      ['function balanceOf(address) view returns (uint256)'],
      this.provider
    );
    return await contract.balanceOf(address);
  }

  async switchChain(chainId: number): Promise<void> {
    await this.provider.send('wallet_switchEthereumChain', [
      { chainId: `0x${chainId.toString(16)}` }
    ]);
    this.chainId = chainId;
  }

  async getCurrentChain(): Promise<number> {
    const network = await this.provider.getNetwork();
    return Number(network.chainId);
  }

  isConnected(): boolean {
    return !!this.signer;
  }

  async disconnect(): Promise<void> {
    this.signer = undefined;
  }
}
```

#### Base Account Kit Provider

```typescript
// packages/sdk-core/src/providers/BaseAccountKitProvider.ts
export class BaseAccountKitProvider implements IWalletProvider {
  readonly type = WalletType.BASE_ACCOUNT_KIT;
  readonly capabilities: WalletCapabilities = {
    gasless: true,
    batchTransactions: true,
    sessionKeys: true,
    autoSpend: true
  };

  private baseAccountSDK: any;
  private provider: any;
  private primaryAccount?: string;
  private subAccount?: string;
  public chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
  }

  async connect(): Promise<void> {
    const { createBaseAccountSDK } = await import('@base-org/account');

    this.baseAccountSDK = createBaseAccountSDK({
      appName: 'Fabstir LLM Marketplace',
      appChainIds: [this.chainId],
      subAccounts: {
        unstable_enableAutoSpendPermissions: true
      }
    });

    this.provider = this.baseAccountSDK.getProvider();

    const accounts = await this.provider.request({
      method: 'eth_requestAccounts',
      params: []
    });

    this.primaryAccount = accounts[0];

    // Get or create sub-account
    await this.ensureSubAccount();
  }

  private async ensureSubAccount(): Promise<void> {
    try {
      const result = await this.provider.request({
        method: 'wallet_getSubAccounts',
        params: [{
          account: this.primaryAccount,
          domain: window.location.origin
        }]
      });

      if (result?.subAccounts?.length) {
        this.subAccount = result.subAccounts[0].address;
        return;
      }
    } catch {}

    // Create sub-account with spend permissions
    const chainConfig = CHAIN_CONFIGS[this.chainId];
    const createResult = await this.provider.request({
      method: 'wallet_addSubAccount',
      params: [{
        account: this.primaryAccount,
        spender: {
          address: chainConfig.contracts.jobMarketplace,
          token: chainConfig.contracts.usdcToken,
          allowance: ethers.parseUnits('1000', 6) // 1000 USDC allowance
        }
      }]
    });

    this.subAccount = createResult.address;
  }

  async getAddress(): Promise<string> {
    // Return primary account for compatibility
    if (!this.primaryAccount) throw new Error('Not connected');
    return this.primaryAccount;
  }

  async getDepositAccount(): Promise<string> {
    // For Base Account Kit, deposits go to the smart account
    if (!this.primaryAccount) throw new Error('Not connected');
    return this.primaryAccount; // Smart account holds funds
  }

  async sendTransaction(tx: any): Promise<any> {
    if (!this.subAccount) throw new Error('Not connected');

    const calls = [{
      to: tx.to as `0x${string}`,
      data: tx.data as `0x${string}`,
      value: tx.value ? `0x${BigInt(tx.value).toString(16)}` : undefined
    }];

    const response = await this.provider.request({
      method: 'wallet_sendCalls',
      params: [{
        version: '2.0.0',
        chainId: `0x${this.chainId.toString(16)}`,
        from: this.subAccount as `0x${string}`,
        calls: calls,
        capabilities: {
          atomic: { required: true }
        }
      }]
    });

    // Wait for confirmation
    const bundleId = typeof response === 'string' ? response : response.id;

    // Poll for transaction hash
    for (let i = 0; i < 30; i++) {
      const status = await this.provider.request({
        method: 'wallet_getCallsStatus',
        params: [bundleId]
      });

      if (status.receipts?.[0]?.transactionHash) {
        const ethersProvider = new ethers.BrowserProvider(this.provider);
        return await ethersProvider.getTransaction(status.receipts[0].transactionHash);
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    throw new Error('Transaction failed to confirm');
  }

  // ... implement remaining methods
}
```

### 4. SDK Core Updates

```typescript
// packages/sdk-core/src/FabstirSDKCore.ts
export interface FabstirSDKCoreConfig {
  chainId?: number; // Optional, will auto-detect if not provided
  walletProvider?: IWalletProvider; // Optional, will be set on authenticate
  rpcUrl?: string; // Optional, will use chain config default
  // Remove hardcoded contractAddresses - use chain config instead
}

export class FabstirSDKCore {
  private walletProvider?: IWalletProvider;
  private chainConfig?: ChainConfig;
  private managers: Map<string, any> = new Map();

  constructor(config?: FabstirSDKCoreConfig) {
    if (config?.chainId) {
      this.setChain(config.chainId);
    }
  }

  private setChain(chainId: number): void {
    const config = CHAIN_CONFIGS[chainId];
    if (!config) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }
    this.chainConfig = config;
    this.reinitializeManagers();
  }

  async authenticate(walletProviderOrSigner: IWalletProvider | ethers.Signer): Promise<void> {
    if ('sendTransaction' in walletProviderOrSigner && 'getAddress' in walletProviderOrSigner) {
      // It's a signer, wrap it in EOA provider for backward compatibility
      const provider = (walletProviderOrSigner as any).provider;
      const network = await provider.getNetwork();

      this.walletProvider = new RainbowKitProvider(
        provider._internal || provider,
        Number(network.chainId)
      );
      await this.walletProvider.connect();
    } else {
      // It's already a wallet provider
      this.walletProvider = walletProviderOrSigner as IWalletProvider;
    }

    // Update chain config based on wallet's chain
    const chainId = await this.walletProvider.getCurrentChain();
    this.setChain(chainId);
  }

  private reinitializeManagers(): void {
    if (!this.chainConfig || !this.walletProvider) return;

    // Create provider-aware managers
    const signer = this.createSigner();

    // Payment Manager with deposit account awareness
    this.managers.set('payment', new PaymentManagerV2({
      walletProvider: this.walletProvider,
      chainConfig: this.chainConfig,
      signer
    }));

    // Session Manager
    this.managers.set('session', new SessionManagerV2({
      walletProvider: this.walletProvider,
      chainConfig: this.chainConfig,
      signer
    }));

    // ... initialize other managers
  }

  private createSigner(): ethers.Signer {
    // Create a custom signer that uses the wallet provider
    return {
      provider: new ethers.JsonRpcProvider(this.chainConfig!.rpcUrl),

      async getAddress(): Promise<string> {
        return await this.walletProvider!.getAddress();
      },

      async signMessage(message: string): Promise<string> {
        return await this.walletProvider!.signMessage(message);
      },

      async sendTransaction(tx: any): Promise<any> {
        return await this.walletProvider!.sendTransaction(tx);
      }
    } as any;
  }

  getPaymentManager(): PaymentManagerV2 {
    const manager = this.managers.get('payment');
    if (!manager) throw new Error('Not authenticated');
    return manager;
  }

  async switchChain(chainId: number): Promise<void> {
    if (!this.walletProvider) throw new Error('Not authenticated');

    await this.walletProvider.switchChain(chainId);
    this.setChain(chainId);
  }

  getCurrentChain(): ChainConfig | undefined {
    return this.chainConfig;
  }

  getDepositAccount(): Promise<string> {
    if (!this.walletProvider) throw new Error('Not authenticated');
    return this.walletProvider.getDepositAccount();
  }
}
```

### 5. Updated Payment Manager

```typescript
// packages/sdk-core/src/managers/PaymentManagerV2.ts
export class PaymentManagerV2 {
  // Note: Functions are chain-agnostic
  // depositNative() deposits ETH on Base Sepolia, BNB on opBNB
  constructor(
    private config: {
      walletProvider: IWalletProvider;
      chainConfig: ChainConfig;
      signer: ethers.Signer;
    }
  ) {}

  async depositNative(amount: string): Promise<TransactionResponse> {
    // Deposits ETH on Base, BNB on opBNB, etc.
    const jobMarketplace = new ethers.Contract(
      this.config.chainConfig.contracts.jobMarketplace,
      ['function depositNative() payable'],
      this.config.signer
    );

    return await jobMarketplace.depositNative({
      value: ethers.parseEther(amount)
    });
  }

  async depositToken(tokenSymbol: string, amount: string): Promise<TransactionResponse> {
    const tokenConfig = this.config.chainConfig.supportedTokens[tokenSymbol];
    if (!tokenConfig) throw new Error(`Token ${tokenSymbol} not supported on this chain`);

    // First approve
    const token = new ethers.Contract(
      tokenConfig.address,
      ['function approve(address,uint256)'],
      this.config.signer
    );

    await token.approve(
      this.config.chainConfig.contracts.jobMarketplace,
      ethers.parseUnits(amount, tokenConfig.decimals)
    );

    // Then deposit
    const jobMarketplace = new ethers.Contract(
      this.config.chainConfig.contracts.jobMarketplace,
      ['function depositToken(address,uint256)'],
      this.config.signer
    );

    return await jobMarketplace.depositToken(
      tokenConfig.address,
      ethers.parseUnits(amount, tokenConfig.decimals)
    );
  }

  async getDepositBalance(tokenSymbol?: string): Promise<string> {
    const depositAccount = await this.config.walletProvider.getDepositAccount();

    const jobMarketplace = new ethers.Contract(
      this.config.chainConfig.contracts.jobMarketplace,
      ['function getDepositBalance(address,address) view returns (uint256)'],
      this.config.signer.provider
    );

    const tokenAddress = tokenSymbol
      ? this.config.chainConfig.supportedTokens[tokenSymbol]?.address || ethers.ZeroAddress
      : ethers.ZeroAddress; // address(0) for native token (ETH/BNB)

    const balance = await jobMarketplace.getDepositBalance(depositAccount, tokenAddress);

    const decimals = tokenSymbol
      ? this.config.chainConfig.supportedTokens[tokenSymbol]?.decimals || 18
      : 18; // Native tokens use 18 decimals

    return ethers.formatUnits(balance, decimals);
  }

  async createSessionFromDeposit(
    host: string,
    config: SessionConfig
  ): Promise<{ sessionId: bigint; txHash: string }> {
    const jobMarketplace = new ethers.Contract(
      this.config.chainConfig.contracts.jobMarketplace,
      ['function createSessionFromDeposit(address,address,uint256,uint256,uint256,uint256)'],
      this.config.signer
    );

    const tx = await jobMarketplace.createSessionFromDeposit(
      host,
      config.paymentToken || ethers.ZeroAddress,
      ethers.parseUnits(config.depositAmount, 6), // Assuming USDC
      config.pricePerToken,
      config.duration,
      config.proofInterval
    );

    const receipt = await tx.wait();

    // Extract sessionId from events
    const event = receipt.logs.find((log: any) =>
      log.topics[0] === ethers.id('SessionCreatedByDepositor(uint256,address,address,uint256)')
    );

    const sessionId = event ? BigInt(event.topics[1]) : 0n;

    return { sessionId, txHash: tx.hash };
  }
}
```

### 6. Session Manager with WebSocket Integration

**CRITICAL**: The SDK connects directly to fabstir-llm-node via WebSocket. Session ending is **gasless for users** because the node automatically handles payment settlement.

```typescript
// packages/sdk-core/src/managers/SessionManagerV2.ts
export class SessionManagerV2 {
  private ws?: WebSocket;
  private sessionId?: bigint;
  private nodeUrl: string;

  constructor(
    private config: {
      walletProvider: IWalletProvider;
      chainConfig: ChainConfig;
      signer: ethers.Signer;
    }
  ) {}

  /**
   * Start a new session with a host node
   * @param host Host address from blockchain
   * @param nodeUrl WebSocket URL of host's node (e.g., ws://localhost:8080/v1/ws)
   * @param sessionId Session ID from createSessionFromDeposit
   */
  async connectToHost(host: string, nodeUrl: string, sessionId: bigint): Promise<void> {
    this.nodeUrl = nodeUrl;
    this.sessionId = sessionId;

    // Connect to host's fabstir-llm-node via WebSocket
    this.ws = new WebSocket(nodeUrl);

    this.ws.on('open', () => {
      // Initialize session with the node
      this.ws.send(JSON.stringify({
        type: 'session_init',
        job_id: sessionId.toString(),
        // Node v5+ handles payment tracking automatically
      }));
    });

    this.ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      // Handle streaming responses, errors, etc.
      this.handleNodeMessage(message);
    });

    this.ws.on('close', () => {
      console.log('WebSocket disconnected - node will automatically settle payment');
      // IMPORTANT: Node v5+ automatically calls completeSessionJob() on disconnect
      // This triggers payment settlement WITHOUT user paying gas
    });
  }

  /**
   * Send a prompt to the host node
   */
  async sendPrompt(prompt: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to host');
    }

    this.ws.send(JSON.stringify({
      type: 'prompt',
      content: prompt,
      request_stream: true
    }));
  }

  /**
   * End the session - GASLESS for users!
   *
   * IMPORTANT: This function just closes the WebSocket connection.
   * The node (v5+) automatically calls completeSessionJob() on the blockchain
   * when it detects the disconnect. The HOST pays the gas for this transaction,
   * not the user. This makes session ending completely gasless for users.
   *
   * DO NOT call completeSessionJob() directly from the SDK for user-initiated
   * session endings. Let the node handle it.
   */
  async endSession(): Promise<void> {
    if (!this.ws) {
      console.warn('No active WebSocket connection');
      return;
    }

    // Just close the WebSocket - node handles the rest
    this.ws.close(1000, 'User ended session');

    console.log('Session ended - payment settlement will be handled by host node');
    console.log('This is GASLESS for the user - host pays gas to get their payment');

    // Clear local state
    this.ws = undefined;
    this.sessionId = undefined;
  }

  /**
   * DEPRECATED - DO NOT USE for normal session endings
   *
   * This function calls completeSessionJob() directly on the blockchain,
   * which requires the USER to pay gas. Only use this in emergency scenarios
   * where the host node is unresponsive and automatic settlement failed.
   *
   * For normal "End Session" button clicks, use endSession() instead.
   */
  async emergencyCompleteSession(): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    console.warn('⚠️ WARNING: User will pay gas for this transaction!');
    console.warn('Only use this if host node failed to auto-settle');

    const jobMarketplace = new ethers.Contract(
      this.config.chainConfig.contracts.jobMarketplace,
      ['function completeSessionJob(uint256)'],
      this.config.signer
    );

    // User pays gas for this :(
    const tx = await jobMarketplace.completeSessionJob(this.sessionId);
    await tx.wait();

    console.log('Emergency session completion - user paid gas');
  }

  /**
   * Check if session is active
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private handleNodeMessage(message: any): void {
    switch (message.type) {
      case 'stream_chunk':
        // Handle streaming LLM response
        this.emit('token', message.content);
        break;
      case 'response':
        // Handle complete response
        this.emit('response', message.content);
        break;
      case 'error':
        // Handle errors
        this.emit('error', message.error);
        break;
      case 'session_end':
        // Node confirmed session ending
        console.log('Node confirmed session end and payment settlement');
        break;
    }
  }

  // Event emitter methods would be added for production
  private emit(event: string, data: any): void {
    // Implement event emitter pattern
  }
}
```

**Key Points for SDK Developer:**

1. **Normal Session Ending (Gasless)**:
   - User clicks "End Session" → SDK calls `sessionManager.endSession()`
   - This just closes the WebSocket connection
   - Node automatically calls `completeSessionJob()` on blockchain
   - Host pays gas (they want their payment)
   - User gets refund without paying any gas

2. **DO NOT Do This**:
   ```typescript
   // ❌ WRONG - Makes user pay gas
   async handleEndSessionButton() {
     await jobMarketplace.completeSessionJob(sessionId);
   }
   ```

3. **DO This Instead**:
   ```typescript
   // ✅ CORRECT - Gasless for user
   async handleEndSessionButton() {
     await sessionManager.endSession(); // Just closes WebSocket
   }
   ```

4. **Why This Works**:
   - Hosts are incentivized to call `completeSessionJob()` to get paid
   - Users can't "cheat" by closing browser - host still settles
   - Works with ALL wallet types (EOA, Smart Accounts, etc.)
   - No gas popups for users when ending sessions

5. **Emergency Fallback**:
   - Only use `emergencyCompleteSession()` if host node is down
   - This makes user pay gas, so avoid unless necessary
   - Could add timeout logic to detect unresponsive hosts

### 7. Wallet Factory

```typescript
// packages/sdk-core/src/factories/WalletFactory.ts
export class WalletFactory {
  static async create(options: WalletFactoryOptions): Promise<IWalletProvider> {
    switch (options.type) {
      case WalletType.EOA:
        if (!options.provider) throw new Error('Provider required for EOA wallet');
        const eoaProvider = new RainbowKitProvider(options.provider, options.chainId);
        await eoaProvider.connect();
        return eoaProvider;

      case WalletType.BASE_ACCOUNT_KIT:
        const baseProvider = new BaseAccountKitProvider(options.chainId);
        await baseProvider.connect();
        return baseProvider;

      case WalletType.PARTICLE_BICONOMY:
        // Future implementation
        throw new Error('Particle/Biconomy not yet implemented');

      default:
        throw new Error(`Unsupported wallet type: ${options.type}`);
    }
  }

  static async detectWalletType(provider: any): Promise<WalletType> {
    // Check for Base Account Kit
    if (provider.isBaseWallet || provider._baseAccountSDK) {
      return WalletType.BASE_ACCOUNT_KIT;
    }

    // Check for Particle
    if (provider.isParticle) {
      return WalletType.PARTICLE_BICONOMY;
    }

    // Default to EOA
    return WalletType.EOA;
  }
}

interface WalletFactoryOptions {
  type: WalletType;
  chainId: number;
  provider?: any; // For EOA wallets
  config?: any; // Additional configuration
}
```

## Usage Examples

### UI Integration with Multi-Chain/Wallet

```typescript
// In React component
import { FabstirSDKCore } from '@fabstir/sdk-core';
import { WalletFactory, WalletType } from '@fabstir/sdk-core/wallet';

// Initialize SDK (no chain/contracts needed yet)
const sdk = new FabstirSDKCore();

// Option 1: Use with RainbowKit (EOA)
async function connectWithRainbowKit() {
  const provider = window.ethereum;
  const walletProvider = await WalletFactory.create({
    type: WalletType.EOA,
    chainId: 84532, // Base Sepolia
    provider
  });

  await sdk.authenticate(walletProvider);

  // SDK now knows chain and contracts from wallet provider
  const chainConfig = sdk.getCurrentChain();
  console.log('Connected to:', chainConfig.name);
}

// Option 2: Use with Base Account Kit
async function connectWithBaseAccountKit() {
  const walletProvider = await WalletFactory.create({
    type: WalletType.BASE_ACCOUNT_KIT,
    chainId: 84532 // Base Sepolia
  });

  await sdk.authenticate(walletProvider);

  // Gasless transactions enabled
  console.log('Gasless:', walletProvider.capabilities.gasless);
}

// Option 3: Auto-detect wallet type
async function connectAuto() {
  const provider = window.ethereum;
  const walletType = await WalletFactory.detectWalletType(provider);

  const walletProvider = await WalletFactory.create({
    type: walletType,
    chainId: 84532,
    provider
  });

  await sdk.authenticate(walletProvider);
}

// Using the SDK with any wallet type
async function startSession() {
  const paymentManager = sdk.getPaymentManager();
  const chainConfig = sdk.getCurrentChain();

  // Deposit native token (ETH on Base, BNB on opBNB)
  if (chainConfig.chainId === 84532) {
    // Base Sepolia - deposits ETH
    await paymentManager.depositNative('0.1');
  } else if (chainConfig.chainId === 5611) {
    // opBNB - deposits BNB
    await paymentManager.depositNative('0.1');
  }

  // Or deposit USDC (works on both chains)
  await paymentManager.depositToken('USDC', '1.0');

  // Check balance (queries correct account)
  const nativeBalance = await paymentManager.getDepositBalance(); // ETH or BNB
  const usdcBalance = await paymentManager.getDepositBalance('USDC');
  console.log(`Native token (${chainConfig.nativeCurrency.symbol}) balance:`, nativeBalance);
  console.log('USDC balance:', usdcBalance);

  // Create session from deposit
  const { sessionId } = await paymentManager.createSessionFromDeposit(
    hostAddress,
    {
      depositAmount: '1.0',
      pricePerToken: 200,
      duration: 3600,
      proofInterval: 100,
      paymentToken: 'USDC'
    }
  );

  console.log('Session started:', sessionId);

  // Return session ID for connection
  return sessionId;
}

// Managing active sessions with WebSocket (GASLESS ending!)
async function manageSession() {
  const sessionManager = sdk.getSessionManager();
  const paymentManager = sdk.getPaymentManager();

  // 1. Create session with deposit
  const { sessionId } = await paymentManager.createSessionFromDeposit(
    hostAddress,
    { depositAmount: '1.0', paymentToken: 'USDC', /* ... */ }
  );

  // 2. Connect to host's node via WebSocket
  const hostNodeUrl = 'ws://host-ip:8080/v1/ws'; // Get from host registry
  await sessionManager.connectToHost(hostAddress, hostNodeUrl, sessionId);

  // 3. Send prompts during session
  await sessionManager.sendPrompt('Hello, can you help me?');

  // 4. End session - GASLESS for user!
  // When user clicks "End Session" button:
  await sessionManager.endSession();
  // ✓ Just closes WebSocket
  // ✓ Host node auto-calls completeSessionJob()
  // ✓ Host pays gas, user pays nothing
  // ✓ User gets refund without gas fees

  console.log('Session ended - no gas paid by user!');
}

// ❌ WRONG WAY - Don't do this for normal endings!
async function wrongWayToEndSession(sessionId: bigint) {
  // This makes USER pay gas - avoid!
  const jobMarketplace = new ethers.Contract(
    contracts.jobMarketplace,
    ['function completeSessionJob(uint256)'],
    signer
  );

  // User pays gas for this :(
  await jobMarketplace.completeSessionJob(sessionId);
}

// Switch chains
async function switchToOpBNB() {
  await sdk.switchChain(5611); // opBNB testnet

  const chainConfig = sdk.getCurrentChain();
  console.log('Switched to:', chainConfig.name);
  console.log('Native token:', chainConfig.nativeCurrency.symbol); // "BNB"

  // Now all operations use opBNB contracts and BNB as native token
  const paymentManager = sdk.getPaymentManager();
  await paymentManager.depositNative('0.01'); // Deposits 0.01 BNB
}
```

## Migration Guide

### For SDK Developers

1. **Remove hardcoded addresses**: Delete all environment variable contract addresses
2. **Implement IWalletProvider**: Create provider classes for each wallet type
3. **Update managers**: Make all managers wallet-provider aware
4. **Add chain registry**: Implement CHAIN_CONFIGS with all contract addresses
5. **Update authentication**: Accept IWalletProvider instead of just Signer

### For UI Developers

Before:
```typescript
// Old way - hardcoded contracts
const sdk = new FabstirSDKCore({
  contractAddresses: {
    jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE,
    // ... 6 more contracts
  }
});

await sdk.authenticate(signer);
```

After:
```typescript
// New way - chain and wallet aware
const sdk = new FabstirSDKCore();

const walletProvider = await WalletFactory.create({
  type: WalletType.EOA,
  chainId: 84532,
  provider: window.ethereum
});

await sdk.authenticate(walletProvider);
// SDK automatically configures for the chain
```

## Testing Strategy

### Unit Tests
```typescript
describe('WalletProvider', () => {
  it('should return same deposit account for EOA', async () => {
    const provider = new RainbowKitProvider(mockProvider, 84532);
    const address = await provider.getAddress();
    const depositAccount = await provider.getDepositAccount();
    expect(depositAccount).toBe(address);
  });

  it('should return smart account for Base Account Kit', async () => {
    const provider = new BaseAccountKitProvider(84532);
    await provider.connect();
    const depositAccount = await provider.getDepositAccount();
    expect(depositAccount).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });
});
```

### Integration Tests
```typescript
describe('Multi-chain support', () => {
  it('should switch between chains and handle native tokens', async () => {
    const sdk = new FabstirSDKCore();
    const wallet = await WalletFactory.create({ type: WalletType.EOA, chainId: 84532 });

    await sdk.authenticate(wallet);
    expect(sdk.getCurrentChain().chainId).toBe(84532);
    expect(sdk.getCurrentChain().nativeCurrency.symbol).toBe('ETH');

    await sdk.switchChain(5611);
    expect(sdk.getCurrentChain().chainId).toBe(5611);
    expect(sdk.getCurrentChain().nativeCurrency.symbol).toBe('BNB');
  });

  it('should deposit correct native token per chain', async () => {
    const sdk = new FabstirSDKCore();
    const paymentManager = sdk.getPaymentManager();

    // On Base Sepolia
    await sdk.switchChain(84532);
    const ethTx = await paymentManager.depositNative('0.1'); // Deposits ETH

    // On opBNB
    await sdk.switchChain(5611);
    const bnbTx = await paymentManager.depositNative('0.1'); // Deposits BNB
  });
});

describe('Session Management', () => {
  it('should end session without user paying gas', async () => {
    const sdk = new FabstirSDKCore();
    const sessionManager = sdk.getSessionManager();

    // Mock WebSocket connection
    const mockWs = {
      close: jest.fn(),
      readyState: WebSocket.OPEN
    };
    sessionManager.ws = mockWs;

    // End session - should just close WebSocket
    await sessionManager.endSession();

    // Verify WebSocket was closed, NOT blockchain call
    expect(mockWs.close).toHaveBeenCalledWith(1000, 'User ended session');

    // Verify NO blockchain transaction was sent
    // (completeSessionJob should NOT be called by SDK)
  });

  it('should handle automatic settlement on disconnect', async () => {
    const sessionManager = new SessionManagerV2(config);

    // Connect to host
    await sessionManager.connectToHost(hostAddress, nodeUrl, sessionId);

    // Simulate WebSocket close event
    sessionManager.ws.emit('close');

    // Verify session state is cleared
    expect(sessionManager.isConnected()).toBe(false);
    expect(sessionManager.sessionId).toBeUndefined();

    // Node handles completeSessionJob() - not SDK's responsibility
  });
});
```

## Implementation Timeline

### Phase 1: Core Abstraction (Week 1)
- [ ] Create IWalletProvider interface
- [ ] Implement chain configuration registry
- [ ] Create WalletFactory

### Phase 2: Provider Implementations (Week 1-2)
- [ ] Implement RainbowKitProvider
- [ ] Implement BaseAccountKitProvider
- [ ] Add provider tests

### Phase 3: SDK Updates (Week 2)
- [ ] Update FabstirSDKCore
- [ ] Update PaymentManager
- [ ] Update SessionManager with WebSocket integration and gasless ending
- [ ] Update other managers

### Phase 4: Testing & Documentation (Week 3)
- [ ] Comprehensive testing
- [ ] Update SDK documentation
- [ ] Create migration guide
- [ ] UI integration examples

## Backward Compatibility

The SDK maintains backward compatibility:

```typescript
// Old code still works
const sdk = new FabstirSDKCore();
await sdk.authenticate(signer); // Automatically wraps in EOA provider
```

But new code gets benefits:
```typescript
// New code with full features
const sdk = new FabstirSDKCore();
const wallet = await WalletFactory.create({
  type: WalletType.BASE_ACCOUNT_KIT,
  chainId: 84532
});
await sdk.authenticate(wallet); // Gasless transactions enabled
```

## Key Benefits

1. **Chain Agnostic**: Add new chains without code changes, properly handles native tokens
2. **Wallet Agnostic**: Support any wallet type transparently
3. **Native Token Agnostic**: Same functions work with ETH, BNB, or any native token
4. **Gasless Session Ending**: Users don't pay gas to end sessions - host handles settlement
5. **Deposit Pattern**: Consistent deposit model across all wallets and chains
6. **Future Proof**: Easy to add new chains and wallet providers
7. **Better UX**: Automatic configuration based on wallet/chain, no gas popups on session end

## Security Considerations

1. **Chain Validation**: Always validate chainId matches expected values
2. **Contract Verification**: Verify contract addresses before transactions
3. **Wallet Permissions**: Request minimal required permissions
4. **Transaction Validation**: Validate all transaction parameters
5. **Error Handling**: Clear errors for unsupported chains/wallets

## Native Token Handling Summary

The SDK handles native tokens intelligently across chains:

| Function | Base Sepolia | opBNB Testnet | Notes |
|----------|-------------|---------------|--------|
| `depositNative()` | Deposits ETH | Deposits BNB | Chain-agnostic function name |
| `withdrawNative()` | Withdraws ETH | Withdraws BNB | Automatically uses correct token |
| `getDepositBalance()` | Returns ETH balance | Returns BNB balance | When no token specified |
| `getDepositBalance('USDC')` | Returns USDC balance | Returns USDC balance | Token-specific balance |

## Conclusion

This architecture enables the SDK to:
- Support multiple chains without hardcoding
- Handle different native tokens (ETH, BNB, etc.) transparently
- Work with any wallet type transparently
- Maintain a consistent API regardless of underlying wallet or chain
- Enable the deposit pattern that works for both EOA and smart accounts
- Future-proof for new chains and wallet innovations

The key insight is that the SDK becomes a thin orchestration layer over wallet providers, while the wallet providers handle all the chain and wallet-specific logic. Native token differences are abstracted away through chain-agnostic function names that automatically work with the correct token for each chain.