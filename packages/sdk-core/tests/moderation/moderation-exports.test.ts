// Copyright (c) 2026 Fabstir. SPDX-License-Identifier: BUSL-1.1
// M3 moderation publish gate — public exports + SDK config wiring.
// The moderationGate config option (OQ-M3-7: name confirmed by Jules) defaults
// to false — the gate ships dark (D1) until the documented go-live.
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  FabstirSDKCore,
  validateModerationReport,
  checkModerationVerdict,
  evaluateModerationGate,
} from '../../src';
import type {
  ModerationReport,
  ModerationGateResult,
  ModerationFetchOutcome,
  ModerationReportFetcher,
  ModerationVerdict,
} from '../../src';
import fixture from './report-fixture.json';

const A = '0x' + '1'.repeat(40);
const sdkConfig = (extra: object = {}) => ({
  chainId: 84532,
  rpcUrl: 'http://localhost:8545',
  contractAddresses: { jobMarketplace: A, nodeRegistry: A, proofSystem: A, hostEarnings: A, usdcToken: A },
  ...extra,
});

describe('moderation gate exports (root)', () => {
  it('validator and gate functions are exported from the package root', () => {
    expect(typeof validateModerationReport).toBe('function');
    expect(typeof checkModerationVerdict).toBe('function');
    expect(typeof evaluateModerationGate).toBe('function');
  });

  it('moderation types resolve from the root', () => {
    const report: ModerationReport = fixture as ModerationReport;
    const verdict: ModerationVerdict = report.verdict;
    expect(verdict).toBe('PASS_RATED');

    const outcome: ModerationFetchOutcome = { kind: 'no-report' };
    const result: ModerationGateResult = checkModerationVerdict(outcome);
    expect(result.allowed).toBe(false);

    // OQ-M3-1: the fetch is behind this interface until the transport lands.
    const fetcher: ModerationReportFetcher = {
      fetchModerationReport: async (_jobId: bigint) => ({ kind: 'no-report' as const }),
    };
    expect(typeof fetcher.fetchModerationReport).toBe('function');
  });
});

describe('FabstirSDKCore config: moderationGate (ships dark, D1)', () => {
  it('defaults to false when not configured', () => {
    const sdk = new FabstirSDKCore(sdkConfig() as any);
    expect((sdk as any).config.moderationGate).toBe(false);
  });

  it('preserves an explicit moderationGate: true through validateConfig', () => {
    const sdk = new FabstirSDKCore(sdkConfig({ moderationGate: true }) as any);
    expect((sdk as any).config.moderationGate).toBe(true);
  });
});
