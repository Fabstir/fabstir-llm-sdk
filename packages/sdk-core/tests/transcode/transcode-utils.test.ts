import { describe, it, expect } from 'vitest';
import { keccak256, toUtf8Bytes } from 'ethers';
import type { VideoFormat, QualityMetrics } from '../../src/types/transcode.types';
import {
  computeTranscodeModelId, billingUnitsToTokens, resolutionFactor,
  codecFactor, estimateTranscodeUnits, validateQuality,
} from '../../src/utils/transcode-utils';

describe('computeTranscodeModelId', () => {
  it('returns keccak256 of sorted canonical JSON', () => {
    const formats: VideoFormat[] = [{ id: 1, ext: 'mp4', vcodec: 'libx264' }];
    const canonical = JSON.stringify([{ id: 1, ext: 'mp4', vcodec: 'libx264' }]);
    expect(computeTranscodeModelId(formats)).toBe(keccak256(toUtf8Bytes(canonical)));
  });

  it('is order-independent', () => {
    const a: VideoFormat[] = [
      { id: 2, ext: 'webm', vcodec: 'libsvtav1' },
      { id: 1, ext: 'mp4', vcodec: 'libx264' },
    ];
    const b: VideoFormat[] = [
      { id: 1, ext: 'mp4', vcodec: 'libx264' },
      { id: 2, ext: 'webm', vcodec: 'libsvtav1' },
    ];
    expect(computeTranscodeModelId(a)).toBe(computeTranscodeModelId(b));
  });

  it('omits undefined fields', () => {
    const withUndef: VideoFormat[] = [{ id: 1, ext: 'mp4', label: undefined, vcodec: 'libx264' }];
    const without: VideoFormat[] = [{ id: 1, ext: 'mp4', vcodec: 'libx264' }];
    expect(computeTranscodeModelId(withUndef)).toBe(computeTranscodeModelId(without));
  });

  it('preserves field order matching VideoFormat struct', () => {
    const formats: VideoFormat[] = [{ id: 1, ext: 'mp4', vcodec: 'libx264', vf: 'scale=1920x1080' }];
    const canonical = JSON.stringify([{ id: 1, ext: 'mp4', vcodec: 'libx264', vf: 'scale=1920x1080' }]);
    expect(computeTranscodeModelId(formats)).toBe(keccak256(toUtf8Bytes(canonical)));
  });
});

describe('billingUnitsToTokens', () => {
  it('converts correctly', () => {
    expect(billingUnitsToTokens(60.0)).toBe(60000);
    expect(billingUnitsToTokens(22.5)).toBe(22500);
  });

  it('rounds up fractional products', () => {
    expect(billingUnitsToTokens(0.0005)).toBe(1);
  });
});

describe('resolutionFactor', () => {
  it('returns correct factor for each tier', () => {
    expect(resolutionFactor('scale=640x480')).toBe(0.25);
    expect(resolutionFactor('scale=1280x720')).toBe(0.5);
    expect(resolutionFactor('scale=1920x1080')).toBe(1.0);
    expect(resolutionFactor('scale=3840x2160')).toBe(2.0);
  });

  it('returns 1.0 for missing vf', () => {
    expect(resolutionFactor(undefined)).toBe(1.0);
  });
});

describe('codecFactor', () => {
  it('returns correct factor', () => {
    expect(codecFactor('libx264')).toBe(1.0);
    expect(codecFactor('h264')).toBe(1.0);
    expect(codecFactor('libx265')).toBe(1.2);
    expect(codecFactor('hevc')).toBe(1.2);
    expect(codecFactor('h265')).toBe(1.2);
    expect(codecFactor('libsvtav1')).toBe(1.5);
    expect(codecFactor('av1')).toBe(1.5);
    expect(codecFactor('libaom')).toBe(1.5);
    expect(codecFactor('vp9')).toBe(1.0);
  });
});

describe('estimateTranscodeUnits', () => {
  it('calculates correctly', () => {
    const formats: VideoFormat[] = [{ id: 1, ext: 'mp4', vcodec: 'libx264', vf: 'scale=1920x1080' }];
    expect(estimateTranscodeUnits(60, formats)).toBe(60.0);
  });

  it('applies encryption factor', () => {
    const formats: VideoFormat[] = [{ id: 1, ext: 'mp4', vcodec: 'libx264', vf: 'scale=1920x1080' }];
    expect(estimateTranscodeUnits(60, formats, true)).toBeCloseTo(66.0, 1);
  });

  it('accumulates across formats', () => {
    const formats: VideoFormat[] = [
      { id: 1, ext: 'mp4', vcodec: 'libx264', vf: 'scale=1280x720' },
      { id: 2, ext: 'mp4', vcodec: 'libx264', vf: 'scale=1920x1080' },
    ];
    expect(estimateTranscodeUnits(60, formats)).toBe(90.0);
  });
});

describe('validateQuality', () => {
  it('passes standard tier at 38.0 dB', () => {
    const m: QualityMetrics = { psnrDB: 38.0, actualBitrate: 5000 };
    expect(validateQuality(m, 'standard').passed).toBe(true);
  });

  it('fails standard tier below 38.0 dB', () => {
    const m: QualityMetrics = { psnrDB: 37.9, actualBitrate: 5000 };
    expect(validateQuality(m, 'standard').passed).toBe(false);
  });

  it('passes high tier at 42.0 dB + 0.95 SSIM', () => {
    const m: QualityMetrics = { psnrDB: 42.0, ssim: 0.95, actualBitrate: 5000 };
    expect(validateQuality(m, 'high').passed).toBe(true);
  });

  it('fails high tier when SSIM null', () => {
    const m: QualityMetrics = { psnrDB: 42.0, actualBitrate: 5000 };
    expect(validateQuality(m, 'high').passed).toBe(false);
  });

  it('returns reason on failure', () => {
    const m: QualityMetrics = { psnrDB: 30.0, actualBitrate: 5000 };
    const result = validateQuality(m, 'standard');
    expect(result.passed).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason!.length).toBeGreaterThan(0);
  });

  it('returns not available when metrics null', () => {
    const result = validateQuality(null, 'standard');
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('not available');
  });
});
