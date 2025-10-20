// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { ethers } from 'ethers';
import { createBaseAccountSDK } from '@base-org/account';
import type { ProviderInterface } from '@base-org/account';
import { BaseAccountFactoryABI, BaseSmartAccountABI, ERC20ABI } from '../contracts/abis';

// Base Account factory and contract addresses from the SDK
const FACTORY_ADDRESS = '0xba5ed110efdba3d005bfc882d75358acbbb85842';
const SPEND_PERMISSION_MANAGER = '0xf85210B21cC50302F477BA56686d2019dC9b67Ad';

export class BaseAccountIntegration {
  private provider: ethers.providers.Provider;
  private signer: ethers.Signer;
  private factory: ethers.Contract;
  private smartAccountAddress?: string;
  private smartAccount?: ethers.Contract;
  private baseAccountSDK?: ProviderInterface;

  constructor(provider: ethers.providers.Provider, signer: ethers.Signer) {
    this.provider = provider;
    this.signer = signer;
    this.factory = new ethers.Contract(FACTORY_ADDRESS, BaseAccountFactoryABI, signer);
  }

  /**
   * Get or create smart account address
   */
  async getSmartAccountAddress(): Promise<string> {
    if (this.smartAccountAddress) {
      return this.smartAccountAddress;
    }

    const eoaAddress = await this.signer.getAddress();
    // Encode EOA address as owner
    const owners = [ethers.utils.defaultAbiCoder.encode(['address'], [eoaAddress])];
    const nonce = 0; // Use 0 for deterministic address

    // Get the deterministic address from factory
    this.smartAccountAddress = await this.factory.getAddress(owners, nonce);
    return this.smartAccountAddress;
  }

  /**
   * Deploy smart account if not already deployed
   */
  async deploySmartAccount(): Promise<string> {
    const address = await this.getSmartAccountAddress();
    
    // Check if already deployed
    const code = await this.provider.getCode(address);
    if (code !== '0x') {
      console.log('[BaseAccount] Smart account already deployed at:', address);
      this.smartAccount = new ethers.Contract(address, BaseSmartAccountABI, this.signer);
      return address;
    }

    console.log('[BaseAccount] Deploying smart account...');
    const eoaAddress = await this.signer.getAddress();
    const owners = [ethers.utils.defaultAbiCoder.encode(['address'], [eoaAddress])];
    const nonce = 0;

    // Deploy via factory
    const tx = await this.factory.createAccount(owners, nonce, {
      gasLimit: 2000000
    });
    console.log('[BaseAccount] Deploy TX:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('[BaseAccount] Smart account deployed at:', address);
    
    this.smartAccount = new ethers.Contract(address, BaseSmartAccountABI, this.signer);
    return address;
  }

  /**
   * Execute a transaction through the smart account
   */
  async execute(target: string, value: ethers.BigNumber, data: string): Promise<ethers.providers.TransactionResponse> {
    if (!this.smartAccount) {
      await this.deploySmartAccount();
    }

    return this.smartAccount!.execute(target, value, data);
  }

  /**
   * Execute multiple transactions in a batch
   */
  async executeBatch(calls: Array<{ target: string; value: ethers.BigNumber; data: string }>): Promise<ethers.providers.TransactionResponse> {
    if (!this.smartAccount) {
      await this.deploySmartAccount();
    }

    return this.smartAccount!.executeBatch(calls);
  }

  /**
   * Transfer ERC20 tokens from smart account
   */
  async transferToken(tokenAddress: string, to: string, amount: ethers.BigNumber): Promise<ethers.providers.TransactionResponse> {
    // ERC20 transfer function selector and encoding
    const transferInterface = new ethers.utils.Interface([
      'function transfer(address to, uint256 amount) returns (bool)'
    ]);
    
    const data = transferInterface.encodeFunctionData('transfer', [to, amount]);
    
    // Execute through smart account
    return this.execute(tokenAddress, ethers.BigNumber.from(0), data);
  }

  /**
   * Get USDC balance of smart account
   */
  async getUSDCBalance(): Promise<ethers.BigNumber> {
    const address = await this.getSmartAccountAddress();
    const usdcAddress = process.env.CONTRACT_USDC_TOKEN;
    if (!usdcAddress) {
      throw new Error('CONTRACT_USDC_TOKEN environment variable is not set');
    }
    
    const usdcContract = new ethers.Contract(
      usdcAddress,
      ERC20ABI,
      this.provider
    );
    
    return usdcContract.balanceOf(address);
  }

  /**
   * Check if smart account is deployed
   */
  async isDeployed(): Promise<boolean> {
    const address = await this.getSmartAccountAddress();
    const code = await this.provider.getCode(address);
    return code !== '0x';
  }
}