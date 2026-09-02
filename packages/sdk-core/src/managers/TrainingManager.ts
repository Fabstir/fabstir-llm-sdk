// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// TrainingManager — LoRA/QLoRA fine-tune (M0). Mirrors LtxManager over the same encrypted rail.
// Wire and money shapes frozen in docs/node-reference/DESIGN-TRAINING-M0-INTERFACE.md v0.3.12
// (C.1/A.3 re-verified byte-identical to v0.3.6, at which this was written).
import { formatUnits } from 'ethers';
import { tokensToUsdc } from '../utils/transcode-utils';
import {
  trainingTokens, trainingSigDigest, recoverTrainingSigner, trainingInputCommitment,
} from '../utils/training-utils';
import type { TrainingCommitmentInput } from '../utils/training-utils';
import {
  manifestSha256, canonicaliseManifest, splitShards, reassembleShards, validateJsonlTextV1,
  verifyPlausibility,
} from '../utils/training-shard';
import { countDatasetTokens } from '../utils/training-count';
import { PLAUSIBILITY_MAX_BYTES_PER_TOKEN } from '../utils/training-shard';
import type { TrainingTokenizer } from '../utils/training-count';
import {
  TrainingError, ADOPTED_SESSION_PARAMS_REASON, EXISTING_SESSION_CONFIG_REASON, SESSION_DECODE_REASON,
} from '../errors/training-errors';
import { normalizeNodeHttpUrl } from '../utils/validation';
import { assertTrainingJobWireShape } from '../types/training.types';
import { SDKError } from '../errors';
import type { OnChainSessionJob } from '../contracts/JobMarketplace';
import type {
  TrainingJob, TrainingBundleSection, TrainingSliceAttestation, ManifestPointer,
  ArtifactManifestV1, ManifestFileEntry, DatasetManifestV1,
} from '../types/training.types';
import type { TrainingHandle, TrainingPointerRecord } from '../utils/training-ws';
import type { ITrainingManager } from '../interfaces/ITrainingManager';

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
  /** The lost-zero-settle backstop. Already wrapped at `contracts/JobMarketplace.ts:428`, so
   *  this is a call site, not new plumbing. Optional: not every caller wires it. */
  triggerSessionTimeout?(jobId: number): Promise<unknown>;
  /** A.3 pre-flight on an ADOPTED session: `sessionJobs` from RAW words against the deployed
   *  18-slot layout, failing CLOSED on drift. REQUIRED (the wrapper carries both): a missing
   *  method is a compile error here, and a runtime refusal for JS callers — never a skipped check. */
  getSessionJobOnChain(jobId: bigint): Promise<OnChainSessionJob>;
  getSessionModel(jobId: bigint): Promise<string>;
}

/** M0's `TRAIN_JOB_TIMEOUT_SECS` (A.3 / § schedule). The node's is deployable — override via
 *  `TrainingManagerDeps.trainJobTimeoutSecs` (`config.trainingJobTimeoutSecs` on the SDK).
 *  TODO(bundle): this is a per-HOST precondition the client is held to and cannot read — the same
 *  class as `alphas`/`tokenizerSha256`, which A.4 gained at the SDK's request. Resolve
 *  bundle → dep → this constant once the bundle publishes it. */
export const TRAIN_JOB_TIMEOUT_SECS = 12600;
/** A.3's settle margin: dispute window + completion tx. */
export const A3_SETTLE_MARGIN_SECS = 600;
/** A.3's `proofTimeoutWindow` floor. The frozen doc pins it at the on-chain `MAX_PROOF_TIMEOUT`
 *  (3600, live-probed) — two authorities that agree today; a test asserts the parity so that
 *  whichever moves first is noticed. Deliberately NOT an alias of the chain constant. */
export const A3_MIN_PROOF_TIMEOUT_WINDOW_SECS = 3600;
const A3_MIN_PROOF_TIMEOUT_WINDOW = BigInt(A3_MIN_PROOF_TIMEOUT_WINDOW_SECS);

const errMessage = (e: unknown): string => (e as { message?: string })?.message ?? String(e);

/** SDKError codes that mean "the wire", not "our wiring" — the only foreign class that stays retryable. */
/**
 * ethers v6 codes for "the chain could not be READ" on the pre-flight reads (session, model, price).
 * Nothing about the session is known or consumed, so they are transport (retry the same session), not
 * sessionDecode.
 */
export const RPC_TRANSIENT_CODES = new Set(['NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR']);

const MAX_UINT256 = (1n << 256n) - 1n;

export const TRANSPORT_SDK_CODES = new Set([
  'WS_CONNECTION_ERROR', 'WS_CREATE_ERROR', 'WS_TIMEOUT', 'WS_NOT_CONNECTED', 'WS_SEND_ERROR',
  'WS_RECONNECT_FAILED', 'SESSION_INIT_ERROR', 'SESSION_AUTH_UNREACHABLE', 'RESPONSE_TIMEOUT',
  // The host could not be reached for its public key during the init — the wire, not our wiring.
  'HOST_PUBKEY_UNAVAILABLE', 'NO_API_URL',
]);

/** Vault / card path: the session a fiat service minted (`POST /fiat/session`) for the SDK to adopt. */
export interface TrainingExistingSession {
  /** bigint, or the JSON forms `/fiat/session` hands a browser: a safe integer or a decimal string. */
  sessionId: bigint | number | string;
  jobId: bigint | number | string;
}

/** The ids every failure after adoption / after the deposit carries. `adopted` says which path. */
type SessionIdTag = { sessionId: bigint | number | string; jobId: bigint | number | string; adopted: boolean };

/** One failing A.3 check, as reported in `detail.failed`. */
export interface A3CheckFailure { check: string; expected: string; actual: string }

