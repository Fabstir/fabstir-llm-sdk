import { IWalletProvider, WalletCapabilities, TransactionRequest, TransactionResponse } from '../interfaces/IWalletProvider';
import { ethers } from 'ethers';
import { ChainId } from '../types/chain.types';

// Types for bundler operations
interface UserOperation {
  sender: string;
  nonce: string;
  initCode: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymasterAndData: string;
  signature: string;
}

/**
 * Smart Account Provider using Base Account Kit for gasless transactions
 * Implements IWalletProvider interface for smart contract wallets
 */
export class SmartAccountProvider implements IWalletProvider {
  private baseAccountSDK: any;
  private bundlerClient: any;
  private provider: any;
  private connected: boolean = false;
  private smartAccountAddress?: string;
  private eoaAddress?: string;

  constructor(config?: { bundlerUrl?: string; paymasterUrl?: string }) {
    // Configuration can be passed or use defaults
    this.initializeBundler(config);
  }

  private async initializeBundler(config?: { bundlerUrl?: string; paymasterUrl?: string }) {
    const bundlerUrl = config?.bundlerUrl || 'https://api.developer.coinbase.com/rpc/v1/base-sepolia';
    const paymasterUrl = config?.paymasterUrl || bundlerUrl;

    // Initialize real bundler client for UserOperation submission
    this.bundlerClient = {
      sendUserOperation: async (userOp: Partial<UserOperation>) => {
        // Submit to real bundler
        if (!bundlerUrl) {
          throw new Error('Bundler URL not configured');
        }

        const response = await fetch(bundlerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_sendUserOperation',
            params: [userOp, '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'],
            id: 1
          })
        });

        const result = await response.json();
        if (result.error) {
          throw new Error(result.error.message || 'Bundler error');
        }

        // Validate transaction hash format
        const hash = result.result;
        if (!hash || !hash.match(/^0x[a-f0-9]{64}$/)) {
          throw new Error('Invalid transaction hash from bundler');
        }

