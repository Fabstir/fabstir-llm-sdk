import { describe, it, expect } from 'vitest';
import type { VideoFormat, TranscodedSource } from '../../src/types/transcode.types';
import {
  buildStreamingFormats,
  selectResolution,
  assembleContentMetadata,
} from '../../src/utils/transcode-utils';

describe('buildStreamingFormats', () => {
  it('produces 4 formats for 2 resolutions', () => {
    const formats = buildStreamingFormats(['720p', '1080p'], 'h264', 15);
    expect(formats).toHaveLength(4);
  });

  it('odd IDs are full (encrypt: true), even IDs are preview (trim_percent set)', () => {
    const formats = buildStreamingFormats(['1080p'], 'h264', 15);
    const full = formats.find((f: VideoFormat) => f.id === 1)!;
    const preview = formats.find((f: VideoFormat) => f.id === 2)!;
    expect(full.encrypt).toBe(true);
    expect(full.trim_percent).toBeUndefined();
    expect(preview.encrypt).toBe(false);
    expect(preview.trim_percent).toBe(15);
  });

  it('uses correct vf scale for each resolution', () => {
    const formats = buildStreamingFormats(['480p', '720p', '1080p', '2160p'], 'h264', 10);
    const vfs = formats.filter((f: VideoFormat) => f.id % 2 === 1).map((f: VideoFormat) => f.vf);
    expect(vfs).toContain('scale=854x480');
    expect(vfs).toContain('scale=1280x720');
    expect(vfs).toContain('scale=1920x1080');
    expect(vfs).toContain('scale=3840x2160');
  });

  it('produces 1 format per resolution when previewPercent is 0 (no preview)', () => {
    const formats = buildStreamingFormats(['720p', '1080p'], 'h264', 0);
    expect(formats).toHaveLength(2);
    expect(formats[0].encrypt).toBeUndefined();
    expect(formats[0].trim_percent).toBeUndefined();
    expect(formats[0].vf).toBe('scale=1280x720');
    expect(formats[1].vf).toBe('scale=1920x1080');
  });

  it('uses codec-specific defaults (h264 preset fast, av1 preset p4)', () => {
    const h264 = buildStreamingFormats(['1080p'], 'h264', 15);
    expect(h264[0].vcodec).toBe('h264_nvenc');
    expect(h264[0].preset).toBe('fast');
    expect(h264[0].b_v).toBe('5M');

    const av1 = buildStreamingFormats(['1080p'], 'av1', 15);
    expect(av1[0].vcodec).toBe('av1_nvenc');
    expect(av1[0].preset).toBe('p4');
    expect(av1[0].b_v).toBe('3M');
  });
});

describe('selectResolution', () => {
  const sources: TranscodedSource[] = [
    { resolution: '480p', previewCid: 'p480', fullCid: 'f480', codec: 'h264', container: 'mp4', bitrateKbps: 1000 },
    { resolution: '720p', previewCid: 'p720', fullCid: 'f720', codec: 'h264', container: 'mp4', bitrateKbps: 2000 },
    { resolution: '1080p', previewCid: 'p1080', fullCid: 'f1080', codec: 'h264', container: 'mp4', bitrateKbps: 5000 },
  ];

  it('returns highest available when no constraints', () => {
    expect(selectResolution(sources).resolution).toBe('1080p');
  });

  it('respects maxHeight (returns 720p when maxHeight=720)', () => {
    expect(selectResolution(sources, { maxHeight: 720 }).resolution).toBe('720p');
  });

  it('respects bandwidthKbps (returns lower resolution when bandwidth limited)', () => {
    expect(selectResolution(sources, { bandwidthKbps: 2500 }).resolution).toBe('720p');
  });
});

describe('assembleContentMetadata', () => {
  const mockResult = {
    taskId: 'task-1',
    outputs: [
      { id: 1, ext: 'mp4', cid: 'fullCid1080' },
      { id: 2, ext: 'mp4', cid: 'prevCid1080' },
      { id: 3, ext: 'mp4', cid: 'fullCid720' },
      { id: 4, ext: 'mp4', cid: 'prevCid720' },
    ],
    billing: { units: 100, tokens: 100000 },
    duration: 5000,
    qualityMetrics: null,
    proofTreeCID: null,
    proofTreeRootHash: null,
  };

  const formats: VideoFormat[] = [
    { id: 1, ext: 'mp4', vcodec: 'h264_nvenc', vf: 'scale=1920x1080', b_v: '5M', encrypt: true },
    { id: 2, ext: 'mp4', vcodec: 'h264_nvenc', vf: 'scale=1920x1080', b_v: '5M', encrypt: false, trim_percent: 15 },
    { id: 3, ext: 'mp4', vcodec: 'h264_nvenc', vf: 'scale=1280x720', b_v: '2M', encrypt: true },
    { id: 4, ext: 'mp4', vcodec: 'h264_nvenc', vf: 'scale=1280x720', b_v: '2M', encrypt: false, trim_percent: 15 },
  ];

  it('pairs full (odd ID) and preview (even ID) outputs by resolution', () => {
    const meta = assembleContentMetadata(mockResult, formats, 'zSource', 15, 42);
    expect(meta.sources).toHaveLength(2);
    const s1080 = meta.sources.find(s => s.resolution === '1080p')!;
    expect(s1080.fullCid).toBe('fullCid1080');
    expect(s1080.previewCid).toBe('prevCid1080');
    const s720 = meta.sources.find(s => s.resolution === '720p')!;
    expect(s720.fullCid).toBe('fullCid720');
    expect(s720.previewCid).toBe('prevCid720');
  });

  it('sets freePreviewPercent, sourceCid, and jobId correctly', () => {
    const meta = assembleContentMetadata(mockResult, formats, 'zSource', 15, 42);
    expect(meta.freePreviewPercent).toBe(15);
    expect(meta.sourceCid).toBe('zSource');
    expect(meta.jobId).toBe(42);
    expect(meta.transcodedAt).toBeGreaterThan(0);
  });

  it('parses vf to resolution name and b_v to bitrateKbps', () => {
    const meta = assembleContentMetadata(mockResult, formats, 'zSource', 15, 42);
    const s1080 = meta.sources.find(s => s.resolution === '1080p')!;
    expect(s1080.bitrateKbps).toBe(5000);
    expect(s1080.codec).toBe('h264');
    expect(s1080.container).toBe('mp4');
    const s720 = meta.sources.find(s => s.resolution === '720p')!;
    expect(s720.bitrateKbps).toBe(2000);
  });
});
