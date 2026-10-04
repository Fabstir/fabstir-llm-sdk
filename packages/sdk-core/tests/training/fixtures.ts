// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared training fixtures. The job and the bundle are load-bearing arithmetic together:
 * trainingTokens(JOB) = declaredTokens × epochs = 9.6M; at 904/1000 per token the bill is
 * 8,678,400 base units — every test that reasons about headroom or deposits assumes exactly
 * this pair. One copy, so a change here breaks tests for the right reason.
 * (training-manager.test.ts, training-ws.test.ts and training-wire-keys.test.ts still carry
 * their own copies — migration follow-up, recorded in EXECUTION-TRAINING-EXISTING-SESSION.md.)
 */
import type { TrainingJob } from '../../src/types/training.types';

export const MODEL = `0x${'11'.repeat(32)}`;
export const USDC = '0x7C7C7C7C7C7C7C7C7C7C7C7C7C7C7C7C7C7C7C7C';       // synthetic — never a live address in tests
export const HOST = '0xA1A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1';       // synthetic

export const JOB: TrainingJob = {
  templateId: 'train-qlora-qwen38-27b-v1',
  templateHash: `0x${'ab'.repeat(32)}`,
  dataset: { manifestCID: 'uDataset', manifestSha256: `0x${'cd'.repeat(32)}`, declaredTokens: 3_200_000, samples: 5000 },
  epochs: 3,
  hyper: { rank: 16, alpha: 32, lr: '0.000200', seed: '1', seqLen: 2048 },
  output: 'adapter-v1',
};

export const BUNDLE = {
  templates: [{ id: JOB.templateId, hash: JOB.templateHash, minAllowListVersion: 26, vramGb: 40 }],
  bounds: {
    minTotalTokens: 10_000, maxDeclaredTokens: 5_000_000, maxTotalTokens: 15_000_000,
    maxEpochs: 5, maxSamples: 200_000, maxDatasetBytes: 268_435_456,
    perTemplate: { [JOB.templateId]: { ranks: [8, 16, 32], seqLens: [1024, 2048, 4096], sliceTokens: 1_000_000, specialsPerSample: 1, alphas: [16, 32, 64] } },
  },
};

export const LORA = { manifestCID: 'uAdapter', manifestSha256: `0x${'0843be66'.repeat(8)}`, file: 'adapter.gguf' };
