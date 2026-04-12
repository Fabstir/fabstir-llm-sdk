// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
import { describe, it, expect } from 'vitest';
import { buildHlsFormats, computeTranscodeModelId, buildMasterPlaylist, buildVariantPlaylist, assembleHlsContentMetadata } from '../../src/utils/transcode-utils';
import type { HlsTranscodedSource, TranscodeResult, VideoFormat } from '../../src/types/transcode.types';

describe('buildHlsFormats — Sub-phase 3.1', () => {
  it('produces one format per resolution (not two like buildStreamingFormats)', () => {
    const fmts = buildHlsFormats(['480p', '720p', '1080p', '2160p'], 'av1');
    expect(fmts).toHaveLength(4);
  });

  it('sets hls: true on all formats', () => {
    const fmts = buildHlsFormats(['1080p'], 'h264');
    expect(fmts.every(f => f.hls === true)).toBe(true);
  });

  it('sets hls_time when provided', () => {
    const fmts = buildHlsFormats(['1080p'], 'av1', 6);
    expect(fmts[0].hls_time).toBe(6);
  });

  it('omits hls_time when not provided', () => {
    const fmts = buildHlsFormats(['1080p'], 'h264');
    expect(fmts[0]).not.toHaveProperty('hls_time');
  });

  it('does NOT set encrypt or trim_percent', () => {
    const fmts = buildHlsFormats(['720p', '1080p'], 'h264', 6);
    for (const f of fmts) {
      expect(f).not.toHaveProperty('encrypt');
      expect(f).not.toHaveProperty('trim_percent');
    }
  });

  it('uses correct vf scale and bitrates from CODEC_DEFAULTS', () => {
    const fmts = buildHlsFormats(['480p', '1080p'], 'av1');
    expect(fmts[0].vf).toBe('scale=854x480');
    expect(fmts[0].b_v).toBe('0.5M');
    expect(fmts[1].vf).toBe('scale=1920x1080');
    expect(fmts[1].b_v).toBe('3M');
  });

  it('assigns sequential IDs starting from 1', () => {
    const fmts = buildHlsFormats(['480p', '720p', '1080p'], 'h264');
    expect(fmts.map(f => f.id)).toEqual([1, 2, 3]);
  });

  it('skips unknown resolutions', () => {
    const fmts = buildHlsFormats(['480p', 'unknown', '1080p'], 'h264');
    expect(fmts).toHaveLength(2);
    expect(fmts[0].vf).toBe('scale=854x480');
    expect(fmts[1].vf).toBe('scale=1920x1080');
  });

  it('FIELD_ORDER includes hls and hls_time (verified via computeTranscodeModelId hash)', () => {
    // If hls/hls_time are in FIELD_ORDER, two formats differing only in hls produce different hashes
    const base = [{ id: 1, ext: 'mp4', vcodec: 'h264_nvenc', vf: 'scale=1920x1080' }];
    const withHls = [{ id: 1, ext: 'mp4', vcodec: 'h264_nvenc', vf: 'scale=1920x1080', hls: true, hls_time: 6 }];
    const hashBase = computeTranscodeModelId(base);
    const hashHls = computeTranscodeModelId(withHls);
    expect(hashHls).not.toBe(hashBase);
  });
});

// --- Sub-phase 3.2: M3U8 Playlist Generation ---

const mockSource1080p: HlsTranscodedSource = {
  resolution: '1080p', codec: 'av1', container: 'mp4', bitrateKbps: 3000,
  initSegmentCid: 'zINIT1080', segments: [
    { index: 0, cid: 'zSEG0', duration: 6.006, encrypted: false },
    { index: 1, cid: 'zSEG1', duration: 6.006, encrypted: false },
    { index: 2, cid: 'zSEG2', duration: 4.5, encrypted: true },
  ],
  previewSegments: 2, totalDuration: 16.512,
};

const mockSource720p: HlsTranscodedSource = {
  resolution: '720p', codec: 'av1', container: 'mp4', bitrateKbps: 1500,
  initSegmentCid: 'zINIT720', segments: [
    { index: 0, cid: 'zS720_0', duration: 6.0, encrypted: false },
  ],
  previewSegments: 1, totalDuration: 6.0,
};

describe('buildMasterPlaylist — Sub-phase 3.2', () => {
  it('produces valid #EXTM3U header', () => {
    const m3u8 = buildMasterPlaylist([mockSource1080p], r => `${r}/index.m3u8`);
    expect(m3u8.startsWith('#EXTM3U\n')).toBe(true);
  });

  it('includes #EXT-X-STREAM-INF with correct BANDWIDTH and RESOLUTION', () => {
    const m3u8 = buildMasterPlaylist([mockSource1080p], r => `${r}/index.m3u8`);
    expect(m3u8).toContain('#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080');
  });

  it('calls variantUrlFn with each resolution', () => {
    const calls: string[] = [];
    buildMasterPlaylist([mockSource1080p, mockSource720p], r => { calls.push(r); return `${r}.m3u8`; });
    expect(calls).toEqual(['1080p', '720p']);
  });

  it('handles single resolution', () => {
    const m3u8 = buildMasterPlaylist([mockSource720p], r => `${r}.m3u8`);
    const lines = m3u8.trim().split('\n');
    expect(lines).toHaveLength(3); // #EXTM3U, #EXT-X-STREAM-INF, URL
  });

  it('handles multiple resolutions in correct order', () => {
    const m3u8 = buildMasterPlaylist([mockSource720p, mockSource1080p], r => `${r}.m3u8`);
    const streamInfLines = m3u8.split('\n').filter(l => l.startsWith('#EXT-X-STREAM-INF'));
    expect(streamInfLines[0]).toContain('BANDWIDTH=1500000');
    expect(streamInfLines[1]).toContain('BANDWIDTH=3000000');
  });
});

