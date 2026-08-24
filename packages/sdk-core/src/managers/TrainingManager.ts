// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// TrainingManager — LoRA/QLoRA fine-tune (M0). Mirrors LtxManager over the same encrypted rail.
// Wire and money shapes frozen in docs/node-reference/DESIGN-TRAINING-M0-INTERFACE.md v0.3.11
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
import { TrainingError } from '../errors/training-errors';
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

export class TrainingManager implements ITrainingManager {
  private readonly sessionManager: any;
  private readonly storageManager: any;
  private readonly paymentManager: any;
  private readonly jobMarketplace?: TrainingJobMarketplace;
  private readonly hostManager: any;
  private readonly trainingModelId: string;
  private readonly usdcAddress: string;
  private readonly chainId?: number;
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
    const total = trainingTokens(job);
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
  }

  /**
   * Pre-validate, fund, submit. The ORDER is the money: validation is pre-escrow so a bounds
   * failure costs nothing, and the session carries training's own lifecycle parameters
   * (`maxDuration 14400 / proofInterval 1000 / proofTimeoutWindow 3600`) — the chat defaults
   * cannot carry a multi-hour run.
   */
  async submitTraining(opts: {
    job: TrainingJob;
    bundle?: TrainingBundleSection;
    hostAddress: string;
    endpoint?: string;
    paymentToken?: string;
    requestId?: string;
    onProgress?: (progress: unknown) => void;
    onSlice?: (slice: unknown) => void;
    persistPointer?: (record: TrainingPointerRecord) => void | Promise<void>;
  }): Promise<TrainingHandle> {
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
    const { sessionId } = await this.sessionManager.startSession({
      chainId: this.chainId, host: opts.hostAddress, endpoint: opts.endpoint,
      modelId: this.trainingModelId, paymentMethod: 'deposit', paymentToken: est.paymentToken,
      depositAmount: formatUnits(BigInt(est.depositBaseUnits), 6),
      encryption: true, maxDuration: 14400, proofInterval: 1000, proofTimeoutWindow: 3600,
    });
    const template = opts.bundle!.templates.find((t) => t.id === opts.job.templateId)!;
    return this.sessionManager.submitTraining(String(sessionId), opts.job, {
      requestId: opts.requestId, onProgress: opts.onProgress, onSlice: opts.onSlice,
      persistPointer: opts.persistPointer,
      // Without these three the over-claim guard degrades to "trust the echo" — which is the
      // one thing constraint 5 exists to prevent.
      onChainPricePerToken: est.pricePerToken.toString(),
      minAllowListVersion: template.minAllowListVersion,
      sliceTokens: opts.bundle!.bounds.perTemplate?.[opts.job.templateId]?.sliceTokens,
    });
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
    opts: Parameters<TrainingManager['submitTraining']>[0],
    lb?: { maxHostRetries?: number; hostSelectionMode?: unknown },
  ): Promise<TrainingHandle> {
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
