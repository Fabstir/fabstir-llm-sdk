import { describe, it, expect } from 'vitest';
import { ProofCollector } from '../../src/core/ProofCollector';
import type { SubTaskResult } from '../../src/types';

function makeResult(overrides: Partial<SubTaskResult> = {}): SubTaskResult {
  return {
    taskId: 'task-1',
    model: 'fast-model',
    summary: 'done',
    artifacts: [],
    ...overrides,
  };
}

describe('ProofCollector', () => {
  it('collect adds proof CID for a task', () => {
    const collector = new ProofCollector();
    const result = makeResult({ proofCID: 'cid-abc' });

    collector.collect(result);

    expect(collector.getProofCIDs()).toEqual(['cid-abc']);
  });

  it('collect ignores undefined proofCID', () => {
    const collector = new ProofCollector();
    const result = makeResult({ proofCID: undefined });

    collector.collect(result);

    expect(collector.getProofCIDs()).toEqual([]);
  });

  it('getProofCIDs returns all collected CIDs', () => {
    const collector = new ProofCollector();

    collector.collect(makeResult({ taskId: 't1', proofCID: 'cid-1' }));
    collector.collect(makeResult({ taskId: 't2', proofCID: 'cid-2' }));
    collector.collect(makeResult({ taskId: 't3', proofCID: 'cid-3' }));

    expect(collector.getProofCIDs()).toEqual(['cid-1', 'cid-2', 'cid-3']);
  });

  it('getProofCIDs returns empty array when none collected', () => {
    const collector = new ProofCollector();

    expect(collector.getProofCIDs()).toEqual([]);
  });

  it('clear removes all CIDs', () => {
    const collector = new ProofCollector();
    collector.collect(makeResult({ proofCID: 'cid-a' }));
    collector.collect(makeResult({ proofCID: 'cid-b' }));

    collector.clear();

    expect(collector.getProofCIDs()).toEqual([]);
  });
});
