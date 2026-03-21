import { describe, it, expect } from 'vitest';
import type {
  VideoFormat,
  TranscodedSource,
  TranscodedContentMetadata,
} from '../../src/types/transcode.types';
import { computeTranscodeModelId } from '../../src/utils/transcode-utils';

describe('VideoFormat streaming fields', () => {
  it('accepts trim_percent field', () => {
    const fmt: VideoFormat = { id: 2, ext: 'mp4', trim_percent: 15 };
    expect(fmt.trim_percent).toBe(15);
  });

  it('excludes trim_percent from model ID', () => {
    const withTrim: VideoFormat[] = [{ id: 1, ext: 'mp4', vcodec: 'libx264', trim_percent: 15 }];
    const without: VideoFormat[] = [{ id: 1, ext: 'mp4', vcodec: 'libx264' }];
    expect(computeTranscodeModelId(withTrim)).toBe(computeTranscodeModelId(without));
  });
});

describe('TranscodedSource', () => {
  it('has previewCid and fullCid fields', () => {
    const src: TranscodedSource = {
      resolution: '1080p',
      previewCid: 'zPreview123',
      fullCid: 'uFull456',
      codec: 'h264',
      container: 'mp4',
      bitrateKbps: 5000,
    };
    expect(src.previewCid).toBe('zPreview123');
    expect(src.fullCid).toBe('uFull456');
    expect(src.resolution).toBe('1080p');
    expect(src.codec).toBe('h264');
    expect(src.container).toBe('mp4');
    expect(src.bitrateKbps).toBe(5000);
  });

  it('accepts optional proofTreeCid', () => {
    const src: TranscodedSource = {
      resolution: '720p',
      previewCid: 'zPrev',
      fullCid: 'uFull',
      codec: 'av1',
      container: 'mp4',
      bitrateKbps: 1500,
      proofTreeCid: 'zProof789',
    };
    expect(src.proofTreeCid).toBe('zProof789');
  });
});

describe('TranscodedContentMetadata', () => {
  it('has sources array, freePreviewPercent, sourceCid, and jobId', () => {
    const meta: TranscodedContentMetadata = {
      sourceCid: 'zSource123',
      transcodedAt: 1700000000,
      freePreviewPercent: 15,
      sources: [
        {
          resolution: '1080p',
          previewCid: 'zPrev1080',
          fullCid: 'uFull1080',
          codec: 'h264',
          container: 'mp4',
          bitrateKbps: 5000,
        },
      ],
      jobId: 42,
    };
    expect(meta.freePreviewPercent).toBe(15);
    expect(meta.sourceCid).toBe('zSource123');
    expect(meta.jobId).toBe(42);
    expect(meta.sources).toHaveLength(1);
    expect(meta.sources[0].resolution).toBe('1080p');
  });
});
