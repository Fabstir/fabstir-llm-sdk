/**
 * Phase 5 — TrainingManager assembly (§A.4 bundle pre-validation, §B, § lifecycle) at v0.3.9.
 *
 * The ordering pin is the one that matters: A.4's pre-validation must run BEFORE the session
 * is created and funded. A.4 says client-side pre-validation makes a post-escrow
 * VALIDATION_FAILED "rare, not impossible" — rare only if the client actually checks first.
 * Validating after the deposit turns a free local error into a funded session awaiting a
 * zero-proof settle.
 */
import { describe, it, expect, vi } from 'vitest';
import { TrainingManager } from '../../src/managers/TrainingManager';
import type { TrainingJob } from '../../src/types/training.types';
import { TrainingError } from '../../src/errors/training-errors';

const MODEL = `0x${'11'.repeat(32)}`;
const USDC = '0x7C7C7C7C7C7C7C7C7C7C7C7C7C7C7C7C7C7C7C7C';

const JOB: TrainingJob = {
  templateId: 'train-qlora-qwen38-27b-v1',
  templateHash: `0x${'ab'.repeat(32)}`,
  dataset: {
    manifestCID: 'uDataset', manifestSha256: `0x${'cd'.repeat(32)}`,
    declaredTokens: 3_200_000, samples: 5000,
  },
  epochs: 3,
  hyper: { rank: 16, alpha: 32, lr: '0.000200', seed: '1', seqLen: 2048 },
  output: 'adapter-v1',
};

const BUNDLE = {
  templates: [{ id: 'train-qlora-qwen38-27b-v1', hash: `0x${'ab'.repeat(32)}`, minAllowListVersion: 26, vramGb: 40 }],
  bounds: {
    // maxDeclaredTokens deliberately BELOW maxTotalTokens: with both at 15M, total
    // (= declaredTokens x epochs) always subsumes it and the check is untestable.
    minTotalTokens: 10_000, maxDeclaredTokens: 5_000_000, maxTotalTokens: 15_000_000,
    maxEpochs: 5, maxSamples: 200_000, maxDatasetBytes: 268_435_456,
    perTemplate: {
      'train-qlora-qwen38-27b-v1': {
        ranks: [8, 16, 32], seqLens: [1024, 2048, 4096], sliceTokens: 1_000_000,
        specialsPerSample: 1, alphas: [16, 32, 64],
      },
    },
  },
};

function mgr(over: Record<string, unknown> = {}) {
  return new TrainingManager({
    sessionManager: { resolveModelPricePerToken: vi.fn().mockResolvedValue(904n) },
    paymentManager: { getTokenMinDeposit: vi.fn().mockResolvedValue(0n) },
    trainingModelId: MODEL, usdcAddress: USDC, chainId: 84532, ...over,
  } as never);
}

const bad = (o: Record<string, unknown>) => ({ ...JOB, ...o } as TrainingJob);

