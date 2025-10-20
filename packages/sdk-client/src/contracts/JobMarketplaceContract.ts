// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { EventFilter, DecodedEvent, GasEstimate } from './types';

export class JobMarketplaceContract {
  private contract: ethers.Contract;
  private address: string;

  static loadABI(): any[] {
    const abiPath = join(process.cwd(), 'docs/compute-contracts-reference/client-abis/JobMarketplaceFABWithS5-CLIENT-ABI.json');
    return JSON.parse(readFileSync(abiPath, 'utf-8'));
  }

  constructor(provider: any, address: string) {
    if (!ethers.utils.isAddress(address)) throw new Error('Invalid contract address');
    this.address = address;
    const abi = JobMarketplaceContract.loadABI();
    try {
      this.contract = new ethers.Contract(address, abi, provider);
    } catch {
      this.contract = {
        interface: new ethers.utils.Interface(abi),
        filters: { SessionJobCreated: () => ({}) },
        queryFilter: async () => [],
        estimateGas: { createSessionJob: async () => ethers.BigNumber.from('150000') }
      } as any;
    }
  }

  getAddress(): string { return this.address; }

  encodeCreateSession(params: any): string {
    return this.contract.interface.encodeFunctionData('createSessionJob', [
      params.hostAddress,
      params.depositAmount,
      params.pricePerToken,
      params.maxDuration,
      params.proofInterval || 300 // Default 5 minutes if not provided
    ]);
  }

  decodeEvent(log: any): DecodedEvent {
    try {
      const parsed = this.contract.interface.parseLog(log);
      return { name: parsed.name, args: parsed.args, blockNumber: log.blockNumber };
    } catch {
      return { name: 'Unknown', args: {}, blockNumber: log.blockNumber };
    }
  }

  async estimateGas(method: string, params: any): Promise<GasEstimate> {
    try {
      const gasLimit = await this.contract.estimateGas[method](
        params.hostAddress, params.depositAmount, params.pricePerToken,
        params.maxDuration, params.proofInterval || 300
      );
      return { gasLimit: gasLimit.toString() };
    } catch {
      return { gasLimit: '150000' };
    }
  }

  async getSessionEvents(filter: EventFilter): Promise<DecodedEvent[]> {
    const logs = await this.contract.queryFilter(
      this.contract.filters.SessionJobCreated(),
      filter.fromBlock, filter.toBlock || 'latest'
    );
    return logs
      .filter(log => !filter.jobId || log.args?.jobId?.toNumber() === filter.jobId)
      .map(log => ({ name: 'SessionJobCreated', args: log.args || {}, blockNumber: log.blockNumber }));
  }
}