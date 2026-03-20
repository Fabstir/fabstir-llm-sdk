import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  Codec,
  type VideoFormat,
  type TranscodeHandle,
  type TranscodeResult,
  type TranscodedOutput,
  type GOPInfo,
} from '../../src/types/transcode.types';

describe('transcode.types - Sub-phase 1.1', () => {
  it('Codec enum includes HEVC with value 2', () => {
    expect(Codec.HEVC).toBe(2);
  });

  it('GOPProof interface comments reference keccak256 not Blake3', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/types/transcode.types.ts'),
      'utf-8'
    );
    const gopProofSection = source.slice(
      source.indexOf('export interface GOPProof'),
      source.indexOf('}', source.indexOf('export interface GOPProof')) + 1
    );
    expect(gopProofSection).not.toContain('Blake3');
    expect(gopProofSection).toContain('keccak256');
  });

  it('VideoFormat interface exists with required fields id and ext', () => {
    const format: VideoFormat = { id: 1, ext: 'mp4' };
    expect(format.id).toBe(1);
    expect(format.ext).toBe('mp4');
  });

  it('TranscodeHandle interface exists with taskId, cancel, and result', () => {
    const handle: TranscodeHandle = {
      taskId: 'test-123',
      cancel: () => {},
      result: Promise.resolve({
        taskId: 'test-123',
        outputs: [],
        billing: { units: 0, tokens: 0 },
        duration: 0,
        qualityMetrics: null,
        proofTreeCID: null,
        proofTreeRootHash: null,
      }),
    };
    expect(handle.taskId).toBe('test-123');
    expect(typeof handle.cancel).toBe('function');
    expect(handle.result).toBeInstanceOf(Promise);
  });
});