describe('A.4 bundle pre-validation — the numeric mirror (constraint 4)', () => {
  it('accepts a job inside every bound', () => {
    expect(() => mgr().validateAgainstBundle(JOB, BUNDLE as never)).not.toThrow();
  });
  it('rejects a template the host does not advertise', () => {
    expect(() => mgr().validateAgainstBundle(bad({ templateId: 'other' }), BUNDLE as never))
      .toThrow(/template/i);
  });
  it('rejects a templateHash that does not match the advertised one', () => {
    // The id is a label; the HASH is what binds. A matching id with a drifted hash means the
    // host is running a different recipe than the one priced and committed to.
    expect(() => mgr().validateAgainstBundle(bad({ templateHash: `0x${'ff'.repeat(32)}` }), BUNDLE as never))
      .toThrow(/hash/i);
  });
  it('rejects epochs over maxEpochs and tokens over maxTotalTokens', () => {
    expect(() => mgr().validateAgainstBundle(bad({ epochs: 6 }), BUNDLE as never)).toThrow(/epoch/i);
    // declaredTokens x epochs is the C.5 wall-clock cap, and it bites where neither factor does.
    expect(() => mgr().validateAgainstBundle(bad({ epochs: 5 }), BUNDLE as never)).toThrow(/maxTotalTokens|total/i);
  });
  it('rejects a run under minTotalTokens — the floor is a floor, not a suggestion', () => {
    expect(() => mgr().validateAgainstBundle(
      bad({ dataset: { ...JOB.dataset, declaredTokens: 1000 }, epochs: 1 }), BUNDLE as never,
    )).toThrow(/minTotalTokens|too small/i);
  });
  it('rejects samples over maxSamples', () => {
    expect(() => mgr().validateAgainstBundle(
      bad({ dataset: { ...JOB.dataset, samples: 200_001 } }), BUNDLE as never,
    )).toThrow(/samples/i);
  });
  it('rejects an alpha outside the template’s list — the third pin, publishable since v0.3.12', () => {
    // A.1 has always held the client to the template's allowed alpha values, and A.4 published
    // ranks and seqLens and no alphas — so we stayed silent rather than guess a range. The node
    // added the list at our request; now it is checkable BEFORE the money.
    expect(() => mgr().validateAgainstBundle(bad({ hyper: { ...JOB.hyper, alpha: 17 } }), BUNDLE as never))
      .toThrow(/alpha/i);
    expect(() => mgr().validateAgainstBundle(bad({ hyper: { ...JOB.hyper, alpha: 64 } }), BUNDLE as never))
      .not.toThrow();
  });
  it('SKIPS the alpha check on a bundle that predates the field', () => {
    // Same degradation rule as baseServingModelId: a bundle emitted before the template was
    // re-authored carries no alphas, and failing closed there would break every older host.
    const older = { ...BUNDLE, bounds: { ...BUNDLE.bounds, perTemplate: {
      'train-qlora-qwen38-27b-v1': { ranks: [8, 16, 32], seqLens: [1024, 2048, 4096], sliceTokens: 1_000_000, specialsPerSample: 1 },
    } } };
    expect(() => mgr().validateAgainstBundle(bad({ hyper: { ...JOB.hyper, alpha: 17 } }), older as never)).not.toThrow();
  });
  it('rejects a rank or seqLen outside the template’s OWN allow-lists', () => {
    expect(() => mgr().validateAgainstBundle(bad({ hyper: { ...JOB.hyper, rank: 64 } }), BUNDLE as never)).toThrow(/rank/i);
    expect(() => mgr().validateAgainstBundle(bad({ hyper: { ...JOB.hyper, seqLen: 8192 } }), BUNDLE as never)).toThrow(/seqLen/i);
  });
  it('enforces maxDeclaredTokens independently of maxTotalTokens', () => {
    expect(() => mgr().validateAgainstBundle(
      bad({ dataset: { ...JOB.dataset, declaredTokens: 6_000_000 }, epochs: 1 }), BUNDLE as never,
    )).toThrow(/declaredTokens/i);
  });
  it('accepts values EXACTLY on the bound — an off-by-one rejects honest jobs', () => {
    // Every bounds test above sits far from its edge, so `>` vs `>=` mutants survive. These
    // are the cases where a wrong comparator refuses work the host would have accepted.
    expect(() => mgr().validateAgainstBundle(
      bad({ dataset: { ...JOB.dataset, samples: 200_000 } }), BUNDLE as never)).not.toThrow();
    expect(() => mgr().validateAgainstBundle(bad({ epochs: 4 }), BUNDLE as never)).not.toThrow();
  });
  it('marks a HOST-SPECIFIC bundle failure RE-SHOPPABLE, not terminal', () => {
    // "this host does not advertise your template" and "this host's allowlist moved" are facts
    // about THIS HOST. Stamping them with a pinned VALIDATION_FAILED reason makes
    // isReshoppable() false and retires a job another host would happily run — the exact case
    // A.4 bothers to write down.
    for (const j of [bad({ templateId: 'other' }), bad({ templateHash: `0x${'ff'.repeat(32)}` })]) {
      try { mgr().validateAgainstBundle(j, BUNDLE as never); expect.unreachable(); }
      catch (e: any) {
        expect(e.code).toBe('VALIDATION_FAILED');
        expect(e.isReshoppable(0), e.message).toBe(true);
      }
    }
  });
  it('REFUSES a template with no perTemplate entry rather than running UNGUARDED', () => {
    // Without perTemplate[templateId] there is no sliceTokens, so the whole slice-level
    // over-claim guard degrades to "trust the echo" — silently. Refusing is the only safe
    // reading: we cannot verify the schedule, so we do not spend money pretending we can.
    const noPer = { ...BUNDLE, bounds: { ...BUNDLE.bounds, perTemplate: {} } };
    expect(() => mgr().validateAgainstBundle(JOB, noPer as never)).toThrow(/perTemplate|sliceTokens/i);
  });
  it('rejects a bundle with NO training section — absence IS the capability advert (A.4/E.2)', () => {
    // A node with TRAIN_ENABLED=false omits the section entirely. Treating that as "defaults
    // are fine" would submit a paid training job to a host that cannot train.
    expect(() => mgr().validateAgainstBundle(JOB, undefined as never)).toThrow(/training/i);
  });
});

