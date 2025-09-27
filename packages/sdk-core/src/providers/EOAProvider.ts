import { IWalletProvider, WalletCapabilities, TransactionRequest, TransactionResponse } from '../interfaces/IWalletProvider';
import { ethers } from 'ethers';
import { ChainRegistry } from '../config/ChainRegistry';
import { ChainId } from '../types/chain.types';

/**
 * EOA (Externally Owned Account) Provider for standard wallets like MetaMask and Rainbow
 * Implements IWalletProvider interface for browser extension wallets
 */
export class EOAProvider implements IWalletProvider {
  private provider: any;
  private connected: boolean = false;
  private accounts: string[] = [];

  constructor(provider?: any) {
    this.provider = provider || (typeof window !== 'undefined' ? (window as any).ethereum : null);
  }

  async connect(chainId?: number): Promise<void> {
    if (!this.provider) {
      throw new Error('No Ethereum provider available');
    }

    // Request accounts first
    this.accounts = await this.provider.request({ method: 'eth_requestAccounts' });
    this.connected = true;

    // Switch chain if requested
    if (chainId) {
      await this.switchChain(chainId);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.accounts = [];
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getAddress(): Promise<string> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }
    return this.accounts[0] || '';
  }

  async getDepositAccount(): Promise<string> {
    // For EOA, deposit account is same as primary account
    return this.getAddress();
  }

  async getCurrentChainId(): Promise<number> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }
    const chainIdHex = await this.provider.request({ method: 'eth_chainId' });
    return parseInt(chainIdHex, 16);
  }

  async switchChain(chainId: number): Promise<void> {
    if (!this.getSupportedChains().includes(chainId)) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }

    const chainIdHex = `0x${chainId.toString(16)}`;

    try {
      await this.provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });
    } catch (error: any) {
      // If chain not added (error code 4902), add it
      if (error.code === 4902) {
        await this.addChain(chainId);
      } else {
        throw error;
      }
    }
  }

  private async addChain(chainId: number): Promise<void> {
    const chainConfig = ChainRegistry.getChain(chainId);
    const params = {
      chainId: `0x${chainId.toString(16)}`,
      chainName: chainConfig.name,
      rpcUrls: [chainConfig.rpcUrl],
      blockExplorerUrls: [chainConfig.blockExplorer],
      nativeCurrency: {
        name: chainConfig.nativeToken,
        symbol: chainConfig.nativeToken,
        decimals: 18
      }
    };

    await this.provider.request({
      method: 'wallet_addEthereumChain',
      params: [params],
    });
  }

  getSupportedChains(): number[] {
    return [ChainId.BASE_SEPOLIA, ChainId.OPBNB_TESTNET];
  }

  async sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }

    const from = await this.getAddress();
    const hash = await this.provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from,
        to: tx.to,
        value: tx.value ? `0x${BigInt(tx.value).toString(16)}` : undefined,
        data: tx.data || '0x',
        gas: tx.gas ? `0x${BigInt(tx.gas).toString(16)}` : undefined,
      }],
    });

    return {
      hash,
      from,
      to: tx.to,
      value: tx.value,
      data: tx.data,
      wait: async () => ({ status: 1 })
    };
  }

  async signMessage(message: string): Promise<string> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }
    const address = await this.getAddress();
    return this.provider.request({
      method: 'personal_sign',
      params: [message, address],
    });
  }

  async getBalance(token?: string): Promise<string> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }

    const address = await this.getAddress();

    if (!token) {
      // Get native token balance
      const balance = await this.provider.request({
        method: 'eth_getBalance',
        params: [address, 'latest'],
      });
      return BigInt(balance).toString();
    } else {
      // Get ERC20 token balance
      const balanceOfData = ethers.concat([
        '0x70a08231', // balanceOf signature
        ethers.zeroPadValue(address, 32)
      ]);

      const result = await this.provider.request({
        method: 'eth_call',
        params: [{
          to: token,
          data: balanceOfData,
        }, 'latest'],
      });

      return BigInt(result).toString();
    }
  }

  getCapabilities(): WalletCapabilities {
    return {
      supportsGaslessTransactions: false,
      supportsChainSwitching: true,
      supportsSmartAccounts: false,
      requiresDepositAccount: false
    };
  }

  static isAvailable(): boolean {
    return typeof window !== 'undefined' && !!(window as any).ethereum;
  }

  getProviderName(): string {
    if (!this.provider) return 'Unknown';
    if (this.provider.isMetaMask) return 'MetaMask';
    if (this.provider.isRainbow) return 'Rainbow';
    if (this.provider.isCoinbaseWallet) return 'Coinbase Wallet';
    return 'Ethereum Wallet';
  }
}