/** `submitTraining` options — ONE definition, referenced by the class and the interface. */
export interface SubmitTrainingOptions {
  job: TrainingJob;
  bundle?: TrainingBundleSection;
  hostAddress: string;
  /** The host's plain http(s) base (the nodeHttpUrl used for postSessionAuth). Required on both paths. */
  endpoint: string;
  paymentToken?: string;
  chainId?: number;
  requestId?: string;
  onProgress?: (progress: unknown) => void;
  onSlice?: (slice: unknown) => void;
  persistPointer?: (record: TrainingPointerRecord) => void | Promise<void>;
  /** Vault / card path: adopt this session instead of creating one — no estimate-funded
   *  `startSession`, no approval, no wallet touch. `endpoint` is REQUIRED as the plain
   *  http(s):// node base (the `nodeHttpUrl` used for `postSessionAuth`); the caller must
   *  have delivered FC1.6 session-auth first. Accepted per call, never cached. */
  existingSession?: TrainingExistingSession;
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
  /** Overrides {@link TRAIN_JOB_TIMEOUT_SECS} for the A.3 remaining-lifetime pre-flight. */
  trainJobTimeoutSecs?: number;
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

export class TrainingManager implements ITrainingManager {
  private readonly sessionManager: any;
  private readonly storageManager: any;
  private readonly paymentManager: any;
  private readonly jobMarketplace?: TrainingJobMarketplace;
  private readonly hostManager: any;
  private readonly trainingModelId: string;
  private readonly usdcAddress: string;
  private readonly chainId?: number;
  private readonly trainJobTimeoutSecs: number;
  private hostSelectionService?: { getRankedHostsForModel(modelId: string, mode?: unknown): Promise<{ host: { address: string; apiUrl: string } }[]> };

