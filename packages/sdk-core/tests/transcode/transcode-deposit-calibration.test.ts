// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * LIVE calibration: confirm estimateTranscodePrice's predicted tokens + USDC match what the
 * host actually bills for a REAL transcode. The unit tests lock the *formula*; this confirms
 * the *scale* and that the transcode-modelId price is in the same PRICE_PRECISION units.
 *
 * Requires REAL infrastructure (gated; SKIPPED otherwise — we never fake it green):
 *   - Base-Sepolia accounts + contracts in .env.test (TEST_USER_1, CONTRACT_*, RPC_URL_*)
 *   - TEST_HOST_4 running a transcode sidecar with USDC pricing registered for the
 *     transcode modelId (TEST_HOST_4_ADDRESS / TEST_HOST_4_URL)
 *   - A short, KNOWN-DURATION source clip already uploaded to S5:
 *       TRANSCODE_CALIBRATION_SOURCE_CID   (e.g. s5://...)
 *       TRANSCODE_CALIBRATION_DURATION_SEC (its exact duration in seconds)
 *
 * Run:
 *   RUN_TRANSCODE_CALIBRATION=1 \
 *   TRANSCODE_CALIBRATION_SOURCE_CID=s5://<cid> TRANSCODE_CALIBRATION_DURATION_SEC=<sec> \
 *   pnpm test tests/transcode/transcode-deposit-calibration.test.ts
 *
 * Guardrail E: uses a UNIFORM-encryption format set (every fmt.encrypt === true AND
 * isEncrypted: true) so the SDK's GLOBAL encryption factor matches the node's PER-FORMAT
 * billing — otherwise estimate.tokens over-counts and the token comparison is not exact.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { ChainId } from '../../src/types/chain.types';
import type { VideoFormat } from '../../src/types/transcode.types';
import {
  computeTranscodeModelId,
  estimateTranscodeUnits,
  billingUnitsToTokens,
} from '../../src/utils/transcode-utils';

const RUN = process.env.RUN_TRANSCODE_CALIBRATION === '1';
const PRICE_PRECISION = 1000n; // canonical token→USDC scale (HostManager/SessionManager)

// UNIFORM-encryption rendition set (all encrypt:true) — Guardrail E.
const FORMATS: VideoFormat[] = [
  { id: 1, ext: 'mp4', vcodec: 'h264_nvenc', acodec: 'aac', preset: 'fast', vf: 'scale=1280x720', b_v: '2M', ar: '48k', ch: 2, dest: 's5', encrypt: true },
  { id: 2, ext: 'mp4', vcodec: 'h264_nvenc', acodec: 'aac', preset: 'fast', vf: 'scale=1920x1080', b_v: '5M', ar: '48k', ch: 2, dest: 's5', encrypt: true },
];

describe.skipIf(!RUN)('transcode deposit calibration (live, RUN_TRANSCODE_CALIBRATION=1)', () => {
  const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA!;
  const userKey = process.env.TEST_USER_1_PRIVATE_KEY!;
  const hostAddress = process.env.TEST_HOST_4_ADDRESS!;
  const hostUrl = process.env.TEST_HOST_4_URL!;
  const usdc = process.env.CONTRACT_USDC_TOKEN!;
  const sourceCid = process.env.TRANSCODE_CALIBRATION_SOURCE_CID!;
  const durationSec = Number(process.env.TRANSCODE_CALIBRATION_DURATION_SEC);

  function makeSdk() {
    return new FabstirSDKCore({
      mode: 'production', chainId: 84532, rpcUrl,
      contractAddresses: {
        jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE,
        nodeRegistry: process.env.CONTRACT_NODE_REGISTRY,
        proofSystem: process.env.CONTRACT_PROOF_SYSTEM,
        hostEarnings: process.env.CONTRACT_HOST_EARNINGS,
        usdcToken: usdc,
      },
    } as any);
  }

  it('predicted tokens + USDC match the host-billed amount for a real transcode', async () => {
    expect(sourceCid, 'set TRANSCODE_CALIBRATION_SOURCE_CID').toBeTruthy();
    expect(Number.isFinite(durationSec) && durationSec > 0, 'set TRANSCODE_CALIBRATION_DURATION_SEC').toBe(true);

    const sdk = makeSdk();
    const wallet = new ethers.Wallet(userKey, new ethers.JsonRpcProvider(rpcUrl));
    await sdk.authenticate('signer', { signer: wallet });

    const sessionManager = await (sdk as any).getSessionManager();
    const transcodeManager = sdk.getTranscodeManager();
    const modelId = computeTranscodeModelId(FORMATS);

    // 1) Predict (the code under test) — uniform encryption, USDC payment token.
    const estimate = await transcodeManager.estimateTranscodePrice(
      hostAddress, FORMATS, durationSec, { isEncrypted: true, paymentToken: usdc },
    );
    const pricePerToken = BigInt(estimate.pricePerToken);

    // Sanity: the predicted token count is exactly the local billing formula (uniform set).
    const expectedTokens = billingUnitsToTokens(estimateTranscodeUnits(durationSec, FORMATS, true));
    expect(estimate.tokens).toBe(expectedTokens);

    // 2) Run a REAL transcode against TEST_HOST_4 and read the host-reported billing.
    const { sessionId, jobId } = await sessionManager.startSession({
      host: hostAddress, modelId, chainId: ChainId.BASE_SEPOLIA,
      endpoint: hostUrl, paymentMethod: 'deposit',
      // size the deposit generously off the prediction (calibration ≠ tight sizing)
      depositAmount: process.env.FABSTIR_SESSION_DEPOSIT || '1.0',
      paymentToken: usdc, duration: 3600, proofInterval: 100, encryption: true,
    });
    const handle = await sessionManager.submitTranscode(
      sessionId.toString(), sourceCid, FORMATS, { isGpu: true, isEncrypted: true },
    );
    const result = await handle.result;

    // 3a) PRIMARY (scale-free): predicted tokens vs host-billed tokens. With uniform encryption
    // the ONLY variance source is probed-vs-measured duration, so allow a small duration band.
    const billedTokens = result.billing.tokens;
    const tokenGapPct = Math.abs(estimate.tokens - billedTokens) / billedTokens;
    console.log(`[calibration] predicted tokens=${estimate.tokens} billed tokens=${billedTokens} gap=${(tokenGapPct * 100).toFixed(2)}%`);
    expect(tokenGapPct).toBeLessThan(0.05); // within 5% (duration error)

    // 3b) USDC: estimate base units vs (billed tokens × pricePerToken / 1000), both base units.
    const billedBaseUnits = (BigInt(billedTokens) * pricePerToken) / PRICE_PRECISION;
    console.log(`[calibration] estimate.totalCostBaseUnits=${estimate.totalCostBaseUnits} billedBaseUnits=${billedBaseUnits} pricePerToken=${pricePerToken} (=${ethers.formatUnits(pricePerToken, 0)} raw)`);
    console.log(`[calibration] estimate.totalCost=${estimate.totalCost} USDC | billed=${ethers.formatUnits(billedBaseUnits, 6)} USDC`);
    // tokensToUsdc(estimate.tokens) must equal the same formula on the estimate's own tokens.
    expect(estimate.totalCostBaseUnits).toBe(((BigInt(estimate.tokens) * pricePerToken) / PRICE_PRECISION).toString());

    // 3c) On-chain cross-check (diagnostic, NOT a hard assert): read the RAW sessionJobs(jobId)
    // charge in base units. ⚠️ Do NOT use getSessionJob().withdrawnByHost — it is formatEther'd
    // (18-dec) at JobMarketplace.ts:413; for 6-dec USDC that is off by 1e12.
    try {
      const jm = (sessionManager as any).contractManager?.getContract?.('jobMarketplace');
      if (jm?.sessionJobs) {
        const raw = await jm.sessionJobs(jobId);
        console.log(`[calibration] raw sessionJobs(${jobId}) =`, JSON.stringify(raw, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
      }
    } catch (e) {
      console.log('[calibration] on-chain raw read skipped:', (e as Error).message);
    }

    // 4) REPORT-BACK numbers for the v2 dev (recorded in IMPL plan 3.2):
    console.log(`[calibration] CANONICAL: tokensToUsdc = tokens × pricePerToken / ${PRICE_PRECISION} → USDC base units (6dp). Observed pricePerToken=${pricePerToken} for transcode modelId ${modelId}.`);

    await sessionManager.endSession(sessionId);
  }, 600_000);
});
