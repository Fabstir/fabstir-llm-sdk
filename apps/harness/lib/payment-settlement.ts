// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { ethers } from 'ethers';
const CONTRACT_JOB_MARKETPLACE = '0xD937c594682Fe74E6e3d06239719805C04BE804A';
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
interface SettlementStatus {
  hostPaid: boolean; treasuryPaid: boolean; userRefunded: boolean;
  hostPayment: string; treasuryFee: string; userRefund: string;
}
export class PaymentSettlement {
  private provider: ethers.JsonRpcProvider;
  private hostAddress: string;
  constructor(rpcUrl: string, hostAddress: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.hostAddress = hostAddress;
  }

  async claimPayment(jobId: number, hostPrivateKey: string): Promise<boolean> {
    const hostSigner = new ethers.Wallet(hostPrivateKey, this.provider);
    const contract = new ethers.Contract(CONTRACT_JOB_MARKETPLACE, ['function claimPaymentForJob(uint256 jobId) returns (bool)'], hostSigner);
    try {
      const tx = await contract.claimPaymentForJob(jobId);
      const receipt = await tx.wait();
      return receipt.status === 1;
    } catch (error) { console.error('Claim failed:', error); return false; }
  }

  calculateSettlement(deposit: bigint, tokensUsed: number, pricePerToken: bigint): SettlementStatus {
    const totalCost = BigInt(tokensUsed) * pricePerToken;
    const hostPayment = (totalCost * BigInt(90)) / BigInt(100); // 90% (0.9) to host
    const treasuryFee = (totalCost * BigInt(10)) / BigInt(100); // 10% (0.1) treasury
    const userRefund = deposit - totalCost; // unused refund
    return { hostPaid: true, treasuryPaid: true, userRefunded: userRefund > 0,
      hostPayment: hostPayment.toString(), treasuryFee: treasuryFee.toString(), userRefund: userRefund.toString() };
  }

  async checkBalances(addresses: string[]): Promise<Record<string, string>> {
    const usdc = new ethers.Contract(USDC_ADDRESS, ['function balanceOf(address) view returns (uint256)'], this.provider);
    const balances: Record<string, string> = {};
    for (const addr of addresses) balances[addr] = ethers.formatUnits(await usdc.balanceOf(addr), 6); // USDC
    return balances;
  }

  async processSettlement(jobId: number, deposit: bigint, tokensUsed: number, pricePerToken: bigint, hostPrivateKey: string): Promise<SettlementStatus> {
    await this.claimPayment(jobId, hostPrivateKey);
    return this.calculateSettlement(deposit, tokensUsed, pricePerToken);
  }
}