// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
import { describe, it, expect } from 'vitest';
import type { VideoFormat, TranscodeResult, TranscodeSubmitOptions } from '../../src/types/transcode.types';
import type { HlsSegment, HlsOutput, TranscodeOutputUnion, HlsTranscodedSource, HlsContentMetadata } from '../../src/types/transcode.types';
import { isHlsOutput } from '../../src/types/transcode.types';

describe('HLS Types — Sub-phase 1.1', () => {
  it('VideoFormat accepts hls boolean field', () => {
    const fmt: VideoFormat = { id: 1, ext: 'mp4', hls: true };
    expect(fmt.hls).toBe(true);
  });

  it('VideoFormat accepts hls_time number field', () => {
    const fmt: VideoFormat = { id: 1, ext: 'mp4', hls: true, hls_time: 6 };
    expect(fmt.hls_time).toBe(6);
  });

  it('HlsSegment has required fields index, cid, duration, encrypted', () => {
    const seg: HlsSegment = { index: 0, cid: 'zABC123', duration: 6.0, encrypted: false };
    expect(seg.index).toBe(0);
    expect(seg.cid).toBe('zABC123');
    expect(seg.duration).toBe(6.0);
    expect(seg.encrypted).toBe(false);
  });

  it('HlsOutput has required fields', () => {
    const output: HlsOutput = {
      id: 1, hls: true, initSegmentCid: 'zINIT',
      segments: [{ index: 0, cid: 'zSEG0', duration: 6.0, encrypted: false }],
      previewSegments: 1, totalSegments: 10, totalDuration: 60.0,
    };
    expect(output.hls).toBe(true);
    expect(output.initSegmentCid).toBe('zINIT');
    expect(output.segments).toHaveLength(1);
    expect(output.previewSegments).toBe(1);
    expect(output.totalSegments).toBe(10);
    expect(output.totalDuration).toBe(60.0);
  });

  it('isHlsOutput returns true for object with hls: true and segments array', () => {
    const hlsOut: TranscodeOutputUnion = {
      id: 1, hls: true, initSegmentCid: 'zINIT',
      segments: [], previewSegments: 0, totalSegments: 5, totalDuration: 30.0,
    };
    expect(isHlsOutput(hlsOut)).toBe(true);
  });

  it('isHlsOutput returns false for standard TranscodedOutput with cid field', () => {
    const stdOut: TranscodeOutputUnion = { id: 1, ext: 'mp4', cid: 'zOUTPUT' };
    expect(isHlsOutput(stdOut)).toBe(false);
  });

  it('TranscodeResult.outputs accepts array containing both TranscodedOutput and HlsOutput', () => {
    const result: TranscodeResult = {
      taskId: 'task-1',
      outputs: [
        { id: 1, ext: 'mp4', cid: 'zSTD' },
        { id: 2, hls: true, initSegmentCid: 'zINIT', segments: [], previewSegments: 0, totalSegments: 5, totalDuration: 30 },
      ],
      billing: { units: 60, tokens: 60000 },
      duration: 60,
      qualityMetrics: null,
      proofTreeCID: null,
      proofTreeRootHash: null,
    };
    expect(result.outputs).toHaveLength(2);
    expect(isHlsOutput(result.outputs[0])).toBe(false);
    expect(isHlsOutput(result.outputs[1])).toBe(true);
  });
});

describe('HLS Types — Sub-phase 1.2', () => {
  it('TranscodeSubmitOptions accepts previewPercent number field', () => {
    const opts: TranscodeSubmitOptions = { previewPercent: 10 };
    expect(opts.previewPercent).toBe(10);
  });

  it('HlsTranscodedSource has required fields', () => {
    const src: HlsTranscodedSource = {
      resolution: '1080p', codec: 'av1', container: 'mp4', bitrateKbps: 4500,
      initSegmentCid: 'zINIT', segments: [{ index: 0, cid: 'zS0', duration: 6.0, encrypted: false }],
      previewSegments: 1, totalDuration: 60.0,
    };
    expect(src.resolution).toBe('1080p');
    expect(src.bitrateKbps).toBe(4500);
    expect(src.segments).toHaveLength(1);
  });

  it('HlsContentMetadata has required fields', () => {
    const meta: HlsContentMetadata = {
      sourceCid: 'zSRC', transcodedAt: Date.now(), freePreviewPercent: 10,
      sources: [], jobId: 42,
    };
    expect(meta.sourceCid).toBe('zSRC');
    expect(meta.freePreviewPercent).toBe(10);
    expect(meta.jobId).toBe(42);
  });
});
