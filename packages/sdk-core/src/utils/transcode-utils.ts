// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
import { keccak256, toUtf8Bytes } from 'ethers';
import type { VideoFormat, QualityMetrics, TranscodedSource, TranscodedContentMetadata, TranscodeResult } from '../types/transcode.types';

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

/** Normalize codec string to short name (h264, hevc, av1) */
function normalizeCodec(vcodec: string): string {
  const v = vcodec.toLowerCase();
  if (v.includes('h264') || v.includes('libx264')) return 'h264';
  if (v.includes('hevc') || v.includes('h265') || v.includes('libx265')) return 'hevc';
  if (v.includes('av1') || v.includes('libsvtav1') || v.includes('libaom')) return 'av1';
  return vcodec;
}

const CODEC_FACTORS: Record<string, number> = { h264: 1.0, hevc: 1.2, av1: 1.5 };

/** Map video codec string to complexity factor */
export function codecFactor(vcodec?: string): number {
  if (!vcodec) return 1.0;
  return CODEC_FACTORS[normalizeCodec(vcodec)] ?? 1.0;
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

// --- Streaming content pipeline utilities ---

const RESOLUTION_MAP: Record<string, { vf: string; height: number }> = {
  '480p': { vf: 'scale=854x480', height: 480 },
  '720p': { vf: 'scale=1280x720', height: 720 },
  '1080p': { vf: 'scale=1920x1080', height: 1080 },
  '2160p': { vf: 'scale=3840x2160', height: 2160 },
};

const CODEC_DEFAULTS: Record<string, { vcodec: string; preset: string; bitrates: Record<string, string> }> = {
  h264: { vcodec: 'h264_nvenc', preset: 'fast', bitrates: { '480p': '1M', '720p': '2M', '1080p': '5M', '2160p': '15M' } },
  av1: { vcodec: 'av1_nvenc', preset: 'p4', bitrates: { '480p': '0.5M', '720p': '1.5M', '1080p': '3M', '2160p': '10M' } },
};

/** Reverse-map vf string to resolution name */
function vfToResolution(vf: string): string {
  for (const [name, info] of Object.entries(RESOLUTION_MAP)) {
    if (info.vf === vf) return name;
  }
  return 'unknown';
}

/** Parse bitrate string (e.g. '5M') to kbps number */
function parseBitrateKbps(bv: string): number {
  const match = bv.match(/^([\d.]+)([MmKk]?)$/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === 'M') return num * 1000;
  if (unit === 'K') return num;
  return num;
}

/** Build format array with full + preview per resolution for streaming content */
export function buildStreamingFormats(
  resolutions: string[], codec: string, previewPercent: number,
): VideoFormat[] {
  const cd = CODEC_DEFAULTS[codec] ?? CODEC_DEFAULTS.h264;
  const formats: VideoFormat[] = [];
  let nextId = 1;
  for (const res of resolutions) {
    const rm = RESOLUTION_MAP[res];
    if (!rm) continue;
    const common = { ext: 'mp4', vcodec: cd.vcodec, acodec: 'aac', preset: cd.preset, ar: '48k', ch: 2, vf: rm.vf, b_v: cd.bitrates[res], dest: 's5' };
    if (previewPercent > 0) {
      formats.push({ ...common, id: nextId, encrypt: true });
      formats.push({ ...common, id: nextId + 1, encrypt: false, trim_percent: previewPercent });
      nextId += 2;
    } else {
      formats.push({ ...common, id: nextId });
      nextId += 1;
    }
  }
  return formats;
}

/** Select best resolution for device/bandwidth from transcoded sources */
export function selectResolution(
  sources: TranscodedSource[], options?: { maxHeight?: number; bandwidthKbps?: number },
): TranscodedSource {
  let candidates = sources.map(s => ({ src: s, height: RESOLUTION_MAP[s.resolution]?.height ?? 0 }));
  if (options?.maxHeight) candidates = candidates.filter(c => c.height <= options.maxHeight!);
  if (options?.bandwidthKbps) candidates = candidates.filter(c => c.src.bitrateKbps <= options.bandwidthKbps!);
  candidates.sort((a, b) => b.height - a.height);
  return candidates[0]?.src ?? sources[0];
}

/** Assemble TranscodedContentMetadata from transcode result and format array */
export function assembleContentMetadata(
  result: TranscodeResult, formats: VideoFormat[], sourceCid: string, previewPercent: number, jobId: number,
): TranscodedContentMetadata {
  const sources: TranscodedSource[] = [];
  for (let i = 0; i < formats.length; i += 2) {
    const fullFmt = formats[i];
    const prevFmt = formats[i + 1];
    const fullOut = result.outputs.find(o => o.id === fullFmt.id);
    const prevOut = result.outputs.find(o => o.id === prevFmt.id);
    if (!fullOut || !prevOut) continue;
    sources.push({
      resolution: vfToResolution(fullFmt.vf!),
      previewCid: prevOut.cid,
      fullCid: fullOut.cid,
      codec: normalizeCodec(fullFmt.vcodec!),
      container: fullFmt.ext,
      bitrateKbps: parseBitrateKbps(fullFmt.b_v!),
    });
  }
  return { sourceCid, transcodedAt: Date.now(), freePreviewPercent: previewPercent, sources, jobId };
}