  constructor(deps: TrainingManagerDeps) {
    this.sessionManager = deps.sessionManager;
    this.storageManager = deps.storageManager;
    this.paymentManager = deps.paymentManager;
    this.jobMarketplace = deps.jobMarketplace;
    this.hostManager = deps.hostManager;
    this.trainingModelId = deps.trainingModelId;
    this.usdcAddress = deps.usdcAddress;
    this.chainId = deps.chainId;
    this.trainJobTimeoutSecs = deps.trainJobTimeoutSecs ?? TRAIN_JOB_TIMEOUT_SECS;
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

  /**
   * A.4 pre-validation — the client-side numeric mirror of the node's own bounds.
   *
   * A.4 says this makes a post-escrow `VALIDATION_FAILED` "rare, not impossible": a host can
   * bump its allowlist while a client sits between validate and `train`. Rare only if the
   * client actually checks, and only BEFORE the deposit — after it, the same failure is a
   * funded session waiting on the C.3 zero-proof settle.
   */
  validateAgainstBundle(job: TrainingJob, bundle?: TrainingBundleSection): void {
    // ⚠️ The reason string decides `isReshoppable`, so it is not cosmetic. A.3's four pinned
    // reasons — `sessionParams`, `sessionReused`, `trainActive`, `datasetFormat` — describe the
    // JOB or the SESSION and recur identically on every host, so they make a job terminal.
    // A BUNDLE failure is the opposite: "this host does not advertise your template", "this
    // host's allowlist moved", "this host's bounds are too small" are all facts about THIS
    // HOST, and A.4 writes down exactly that case. Stamping them `sessionParams` retired jobs
    // another host would run. `hostBundle` is client-minted, never sent on the wire, and is
    // deliberately NOT one of the pinned four — so `isReshoppable` returns true.
    const fail = (message: string): never => {
      throw new TrainingError(message, 'VALIDATION_FAILED', { reason: 'hostBundle' });
    };
    if (!bundle?.templates || !bundle?.bounds) {
      return fail('host bundle carries no `training` section: a node with TRAIN_ENABLED=false '
        + 'OMITS it, so absence IS the capability advert (A.4/E.2) — this host cannot train');
    }
    const template = bundle.templates.find((t) => t.id === job.templateId);
    if (!template) return fail(`template ${job.templateId} is not advertised by this host`);
    // The id is a label; the HASH binds. A matching id over a drifted hash means the host runs
    // a different recipe from the one that was priced and committed to.
    if (String(template.hash).toLowerCase() !== job.templateHash.toLowerCase()) {
      return fail(`templateHash ${job.templateHash} != the host's advertised ${template.hash}`);
    }
    const b = bundle.bounds;
    const total = TrainingManager.checkedTrainingTokens(job);
    // The wire's own shape rules (lr format, seed, integrality) used to be checked only inside the transport,
    // AFTER adoption / escrow, and their refusal rode handle.result. A malformed job is OURS: refuse it here.
    assertTrainingJobWireShape(job);
    if (job.epochs > b.maxEpochs) return fail(`epochs ${job.epochs} exceeds maxEpochs ${b.maxEpochs}`);
    if (job.dataset.declaredTokens > b.maxDeclaredTokens) {
      return fail(`declaredTokens ${job.dataset.declaredTokens} exceeds ${b.maxDeclaredTokens}`);
    }
    // declaredTokens x epochs — the C.5 wall-clock cap, which bites where neither factor does.
    if (total > b.maxTotalTokens) return fail(`total ${total} exceeds maxTotalTokens ${b.maxTotalTokens}`);
    if (total < b.minTotalTokens) return fail(`total ${total} is below minTotalTokens ${b.minTotalTokens}`);
    if (job.dataset.samples > b.maxSamples) return fail(`samples ${job.dataset.samples} exceeds ${b.maxSamples}`);
    // ⚠️ REQUIRED, not optional. Without this entry there is no `sliceTokens`, and the whole
    // slice-level over-claim guard degrades to "trust the echo" — silently, on a funded run.
    // We cannot verify the schedule, so we refuse rather than spend money pretending we can.
    const per = b.perTemplate?.[job.templateId];
    if (!per) {
      return fail(`bundle publishes no perTemplate entry for ${job.templateId}: without its `
        + 'sliceTokens the slice schedule cannot be verified, so the over-claim guard would be disabled');
    }
    if (!per.ranks.includes(job.hyper.rank)) return fail(`rank ${job.hyper.rank} not in ${per.ranks.join(', ')}`);
    if (!per.seqLens.includes(job.hyper.seqLen)) return fail(`seqLen ${job.hyper.seqLen} not in ${per.seqLens.join(', ')}`);
    // `alphas` is OPTIONAL by design: it landed in v0.3.12, so a bundle emitted before the
    // template was re-authored carries none. Skipping when absent degrades the check rather
    // than rejecting every host that has not republished — the same rule as baseServingModelId.
    if (per.alphas && !per.alphas.includes(job.hyper.alpha)) {
      return fail(`alpha ${job.hyper.alpha} not in ${per.alphas.join(', ')}`);
    }
  }

  /**
   * Pre-validate, fund, submit. The ORDER is the money: validation is pre-escrow so a bounds
   * failure costs nothing, and the session carries training's own lifecycle parameters
   * (`duration 14400 / proofInterval 1000 / proofTimeoutWindow 3600` — `duration` is the key
   * startSession reads; a `maxDuration` key here was dead and minted 3600 s sessions) — the chat defaults
   * cannot carry a multi-hour run.
   *
   * With `opts.existingSession` (vault / card path) the session is adopted rather than created —
   * see {@link submitOnExistingSession}.
   */
  async submitTraining(opts: SubmitTrainingOptions): Promise<TrainingHandle> {
    if (opts.existingSession) {
      return this.submitOnExistingSession(opts, opts.existingSession);
    }
    this.validateAgainstBundle(opts.job, opts.bundle);
    const est = await this.estimateTrainingCost(opts.job, opts.hostAddress, opts.paymentToken);
    // `formatUnits(..., 6)` below is inherited verbatim from the LTX path and is correct for
    // USDC. It is SILENTLY wrong for any other decimal scale: an 18-decimal token under-funds
    // the deposit by 10^12, A.3's headroom check then fails POST-ESCROW, and the session is
    // consumed. M0's payment scope is USDC, so refuse rather than compute a number we cannot
    // justify. Widening this means reading the token's decimals, not changing the literal.
    if (est.paymentToken.toLowerCase() !== this.usdcAddress.toLowerCase()) {
      throw new TrainingError(
        `payment token ${est.paymentToken} is not the configured USDC (${this.usdcAddress}); `
        + 'the deposit is formatted at 6 decimals and M0 supports USDC only',
        'VALIDATION_FAILED', { reason: 'hostBundle' },
      );
    }
    // Pre-escrow: the socket cannot be derived without the endpoint, and after startSession the
    // deposit is locked — SESSION_ENDPOINT_MISSING used to surface only then, with no ids to reclaim by.
    if (!opts.endpoint) {
      throw new SDKError(
        "submitTraining requires the host's http(s) endpoint (opts.endpoint) — refused before any deposit",
        'SESSION_ENDPOINT_MISSING',
      );
    }
    // Validated and normalised by the same rule as the adopted path and the registry: a malformed base
    // (whitespace, a /v1 path, ws://) would pass a presence check, take the deposit, then mistarget the socket.
    const endpoint = normalizeNodeHttpUrl(opts.endpoint);
    if (!endpoint) {
      throw new SDKError(
        `submitTraining requires the host's plain http(s) base as opts.endpoint (the nodeHttpUrl used for postSessionAuth), got: ${String(opts.endpoint)} — refused before any deposit`,
        'SESSION_ENDPOINT_INVALID',
      );
    }
    const { sessionId, jobId } = await this.sessionManager.startSession({
      chainId: opts.chainId ?? this.chainId, host: opts.hostAddress, endpoint,
      modelId: this.trainingModelId, paymentToken: est.paymentToken,   // direct payment: approve + pay (no `useDeposit`)
      depositAmount: formatUnits(BigInt(est.depositBaseUnits), 6),
      // `duration` is the key SessionConfig/startSession read; `maxDuration` was silently ignored and the
      // session fell to PaymentManager's 3600 s default — a lifetime the node's A.3 rejects post-escrow.
      encryption: true, duration: 14400, proofInterval: 1000, proofTimeoutWindow: 3600,
    });
    // Money moved: from here every failure carries the ids the SDK just minted (adopted: false), classified
    // exactly as on the adopted path — the reclaim (`triggerSessionTimeout(Number(jobId))`) needs them.
    const minted: SessionIdTag = { sessionId, jobId, adopted: false };
    let handle: TrainingHandle;
    try {
      handle = await this.sessionManager.submitTraining(
        String(sessionId), opts.job, this.wsSubmitOptions(opts, est.pricePerToken),
      );
    } catch (err) {
      throw TrainingManager.withSessionIds(err, minted, true);
    }
    handle.sessionId = sessionId;
    handle.jobId = jobId;
    handle.result = handle.result.catch((err: unknown) => { throw TrainingManager.withSessionIds(err, minted, false); });
    handle.result.catch(() => {});
    return handle;
  }

  /**
   * The WS submit options, built ONCE for both paths. Without the last three the over-claim
   * guard degrades to "trust the echo" — the one thing constraint 5 exists to prevent — and the
   * copy that would be forgotten is the vault path, where the money has already moved.
   */
  private wsSubmitOptions(opts: SubmitTrainingOptions, pricePerToken: bigint) {
    const template = opts.bundle!.templates.find((t) => t.id === opts.job.templateId)!;
    return {
      requestId: opts.requestId, onProgress: opts.onProgress, onSlice: opts.onSlice,
      persistPointer: opts.persistPointer,
      onChainPricePerToken: pricePerToken.toString(),
      minAllowListVersion: template.minAllowListVersion,
      sliceTokens: opts.bundle!.bounds.perTemplate?.[opts.job.templateId]?.sliceTokens,
    };
  }

  /** The reclaim tag every adopted-path failure carries: `{ sessionId, jobId, adopted: true }`. */
  private static adoptedIds(e: TrainingExistingSession): SessionIdTag {
    return { sessionId: e.sessionId, jobId: e.jobId, adopted: true };
  }

  /**
   * The ids as bigints, or a typed refusal. `/fiat/session` hands the UI JSON, so a safe integer or a
   * decimal string is as valid as a bigint; anything else used to be refused as `exists` ("expected job
   * 2290 … got id 2290") — a fresh session bought for a type mismatch.
   */
  private static normalizeExistingSession(e: TrainingExistingSession | undefined): { sessionId: bigint; jobId: bigint } {
    const asId = (v: unknown, name: string): bigint => {
      const shaped = typeof v === 'bigint' ? v >= 0n
        : typeof v === 'number' ? Number.isSafeInteger(v) && v >= 0
        : typeof v === 'string' && /^\d+$/.test(v);
      // uint256 is the on-chain type: a larger value would pass here and fail the read as sessionDecode.
      const n = shaped ? BigInt(v as bigint | number | string) : -1n;
      if (!shaped || n > MAX_UINT256) {
        throw new TrainingError(
          `existingSession.${name} must be a non-negative uint256 (bigint, safe integer or decimal string), got ${String(v)}`,
          'VALIDATION_FAILED',
          { reason: EXISTING_SESSION_CONFIG_REASON, consumed: false, sessionId: e?.sessionId, jobId: e?.jobId, adopted: true },
        );
      }
      return n;
    };
    return { sessionId: asId(e?.sessionId, 'sessionId'), jobId: asId(e?.jobId, 'jobId') };
  }

  private static failMissingDependency(what: string, ids: SessionIdTag): never {
    throw new TrainingError(
      `${what} — the existingSession path FAILS CLOSED rather than proceeding unchecked`,
      'ESTIMATE_MISMATCH', { reason: 'missingDependencyMethod', consumed: false, ...ids },
    );
  }

  /**
   * The A.3 decision, pure: every failing check in evaluation order (so `failed[0]` is stable),
   * over values already read. Six node-side rules plus one the node never needs but the client
   * does — the session's `host` must be the host being connected to: the node IS the host, so
   * it cannot get that wrong; a client can, and a session bound to X submitted to Y is a spent
   * session at Y. Reported all at once, not first-only: the live fiat shape fails two.
   */
  private static a3Failures(input: {
    session: OnChainSessionJob; jobId: bigint; model: string; price: bigint | string; needTokens: bigint;
    hostAddress: string; trainingModelId: string; remainingSecs: number; floorSecs: number;
  }): A3CheckFailure[] {
    const { session, jobId, model, price, needTokens, hostAddress, trainingModelId, remainingSecs, floorSecs } = input;
    const failed: A3CheckFailure[] = [];
    const fail = (check: string, expected: unknown, actual: unknown): void => {
      failed.push({ check, expected: String(expected), actual: String(actual) });
    };
    // A missing key on a public mapping decodes as the ZERO struct — zero values with real tail
    // offsets (640 bytes), so every layout pin is satisfied and status 0 = Active. Name it, or the
    // refusal blames `host`.
    if (session.id !== jobId) {
      fail('exists', `job ${jobId} on this JobMarketplace`, session.id === 0n ? 'no such job (zero struct)' : `id ${session.id}`);
    }
    if (session.status !== 0) fail('status', 'Active (0)', session.status);
    // Documented order (D5, SDK_API, the reply): status, model, host, … — `detail.check` is "the first".
    if (model.toLowerCase() !== trainingModelId.toLowerCase()) fail('model', trainingModelId, model);
    if (session.host.toLowerCase() !== hostAddress.toLowerCase()) fail('host', hostAddress, session.host);
    if (typeof price === 'string') fail('price', 'a registered price for this host, model and token', price);
    else if (price !== session.pricePerToken) fail('price', price, session.pricePerToken);
    const headroom = session.pricePerToken > 0n
      ? session.deposit * 1000n / session.pricePerToken - session.tokensUsed
      : 0n;
    if (headroom < needTokens) fail('headroom', `>= ${needTokens} tokens`, `${headroom} tokens`);
    if (remainingSecs < floorSecs) fail('lifetime', `>= ${floorSecs} s remaining`, `${remainingSecs} s`);
    if (session.proofTimeoutWindow < A3_MIN_PROOF_TIMEOUT_WINDOW) {
      fail('proofTimeoutWindow', `>= ${A3_MIN_PROOF_TIMEOUT_WINDOW_SECS} s`, `${session.proofTimeoutWindow} s`);
    }
    return failed;
  }

  /**
   * The check only the SDK can make: A.3 pre-flight on an ADOPTED session.
   *
   * On the wallet path the SDK creates the session, so its parameters are right by
   * construction. On the vault path a service created it with ITS constants (today
   * `maxDuration 3600 / proofTimeoutWindow 300`), and the node's A.3 then rejects `train`
   * AFTER escrow — the session is spent (one `train` per session, ever) and the deposit waits
   * on the zero-proof settle. So the same maths runs here, BEFORE `train`, against the on-chain
   * session decoded drift-proof (fails CLOSED — a decoder that fails open is the exact hole
   * A.3 exists to close), and every refusal carries `{ sessionId, jobId }` for reclaim.
   *
   * Latency matters: the accept latitude is 1,200 s from session creation (14400 − 12600 −
   * 600), so this is RPC reads only — the session and model in parallel, then the price for
   * the session's own token. No S5 traffic, no bundle re-fetch. The lifetime check uses the
   * client clock; the node re-checks on block time.
   *
   * A refusal is `VALIDATION_FAILED` / {@link ADOPTED_SESSION_PARAMS_REASON} — distinct from
   * the node's terminal `sessionParams` because here the JOB is fine and the recourse is a
   * fresh, correctly shaped session for the same job.
   */
  /**
   * trainingTokens(job) as a bigint-safe count. NaN compares false against every bound and a fraction
   * passes them all; both then throw a raw RangeError out of BigInt() on the money path. A malformed
   * job is OURS — terminal. Public callers of the pre-flight get the same typed refusal, with the ids.
   */
  private static checkedTrainingTokens(job: TrainingJob, tag: Record<string, unknown> = {}): number {
    const total = trainingTokens(job);
    if (!Number.isSafeInteger(total) || total <= 0) {
      throw new TrainingError(
        `declaredTokens × epochs must be a positive whole number, got ${total}`,
        'VALIDATION_FAILED', { reason: 'numericWireRule', ...tag },
      );
    }
    return total;
  }

  async validateExistingSession(
    existing: TrainingExistingSession, job: TrainingJob, hostAddress: string,
  ): Promise<{ session: OnChainSessionJob; pricePerToken: bigint; acceptLatitudeSecs: number }> {
    const norm = TrainingManager.normalizeExistingSession(existing);
    const ids = TrainingManager.adoptedIds(norm);
    const jm = this.jobMarketplace;
    if (typeof jm?.getSessionJobOnChain !== 'function' || typeof jm?.getSessionModel !== 'function') {
      TrainingManager.failMissingDependency(
        'jobMarketplace does not provide getSessionJobOnChain()/getSessionModel(), so the A.3 pre-flight cannot run', ids,
      );
    }
    // This method is public: a UI may call it before submit, outside the submit envelope, so every
    // refusal it can make is typed and id-tagged here.
    if (typeof this.sessionManager?.resolveModelPricePerToken !== 'function') {
      TrainingManager.failMissingDependency('SessionManager does not provide resolveModelPricePerToken(), so the price check cannot run', ids);
    }
    const needTokens = BigInt(TrainingManager.checkedTrainingTokens(job, { ...ids, consumed: false }));   // before any read
    // Nothing thrown here consumed the session (`consumed: false`); the read failures split in two:
    // the chain could not be READ (transport — retry the same session) vs the bytes were read and did not
    // decode (sessionDecode — ours, terminal).
    const decodeFailure = (what: string) => (e: unknown): never => {
      const code = (e as { code?: string })?.code;
      if (code && RPC_TRANSIENT_CODES.has(code)) {
        throw new TrainingError(
          `could not reach the chain to read ${what} for job ${norm.jobId}: ${errMessage(e)}`,
          'SIDECAR_UNAVAILABLE', { reason: 'transport', consumed: false, cause: e, sdkCode: code, ...ids },
        );
      }
      throw new TrainingError(
        `could not read ${what} for job ${norm.jobId} on chain: ${errMessage(e)}`,
        'ESTIMATE_MISMATCH', { reason: SESSION_DECODE_REASON, consumed: false, cause: e, ...ids },
      );
    };
    const [session, model] = await Promise.all([
      jm.getSessionJobOnChain(norm.jobId).catch(decodeFailure('sessionJobs')),
      jm.getSessionModel(norm.jobId).catch(decodeFailure('sessionModel')),
    ]);
    // Priced for the SESSION's token, so "pricePerToken == registered price" and "the payment
    // token is one the host prices" are one read. bigint = the price; string = why there is none
    // (a check failure, not an exception).
    const noPrice = `no registered price for token ${session.paymentToken}`;
    const price: bigint | string = await this.sessionManager
      .resolveModelPricePerToken(hostAddress, this.trainingModelId, session.paymentToken)
      .then((p: bigint) => (p && p > 0n ? p : noPrice))
      // HostManager THROWS ZERO_MODEL_PRICE rather than returning 0n: that is the host's own "no
      // price" and a fact about the session. Anything else — RPC, wiring — is a failed READ, and
      // reporting it as adoptedSessionParams would send a card user to a second /fiat/session.
      .catch((e: unknown) => ((e as { code?: string })?.code === 'ZERO_MODEL_PRICE' ? noPrice : decodeFailure('the registered price')(e)));
    const remainingSecs = Number(session.startTime + session.maxDuration) - Math.floor(Date.now() / 1000);
    const floorSecs = this.trainJobTimeoutSecs + A3_SETTLE_MARGIN_SECS;
    const failed = TrainingManager.a3Failures({
      session, jobId: norm.jobId, model, price, needTokens,
      hostAddress, trainingModelId: this.trainingModelId, remainingSecs, floorSecs,
    });
    // A string price is always a `failed` entry; naming it here is what narrows the return type.
    if (failed.length > 0 || typeof price === 'string') {
      throw new TrainingError(
        `adopted session ${norm.sessionId} cannot carry this job — `
        + failed.map((f) => `${f.check}: expected ${f.expected}, got ${f.actual}`).join('; ')
        + '. The session is untouched; the recourse is a fresh, correctly shaped session for the same job.',
        'VALIDATION_FAILED',
        { reason: ADOPTED_SESSION_PARAMS_REASON, check: failed[0].check, failed, ...ids },
      );
    }
    return { session, pricePerToken: price, acceptLatitudeSecs: remainingSecs - floorSecs };
  }

  /**
   * Vault / card path: adopt a session the SDK did not create, then submit exactly as the wallet
   * path does. The job is still validated — funds are already locked, so a doomed job wastes
   * vault money and spins a zero-proof settle cycle. Mirrors `LtxManager.adoptExistingSession`.
   */
  private async submitOnExistingSession(
    opts: SubmitTrainingOptions, given: TrainingExistingSession,
  ): Promise<TrainingHandle> {
    const existing = TrainingManager.normalizeExistingSession(given);   // a typed, id-tagged refusal on its own
    const ids = TrainingManager.adoptedIds(existing);
    // ONE envelope: every failure after this point — a guard, the bundle, the pre-flight, the
    // registry seed, the submit, a programming fault — leaves tagged with the reclaim ids.
    try {
      if (!this.sessionManager || typeof this.sessionManager.registerExternalSession !== 'function') {
        TrainingManager.failMissingDependency(
          'SessionManager does not implement registerExternalSession (the existingSession path needs a newer @fabstir/sdk-core)', ids,
        );
      }
      // Q8: ONE nodeHttpUrl serves both postSessionAuth and this call; the http(s)-only rule and
      // the normalisation live in normalizeNodeHttpUrl (shared with LtxManager and the registry).
      const endpoint = normalizeNodeHttpUrl(opts.endpoint);
      if (!endpoint) {
        throw new TrainingError(
          `existingSession requires a plain http(s):// node endpoint (the nodeHttpUrl used for postSessionAuth), got: ${String(opts.endpoint)}`,
          'VALIDATION_FAILED', { reason: EXISTING_SESSION_CONFIG_REASON, ...ids },
        );
      }
      const chainId = opts.chainId ?? this.chainId;
      if (chainId === undefined) {
        throw new TrainingError(
          'existingSession requires a chainId (opts.chainId or the SDK default)',
          'VALIDATION_FAILED', { reason: EXISTING_SESSION_CONFIG_REASON, ...ids },
        );
      }
      // The pre-flight reads the SDK's chain (its wrapper); the registry entry and the init frame would
      // carry opts.chainId. Verifying one chain's job and submitting to another is refused, not reconciled.
      if (this.chainId !== undefined && chainId !== this.chainId) {
        throw new TrainingError(
          `existingSession chainId ${chainId} is not the SDK's chain ${this.chainId}; call switchChain(${chainId}) first — the pre-flight reads the SDK's chain`,
          'VALIDATION_FAILED', { reason: EXISTING_SESSION_CONFIG_REASON, ...ids },
        );
      }
      this.validateAgainstBundle(opts.job, opts.bundle);
      const { pricePerToken } = await this.validateExistingSession(existing, opts.job, opts.hostAddress);
      this.sessionManager.registerExternalSession({
        sessionId: existing.sessionId, jobId: existing.jobId, endpoint,
        hostAddress: opts.hostAddress, model: this.trainingModelId, chainId,
      });
      const handle: TrainingHandle = await this.sessionManager.submitTraining(
        String(existing.sessionId), opts.job, this.wsSubmitOptions(opts, pricePerToken),
      );
      handle.sessionId = existing.sessionId;
      handle.jobId = existing.jobId;
      // The money moved before the SDK was called, so a LATE failure needs the ids as much as an
      // early one — the UI relays them to the service for reclaim.
      handle.result = handle.result.catch((err: unknown) => {
        throw TrainingManager.withSessionIds(err, ids, false);     // late: the node had the frame
      });
      // The re-wrap is a NEW promise; mark it handled (training-ws does the same for the original)
      // so a run that fails before the consumer attaches cannot become an unhandled rejection.
      handle.result.catch(() => {});
      return handle;
    } catch (err) {
      throw TrainingManager.withSessionIds(err, ids, true);        // pre-frame: nothing consumed
    }
  }

  /**
   * Re-throw with the reclaim tag in `detail`, preserving a TrainingError's code and detail (so
   * `isReshoppable`/`requiresFreshSession` read exactly as before). A foreign error is classified
   * by the SDK's own vocabulary, never flattened to something retryable:
   *  · a transport SDKError (WS_*, init timeout, auth unreachable) → `SIDECAR_UNAVAILABLE` /
   *    `transport` — zero-settle class, retryable, and on an adopted session "retry" is a fresh session;
   *  · our own wiring (SESSION_NOT_FOUND, ENCRYPTION_NOT_AVAILABLE, …) or a programming fault →
   *    `ESTIMATE_MISMATCH` / `missingDependency` — TERMINAL: another host reaches the identical
   *    failure, and a UI must not buy a second session to find that out (training-ws `mapCode`'s
   *    contract for unknowns: non-re-shoppable, original preserved).
   */
  /**
   * Tag a failure with the session ids and classify anything that is not already a TrainingError.
   * `preFrame` = raised before the `train` frame left: nothing on chain was consumed, so every such
   * failure carries `consumed: false` (requiresFreshSession → false) — EXCEPT adoptedSessionParams,
   * whose recourse IS a fresh, correctly shaped session. A late failure (the node had the frame) keeps
   * whatever the node's classes say.
   */
  private static withSessionIds(err: unknown, tag: SessionIdTag, preFrame: boolean): TrainingError {
    if (err instanceof TrainingError) {
      // CAPACITY is the node's one-in-flight rule: it consumes by definition, whichever promise it rode.
      const intact = preFrame && err.code !== 'CAPACITY' && err.detail?.reason !== ADOPTED_SESSION_PARAMS_REASON
        ? { consumed: false } : {};
      return new TrainingError(err.message, err.code, { ...intact, ...err.detail, ...tag });
    }
    // A raw (non-Training) error: pre-frame it consumed nothing; LATE (a consumer callback that threw after a
    // slice settled, a socket that died mid-run) the node had the frame, so nothing here may claim intactness.
    const intact = preFrame ? { consumed: false } : {};
    const sdkCode = (err as { code?: string })?.code;
    if (sdkCode && TRANSPORT_SDK_CODES.has(sdkCode)) {
      // Pre-frame, every transport code is raised BEFORE the `train` frame leaves: `consumed: false` makes
      // requiresFreshSession say "same session" — a fresh /fiat/session would be a second charge for nothing.
      return new TrainingError(errMessage(err), 'SIDECAR_UNAVAILABLE', { reason: 'transport', ...intact, cause: err, sdkCode, ...tag });
    }
    return new TrainingError(errMessage(err), 'ESTIMATE_MISMATCH', { reason: 'missingDependency', ...intact, cause: err, sdkCode, ...tag });
  }

  /**
   * Recompute B.5's digest, recover the signer, and — given the job's binding fields — recompute
   * B.4's `inputCommitment`, which the doc calls "the highest-value client check": proof the
   * host trained OUR exact job on OUR exact dataset.
   *
   * A valid signature alone does not give you that. A host can sign a perfectly well-formed
   * attestation over a DIFFERENT commitment — another dataset, other hyperparameters — and the
   * signature still verifies. `inputBindingValid` is `undefined` rather than `false` when no
   * binding is supplied, so "not checked" can never be mistaken for "checked and fine".
   *
   * An UNSIGNED attestation is ADVISORY in M0 (constraint 4): report it, never abort over it.
   */
  verifyTrainingSlice(att: TrainingSliceAttestation, binding?: TrainingCommitmentInput): {
    digest: string; signer: string | null; signatureValid: boolean; inputBindingValid?: boolean;
  } {
    const digest = trainingSigDigest(att);
    const signer = recoverTrainingSigner(att);
    return {
      digest,
      signer,
      signatureValid: signer !== null && signer.toLowerCase() === String(att.host).toLowerCase(),
      inputBindingValid: binding === undefined
        ? undefined
        : trainingInputCommitment(binding).toLowerCase() === String(att.inputCommitment).toLowerCase(),
    };
  }

  /**
   * Fetch an artifact manifest AND the named file, verifying all THREE hops the node verifies
   * (§E.2): the manifest's stored bytes against the committed `manifestSha256` (§D.2's rule —
   * hash what was fetched, never a re-serialisation), that the manifest names the file asked
   * for, and that the file's shards reassemble to the sha256 the manifest claims.
   *
   * `manifestOnly` stops after hop 2, for a caller inspecting a manifest who does not want to
   * pull an adapter that may be up to 1 GiB.
   */
  async downloadAdapter(
    pointer: ManifestPointer, fileName: string, options?: { manifestOnly?: boolean },
  ): Promise<{ manifest: ArtifactManifestV1; file: ManifestFileEntry; bytes?: Uint8Array }> {
    const bytes: Uint8Array = await this.storageManager.downloadDecryptedByCID(pointer.manifestCID);
    const actual = manifestSha256(bytes);
    if (actual.toLowerCase() !== String(pointer.manifestSha256).toLowerCase()) {
      throw new TrainingError(
        `manifest ${pointer.manifestCID} hashes to ${actual}, not the committed ${pointer.manifestSha256}`,
        'LORA_STAGING_FAILED', { reason: 'invalid' },
      );
    }
    const manifest = JSON.parse(new TextDecoder().decode(bytes)) as ArtifactManifestV1;
    const file = manifest.files?.find((f) => f.name === fileName);
    if (!file) {
      throw new TrainingError(
        `manifest does not name ${fileName} (it has: ${(manifest.files ?? []).map((f) => f.name).join(', ') || 'nothing'})`,
        'LORA_STAGING_FAILED', { reason: 'invalid' },
      );
    }
    if (options?.manifestOnly) return { manifest, file };
    // HOP 3, which the node also performs (§E.2: "verifies manifestSha256, reassembles +
    // verifies the named file's sha256"). Without it a corrupted shard is discovered node-side
    // as LORA_STAGING_FAILED — post-ack, uncorrelated, on a session already funded. Each shard
    // is checked as it arrives so a failure names the shard, not just the file.
    const parts: Uint8Array[] = [];
    if (!Array.isArray(file.shards) || file.shards.length === 0) {
      throw new TrainingError(
        `manifest entry ${fileName} carries no shards array, so its bytes cannot be verified`,
        'LORA_STAGING_FAILED', { reason: 'invalid' },
      );
    }
    for (const shard of file.shards) {
      const part: Uint8Array = await this.storageManager.downloadDecryptedByCID(shard.cid);
      const got = manifestSha256(part);
      if (got.toLowerCase() !== String(shard.sha256).toLowerCase()) {
        throw new TrainingError(
          `shard ${shard.cid} of ${fileName} hashes to ${got}, not the manifest's ${shard.sha256}`,
          // NOT DATASET_INTEGRITY: that code's advice is "re-prepare the dataset and retry on a
          // fresh session", which is nonsense for an adapter downloaded after a run that already
          // completed and was already paid for. This is the adapter being unusable.
          'LORA_STAGING_FAILED', { reason: 'invalid' },
        );
      }
      parts.push(part);
    }
    const assembled = reassembleShards(parts);
    const fileHash = manifestSha256(assembled);
    if (fileHash.toLowerCase() !== String(file.sha256).toLowerCase()) {
      throw new TrainingError(
        `${fileName} reassembles to ${fileHash}, not the manifest's ${file.sha256}`,
        'LORA_STAGING_FAILED', { reason: 'invalid' },
      );
    }
    return { manifest, file, bytes: assembled };
  }

  /**
   * Pre-escrow dataset assembly: validate → count → plausibility → shard → encrypt+upload →
   * manifest. EVERYTHING here is free and reversible; everything after it costs a deposit, so
   * every check that can run belongs on this side of the line.
   */
  async prepareDataset(opts: {
    jsonl: string;
    tokenizer: TrainingTokenizer;
    specialsPerSample: number;
    tokenizerSha256: string;
    /** A.4's `maxDatasetBytes`, from the host bundle. Checked FIRST — it is the cheapest bound
     *  and the one that otherwise costs a full encrypt-and-upload before the node refuses. */
    maxDatasetBytes?: number;
  }): Promise<{
    manifest: DatasetManifestV1; manifestBytes: Uint8Array; manifestSha256: string;
    declaredTokens: number; samples: number; totalBytes: number;
  }> {
    const bytes = new TextEncoder().encode(opts.jsonl);
    const totalBytes = bytes.length;
    // Cheapest bound first: known from the byte length alone, before tokenising anything.
    if (opts.maxDatasetBytes !== undefined && totalBytes > opts.maxDatasetBytes) {
      throw new TrainingError(
        `dataset is ${totalBytes} bytes, over the host's maxDatasetBytes of ${opts.maxDatasetBytes}`,
        'VALIDATION_FAILED', { reason: 'datasetFormat' },
      );
    }
    const { samples, texts } = validateJsonlTextV1(opts.jsonl);
    const declaredTokens = countDatasetTokens(opts.tokenizer, texts, opts.specialsPerSample);
    // C.6 client-side. The node runs this BEFORE fetching a single shard, so failing it there
    // costs a funded session; failing it here costs an error message and no uploads.
    const plausible = verifyPlausibility({ totalBytes, declaredTokens });
    if (!plausible.ok) {
      throw new TrainingError(
        `implausible dataset: ${totalBytes} bytes for ${declaredTokens} declaredTokens `
        + `(${plausible.bytesPerToken.toFixed(2)} bytes/token; the C.6 gate allows ${PLAUSIBILITY_MAX_BYTES_PER_TOKEN})`,
        'VALIDATION_FAILED', { reason: 'datasetFormat' },
      );
    }
    const shards: DatasetManifestV1['shards'] = [];
    for (const part of splitShards(bytes)) {
      const cid: string = await this.storageManager.uploadEncryptedBlob(part);
      // `sha256` is the PLAINTEXT shard hash (D.2) — the node verifies it AFTER decrypting.
      shards.push({ cid, sha256: manifestSha256(part), sizeBytes: part.length });
    }
    const manifest: DatasetManifestV1 = {
      schema: 'dataset-manifest-v1', format: 'jsonl-text-v1', countingRecipe: 'count-v1',
      tokenizerSha256: opts.tokenizerSha256, samples, declaredTokens, totalBytes, shards,
    };
    const manifestBytes = canonicaliseManifest(manifest);
    return {
      manifest, manifestBytes, manifestSha256: manifestSha256(manifestBytes),
      declaredTokens, samples, totalBytes,
    };
  }

  /**
   * The C.3 `DECLARED_TOKENS_MISMATCH` recourse, in ONE round trip: the reject hands back the
   * actual count, so only the manifest is wrong. The shards are already uploaded and their
   * plaintext hashes are already correct, so they are reused verbatim — re-uploading would be
   * a second full dataset transfer to settle an arithmetic disagreement. The retry rides a
   * FRESH session (A.3); the rejected one settles at zero with the deposit freed.
   */
  remanifestWithActual(
    manifest: DatasetManifestV1, actualTokens: number,
  ): { manifest: DatasetManifestV1; manifestBytes: Uint8Array; manifestSha256: string } {
    const next: DatasetManifestV1 = { ...manifest, declaredTokens: actualTokens };
    const manifestBytes = canonicaliseManifest(next);
    return { manifest: next, manifestBytes, manifestSha256: manifestSha256(manifestBytes) };
  }

  /**
   * Cancel a run and report what the user still OWNS.
   *
   * A cancel aborts at the NEXT SLICE BOUNDARY and completed slices still settle, so "cancelled"
   * alone is not the whole answer — the settled checkpoints are the user's property and each is
   * a real, usable, owned adapter. Returning the settled state is what lets a caller say so.
   */
  async cancelTraining(handle: TrainingHandle): Promise<{
    settledSlices: number; pointers: TrainingPointerRecord[]; forfeitedSlices: number[];
  }> {
    await handle.cancel();
    // WAIT for the run to actually finish settling. `cancel()` returns as soon as the action is
    // sent, because the run stops at the NEXT slice boundary — that slice still executes,
    // settles and BILLS. Reporting here without waiting under-counts by exactly the slice the
    // user just paid for, and omits its checkpoint pointer. The rejection is expected: the
    // terminal frame IS a CANCELLED error, and it is the signal we are waiting for.
    await handle.result.catch(() => undefined);
    return {
      settledSlices: handle.slices.length,
      pointers: handle.pointers,
      forfeitedSlices: handle.forfeitedSlices,
    };
  }

  /**
   * Fetch a slice attestation by its `proofCID` and verify it (§B.3).
   *
   * Attestations are PLAINTEXT on S5 — unlike the manifests, which are encrypted — so this is
   * the raw read path, and `proofHash` is SHA256 over the EXACT fetched bytes. Parsing and
   * re-serialising before hashing breaks verification even when the object is identical in
   * spirit, the same trap D.2 spells out for manifests.
   */
  async getTrainingResult(proofCID: string, binding?: TrainingCommitmentInput): Promise<{
    attestation: TrainingSliceAttestation; proofHash: string;
    digest: string; signer: string | null; signatureValid: boolean; inputBindingValid?: boolean;
  }> {
    const raw: Uint8Array = await this.storageManager.getRawBytes(proofCID);
    const proofHash = manifestSha256(raw);
    const attestation = JSON.parse(new TextDecoder().decode(raw)) as TrainingSliceAttestation;
    return { attestation, proofHash, ...this.verifyTrainingSlice(attestation, binding) };
  }

  /** Wire the ranked-host source used by {@link submitTrainingWithLoadBalancing}. */
  setHostSelectionService(service: { getRankedHostsForModel(modelId: string, mode?: unknown): Promise<{ host: { address: string; apiUrl: string } }[]> }): void {
    this.hostSelectionService = service;
  }

  /**
   * Try ranked hosts until one accepts, mirroring the transcode idiom — with the one rule that
   * makes it safe for training.
   *
   * ⚠️ **A moderation hold is NEVER re-shopped.** Re-shopping a held job is not merely futile,
   * it is forbidden (WP-S1): a balancer that treats a hold like a capacity failure launders the
   * job around the network until some host accepts it. `TrainingError.isReshoppable(k)` encodes
   * that, along with the money rule — after k ≥ 1 settled slices the deposit has been drawn
   * against, so `TRAIN_FAILED`/`TIMEOUT` stop here rather than starting a second paid run.
   *
   * Validation happens ONCE, before any host is contacted: a job that violates the bounds would
   * otherwise be rejected N times, and on the paths that fund first, burn N deposits doing it.
   */
  async submitTrainingWithLoadBalancing(
    opts: SubmitTrainingOptions,
    lb?: { maxHostRetries?: number; hostSelectionMode?: unknown },
  ): Promise<TrainingHandle> {
    if (opts.existingSession) {
      // A vault session is bound on-chain to ONE host. "Try the next host" with the same ids
      // would submit a session host X owns to host Y — a spent session at Y, and the vault's
      // money. The recourse for a refused adopted session is a fresh session, not another host.
      throw new TrainingError(
        'existingSession cannot be load-balanced: the session is bound on-chain to one host',
        'VALIDATION_FAILED',
        { reason: EXISTING_SESSION_CONFIG_REASON, consumed: false, ...TrainingManager.adoptedIds(opts.existingSession) },   // refused before anything touched it
      );
    }
    if (!this.hostSelectionService) {
      throw new TrainingError(
        'HostSelectionService not set — call setHostSelectionService() first',
        'VALIDATION_FAILED', { reason: 'hostBundle' },
      );
    }
    this.validateAgainstBundle(opts.job, opts.bundle);
    const ranked = await this.hostSelectionService.getRankedHostsForModel(
      this.trainingModelId, lb?.hostSelectionMode,
    );
    let lastError: unknown;
    for (const { host } of ranked.slice(0, lb?.maxHostRetries ?? 3)) {
      try {
        return await this.submitTraining({ ...opts, hostAddress: host.address, endpoint: host.apiUrl });
      } catch (err) {
        lastError = err;
        const e = err as TrainingError;
        const k = Number((e?.detail?.settledSlices as number) ?? 0);
        // Not re-shoppable ⇒ STOP. Never soften this into a `continue`.
        if (typeof e?.isReshoppable !== 'function' || !e.isReshoppable(k)) throw err;
      }
    }
    throw lastError;
  }

  /** The lost-zero-settle backstop: reclaim a funded session whose settle never landed. */
  async triggerSessionTimeout(jobId: number): Promise<unknown> {
    if (typeof this.jobMarketplace?.triggerSessionTimeout !== 'function') {
      throw new TrainingError(
        'jobMarketplace dependency does not provide triggerSessionTimeout()',
        'ESTIMATE_MISMATCH', { reason: 'missingDependencyMethod' },
      );
    }
    return this.jobMarketplace.triggerSessionTimeout(jobId);
  }
}
