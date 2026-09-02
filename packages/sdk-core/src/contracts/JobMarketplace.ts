// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { ethers, Signer, Contract, Provider, dataSlice, toBigInt, getAddress, getBytes } from 'ethers';
import { SDKError } from '../errors';
import { ChainRegistry } from '../config/ChainRegistry';
import { ChainId } from '../types/chain.types';
import {
  UnsupportedChainError,
  ChainMismatchError,
  InsufficientDepositError
} from '../errors/ChainErrors';
// Use Upgradeable CLIENT-ABI which has model-specific functions and UUPS support
import JobMarketplaceABI from './abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json';

// AUDIT-F3: Proof timeout constants (in seconds)
export const MIN_PROOF_TIMEOUT = 60;       // 1 minute minimum
export const MAX_PROOF_TIMEOUT = 3600;     // 1 hour maximum
export const DEFAULT_PROOF_TIMEOUT = 300;  // 5 minutes (recommended)

export interface SessionCreationParams {
  host: string;
  paymentToken: string;
  deposit: string;
  pricePerToken: number;
  duration: number;
  proofInterval: number;
  /** AUDIT-F3: Timeout window in seconds (60-3600, default 300) */
  proofTimeoutWindow?: number;
  modelId: string;  // Required bytes32 model ID — Phase 18: modelless sessions removed
}

export interface DirectSessionParams {
  host: string;
  pricePerToken: number;
  duration: number;
  proofInterval: number;
  /** AUDIT-F3: Timeout window in seconds (60-3600, default 300) */
  proofTimeoutWindow?: number;
  paymentAmount: string;
  modelId: string;  // Required bytes32 model ID — Phase 18: modelless sessions removed
}

/**
 * Map an ethers Result of `sessionJobs(jobId)` to a SessionJob, by FIELD NAME against the
 * verified 18-output ABI (JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json), never by
 * index. History: the old index mapping assumed a phantom `requester` at [2] and shifted
 * every later field (host ← paymentToken, deposit ← pricePerToken, …) — found from both
 * sides of the seam 2026-08-23 and pinned here by a LIVE byte fixture
 * (tests/contracts/fixtures/sessionjobs_931.hex). Money fields are raw base-unit strings;
 * proofInterval is a TOKEN count, proofTimeoutWindow is SECONDS — easy to invert, don't.
 */
export function mapSessionJob(r: any): SessionJob {
  return {
    id: Number(r.id),
    depositor: r.depositor,
    requester: r.depositor, // deprecated alias — the deployed struct has no requester
    host: r.host,
    paymentToken: r.paymentToken,
    deposit: r.deposit.toString(),
    pricePerToken: Number(r.pricePerToken),
    tokensUsed: Number(r.tokensUsed),
    maxDuration: Number(r.maxDuration),
    startTime: Number(r.startTime),
    lastProofTime: Number(r.lastProofTime),
    proofInterval: Number(r.proofInterval),
    proofTimeoutWindow: Number(r.proofTimeoutWindow),
    status: Number(r.status),
    withdrawnByHost: r.withdrawnByHost.toString(),
    refundedToUser: r.refundedToUser.toString(),
    conversationCID: r.conversationCID,
  };
}

/**
 * The STATIC head of the deployed `sessionJobs` struct, decoded from RAW words (A.3 pre-flight
 * read for adopted sessions). Every number is a bigint — no `Number()` narrowing on the money
 * path — and the decode FAILS CLOSED on any layout drift. See {@link decodeSessionJobWords}.
 */
export interface OnChainSessionJob {
  id: bigint;
  depositor: string;
  host: string;
  paymentToken: string;
  /** Base units of `paymentToken`. */
  deposit: bigint;
  pricePerToken: bigint;
  tokensUsed: bigint;
  /** SECONDS. */
  maxDuration: bigint;
  startTime: bigint;
  lastProofTime: bigint;
  /** TOKENS — not seconds. */
  proofInterval: bigint;
  /** SECONDS — not tokens. */
  proofTimeoutWindow: bigint;
  /** 0 = Active, 1 = Completed, 2 = TimedOut. */
  status: number;
}

/** The output names the wrapper's Interface decodes `sessionJobs` with — read off the ABI PRODUCTION
 *  imports, so a test can pin them (a swap to the 16-output sibling shifts every field from `host`). */
