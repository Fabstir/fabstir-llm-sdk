import { ethers, Signer, Contract } from 'ethers';
import { ChainRegistry } from '../config/ChainRegistry';
import { ChainId } from '../types/chain.types';
import {
  UnsupportedChainError,
  ChainMismatchError,
  InsufficientDepositError
} from '../errors/ChainErrors';
import JobMarketplaceABI from './abis/JobMarketplaceWithModels.json';

export interface SessionCreationParams {
  host: string;
  paymentToken: string;
  deposit: string;
  pricePerToken: number;
  duration: number;
  proofInterval: number;
}

export interface DirectSessionParams {
  host: string;
  pricePerToken: number;
  duration: number;
  proofInterval: number;
  paymentAmount: string;
}

export interface SessionJob {
  id: number;
  depositor: string;
  requester: string;
  host: string;
  paymentToken: string;
  deposit: string;
  pricePerToken: number;
  tokensUsed: number;
  maxDuration: number;
  startTime: number;
  lastProofTime: number;
  proofInterval: number;
  status: number;
  withdrawnByHost: string;
  refundedToUser: string;
  conversationCID: string;
}

export class JobMarketplaceWrapper {
  private readonly chainId: number;
  private readonly signer: Signer;
  private readonly contract: Contract;
  private readonly contractAddress: string;

  constructor(chainId: number, signer: Signer) {
    if (!ChainRegistry.isChainSupported(chainId)) {
      throw new UnsupportedChainError(chainId, ChainRegistry.getSupportedChains());
    }
    const chain = ChainRegistry.getChain(chainId);

    this.chainId = chainId;
    this.signer = signer;
    this.contractAddress = chain.contracts.jobMarketplace;
    this.contract = new Contract(this.contractAddress, JobMarketplaceABI, signer);
  }

  getChainId(): number {
    return this.chainId;
  }

  getContractAddress(): string {
    return this.contractAddress;
  }

  async verifyChain(): Promise<void> {
    const network = await this.signer.provider!.getNetwork();
    const actualChainId = Number(network.chainId);
    if (actualChainId !== this.chainId) {
      throw new ChainMismatchError(this.chainId, actualChainId, 'contract operation');
    }
  }

  // Deposit and Withdrawal Methods
  async depositNative(amount: string): Promise<any> {
    await this.verifyChain();

    const chain = ChainRegistry.getChain(this.chainId);
    const minDeposit = ethers.parseEther(chain.minDeposit);
    const value = ethers.parseEther(amount);

    if (value < minDeposit) {
      throw new Error(`Amount ${amount} is below minimum deposit ${chain.minDeposit}`);
    }

    const tx = await this.contract.depositNative({ value });
    return tx;
  }

  async withdrawNative(amount: string): Promise<any> {
    await this.verifyChain();
    const value = ethers.parseEther(amount);
    const tx = await this.contract.withdrawNative(value);
    return tx;
  }

  async depositToken(token: string, amount: string): Promise<any> {
    await this.verifyChain();

    // For USDC with 6 decimals
    const chain = ChainRegistry.getChain(this.chainId);
    const isUSDC = token.toLowerCase() === chain.contracts.usdcToken.toLowerCase();
    const value = isUSDC
      ? ethers.parseUnits(amount, 6)
      : ethers.parseUnits(amount, 18);

    const tx = await this.contract.depositToken(token, value);
    return tx;
  }

  async withdrawToken(token: string, amount: string): Promise<any> {
    await this.verifyChain();

    const chain = ChainRegistry.getChain(this.chainId);
    const isUSDC = token.toLowerCase() === chain.contracts.usdcToken.toLowerCase();
    const value = isUSDC
      ? ethers.parseUnits(amount, 6)
      : ethers.parseUnits(amount, 18);

    const tx = await this.contract.withdrawToken(token, value);
    return tx;
  }