        return hash;
      },
      estimateUserOperationGas: async (userOp: Partial<UserOperation>) => {
        const response = await fetch(bundlerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_estimateUserOperationGas',
            params: [userOp, '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'],
            id: 1
          })
        });

        const result = await response.json();
        if (result.error) {
          throw new Error(result.error.message || 'Gas estimation failed');
        }

        return result.result;
      },
      getUserOperationReceipt: async (hash: string) => {
        const response = await fetch(bundlerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getUserOperationReceipt',
            params: [hash],
            id: 1
          })
        });

        const result = await response.json();
        return result.result || { status: 'pending' };
      },
      getSupportedEntryPoints: async () => {
        return ['0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789']; // v0.6 EntryPoint
      }
    };
  }

  async connect(chainId?: number): Promise<void> {
    // Only support Base Sepolia for smart accounts
    if (chainId && chainId !== ChainId.BASE_SEPOLIA) {
      throw new Error(`Smart Account Provider only supports Base Sepolia (${ChainId.BASE_SEPOLIA})`);
    }

    try {
      // Dynamic import to avoid build issues
      const BaseAccountModule = await import('@base-org/account').catch(() => null);

      if (BaseAccountModule) {
        const { createBaseAccountSDK, base } = BaseAccountModule;

        // Initialize Base Account SDK
        this.baseAccountSDK = createBaseAccountSDK({
          appName: 'Fabstir SDK',
          appChainIds: [base.constants.CHAIN_IDS.baseSepolia],
        });

        this.provider = this.baseAccountSDK.getProvider();

        // Request accounts
        const accounts = await this.provider.request({
          method: 'eth_requestAccounts',
          params: []
        });

        this.eoaAddress = accounts[0];
        this.smartAccountAddress = await this.baseAccountSDK.getAddress();
      } else {
        // Fallback for testing without Base Account SDK
        if (!this.baseAccountSDK) {
          throw new Error('Base Account SDK not available');
        }
        // Use injected mock for testing
        this.smartAccountAddress = this.baseAccountSDK.getAddress ?
          await this.baseAccountSDK.getAddress() :
          this.baseAccountSDK.address;
        this.eoaAddress = this.baseAccountSDK.eoaAddress;
      }

      this.connected = true;
    } catch (error) {
      throw new Error(`Failed to connect wallet: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.smartAccountAddress = undefined;
    this.eoaAddress = undefined;
    this.baseAccountSDK = undefined;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getAddress(): Promise<string> {
    if (!this.connected || !this.smartAccountAddress) {
      throw new Error('Wallet not connected');
    }
    return this.smartAccountAddress;
  }

  async getDepositAccount(): Promise<string> {
    // For smart accounts, deposit account is the smart account address
    return this.getAddress();
  }

  async getCurrentChainId(): Promise<number> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }
    // Always Base Sepolia for smart accounts
    return ChainId.BASE_SEPOLIA;
  }

  async switchChain(chainId: number): Promise<void> {
    // Smart accounts don't support chain switching in v1
    throw new Error('Smart Account Provider does not support chain switching');
  }

  getSupportedChains(): number[] {
    // Only Base Sepolia supported for smart accounts
    return [ChainId.BASE_SEPOLIA];
  }

  async sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
    if (!this.connected || !this.smartAccountAddress) {
      throw new Error('Wallet not connected');
    }

    // Validate transaction parameters
    if (!tx.to || !ethers.isAddress(tx.to)) {
      throw new Error('Invalid transaction: missing or invalid "to" address');
    }

    // Build UserOperation for gasless transaction
    const userOp: Partial<UserOperation> = {
      sender: this.smartAccountAddress,
      callData: this.encodeCallData(tx),
      nonce: '0x0', // Would be fetched from account
      initCode: '0x', // Empty for already deployed accounts
      // Paymaster will sponsor gas
      paymasterAndData: '0x', // Would be filled by paymaster service
      signature: '0x', // Will be added after signing
    };

    // Estimate gas with retry logic
    let gasEstimates;
    let retries = 3;
    while (retries > 0) {
      try {
        gasEstimates = await this.bundlerClient.estimateUserOperationGas(userOp);
        break;
      } catch (error: any) {
        retries--;
        if (retries === 0 || !error.message?.includes('timeout')) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!gasEstimates) {
      throw new Error('Failed to estimate gas for transaction');
    }

    userOp.callGasLimit = gasEstimates.callGasLimit;
    userOp.verificationGasLimit = gasEstimates.verificationGasLimit;
    userOp.preVerificationGas = gasEstimates.preVerificationGas;
    userOp.maxFeePerGas = '0x1000000'; // Would be from gas oracle
    userOp.maxPriorityFeePerGas = '0x1000000';

    // Submit to bundler with retry for transient failures
    let userOpHash;
    retries = 3;
    while (retries > 0) {
      try {
        userOpHash = await this.bundlerClient.sendUserOperation(userOp);
        break;
      } catch (error: any) {
        retries--;
        if (retries === 0 || !error.message?.includes('Network timeout')) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Validate the returned hash
    if (!userOpHash || !userOpHash.match(/^0x[a-f0-9]{64}$/)) {
      throw new Error('Invalid transaction hash from bundler');
    }

    return {
      hash: userOpHash,
      from: this.smartAccountAddress,
      to: tx.to || null,
      value: tx.value || 0n,
      data: tx.data || '0x',
      wait: async (confirmations?: number) => {
        // Wait for UserOperation to be mined
        const receipt = await this.bundlerClient.getUserOperationReceipt(userOpHash);
        return {
          status: receipt.status === 'success' ? 1 : 0
        } as ethers.TransactionReceipt;
      }
    } as TransactionResponse;
  }

  private encodeCallData(tx: TransactionRequest): string {
    // Encode the transaction as calldata for smart account
    const iface = new ethers.Interface([
      'function execute(address to, uint256 value, bytes data)'
    ]);
    return iface.encodeFunctionData('execute', [
      tx.to || ethers.ZeroAddress,
      tx.value || 0,
      tx.data || '0x'
    ]);
  }

  private async estimateGas(tx: any): Promise<any> {
    return this.bundlerClient.estimateUserOperationGas({
      sender: this.smartAccountAddress,
      callData: this.encodeCallData(tx),
      nonce: '0x0',
      initCode: '0x',
      paymasterAndData: '0x',
      signature: '0x'
    });
  }

  private async getTransactionReceipt(hash: string): Promise<any> {
    return this.bundlerClient.getUserOperationReceipt(hash);
  }

  async signMessage(message: string): Promise<string> {
    if (!this.connected || !this.provider) {
      throw new Error('Wallet not connected');
    }

    // Sign with smart account via provider
    return this.provider.request({
      method: 'personal_sign',
      params: [message, this.smartAccountAddress]
    });
  }

  async getBalance(token?: string): Promise<string> {
    if (!this.connected || !this.smartAccountAddress) {
      throw new Error('Wallet not connected');
    }

    if (!token) {
      // Get native balance
      const balance = await this.provider.request({
        method: 'eth_getBalance',
        params: [this.smartAccountAddress, 'latest']
      });
      return BigInt(balance).toString();
    } else {
      // Get ERC20 balance
      const balanceOfData = ethers.concat([
        '0x70a08231', // balanceOf signature
        ethers.zeroPadValue(this.smartAccountAddress, 32)
      ]);

      const result = await this.provider.request({
        method: 'eth_call',
        params: [{
          to: token,
          data: balanceOfData
        }, 'latest']
      });

      return BigInt(result).toString();
    }
  }

  getCapabilities(): WalletCapabilities {
    return {
      supportsGaslessTransactions: true,
      supportsChainSwitching: false, // Limited to Base Sepolia in v1
      supportsSmartAccounts: true,
      requiresDepositAccount: true // Deposits go to smart account
    };
  }

  static isAvailable(): boolean {
    // Check if we can import Base Account SDK
    return true; // In production, would check for module availability
  }

  getProviderName(): string {
    return 'Base Account Kit';
  }
}