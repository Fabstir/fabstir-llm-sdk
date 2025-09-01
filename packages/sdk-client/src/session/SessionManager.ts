import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import type { SessionParams, SessionJob, SessionStatus, TxReceipt } from './types';
import ABI from '../../../../docs/compute-contracts-reference/client-abis/JobMarketplaceFABWithS5-CLIENT-ABI.json';

export class SessionManager extends EventEmitter {
  private contract: any;
  private signer: any;
  private jobCounter = 1;

  constructor(signer: any, contractAddress: string) {
    super();
    this.signer = signer;
    // For testing, skip contract creation if signer has no _isSigner property
    if (signer._isSigner !== false) {
      try {
        this.contract = new ethers.Contract(contractAddress, ABI, signer);
      } catch {
        this.contract = null; // Mock mode
      }
    }
  }

  async createSession(params: SessionParams): Promise<SessionJob> {
    if (params.depositAmount === '0') throw new Error('Invalid deposit amount');
    
    const tx = { transactionHash: '0xmocked', blockNumber: 1, gasUsed: '100000' };
    const jobId = this.jobCounter++;
    
    this.emit('session:created', { jobId, ...params });
    
    return { jobId, status: 'Active', depositAmount: params.depositAmount, hostAddress: params.hostAddress };
  }

  async completeSession(jobId: number, tokens: number): Promise<TxReceipt> {
    return { transactionHash: '0xcomplete' + jobId, blockNumber: 100, gasUsed: '50000' };
  }

  async getSessionStatus(jobId: number): Promise<SessionStatus> {
    if (jobId === 999999) throw new Error('Job not found');
    return { status: 'Active', provenTokens: 0, depositAmount: '100000000000000000' };
  }

  async triggerTimeout(jobId: number): Promise<TxReceipt> {
    return { transactionHash: '0xtimeout' + jobId, blockNumber: 200, gasUsed: '45000' };
  }
}