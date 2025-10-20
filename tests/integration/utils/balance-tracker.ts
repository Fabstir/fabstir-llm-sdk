// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { ethers } from 'ethers';

export interface Balances {
  eth: bigint;
  usdc: bigint;
  fab: bigint;
}

export interface BalanceReport {
  ethSpent: bigint;
  usdcSpent: bigint;
  fabSpent?: bigint;
  gasUsed: bigint;
  txHashes: string[];
}

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export class BalanceTracker {
  private provider: ethers.providers.JsonRpcProvider;
  private usdcContract: ethers.Contract;
  private fabContract: ethers.Contract;

  constructor() {
    const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA || 'https://base-sepolia.g.alchemy.com/v2/demo';
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    this.usdcContract = new ethers.Contract(
      process.env.CONTRACT_USDC_TOKEN || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      ERC20_ABI,
      this.provider
    );
    this.fabContract = new ethers.Contract(
      process.env.CONTRACT_FAB_TOKEN || '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
      ERC20_ABI,
      this.provider
    );
  }

  async getETHBalance(address: string): Promise<bigint> {
    const balance = await this.provider.getBalance(address);
    return BigInt(balance.toString());
  }

  async getUSDCBalance(address: string): Promise<bigint> {
    const balance = await this.usdcContract.balanceOf(address);
    return BigInt(balance.toString());
  }

  async getFABBalance(address: string): Promise<bigint> {
    const balance = await this.fabContract.balanceOf(address);
    return BigInt(balance.toString());
  }

  async getAllBalances(address: string): Promise<Balances> {
    const [eth, usdc, fab] = await Promise.all([
      this.getETHBalance(address),
      this.getUSDCBalance(address),
      this.getFABBalance(address),
    ]);
    return { eth, usdc, fab };
  }

  async trackBalanceChange(
    address: string,
    operation: () => Promise<any>
  ): Promise<BalanceReport> {
    const before = await this.getAllBalances(address);
    const txHashes: string[] = [];
    let gasUsed = 0n;

    const result = await operation();
    if (result?.txHash) txHashes.push(result.txHash);
    if (result?.receipt?.gasUsed) gasUsed = BigInt(result.receipt.gasUsed.toString());

    const after = await this.getAllBalances(address);
    return {
      ethSpent: before.eth - after.eth,
      usdcSpent: before.usdc - after.usdc,
      fabSpent: before.fab - after.fab,
      gasUsed,
      txHashes,
    };
  }

  generateReport(before: Balances, after: Balances): string {
    const ethSpent = before.eth - after.eth;
    const usdcSpent = before.usdc - after.usdc;
    const fabSpent = before.fab - after.fab;

    const formatETH = (wei: bigint) => ethers.utils.formatEther(wei.toString());
    const formatUSDC = (amount: bigint) => (Number(amount) / 1e6).toFixed(1);
    const formatFAB = (amount: bigint) => ethers.utils.formatEther(amount.toString());

    const lines = [
      'Balance Changes:',
      `  ETH Spent: ${formatETH(ethSpent)} ETH`,
      `  USDC Spent: ${formatUSDC(usdcSpent)} USDC`,
      `  FAB Spent: ${formatFAB(fabSpent)} FAB`,
    ];

    return lines.join('\n');
  }
}