export const SESSION_JOBS_OUTPUT_NAMES: string[] = new ethers.Interface(JobMarketplaceABI)
  .getFunction('sessionJobs')!.outputs.map((o) => o.name);

/** Head slots in the DEPLOYED `sessionJobs` layout (pinned by the live 931 byte fixture). */
export const SESSION_JOB_HEAD_WORDS = 18;
const SESSION_JOB_HEAD_BYTES = SESSION_JOB_HEAD_WORDS * 32;      // 576
const FIRST_TAIL_OFFSET = BigInt(SESSION_JOB_HEAD_BYTES);          // slot 15 must hold exactly this
const SECOND_TAIL_MIN_OFFSET = FIRST_TAIL_OFFSET + 32n;            // after the first tail's length word
const ZERO_HIGH_BYTES = '0x' + '00'.repeat(12);                    // an address slot's top 12 bytes

/**
 * Decode the static head of a raw `sessionJobs(jobId)` return against the deployed 18-slot
 * layout, failing CLOSED.
 *
 * Why not the ABI decode: this repo carries THREE JobMarketplace ABIs whose `sessionJobs`
 * output has 15, 17 and 18 fields. A named decode is only as right as the ABI file it was
 * handed, and the 17-field one (no `proofTimeoutWindow`) decodes these same bytes with every
 * field from `status` onward shifted — silently, for the static fields. The design doc calls
 * that the 17-field decode trap and requires A.3's read to fail closed. Three layout pins do
 * that here, independent of any ABI file:
 *  · slot 15 is the offset of the FIRST dynamic field (`conversationCID`) and must equal the
 *    head size, 18 × 32 = 576 — in a 17-slot layout that slot holds `lastProofHash`;
 *  · slot 17 (`lastProofCID` offset) must land after the first tail and inside the data;
 *  · `status` must be one of the three enum values — a shifted slot is a token count.
 * Word layout: w0 id · w1 depositor · w2 host · w3 paymentToken · w4 deposit · w5 pricePerToken
 * · w6 tokensUsed · w7 maxDuration · w8 startTime · w9 lastProofTime · w10 proofInterval(TOKENS)
 * · w11 proofTimeoutWindow(SECONDS) · w12 status · w13 withdrawnByHost · w14 refundedToUser ·
 * w15 conversationCID(offset) · w16 lastProofHash · w17 lastProofCID(offset).
 */
export function decodeSessionJobWords(data: string): OnChainSessionJob {
  const bytes = getBytes(data);          // parse the hex ONCE; every slice below copies 32 bytes, not the whole return
  const len = bytes.length;
  const bail = (why: string): never => {
    throw new SDKError(`sessionJobs ${why}`, 'SESSION_JOB_LAYOUT_MISMATCH');
  };
  // Two dynamic tails follow the head, each at least a length word.
  if (len < SESSION_JOB_HEAD_BYTES + 64) {
    bail(`return is ${len} bytes; the deployed 18-slot layout needs at least ${SESSION_JOB_HEAD_BYTES + 64}`);
  }
  const word = (i: number): bigint => toBigInt(dataSlice(bytes, i * 32, (i + 1) * 32));
  const addr = (i: number): string => {
    if (dataSlice(bytes, i * 32, i * 32 + 12) !== ZERO_HIGH_BYTES) bail(`slot ${i} is not an address — layout mismatch`);
    return getAddress(dataSlice(bytes, i * 32 + 12, (i + 1) * 32));
  };
  const firstTail = word(15);
  if (firstTail !== FIRST_TAIL_OFFSET) {
    bail(`return does not match the deployed 18-slot layout (first dynamic offset ${firstTail} != ${SESSION_JOB_HEAD_BYTES})`);
  }
  const secondTail = word(17);
  if (secondTail < SECOND_TAIL_MIN_OFFSET || secondTail >= BigInt(len)) {
    bail(`return does not match the deployed 18-slot layout (second dynamic offset ${secondTail} out of range)`);
  }
  const status = word(12);
  if (status > 2n) bail(`status slot holds ${status}; expected Active/Completed/TimedOut (0/1/2) — layout mismatch`);
  return {
    id: word(0), depositor: addr(1), host: addr(2), paymentToken: addr(3),
    deposit: word(4), pricePerToken: word(5), tokensUsed: word(6),
    maxDuration: word(7), startTime: word(8), lastProofTime: word(9),
    proofInterval: word(10), proofTimeoutWindow: word(11), status: Number(status),
  };
}

