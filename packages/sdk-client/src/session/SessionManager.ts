import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import type { SessionParams, SessionJob, SessionStatus, TxReceipt } from './types';
import { JobMarketplaceABI } from '../contracts/minimalABI';

export class SessionManager extends EventEmitter {
  private contract: any;
  private signer: any;
  private jobCounter = 1;

  constructor(signer: any, contractAddress: string) {
    super();
    this.signer = signer;
    // Always create contract with minimal ABI
    try {
      this.contract = new ethers.Contract(contractAddress || '0xebD3bbc24355d05184C7Af753d9d631E2b3aAF7A', JobMarketplaceABI, signer);
      console.log('SessionManager: Contract initialized at', contractAddress || '0xebD3bbc24355d05184C7Af753d9d631E2b3aAF7A');
    } catch (error: any) {
      console.error('SessionManager: Failed to initialize contract:', error.message);
      this.contract = null;
    }
  }

  async createSession(params: SessionParams): Promise<SessionJob> {
    if (params.depositAmount === '0') throw new Error('Invalid deposit amount');
    
    console.log('Creating session with params:', {
      host: params.hostAddress,
      deposit: params.depositAmount,
      pricePerToken: params.pricePerToken,
      maxDuration: params.maxDuration
    });
    
    // createSessionJob takes 5 parameters: host, deposit, pricePerToken, maxDuration, proofInterval
    const tx = await this.contract.createSessionJob(
      params.hostAddress,
      params.depositAmount,
      params.pricePerToken,
      params.maxDuration,
      100, // proofInterval - 100 tokens minimum
      { 
        value: params.depositAmount, // deposit must match msg.value
        gasLimit: 500000 // Increased for new contract
      }
    );
    
    console.log('Transaction sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('Transaction confirmed in block:', receipt.blockNumber);
    
    // Parse SessionJobCreated or JobCreated event
    let jobId: number | undefined;
    for (const log of receipt.logs) {
      try {
        const parsed = this.contract.interface.parseLog(log);
        if (parsed.name === 'SessionJobCreated' || parsed.name === 'JobCreated') {
          jobId = parsed.args.jobId.toNumber();
          console.log('Job created with ID:', jobId);
          break;
        }
      } catch {}
    }
    
    if (!jobId) {
      throw new Error('Failed to parse job ID from transaction receipt');
    }
    
    this.emit('session:created', { jobId, ...params });
    return { jobId, status: 'Active', depositAmount: params.depositAmount, hostAddress: params.hostAddress };
  }

  async completeSession(jobId: number, tokens: number): Promise<TxReceipt> {
    try {
      console.log('User completing session:', { jobId, tokens });
      
      // USER completes their own session using completeSessionJob
      const tx = await this.contract.completeSessionJob(jobId, { gasLimit: 200000 });
      
      console.log('Complete transaction sent:', tx.hash);
      const receipt = await tx.wait();
      console.log('Session completed successfully:', receipt.transactionHash);
      
      return {
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error: any) {
      console.error('Failed to complete session:', error.message);
      throw error; // No mocks! Let the error propagate
    }
  }

  async getSessionStatus(jobId: number): Promise<SessionStatus> {
    const session = await this.contract.sessions(jobId);
    // Check if session exists (depositAmount > 0 or has assignedHost)
    if (!session || (session.depositAmount.eq(0) && session.assignedHost === ethers.constants.AddressZero)) {
      throw new Error('Session not found');
    }
    
    // CORRECT enum mapping from contract:
    // enum SessionStatus { Active, Completed, TimedOut, Disputed, Abandoned }
    const statusMap: { [key: number]: string } = {
      0: 'Active',    // First enum value in Solidity
      1: 'Completed',
      2: 'TimedOut',
      3: 'Disputed',
      4: 'Abandoned'
    };
    
    return {
      status: statusMap[session.status] || 'Active',
      provenTokens: session.provenTokens.toNumber(),
      depositAmount: session.depositAmount.toString()
    };
  }

  async triggerTimeout(jobId: number): Promise<TxReceipt> {
    const tx = await this.contract.cancelAbandonedJob(jobId);
    const receipt = await tx.wait();
    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString()
    };
  }
}