describe('submitTraining — the order of operations is the money', () => {
  const wired = () => {
    const calls: string[] = [];
    const submitTraining = vi.fn(async () => { calls.push('submit'); return { requestId: 'r', result: Promise.resolve({}), cancel: vi.fn(), slices: [], pointers: [], forfeitedSlices: [] }; });
    const m = mgr({
      sessionManager: {
        resolveModelPricePerToken: vi.fn(async () => { calls.push('price'); return 904n; }),
        startSession: vi.fn(async (a: any) => { calls.push('session'); (calls as any).startSessionArgs = a; return { sessionId: 1n, jobId: 2n }; }),
        submitTraining,
      },
    });
    return { m, calls, submitTraining };
  };
  it('VALIDATES BEFORE it funds — a bounds failure must not cost a deposit', async () => {
    const { m, calls } = wired();
    await expect(m.submitTraining({ job: bad({ epochs: 9 }), bundle: BUNDLE as never, hostAddress: '0xh', endpoint: 'https://host2.fabstir.net' } as never))
      .rejects.toThrow(/epoch/i);
    expect(calls).not.toContain('session');
  });
  it('passes the bundle’s sliceTokens and minAllowListVersion into the over-claim guard', async () => {
    const { m, submitTraining } = wired();
    await m.submitTraining({ job: JOB, bundle: BUNDLE as never, hostAddress: '0xh', endpoint: 'https://host2.fabstir.net' } as never);
    const passed = submitTraining.mock.calls[0][2] as any;
    // Without these the guard silently degrades to "trust the echo", which is the whole thing
    // constraint 5 exists to prevent.
    expect(passed.sliceTokens).toBe(1_000_000);
    expect(passed.minAllowListVersion).toBe(26);
    expect(passed.onChainPricePerToken).toBe('904');
  });
  it('funds the session with the RIGHT NUMBER IN THE RIGHT UNIT and training parameters', async () => {
    // startSession was mocked and its arguments never read, so `formatUnits(deposit, 18)` —
    // a 10^12 under-funding of every training session — was green. So was dropping
    // maxDuration/proofInterval/proofTimeoutWindow back to the chat defaults, which cannot
    // carry a multi-hour run, and pricing on templateId instead of the A.2 model id.
    const { m, calls } = wired();
    await m.submitTraining({ job: JOB, bundle: BUNDLE as never, hostAddress: '0xh', endpoint: 'https://host2.fabstir.net' } as never);
    const sess = (calls as any).startSessionArgs;
    expect(sess).toMatchObject({
      modelId: MODEL, encryption: true,
      duration: 14400, proofInterval: 1000, proofTimeoutWindow: 3600,   // `duration` is the key startSession reads; `maxDuration` was dead
    });
    // Direct payment (approve + pay) is the wallet-path design: startSession decides deposit-vs-direct on
    // `useDeposit` alone; the former `paymentMethod: 'deposit'` key was never read (Round 4).
    expect(sess.useDeposit).toBeUndefined();
    expect(sess).not.toHaveProperty('paymentMethod');
    expect(sess.depositAmount).toBe('9.11232');   // 9,112,320 base units at 6 decimals
  });
  it('REFUSES a non-USDC payment token rather than mis-sizing the deposit by 10^12', async () => {
    // `formatUnits(deposit, 6)` is hardcoded, inherited from the LTX path. It is correct for
    // USDC and M0, and silently wrong for an 18-decimal token: the deposit under-funds by a
    // factor of 10^12, A.3's headroom check then fails POST-ESCROW, and the session is consumed.
    // M0's scope is USDC, so say so rather than compute a number we cannot justify.
    const { m } = wired();
    await expect(m.submitTraining({
      job: JOB, bundle: BUNDLE as never, hostAddress: '0xh', endpoint: 'https://host2.fabstir.net', paymentToken: `0x${'ee'.repeat(20)}`,
    } as never)).rejects.toThrow(/decimals|USDC|payment token/i);
  });
  it('calls methods the REAL SessionManager actually has (the CP1 lesson)', async () => {
    // CP1 shipped a call to `getMinTokensFee` that the injected dependency did not carry, and
    // the suite was green because it MOCKED the method — a mock proves the mock. Assert against
    // the real prototype so a rename or a missing method fails here instead of at runtime.
    const { SessionManager } = await import('../../src/managers/SessionManager');
    expect(typeof SessionManager.prototype.submitTraining).toBe('function');
    expect(typeof SessionManager.prototype.startSession).toBe('function');
  });
});

