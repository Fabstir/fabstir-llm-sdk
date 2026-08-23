// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// TrainingManager — LoRA/QLoRA fine-tune (M0). Mirrors LtxManager over the same encrypted rail.
// Wire and money shapes frozen in docs/node-reference/DESIGN-TRAINING-M0-INTERFACE.md v0.3.8
// (C.1/A.3 re-verified byte-identical to v0.3.6, at which this was written).
import { tokensToUsdc } from '../utils/transcode-utils';
import { trainingTokens } from '../utils/training-utils';
import { TrainingError } from '../errors/training-errors';
import type { TrainingJob } from '../types/training.types';

/**
 * The JobMarketplace surface this manager actually calls, typed NARROWLY on purpose.
 *
 * The sibling managers type this dependency as `any`, and that is precisely how a call to a
 * method the injected class does not have survived to review: `JobMarketplaceWrapper` carries
 * `getTokenMinDeposit` and `triggerSessionTimeout` but NOT `getMinTokensFee`, and `any` hides
 * it from tsc while a mocked test hides it from the suite. Naming the surface makes the wiring
 * site fail to compile instead of throwing at runtime.
 */
export interface TrainingJobMarketplace {
  /** `minTokensFee()` — the depositor-only early-self-complete fee (Open 8). */
  getMinTokensFee(): Promise<bigint>;
}

/** Dependencies for TrainingManager. Managers are typed loosely to avoid import cycles —
 *  EXCEPT `jobMarketplace`, see above. */
export interface TrainingManagerDeps {
  sessionManager?: any;
  storageManager?: any;
  paymentManager?: any;
  jobMarketplace?: TrainingJobMarketplace;
  hostManager?: any;
  /** Registered TRAINING model id (bytes32) — `keccak256("fabstir/training/" + templateId)` (A.2).
   *  This is the price key; never the templateHash. */
  trainingModelId: string;
  usdcAddress: string;
  chainId?: number;
}

export interface TrainingPriceEstimate {
  tokens: number;
  pricePerToken: bigint;
  /** floor(tokens × price / 1000) — the wire bill (C.1). */
  totalCostBaseUnits: string;
  /** max(on-chain floor, ceil(gross × 1.05)) — what the session is funded with. */
  depositBaseUnits: string;
  paymentToken: string;
}

type BillableJob = Pick<TrainingJob, 'epochs'> & { dataset: Pick<TrainingJob['dataset'], 'declaredTokens'> };

export class TrainingManager {
  private readonly sessionManager: any;
  private readonly storageManager: any;
  private readonly paymentManager: any;
  private readonly jobMarketplace?: TrainingJobMarketplace;
  private readonly hostManager: any;
  private readonly trainingModelId: string;
  private readonly usdcAddress: string;
  private readonly chainId?: number;

  constructor(deps: TrainingManagerDeps) {
    this.sessionManager = deps.sessionManager;
    this.storageManager = deps.storageManager;
    this.paymentManager = deps.paymentManager;
    this.jobMarketplace = deps.jobMarketplace;
    this.hostManager = deps.hostManager;
    this.trainingModelId = deps.trainingModelId;
    this.usdcAddress = deps.usdcAddress;
    this.chainId = deps.chainId;
  }

  /** `floor(trainingTokens × pricePerToken / 1000)` (C.1) — byte-identical to the shared
   *  `tokensToUsdc`, which is BigInt division and therefore already the floor. */
  estimateTrainingPrice(job: BillableJob, pricePerToken: bigint): bigint {
    return tokensToUsdc(trainingTokens(job), pricePerToken);
  }

  /**
   * `max(floor, ceil(gross × 1.05))` (C.1, "the LTX maths verbatim").
   *
   * Two pinned details. The uplift is applied to the ALREADY-FLOORED gross, not to the exact
   * quotient — the two orderings disagree on ~54% of totals above the deposit floor, and
   * `LtxManager.ts:148` (which C.1 defers to) pads `est.totalCostBaseUnits`. And the ceil is
   * integer BigInt, so no float ever touches the money path.
   */
  computeTrainingDeposit(gross: bigint, minDeposit: bigint): bigint {
    const padded = (gross * 105n + 99n) / 100n;
    return padded > minDeposit ? padded : minDeposit;
  }

  /**
   * Price a job against the host's ON-CHAIN registered price for the training model id, and size
   * the deposit. The 5% buffer is also what makes A.3's headroom check
   * (`depositAmount × 1000 / pricePerToken − tokensUsed ≥ trainingTokens`) safe: the doc never
   * pins that division's rounding, and it only fails to matter because the buffer dominates it.
   */
  async estimateTrainingCost(
    job: BillableJob, hostAddress: string, paymentToken?: string,
  ): Promise<TrainingPriceEstimate> {
    if (!this.sessionManager || !this.paymentManager) {
      throw new TrainingError(
        'SessionManager/PaymentManager not available for estimateTrainingCost', 'ESTIMATE_MISMATCH',
      );
    }
    const token = paymentToken ?? this.usdcAddress;
    const tokens = trainingTokens(job);
    const pricePerToken: bigint = await this.sessionManager.resolveModelPricePerToken(
      hostAddress, this.trainingModelId, token,
    );
    if (!pricePerToken || pricePerToken <= 0n) {
      throw new TrainingError(
        `No on-chain training price for model ${this.trainingModelId} (token ${token})`,
        'ESTIMATE_MISMATCH',
      );
    }
    const gross = tokensToUsdc(tokens, pricePerToken);
    // Read on chain, never assumed: C.1 says "0.5 USDC floor" but never states it in base units,
    // and the contract's minimum is admin-mutable.
    const minDeposit: bigint = await this.paymentManager.getTokenMinDeposit(token, this.chainId);
    return {
      tokens,
      pricePerToken,
      totalCostBaseUnits: gross.toString(),
      depositBaseUnits: this.computeTrainingDeposit(gross, minDeposit).toString(),
      paymentToken: token,
    };
  }

  /**
   * The contract's `minTokensFee`, read live — the fee a DEPOSITOR pays for completing their own
   * zero-proof session early. Surfaced so the cost is never a surprise (Open 8).
   *
   * ⚠️ NAMING: this is NOT a fee for cancelling a training run. `train_cancel` settles via the
   * NODE, which is a host-initiated complete, and `completedBy == session.depositor` is one of the
   * four ANDed gates (`sol:701`) — so cancelling a run can never charge it, and neither can the
   * `triggerSessionTimeout` path (status = TimedOut, not Completed). It applies ONLY when the
   * depositor calls `completeSessionJob` themselves on a session with zero landed proofs, while
   * the fee is non-zero. One landed proof makes a session permanently immune. Do not present this
   * beside a cancel control: users would read it as exactly the opposite of what it is.
   *
   * The value is `0` on the live chain today, and its UNIT is not stated anywhere in the frozen
   * doc — so return it raw and never currency-format it against a guessed unit.
   */
  async getEarlySelfCompleteFee(): Promise<bigint> {
    if (typeof this.jobMarketplace?.getMinTokensFee !== 'function') {
      // Explicit rather than a TypeError from a missing method: the standard JobMarketplace
      // wrapper does NOT carry this call today (see TrainingJobMarketplace above), so a caller
      // that wires the usual dependency gets a named error naming the missing surface.
      throw new TrainingError(
        'jobMarketplace dependency does not provide getMinTokensFee() — the early self-complete '
        + 'fee cannot be read', 'ESTIMATE_MISMATCH', { reason: 'missingDependencyMethod' },
      );
    }
    return this.jobMarketplace.getMinTokensFee();
  }
}
