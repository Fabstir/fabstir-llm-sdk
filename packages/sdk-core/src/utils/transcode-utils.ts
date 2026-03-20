// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
import { keccak256, toUtf8Bytes } from 'ethers';
import type { VideoFormat, QualityMetrics } from '../types/transcode.types';

/** VideoFormat field order matching the struct definition */
const FIELD_ORDER: (keyof VideoFormat)[] = [
  'id', 'ext', 'label', 'type', 'vcodec', 'acodec', 'preset', 'profile',
  'ch', 'vf', 'b_v', 'ar', 'b_a', 'c_a', 'minrate', 'maxrate', 'bufsize',
  'gpu', 'compression_level', 'dest', 'encrypt',
];
const PSNR_STANDARD = 38.0;
const PSNR_HIGH = 42.0;
const SSIM_HIGH = 0.95;
const ENCRYPTION_FACTOR = 1.1;

/** Build canonical object with struct field order, omitting undefined/null */
function canonicalFormat(f: VideoFormat): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const key of FIELD_ORDER) {
    if (f[key] !== undefined && f[key] !== null) obj[key] = f[key];
  }
  return obj;
}

/** Compute deterministic modelId: sort by id, canonical JSON, keccak256 hash */
export function computeTranscodeModelId(formats: VideoFormat[]): string {
  const sorted = [...formats].sort((a, b) => a.id - b.id);
  return keccak256(toUtf8Bytes(JSON.stringify(sorted.map(canonicalFormat))));
}

/** Convert billing units to token amount (1 unit = 1000 tokens), rounding up */
export function billingUnitsToTokens(units: number): number {
  return Math.ceil(units * 1000);
}

/** Extract resolution factor from vf string (e.g. 'scale=1920x1080') */
export function resolutionFactor(vf?: string): number {
  if (!vf) return 1.0;
  const match = vf.match(/(\d+)x(\d+)/);
  if (!match) return 1.0;
  const height = parseInt(match[2], 10);
  if (height <= 480) return 0.25;
  if (height <= 720) return 0.5;
  if (height <= 1080) return 1.0;
  return 2.0;
}

/** Map video codec string to complexity factor */
export function codecFactor(vcodec?: string): number {
  if (!vcodec) return 1.0;
  const v = vcodec.toLowerCase();
  if (v.includes('h264') || v.includes('libx264')) return 1.0;
  if (v.includes('hevc') || v.includes('h265') || v.includes('libx265')) return 1.2;
  if (v.includes('av1') || v.includes('libsvtav1') || v.includes('libaom')) return 1.5;
  return 1.0;
}

/** Estimate total transcode billing units across all formats */
export function estimateTranscodeUnits(
  durationSeconds: number, formats: VideoFormat[], isEncrypted?: boolean,
): number {
  let total = 0;
  for (const fmt of formats) {
    total += durationSeconds * resolutionFactor(fmt.vf) * codecFactor(fmt.vcodec);
  }
  return isEncrypted ? total * ENCRYPTION_FACTOR : total;
}

/** Validate quality metrics against tier thresholds */
export function validateQuality(
  metrics: QualityMetrics | null, tier: 'standard' | 'high' = 'standard',
): { passed: boolean; reason?: string } {
  if (!metrics) return { passed: false, reason: 'Quality metrics not available' };
  if (tier === 'high') {
    if (metrics.ssim == null)
      return { passed: false, reason: `High tier requires SSIM >= ${SSIM_HIGH}, but SSIM not provided` };
    if (metrics.psnrDB < PSNR_HIGH)
      return { passed: false, reason: `PSNR ${metrics.psnrDB} dB below high tier threshold ${PSNR_HIGH} dB` };
    if (metrics.ssim < SSIM_HIGH)
      return { passed: false, reason: `SSIM ${metrics.ssim} below high tier threshold ${SSIM_HIGH}` };
    return { passed: true };
  }
  if (metrics.psnrDB < PSNR_STANDARD)
    return { passed: false, reason: `PSNR ${metrics.psnrDB} dB below standard tier threshold ${PSNR_STANDARD} dB` };
  return { passed: true };
}