describe('verifyTrainingSlice — recompute rather than trust', () => {
  it('recovers the signer over the B.5 digest and reports a match', () => {
    const m = mgr();
    const att = {
      modelId: MODEL, templateHash: JOB.templateHash, envHash: `0x${'ee'.repeat(32)}`,
      inputCommitment: `0x${'11'.repeat(32)}`, checkpointManifestSha256: `0x${'22'.repeat(32)}`,
      sliceIndex: 0, tokensDelta: 1_000_000, sessionId: '1',
      host: '0xA1A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1', timestamp: 1,
    };
    const r = m.verifyTrainingSlice(att as never);
    // Unsigned is ADVISORY in M0 (constraint 4): report it, never abort verification.
    expect(r.signer).toBeNull();
    expect(r.signatureValid).toBe(false);
    expect(r.digest).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it('RECOMPUTES the B.4 inputCommitment — the doc\'s "highest-value client check"', async () => {
    // doc:543-544: "the host trained our exact job on our exact dataset". Without recomputing
    // it, a host can sign a perfectly valid attestation over a DIFFERENT commitment — another
    // dataset, other hyperparameters — and signatureValid still comes back true. The function
    // existed, was exported and unit-tested, and had NO call site anywhere in src/.
    const { trainingInputCommitment } = await import('../../src/utils/training-utils');
    const binding = {
      templateHash: JOB.templateHash, datasetManifestSha256: JOB.dataset.manifestSha256,
      declaredTokens: JOB.dataset.declaredTokens, epochs: JOB.epochs,
      rank: JOB.hyper.rank, alpha: JOB.hyper.alpha, lr: JOB.hyper.lr,
      seed: JOB.hyper.seed, seqLen: JOB.hyper.seqLen,
    };
    const att = {
      modelId: MODEL, templateHash: JOB.templateHash, envHash: `0x${'ee'.repeat(32)}`,
      inputCommitment: trainingInputCommitment(binding as never),
      checkpointManifestSha256: `0x${'22'.repeat(32)}`, sliceIndex: 0, tokensDelta: 1,
      sessionId: '1', host: `0x${'a1'.repeat(20)}`, timestamp: 1,
    };
    expect(mgr().verifyTrainingSlice(att as never, binding as never).inputBindingValid).toBe(true);
    const tampered = { ...att, inputCommitment: `0x${'99'.repeat(32)}` };
    expect(mgr().verifyTrainingSlice(tampered as never, binding as never).inputBindingValid).toBe(false);
    // Absent binding => undefined, never a silent `true`: "not checked" must not read as "ok".
    expect(mgr().verifyTrainingSlice(att as never).inputBindingValid).toBeUndefined();
  });
  it('proves a REAL signature valid, and rejects one from the wrong host', async () => {
    // The unsigned fixture alone lets `signatureValid: false` be hardcoded, and lets the host
    // comparison be made against the wrong field. Neither survives an actually-signed case.
    const { Wallet, getBytes } = await import('ethers');
    const { trainingSigDigest } = await import('../../src/utils/training-utils');
    const w = Wallet.createRandom();
    const base = {
      modelId: MODEL, templateHash: JOB.templateHash, envHash: `0x${'ee'.repeat(32)}`,
      inputCommitment: `0x${'11'.repeat(32)}`, checkpointManifestSha256: `0x${'22'.repeat(32)}`,
      sliceIndex: 0, tokensDelta: 1_000_000, sessionId: '1', host: w.address, timestamp: 1,
    };
    const signature = await w.signMessage(getBytes(trainingSigDigest(base as never)));
    const ok = mgr().verifyTrainingSlice({ ...base, signature } as never);
    expect(ok.signer?.toLowerCase()).toBe(w.address.toLowerCase());
    expect(ok.signatureValid).toBe(true);
    // `host` is INSIDE the B.5 digest, so substituting it changes the digest and recovery
    // yields some other address entirely — which is the property that makes the attestation
    // bind the host rather than merely mention it.
    const wrongHost = mgr().verifyTrainingSlice({ ...base, host: `0x${'99'.repeat(20)}`, signature } as never);
    expect(wrongHost.signer?.toLowerCase()).not.toBe(w.address.toLowerCase());
    expect(wrongHost.signatureValid).toBe(false);
  });
});

describe('manifestSha256 is SHA-256, pinned by a known answer', () => {
  it('matches the NIST SHA-256 vector for "abc"', async () => {
    // Every other assertion on this function was a hex-shape regex or a value compared to
    // itself, so `keccak256` would have passed them all. This is D.2's bytes-level commitment,
    // recomputed independently by the node — the algorithm has to be pinned, not just the shape.
    const { manifestSha256 } = await import('../../src/utils/training-shard');
    expect(manifestSha256(new TextEncoder().encode('abc')))
      .toBe('0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('downloadAdapter — verify the manifest, then the named file', () => {
  const MANIFEST = {
    schema: 'artifact-manifest-v1', kind: 'adapter',
    files: [{ name: 'adapter.gguf', sha256: `0x${'aa'.repeat(32)}`, sizeBytes: 3, shards: [] }],
  };
  it('rejects when the fetched manifest bytes do not hash to the pointer’s manifestSha256', async () => {
    const m = mgr({ storageManager: { downloadDecryptedByCID: vi.fn(async () => new TextEncoder().encode('{}')) } });
    // NOT DATASET_INTEGRITY: that code's advice is "re-prepare the dataset and retry on a fresh
    // session", which is meaningless for an adapter fetched after a run that already completed
    // and was already paid for. The adapter is simply unusable.
    await expect(m.downloadAdapter({ manifestCID: 'uM', manifestSha256: `0x${'00'.repeat(32)}` } as never, 'adapter.gguf'))
      .rejects.toMatchObject({ code: 'LORA_STAGING_FAILED', detail: { reason: 'invalid' } });
  });
  it('REASSEMBLES the shards and verifies the file\'s OWN sha256 — E.2\'s third hop', async () => {
    // The node does three things: verify manifestSha256, reassemble, verify the named file's
    // sha256. We did the first two. A corrupted shard therefore surfaced only node-side, as
    // LORA_STAGING_FAILED, post-ack, on a session already funded. And the method is called
    // downloadAdapter while downloading only the manifest.
    const { manifestSha256, splitShards } = await import('../../src/utils/training-shard');
    const payload = new TextEncoder().encode('ADAPTER-BYTES-'.repeat(4));
    const parts = splitShards(payload);
    const fileEntry = {
      name: 'adapter.gguf', sha256: manifestSha256(payload), sizeBytes: payload.length,
      shards: parts.map((p, i) => ({ cid: `uS${i}`, sha256: manifestSha256(p), sizeBytes: p.length })),
    };
    const man = { schema: 'artifact-manifest-v1', kind: 'adapter', files: [fileEntry] };
    const manBytes = new TextEncoder().encode(JSON.stringify(man));
    const store: Record<string, Uint8Array> = { uM: manBytes };
    parts.forEach((p, i) => { store[`uS${i}`] = p; });
    const m = mgr({ storageManager: { downloadDecryptedByCID: async (c: string) => store[c] } });
    const r = await m.downloadAdapter({ manifestCID: 'uM', manifestSha256: manifestSha256(manBytes) } as never, 'adapter.gguf');
    expect(r.bytes).toBeDefined();
    expect(new TextDecoder().decode(r.bytes!)).toBe(new TextDecoder().decode(payload));

  });

  it('names the SHARD when a shard\'s own hash is wrong', async () => {
    // Two checks guard this path and both throw DATASET_INTEGRITY, so a single corruption test
    // cannot tell which one fired — remove either and the other still throws. These two cases
    // isolate them: here the shard hash is the ONLY thing wrong.
    const { manifestSha256, splitShards } = await import('../../src/utils/training-shard');
    const payload = new TextEncoder().encode('ADAPTER-BYTES-'.repeat(4));
    const parts = splitShards(payload);
    const fileEntry = {
      name: 'adapter.gguf', sha256: manifestSha256(payload), sizeBytes: payload.length,
      shards: parts.map((p, i) => ({ cid: `uS${i}`, sha256: manifestSha256(p), sizeBytes: p.length })),
    };
    const man = { schema: 'artifact-manifest-v1', kind: 'adapter', files: [fileEntry] };
    const manBytes = new TextEncoder().encode(JSON.stringify(man));
    const store: Record<string, Uint8Array> = { uM: manBytes, uS0: new TextEncoder().encode('tampered') };
    const m = mgr({ storageManager: { downloadDecryptedByCID: async (c: string) => store[c] } });
    await expect(m.downloadAdapter({ manifestCID: 'uM', manifestSha256: manifestSha256(manBytes) } as never, 'adapter.gguf'))
      .rejects.toThrow(/shard uS0/);
  });

  it('catches a manifest whose file sha256 is a LIE, though every shard is intact', async () => {
    // Here each shard matches its declared hash perfectly — only the FILE-level claim is false.
    // Nothing but the reassembly check can catch this, which is why it must exist separately.
    const { manifestSha256, splitShards } = await import('../../src/utils/training-shard');
    const payload = new TextEncoder().encode('ADAPTER-BYTES-'.repeat(4));
    const parts = splitShards(payload);
    const fileEntry = {
      name: 'adapter.gguf', sha256: `0x${'de'.repeat(32)}`, sizeBytes: payload.length,   // the lie
      shards: parts.map((p, i) => ({ cid: `uS${i}`, sha256: manifestSha256(p), sizeBytes: p.length })),
    };
    const man = { schema: 'artifact-manifest-v1', kind: 'adapter', files: [fileEntry] };
    const manBytes = new TextEncoder().encode(JSON.stringify(man));
    const store: Record<string, Uint8Array> = { uM: manBytes };
    parts.forEach((p, i) => { store[`uS${i}`] = p; });
    const m = mgr({ storageManager: { downloadDecryptedByCID: async (c: string) => store[c] } });
    await expect(m.downloadAdapter({ manifestCID: 'uM', manifestSha256: manifestSha256(manBytes) } as never, 'adapter.gguf'))
      .rejects.toThrow(/reassembles to/);
  });
  it('can inspect the manifest WITHOUT pulling a 1 GiB adapter', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(MANIFEST));
    const { manifestSha256 } = await import('../../src/utils/training-shard');
    const downloadDecryptedByCID = vi.fn(async () => bytes);
    const m = mgr({ storageManager: { downloadDecryptedByCID } });
    const r = await m.downloadAdapter({ manifestCID: 'uM', manifestSha256: manifestSha256(bytes) } as never, 'adapter.gguf', { manifestOnly: true });
    expect(r.file.name).toBe('adapter.gguf');
    expect(r.bytes).toBeUndefined();
    expect(downloadDecryptedByCID).toHaveBeenCalledTimes(1);   // the manifest only
  });
  it('rejects a manifest entry with NO shards array instead of silently reassembling nothing', async () => {
    // `file.shards ?? []` produced an empty reassembly — a `??` fallback of exactly the kind
    // the project rules target. It happened to fail closed at the file-hash check, but the
    // error then named the wrong thing.
    const { manifestSha256 } = await import('../../src/utils/training-shard');
    const man = { schema: 'artifact-manifest-v1', kind: 'adapter',
      files: [{ name: 'adapter.gguf', sha256: `0x${'aa'.repeat(32)}`, sizeBytes: 3 }] };
    const manBytes = new TextEncoder().encode(JSON.stringify(man));
    const m = mgr({ storageManager: { downloadDecryptedByCID: async () => manBytes } });
    await expect(m.downloadAdapter({ manifestCID: 'uM', manifestSha256: manifestSha256(manBytes) } as never, 'adapter.gguf'))
      .rejects.toThrow(/no shards array/i);
  });
  it('rejects a file the manifest does not name', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(MANIFEST));
    const { manifestSha256 } = await import('../../src/utils/training-shard');
    const m = mgr({ storageManager: { downloadDecryptedByCID: vi.fn(async () => bytes) } });
    await expect(m.downloadAdapter({ manifestCID: 'uM', manifestSha256: manifestSha256(bytes) } as never, 'nope.gguf'))
      .rejects.toMatchObject({ code: 'LORA_STAGING_FAILED' });
  });
});

describe('the early-self-complete fee and the timeout backstop', () => {
  it('names the missing dependency instead of throwing a bare TypeError', async () => {
    await expect(mgr().getEarlySelfCompleteFee()).rejects.toMatchObject({ code: 'ESTIMATE_MISMATCH' });
  });
  it('triggerSessionTimeout is a call site on the EXISTING wrapper, not new plumbing', async () => {
    const triggerSessionTimeout = vi.fn().mockResolvedValue({ hash: '0xtx' });
    const m = mgr({ jobMarketplace: { getMinTokensFee: vi.fn(), triggerSessionTimeout } });
    await m.triggerSessionTimeout(7);
    // And the REAL wrapper carries both, so this manager is wirable (CP1's open Phase 5 item).
    const { JobMarketplaceWrapper } = await import('../../src/contracts/JobMarketplace');
    expect(typeof JobMarketplaceWrapper.prototype.getMinTokensFee).toBe('function');
    expect(typeof JobMarketplaceWrapper.prototype.triggerSessionTimeout).toBe('function');
    expect(triggerSessionTimeout).toHaveBeenCalledWith(7);
  });
});

describe('the three Phase 5 methods the plan named', () => {
  const handleStub = (over: Record<string, unknown> = {}) => ({
    requestId: 'r', result: Promise.resolve({}), cancel: vi.fn(async () => {}),
    slices: [{ index: 0 }, { index: 1 }], pointers: [{ kind: 'checkpoint' }],
    forfeitedSlices: [1], ...over,
  });

  describe('cancelTraining — what the user still OWNS after stopping', () => {
    it('AWAITS the terminal frame before reporting — a slice settles AFTER the cancel', async () => {
      // cancel() now returns as soon as train_cancel is sent, because the run stops at the NEXT
      // slice boundary. Reporting immediately would under-count by exactly the slice the user
      // just paid for. cancelTraining must wait for the run to actually finish settling.
      let resolveRun: (v?: unknown) => void = () => {};
      const pending = new Promise((r) => { resolveRun = r; });
      const h: any = { cancel: vi.fn(async () => {}), slices: [{ index: 0 }], pointers: [], forfeitedSlices: [] };
      // The final slice is appended INSIDE the result chain, so only an implementation that
      // actually awaits the terminal frame can observe it. Appending it from the test body
      // instead would pass on a lucky microtask ordering and prove nothing.
      h.result = pending.then(async () => {
        // A MACROTASK boundary, deliberately: microtask ordering alone let a non-awaiting
        // implementation pass by luck. Nothing that fails to await `result` can see past this.
        await new Promise((r) => { setTimeout(r, 0); });
        h.slices.push({ index: 1 });
        h.pointers.push({ kind: 'checkpoint' });
        throw new TrainingError('cancelled', 'CANCELLED');
      });
      const promise = mgr().cancelTraining(h);
      resolveRun();
      const r = await promise;
      expect(r.settledSlices).toBe(2);
      expect(r.pointers).toHaveLength(1);
    });
    it('cancels and reports the settled state, because those checkpoints are theirs', async () => {
      // The run aborts at the next slice boundary and completed slices still settle. A caller
      // that only learns "cancelled" cannot tell the user what they already paid for and own.
      const h = handleStub();
      const r = await mgr().cancelTraining(h as never);
      expect(h.cancel).toHaveBeenCalled();
      expect(r.settledSlices).toBe(2);
      expect(r.forfeitedSlices).toEqual([1]);
      expect(r.pointers).toHaveLength(1);
    });
  });

  describe('getTrainingResult — fetch the attestation, then verify it', () => {
    const att = {
      modelId: MODEL, templateHash: JOB.templateHash, envHash: `0x${'ee'.repeat(32)}`,
      inputCommitment: `0x${'11'.repeat(32)}`, checkpointManifestSha256: `0x${'22'.repeat(32)}`,
      sliceIndex: 0, tokensDelta: 1, sessionId: '1', host: `0x${'a1'.repeat(20)}`, timestamp: 1,
    };
    // PRETTY-PRINTED on purpose. A compact fixture round-trips through JSON.parse ->
    // JSON.stringify unchanged, so it cannot catch an implementation that re-serialises before
    // hashing — which is the exact trap D.2 spells out and B.3 repeats for proofHash.
    const raw = () => new TextEncoder().encode(JSON.stringify(att, null, 2));

    it('hashes the RAW fetched bytes — B.3 proofHash is over what was fetched', async () => {
      // Parsing and re-serialising before hashing breaks verification even when the object is
      // identical in spirit, exactly as with the manifests.
      const { manifestSha256 } = await import('../../src/utils/training-shard');
      const m = mgr({ storageManager: { getRawBytes: vi.fn(async () => raw()) } });
      const r = await m.getTrainingResult('uProof0');
      expect(r.proofHash).toBe(manifestSha256(raw()));
      expect(r.attestation.sliceIndex).toBe(0);
      expect(r.signatureValid).toBe(false);           // unsigned fixture: advisory, not fatal
    });
    it('uses the PLAINTEXT read path — attestations are not encrypted (B.3)', async () => {
      const getRawBytes = vi.fn(async () => raw());
      const downloadDecryptedByCID = vi.fn();
      await mgr({ storageManager: { getRawBytes, downloadDecryptedByCID } }).getTrainingResult('uP');
      expect(getRawBytes).toHaveBeenCalledWith('uP');
      expect(downloadDecryptedByCID).not.toHaveBeenCalled();
    });
  });

  describe('submitTrainingWithLoadBalancing — and the rule it exists to enforce', () => {
    const hosts = [{ host: { address: '0xh1', apiUrl: 'http://h1' } }, { host: { address: '0xh2', apiUrl: 'http://h2' } }];
    const svc = { getRankedHostsForModel: vi.fn(async () => hosts) };

    it('moves to the next host when the first is NOT reshoppable-blocked', async () => {
      let calls = 0;
      const m = mgr({ sessionManager: {
        resolveModelPricePerToken: vi.fn(async () => 904n),
        startSession: vi.fn(async () => ({ sessionId: 1n, jobId: 2n })),
        submitTraining: vi.fn(async () => {
          calls += 1;
          if (calls === 1) throw new TrainingError('busy', 'CAPACITY', { reason: 'slotBusy' });
          return handleStub();
        }),
      } });
      m.setHostSelectionService(svc as never);
      await expect(m.submitTrainingWithLoadBalancing({ job: JOB, bundle: BUNDLE as never } as never))
        .resolves.toBeDefined();
      expect(calls).toBe(2);
    });

    it('NEVER re-shops a moderation hold — it stops at the first host', async () => {
      // WP-S1: a held job must not reach another host. Re-shopping it is not merely futile, it
      // is forbidden — a load balancer that treats a hold like a capacity failure launders it
      // around the network.
      // CONTENT_BLOCKED is a real MODERATION_HOLD_CODE. Using an invented code would have
      // tested the UNKNOWN-code path instead of the hold path — and unknown codes ARE
      // re-shoppable, so the test would have failed for entirely the wrong reason.
      const submitTraining = vi.fn(async () => { throw new TrainingError('held', 'CONTENT_BLOCKED'); });
      const m = mgr({ sessionManager: {
        resolveModelPricePerToken: vi.fn(async () => 904n),
        startSession: vi.fn(async () => ({ sessionId: 1n, jobId: 2n })), submitTraining,
      } });
      m.setHostSelectionService(svc as never);
      await expect(m.submitTrainingWithLoadBalancing({ job: JOB, bundle: BUNDLE as never } as never)).rejects.toThrow();
      expect(submitTraining).toHaveBeenCalledTimes(1);
    });

    it('does not re-shop after money has moved (k >= 1)', async () => {
      const submitTraining = vi.fn(async () => {
        throw new TrainingError('died', 'TRAIN_FAILED', { settledSlices: 3 });
      });
      const m = mgr({ sessionManager: {
        resolveModelPricePerToken: vi.fn(async () => 904n),
        startSession: vi.fn(async () => ({ sessionId: 1n, jobId: 2n })), submitTraining,
      } });
      m.setHostSelectionService(svc as never);
      await expect(m.submitTrainingWithLoadBalancing({ job: JOB, bundle: BUNDLE as never } as never)).rejects.toThrow();
      expect(submitTraining).toHaveBeenCalledTimes(1);   // TRAIN_FAILED at k=3 is terminal
    });

    it('validates ONCE, BEFORE ranking hosts — not once per host', async () => {
      const startSession = vi.fn();
      const getRankedHostsForModel = vi.fn(async () => hosts);
      const m = mgr({ sessionManager: { startSession, submitTraining: vi.fn() } });
      m.setHostSelectionService({ getRankedHostsForModel } as never);
      await expect(m.submitTrainingWithLoadBalancing({ job: bad({ epochs: 9 }), bundle: BUNDLE as never } as never))
        .rejects.toThrow(/epoch/i);
      expect(startSession).not.toHaveBeenCalled();
      // Asserting only on startSession cannot tell "validated up front" from "validated inside
      // submitTraining", since the inner call throws first either way. Host ranking is the
      // observable that separates them — a job that can never run should not cost a lookup.
      expect(getRankedHostsForModel).not.toHaveBeenCalled();
    });
  });
});