export interface SessionJob {
  id: number;
  depositor: string;
  /** @deprecated The deployed struct has NO requester field — this is an alias of `depositor`
   *  kept for compile compatibility. The old mapping put `host` here (the 2026-08-23 shift bug). */
  requester: string;
  host: string;
  paymentToken: string;
  /** Token BASE UNITS as a decimal string (wei for native, 6-dp for USDC) — never pre-formatted. */
  deposit: string;
  pricePerToken: number;
  tokensUsed: number;
  maxDuration: number;
  startTime: number;
  lastProofTime: number;
  proofInterval: number;
  /** AUDIT-F3: Timeout window for proof submissions */
  proofTimeoutWindow: number;
  status: number;
  withdrawnByHost: string;
  refundedToUser: string;
  conversationCID: string;
}

/**
 * Parameters for V2 direct payment delegated session.
 * Pulls USDC directly from payer's wallet via transferFrom.
 * USDC only - ETH not supported for delegation (ERC20Only error).
 * Caller (msg.sender) must be authorized via authorizeDelegate().
 */
export interface DelegatedSessionParams {
  /** Primary wallet address (whose USDC to use) */
  payer: string;
  /** Host address to create session with */
  host: string;
  /** Payment token address - Must be ERC-20 (USDC), NOT address(0) */
  paymentToken: string;
  /** Amount in token units (e.g., "10" for 10 USDC) */
  amount: string;
  /** Price per token in wei */
  pricePerToken: number;
  /** Maximum session duration in seconds */
  duration: number;
  /** Proof submission interval in seconds */
  proofInterval: number;
  /** AUDIT-F3: Timeout window in seconds (60-3600, default 300) */
  proofTimeoutWindow?: number;
  /** Model ID (bytes32) - Required — Phase 18: modelless sessions removed */
  modelId: string;
}

/** Validate proofTimeoutWindow is within allowed range */
function validateProofTimeoutWindow(timeout?: number): number {
  const value = timeout ?? DEFAULT_PROOF_TIMEOUT;
  if (value < MIN_PROOF_TIMEOUT || value > MAX_PROOF_TIMEOUT) {
    throw new Error(
      `proofTimeoutWindow must be between ${MIN_PROOF_TIMEOUT} and ${MAX_PROOF_TIMEOUT} seconds, got ${value}`
    );
  }
  return value;
}

export class JobMarketplaceWrapper {
  private readonly chainId: number;
  private readonly signer: Signer;
  /** Optional dedicated read provider (rpcUrl). The two session reads prefer it over the wallet. */
  private readonly readProvider?: Provider;
  private readonly contract: Contract;
  private readonly contractAddress: string;

  constructor(chainId: number, signer: Signer, readProvider?: Provider) {
    if (!ChainRegistry.isChainSupported(chainId)) {
      throw new UnsupportedChainError(chainId, ChainRegistry.getSupportedChains());
    }
    const chain = ChainRegistry.getChain(chainId);

    this.chainId = chainId;
    this.signer = signer;
    this.readProvider = readProvider;
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

    // AUDIT-F3: Validate and get proofTimeoutWindow
    const proofTimeoutWindow = validateProofTimeoutWindow(params.proofTimeoutWindow);

    // Phase 18: modelId is required — modelless session creation removed from contract
    if (!params.modelId) {
      throw new Error('modelId is required for session creation (Phase 18: modelless sessions removed)');
    }

    // Ensure all uint256 params are BigInt for unambiguous ABI encoding
    const priceBigInt = BigInt(params.pricePerToken);
    const durationBigInt = BigInt(params.duration);
    const proofIntervalBigInt = BigInt(params.proofInterval);
    const proofTimeoutBigInt = BigInt(proofTimeoutWindow);

    console.log(`[JobMarketplace] createSessionFromDepositForModel:`, {
      modelId: params.modelId, host: params.host, paymentToken: params.paymentToken,
      deposit: depositValue.toString(), pricePerToken: priceBigInt.toString(),
      duration: durationBigInt.toString(), proofInterval: proofIntervalBigInt.toString(),
      proofTimeoutWindow: proofTimeoutBigInt.toString(),
    });

    const tx = await this.contract.createSessionFromDepositForModel(
      params.modelId,
      params.host,
      params.paymentToken,
      depositValue,          // already bigint
      priceBigInt,           // uint256 — explicit bigint
      durationBigInt,        // uint256 — explicit bigint
      proofIntervalBigInt,   // uint256 — explicit bigint
      proofTimeoutBigInt     // uint256 — explicit bigint
    );
    const receipt = await tx.wait();
    const event = receipt.logs?.find((log: any) =>
      log.fragment?.name === 'SessionJobCreatedForModel' || log.fragment?.name === 'SessionCreatedByDepositor'
    );
    return event ? Number(event.args?.sessionId || event.args[0]) : 0;
  }