describe('buildVariantPlaylist — Sub-phase 3.2', () => {
  it('produces valid #EXTM3U and #EXT-X-VERSION:7 header', () => {
    const m3u8 = buildVariantPlaylist(mockSource1080p, cid => `https://s5.example/${cid}`);
    expect(m3u8).toContain('#EXTM3U');
    expect(m3u8).toContain('#EXT-X-VERSION:7');
  });

  it('computes #EXT-X-TARGETDURATION as ceiling of max segment duration', () => {
    const m3u8 = buildVariantPlaylist(mockSource1080p, cid => cid);
    expect(m3u8).toContain('#EXT-X-TARGETDURATION:7'); // ceil(6.006)
  });

  it('includes #EXT-X-MAP:URI for init segment', () => {
    const m3u8 = buildVariantPlaylist(mockSource1080p, cid => `https://s5.example/${cid}`);
    expect(m3u8).toContain('#EXT-X-MAP:URI="https://s5.example/zINIT1080"');
  });

  it('lists all segments with #EXTINF and correct duration', () => {
    const m3u8 = buildVariantPlaylist(mockSource1080p, cid => cid);
    const extinfLines = m3u8.split('\n').filter(l => l.startsWith('#EXTINF'));
    expect(extinfLines).toHaveLength(3);
    expect(extinfLines[0]).toBe('#EXTINF:6.006000,');
    expect(extinfLines[2]).toBe('#EXTINF:4.500000,');
  });

  it('calls segmentUrlFn with each segment CID and init CID', () => {
    const calls: string[] = [];
    buildVariantPlaylist(mockSource1080p, cid => { calls.push(cid); return cid; });
    expect(calls).toContain('zINIT1080');
    expect(calls).toContain('zSEG0');
    expect(calls).toContain('zSEG1');
    expect(calls).toContain('zSEG2');
  });

  it('ends with #EXT-X-ENDLIST', () => {
    const m3u8 = buildVariantPlaylist(mockSource1080p, cid => cid);
    expect(m3u8.trim().endsWith('#EXT-X-ENDLIST')).toBe(true);
  });
});

// --- Sub-phase 3.3: assembleHlsContentMetadata ---

describe('assembleHlsContentMetadata — Sub-phase 3.3', () => {
  const hlsOutput = {
    id: 1, hls: true as const, initSegmentCid: 'zINIT',
    segments: [{ index: 0, cid: 'zS0', duration: 6.0, encrypted: false }],
    previewSegments: 1, totalSegments: 5, totalDuration: 30.0,
  };
  const stdOutput = { id: 2, ext: 'mp4', cid: 'zSTD' };
  const formats: VideoFormat[] = [
    { id: 1, ext: 'mp4', vcodec: 'h264_nvenc', vf: 'scale=1920x1080', b_v: '5M', hls: true },
    { id: 2, ext: 'mp4', vcodec: 'h264_nvenc', vf: 'scale=1920x1080', b_v: '5M' },
  ];
  const result: TranscodeResult = {
    taskId: 't1', outputs: [hlsOutput, stdOutput],
    billing: { units: 60, tokens: 60000 }, duration: 60,
    qualityMetrics: null, proofTreeCID: null, proofTreeRootHash: null,
  };

  it('maps HLS outputs to HlsTranscodedSource per format', () => {
    const meta = assembleHlsContentMetadata(result, formats, 'zSRC', 10, 42);
    expect(meta.sources).toHaveLength(1);
    expect(meta.sources[0].initSegmentCid).toBe('zINIT');
    expect(meta.sources[0].segments).toHaveLength(1);
  });

  it('skips non-HLS outputs', () => {
    const meta = assembleHlsContentMetadata(result, formats, 'zSRC', 10, 42);
    // Only 1 HLS source mapped, the standard output (id:2) is skipped
    expect(meta.sources).toHaveLength(1);
  });

  it('parses vf to resolution name and b_v to bitrateKbps', () => {
    const meta = assembleHlsContentMetadata(result, formats, 'zSRC', 10, 42);
    expect(meta.sources[0].resolution).toBe('1080p');
    expect(meta.sources[0].bitrateKbps).toBe(5000);
  });

  it('normalizes vcodec to short codec name', () => {
    const meta = assembleHlsContentMetadata(result, formats, 'zSRC', 10, 42);
    expect(meta.sources[0].codec).toBe('h264');
  });

  it('sets sourceCid, freePreviewPercent, and jobId correctly', () => {
    const meta = assembleHlsContentMetadata(result, formats, 'zSRC', 10, 42);
    expect(meta.sourceCid).toBe('zSRC');
    expect(meta.freePreviewPercent).toBe(10);
    expect(meta.jobId).toBe(42);
  });
});