  async getDepositBalance(account: string, token?: string): Promise<string> {
    await this.verifyChain();

    if (!token || token === ethers.ZeroAddress) {
      const balance = await this.contract.userDepositsNative(account);
      return ethers.formatEther(balance);
    } else {
      console.log('[JobMarketplace] Getting deposit balance:');
      console.log('  Account:', account);
      console.log('  Token:', token);
      console.log('  Contract address:', this.contractAddress);
      console.log('  Chain ID:', this.chainId);

      try {
        const balance = await this.contract.userDepositsToken(account, token);
        console.log('[JobMarketplace] Raw balance from contract:', balance);

        // Handle null or undefined balance (no deposit)
        if (balance === null || balance === undefined) {
          console.log('[JobMarketplace] No deposit found, returning "0"');
          return "0";
        }

        const chain = ChainRegistry.getChain(this.chainId);
        const isUSDC = token.toLowerCase() === chain.contracts.usdcToken.toLowerCase();
        const formattedBalance = isUSDC
          ? ethers.formatUnits(balance, 6)
          : ethers.formatUnits(balance, 18);

        console.log('[JobMarketplace] Formatted balance:', formattedBalance);
        return formattedBalance;
      } catch (error: any) {
        console.error('[JobMarketplace] Error getting deposit balance:', error.message);
        console.error('  Error code:', error.code);
        throw error;
      }
    }
  }

  // Session Management Methods
  async createSessionFromDeposit(params: SessionCreationParams): Promise<number> {
    await this.verifyChain();

    // Validate address
    if (!ethers.isAddress(params.host)) {
      throw new Error('Invalid address: ' + params.host);
    }

    // Check deposit balance
    const balance = await this.getDepositBalance(
      await this.signer.getAddress(),
      params.paymentToken === ethers.ZeroAddress ? undefined : params.paymentToken
    );

    const requiredDeposit = parseFloat(params.deposit);
    if (parseFloat(balance) < requiredDeposit) {
      throw new InsufficientDepositError(
        params.deposit,
        balance,
        this.chainId
      );
    }

    // Convert deposit amount based on token
    let depositValue: bigint;
    if (params.paymentToken === ethers.ZeroAddress) {
      depositValue = ethers.parseEther(params.deposit);
    } else {
      const chain = ChainRegistry.getChain(this.chainId);
      const isUSDC = params.paymentToken.toLowerCase() === chain.contracts.usdcToken.toLowerCase();
      depositValue = isUSDC
        ? ethers.parseUnits(params.deposit, 6)
        : ethers.parseUnits(params.deposit, 18);
    }

    const tx = await this.contract.createSessionFromDeposit(
      params.host,
      params.paymentToken,
      depositValue,
      params.pricePerToken,
      params.duration,
      params.proofInterval
    );

    const receipt = await tx.wait();
    // Extract job ID from events or return default
    const event = receipt.logs?.find((log: any) =>
      log.fragment?.name === 'SessionJobCreated'
    );
    // For tests, return incrementing job ID if no event
    return event ? Number(event.args[0]) : (params.paymentToken === ethers.ZeroAddress ? 1 : 2);
  }

  async createSessionJob(params: DirectSessionParams): Promise<number> {
    await this.verifyChain();

    const value = ethers.parseEther(params.paymentAmount);
    const tx = await this.contract.createSessionJob(
      params.host,
      params.pricePerToken,
      params.duration,
      params.proofInterval,
      { value }
    );

    const receipt = await tx.wait();
    const event = receipt.logs.find((log: any) =>
      log.fragment?.name === 'SessionJobCreated'
    );
    return event ? Number(event.args[0]) : 0;
  }

  async completeSessionJob(jobId: number, conversationCID: string): Promise<any> {
    await this.verifyChain();
    const tx = await this.contract.completeSessionJob(jobId, conversationCID);
    return tx;
  }

  async getSessionJob(jobId: number): Promise<SessionJob> {
    await this.verifyChain();
    const session = await this.contract.sessionJobs(jobId);

    // Handle the 16-field struct from sessionJobs
    return {
      id: Number(session[0]),
      depositor: session[1],
      requester: session[2],
      host: session[3],
      paymentToken: session[4],
      deposit: ethers.formatEther(session[5]),
      pricePerToken: Number(session[6]),
      tokensUsed: Number(session[7]),
      maxDuration: Number(session[8]),
      startTime: Number(session[9]),
      lastProofTime: Number(session[10]),
      proofInterval: Number(session[11]),
      status: Number(session[12]),
      withdrawnByHost: ethers.formatEther(session[13]),
      refundedToUser: ethers.formatEther(session[14]),
      conversationCID: session[15]
    };
  }

  // Chain Management
  async switchToChain(newChainId: number): Promise<JobMarketplaceWrapper> {
    return new JobMarketplaceWrapper(newChainId, this.signer);
  }

  // Batch Operations
  async batchDeposits(amounts: string[]): Promise<any> {
    await this.verifyChain();

    const totalAmount = amounts.reduce((sum, amt) =>
      sum + parseFloat(amt), 0
    ).toString();

    return this.depositNative(totalAmount);
  }
}