  async createSessionJob(params: DirectSessionParams & { paymentToken?: string }): Promise<number> {
    await this.verifyChain();

    // UUPS upgrade: Check if contract is paused before creating session
    const isPaused = await this.contract.paused();
    if (isPaused) {
      throw new Error('Contract is paused for maintenance - cannot create sessions');
    }

    // AUDIT-F3: Validate and get proofTimeoutWindow
    const proofTimeoutWindow = validateProofTimeoutWindow(params.proofTimeoutWindow);

    // Phase 18: modelId is required — modelless session creation removed from contract
    if (!params.modelId) {
      throw new Error('modelId is required for session creation (Phase 18: modelless sessions removed)');
    }

    // Check if we're using USDC or ETH
    const isUSDC = params.paymentToken && params.paymentToken !== ethers.ZeroAddress;

    if (isUSDC) {
      // For USDC, use createSessionJobForModelWithToken
      const amountInUSDC = ethers.parseUnits(params.paymentAmount, 6); // USDC has 6 decimals

      // Ensure all uint256 params are BigInt for unambiguous ABI encoding
      // (prevents Coinbase SubAccountSigner Go chain-proxy misinterpretation)
      const priceBigInt = BigInt(params.pricePerToken);
      const durationBigInt = BigInt(params.duration);
      const proofIntervalBigInt = BigInt(params.proofInterval);
      const proofTimeoutBigInt = BigInt(proofTimeoutWindow);

      console.log(`[JobMarketplace] createSessionJobForModelWithToken:`, {
        host: params.host, modelId: params.modelId, paymentToken: params.paymentToken,
        amount: amountInUSDC.toString(), pricePerToken: priceBigInt.toString(),
        duration: durationBigInt.toString(), proofInterval: proofIntervalBigInt.toString(),
        proofTimeoutWindow: proofTimeoutBigInt.toString(),
      });

      const tx = await this.contract.createSessionJobForModelWithToken(
        params.host,
        params.modelId,       // bytes32 model ID
        params.paymentToken,  // token address
        amountInUSDC,         // deposit amount (bigint)
        priceBigInt,          // uint256 — explicit bigint
        durationBigInt,       // uint256 — explicit bigint
        proofIntervalBigInt,  // uint256 — explicit bigint
        proofTimeoutBigInt    // uint256 — explicit bigint
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) =>
        log.fragment?.name === 'SessionJobCreated'
      );
      return event ? Number(event.args[0]) : 0;
    } else {
      // For ETH, use createSessionJobForModel
      const value = ethers.parseEther(params.paymentAmount);

      const priceBigInt = BigInt(params.pricePerToken);
      const durationBigInt = BigInt(params.duration);
      const proofIntervalBigInt = BigInt(params.proofInterval);
      const proofTimeoutBigInt = BigInt(proofTimeoutWindow);

      console.log(`[JobMarketplace] createSessionJobForModel:`, {
        host: params.host, modelId: params.modelId,
        value: value.toString(), pricePerToken: priceBigInt.toString(),
        duration: durationBigInt.toString(), proofInterval: proofIntervalBigInt.toString(),
        proofTimeoutWindow: proofTimeoutBigInt.toString(),
      });

      const tx = await this.contract.createSessionJobForModel(
        params.host,
        params.modelId,       // bytes32 model ID
        priceBigInt,          // uint256 — explicit bigint
        durationBigInt,       // uint256 — explicit bigint
        proofIntervalBigInt,  // uint256 — explicit bigint
        proofTimeoutBigInt,   // uint256 — explicit bigint
        { value }
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) =>
        log.fragment?.name === 'SessionJobCreated'
      );
      return event ? Number(event.args[0]) : 0;
    }
  }

  async completeSessionJob(jobId: number, conversationCID: string): Promise<any> {
    await this.verifyChain();
    const tx = await this.contract.completeSessionJob(jobId, conversationCID);
    return tx;
  }

  /** Reclaim a reserved deposit after proof timeout: triggerSessionTimeout(uint256 jobId). */
  async triggerSessionTimeout(jobId: number): Promise<any> {
    await this.verifyChain();
    const tx = await this.contract.triggerSessionTimeout(jobId);
    return tx;
  }

  /**
   * `minTokensFee()` — the fee a DEPOSITOR pays to complete their own zero-proof session early
   * (Open 8). Added for Training M0: the ABI already declared it (`abis/index.ts:61`) while no
   * accessor existed, so `TrainingManager` was calling a method this wrapper did not have.
   * Caught at CP1 by typing that dependency narrowly instead of as `any`.
   */
  async getMinTokensFee(): Promise<bigint> {
    await this.verifyChain();
    return this.contract.minTokensFee();
  }

  /** Per-token minimum session deposit (tokenMinDeposits mapping; admin-mutable — read, never hardcode). */
  async getTokenMinDeposit(token: string): Promise<bigint> {
    await this.verifyChain();
    return this.contract.tokenMinDeposits(token);
  }

  async getSessionJob(jobId: number): Promise<SessionJob> {
    await this.verifyChain();
    return mapSessionJob(await this.contract.sessionJobs(jobId));
  }

  /** The provider the two session reads use — the dedicated read provider when wired (1.38.1 moved
   *  discovery reads off the injected wallet; the pre-flight is the one read between a card charge
   *  and a spent session), else the signer's. Refused, typed, when neither exists. */
  private sessionReadProvider(): Provider {
    const provider = this.readProvider ?? this.signer.provider;
    if (!provider) throw new SDKError('No provider available for the session read', 'PROVIDER_ERROR');
    return provider;
  }

  /** `verifyChain()` against a specific provider — the one the read will use. */
  private async assertChainOn(provider: Provider): Promise<void> {
    const actualChainId = Number((await provider.getNetwork()).chainId);
    if (actualChainId !== this.chainId) {
      throw new ChainMismatchError(this.chainId, actualChainId, 'session read');
    }
  }

  /**
   * The A.3 pre-flight read for an ADOPTED session: `sessionJobs(jobId)` as raw words, decoded
   * drift-proof and failing CLOSED (see {@link decodeSessionJobWords}). One `eth_call`.
   */
  async getSessionJobOnChain(jobId: bigint): Promise<OnChainSessionJob> {
    const provider = this.sessionReadProvider();   // before the chain check, which dereferences the provider
    await this.assertChainOn(provider);
    const data = await provider.call({
      to: this.contractAddress,
      data: this.contract.interface.encodeFunctionData('sessionJobs', [jobId]),
    });
    return decodeSessionJobWords(data);
  }

  /** The bytes32 model id a session was created for (`sessionModel(jobId)`), over the same provider. */
  async getSessionModel(jobId: bigint): Promise<string> {
    const provider = this.sessionReadProvider();
    await this.assertChainOn(provider);
    const data = await provider.call({
      to: this.contractAddress,
      data: this.contract.interface.encodeFunctionData('sessionModel', [jobId]),
    });
    return this.contract.interface.decodeFunctionResult('sessionModel', data)[0] as string;
  }

  /**
   * Get proof submission details for a session
   *
   * @param sessionId - The session/job ID
   * @param proofIndex - Index of the proof submission (0-based)
   * @returns Proof submission result with proofHash, tokensClaimed, timestamp, verified, deltaCID
   */
  async getProofSubmission(
    sessionId: bigint,
    proofIndex: number
  ): Promise<{
    proofHash: string;
    tokensClaimed: bigint;
    timestamp: bigint;
    verified: boolean;
    deltaCID: string;  // Added in AUDIT remediation
  }> {
    await this.verifyChain();
    const [proofHash, tokensClaimed, timestamp, verified, deltaCID] =
      await this.contract.getProofSubmission(sessionId, proofIndex);
    return { proofHash, tokensClaimed, timestamp, verified, deltaCID };
  }

  // Chain Management
  async switchToChain(newChainId: number): Promise<JobMarketplaceWrapper> {
    return new JobMarketplaceWrapper(newChainId, this.signer, this.readProvider);   // keep the read/write split
  }

  // Batch Operations
  async batchDeposits(amounts: string[]): Promise<any> {
    await this.verifyChain();

    const totalAmount = amounts.reduce((sum, amt) =>
      sum + parseFloat(amt), 0
    ).toString();

    return this.depositNative(totalAmount);
  }

  // Delegation Methods

  /**
   * Authorize or revoke a delegate to create sessions on behalf of this account.
   * @param delegate Address to authorize (e.g., Smart Wallet sub-account)
   * @param authorized true to authorize, false to revoke
   * @returns Transaction object
   */
  async authorizeDelegate(delegate: string, authorized: boolean): Promise<any> {
    await this.verifyChain();

    if (!ethers.isAddress(delegate) || delegate === ethers.ZeroAddress) {
      throw new Error('Invalid delegate address');
    }

    const signerAddress = await this.signer.getAddress();
    if (delegate.toLowerCase() === signerAddress.toLowerCase()) {
      throw new Error('Cannot delegate to self');
    }

    const tx = await this.contract.authorizeDelegate(delegate, authorized);
    return tx;
  }

  /**
   * Check if a delegate is authorized to create sessions for a depositor.
   * @param depositor Address of the primary account (deposit owner)
   * @param delegate Address of the potential delegate (e.g., sub-account)
   * @returns true if delegate is authorized, false otherwise
   */
  async isDelegateAuthorized(depositor: string, delegate: string): Promise<boolean> {
    await this.verifyChain();
    return await this.contract.isDelegateAuthorized(depositor, delegate);
  }

  /**
   * Create model session as delegate - pulls USDC directly from payer's wallet.
   * V2 direct payment pattern - no escrow required.
   * Caller must be authorized via authorizeDelegate() first.
   * @param params Session parameters with payer address and modelId (required)
   * @returns Session ID
   * @throws NotDelegate if caller not authorized
   * @throws ERC20Only if paymentToken is address(0)
   */
  async createSessionForModelAsDelegate(params: DelegatedSessionParams): Promise<number> {
    await this.verifyChain();

    // Validate payer address
    if (!ethers.isAddress(params.payer) || params.payer === ethers.ZeroAddress) {
      throw new Error('Invalid payer address');
    }

    // Validate modelId is provided
    if (!params.modelId || params.modelId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      throw new Error('modelId is required for createSessionForModelAsDelegate');
    }

    // V2: ERC20Only - paymentToken must NOT be address(0)
    if (!params.paymentToken || params.paymentToken === ethers.ZeroAddress) {
      throw new Error('ERC20Only: paymentToken must be an ERC-20 token address (not address(0))');
    }

    // Convert amount based on token decimals (USDC = 6 decimals)
    const chain = ChainRegistry.getChain(this.chainId);
    const isUSDC = params.paymentToken.toLowerCase() === chain.contracts.usdcToken.toLowerCase();
    const amountValue = isUSDC
      ? ethers.parseUnits(params.amount, 6)
      : ethers.parseUnits(params.amount, 18);

    const proofTimeoutWindow = validateProofTimeoutWindow(params.proofTimeoutWindow);

    // Ensure all uint256 params are BigInt for unambiguous ABI encoding
    const priceBigInt = BigInt(params.pricePerToken);
    const durationBigInt = BigInt(params.duration);
    const proofIntervalBigInt = BigInt(params.proofInterval);
    const proofTimeoutBigInt = BigInt(proofTimeoutWindow);

    console.log(`[JobMarketplace] createSessionForModelAsDelegate:`, {
      payer: params.payer, modelId: params.modelId, host: params.host,
      paymentToken: params.paymentToken, amount: amountValue.toString(),
      pricePerToken: priceBigInt.toString(), duration: durationBigInt.toString(),
      proofInterval: proofIntervalBigInt.toString(), proofTimeoutWindow: proofTimeoutBigInt.toString(),
    });

    const tx = await this.contract.createSessionForModelAsDelegate(
      params.payer,
      params.modelId,
      params.host,
      params.paymentToken,
      amountValue,           // already bigint
      priceBigInt,           // uint256 — explicit bigint
      durationBigInt,        // uint256 — explicit bigint
      proofIntervalBigInt,   // uint256 — explicit bigint
      proofTimeoutBigInt     // uint256 — explicit bigint
    );

    const receipt = await tx.wait(3);
    const event = receipt.logs?.find((log: any) =>
      log.fragment?.name === 'SessionCreatedByDelegate'
    );
    return event ? Number(event.args?.sessionId || event.args[0]) : 0;
  }
}