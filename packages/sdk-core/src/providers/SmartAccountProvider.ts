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
    // Initialize bundler client for UserOperation submission
    this.bundlerClient = {
      sendUserOperation: async (userOp: Partial<UserOperation>) => {
        // In real implementation, this would submit to bundler
        // Check if mock has overridden this method
        if (this.bundlerClient._mockSendUserOp) {
          return this.bundlerClient._mockSendUserOp(userOp);
        }
        return '0x' + 'deed'.repeat(16);
      },
      estimateUserOperationGas: async (userOp: Partial<UserOperation>) => {
        return {
          preVerificationGas: '100000',
          verificationGasLimit: '200000',
          callGasLimit: '300000'
        };
      },
      getUserOperationReceipt: async (hash: string) => {
        return { status: 'success' };
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

    // Dynamic import to avoid build issues
    const { createBaseAccountSDK, base } = await import('@base-org/account');

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
    this.connected = true;
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

    // Build UserOperation for gasless transaction
    const userOp: Partial<UserOperation> = {
      sender: this.smartAccountAddress,
      callData: this.encodeCallData(tx),
      // Paymaster will sponsor gas
      paymasterAndData: '0x', // Would be filled by paymaster service
    };

    // Estimate gas
    const gasEstimates = await this.bundlerClient.estimateUserOperationGas(userOp);
    userOp.callGasLimit = gasEstimates.callGasLimit;
    userOp.verificationGasLimit = gasEstimates.verificationGasLimit;
    userOp.preVerificationGas = gasEstimates.preVerificationGas;

    // Submit to bundler - this can throw if bundler has errors
    let userOpHash;
    try {
      userOpHash = await this.bundlerClient.sendUserOperation(userOp);
    } catch (error) {
      // Re-throw bundler/paymaster errors
      throw error;
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