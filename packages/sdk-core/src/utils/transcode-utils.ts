// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
import { keccak256, toUtf8Bytes } from 'ethers';
import type { VideoFormat, QualityMetrics, TranscodedSource, TranscodedContentMetadata, TranscodeResult, HlsTranscodedSource, HlsContentMetadata } from '../types/transcode.types';
import { isHlsOutput, isTranscodeModerationStatus, cloneTranscodeModerationStatus } from '../types/transcode.types';
import { TranscodeError } from '../errors/transcode-errors';

/** VideoFormat field order matching the struct definition */
const FIELD_ORDER: (keyof VideoFormat)[] = [
  'id', 'ext', 'label', 'type', 'vcodec', 'acodec', 'preset', 'profile',
  'ch', 'vf', 'b_v', 'ar', 'b_a', 'c_a', 'minrate', 'maxrate', 'bufsize',
  'gpu', 'compression_level', 'dest', 'encrypt', 'hls', 'hls_time',
];
const PSNR_STANDARD = 38.0;
const PSNR_HIGH = 42.0;
const SSIM_HIGH = 0.95;
const ENCRYPTION_FACTOR = 1.1;
/** Token→USDC scale; must match HostManager/SessionManager (PRICE_PRECISION = 1000n). */
const PRICE_PRECISION = 1000n;

/**
 * Canonical token→USDC conversion: (tokens × pricePerToken) / PRICE_PRECISION.
 * Returns USDC base units (6 decimals). Integer-floors.
 */
export function tokensToUsdc(tokens: number, pricePerToken: bigint | number): bigint {
  return (BigInt(tokens) * BigInt(pricePerToken)) / PRICE_PRECISION;
}

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

/**
 * Billing resolution factor from a vf string, exactly as the node reads it (billing.rs resolution_factor_from_vf): a pure
 * `scale=WxH` or `scale=W:H`, anything else 1.0. A wider match here would estimate less than the node bills.
 */
export function resolutionFactor(vf?: string): number {
  if (!vf?.startsWith('scale=')) return 1.0;
  const scale = vf.slice('scale='.length);
  const split = scale.includes('x') ? scale.indexOf('x') : scale.indexOf(':');   // the first x, else the first colon
  const heightText = split < 0 ? '' : scale.slice(split + 1);
  if (!/^\+?\d+$/.test(heightText)) return 1.0;
  const height = Number(heightText);
  if (height > 0xffffffff) return 1.0;                                            // the node parses a u32
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

/** Lifetime a transcode session never goes below: today's default, which also outlasts the node's 1,800 s run limit. */
export const TRANSCODE_SESSION_MIN_SECONDS = 3600;
/** Added to the time the rate needs: the estimate can undershoot, and the final proof must land before expiry. */
export const TRANSCODE_SESSION_MARGIN_SECONDS = 600;

/**
 * The most rate-limited time a node (8.62.4) can release a result for: its final claim waits at most 3,600 s
 * (FINAL_WAIT_CEILING_SECS), after a run of at most 1,800 s (the default TRANSCODE_TIMEOUT_SECONDS). A job whose deposit
 * pays for it and owes more has its tokens paid and its result withheld (BILLING_FAILED), however long the session.
 * A deposit that pays for less caps what is owed and escapes this; sizing is for a job funded in full.
 */
export const TRANSCODE_MAX_RELEASABLE_RATE_SECONDS = 5400;

/**
 * The session lifetime (the contract's `maxDuration`, the SDK's `duration`) a transcode of this source needs (1.39.17).
 * The model's rate cap limits how fast tokens can be claimed, so from node 8.62.4 a job the cap cannot bill before expiry
 * stops with SESSION_NOT_BILLABLE soon after it starts. A longer session costs nothing extra: the deposit sets the spend.
 *
 * @param sourceSeconds length of the source video
 * @param options.ratePerSecond the model's rate from the chain (TranscodeManager.sizeTranscodeSession reads it)
 * @param options.finalWaitUncapped the node reports `transcode-final-wait-uncapped` (8.62.6+): SOURCE_TOO_LONG does not apply
 * @throws TranscodeError `details.reason` INVALID_SOURCE_DURATION, INVALID_RATE, or SOURCE_TOO_LONG (funded in full, a job
 *   the node is certain to withhold, so funding it can only lose the deposit)
 */
export function transcodeSessionDuration(
  sourceSeconds: number, formats: VideoFormat[],
  options: { ratePerSecond: number; isEncrypted?: boolean; marginSeconds?: number; minimumSeconds?: number; finalWaitUncapped?: boolean },
): number {
  if (!Number.isFinite(sourceSeconds) || sourceSeconds <= 0) {
    throw new TranscodeError(`Source length must be a positive number of seconds, got ${sourceSeconds}`, 'TRANSCODE_FAILED', undefined,
      { reason: 'INVALID_SOURCE_DURATION' });
  }
  const { ratePerSecond, isEncrypted = true, marginSeconds = TRANSCODE_SESSION_MARGIN_SECONDS, minimumSeconds = TRANSCODE_SESSION_MIN_SECONDS } = options;
  // 0 included: the node can never bill at a rate of 0 (biller.rs), whatever the contract's "no cap" reads as.
  if (!Number.isFinite(ratePerSecond) || ratePerSecond <= 0) {
    throw new TranscodeError(`The model's rate limit must be read from the chain, got ${ratePerSecond}`, 'TRANSCODE_FAILED', undefined,
      { reason: 'INVALID_RATE' });
  }
  const tokens = billingUnitsToTokens(estimateTranscodeUnits(sourceSeconds, formats, isEncrypted));
  const maxTokens = TRANSCODE_MAX_RELEASABLE_RATE_SECONDS * ratePerSecond;
  // A node reporting `transcode-final-wait-uncapped` (8.62.6) waits as long as the rate needs: no limit to refuse at.
  if (tokens > maxTokens && !options.finalWaitUncapped) {
    throw new TranscodeError(
      `A ${sourceSeconds} s source costs ${tokens} tokens, more than the ${maxTokens} a node can bill in full and still release at ${ratePerSecond} tokens/s`,
      'TRANSCODE_FAILED', undefined, { reason: 'SOURCE_TOO_LONG', tokens, maxTokens, ratePerSecond },
    );
  }
  return Math.max(minimumSeconds, Math.ceil(tokens / ratePerSecond) + marginSeconds);
}

/** The first byte of a multibase string in the encodings s5js decodes (u base64url, z base58btc, b base32, f hex). */
function multibaseFirstByte(body: string): number | undefined {
  const prefix = body[0], rest = body.slice(1);
  const index = (alphabet: string, c: string | undefined) => (c === undefined ? -1 : alphabet.indexOf(c));
  if (prefix === 'u') {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const hi = index(A, rest[0]), lo = index(A, rest[1]);
    return hi < 0 || lo < 0 ? undefined : (hi << 2) | (lo >> 4);
  }
  if (prefix === 'b') {
    const A = 'abcdefghijklmnopqrstuvwxyz234567';
    const hi = index(A, rest[0]), lo = index(A, rest[1]);
    return hi < 0 || lo < 0 ? undefined : ((hi << 3) | (lo >> 2)) & 0xff;
  }
  if (prefix === 'f') {
    return /^[0-9a-f]{2}/.test(rest) ? parseInt(rest.slice(0, 2), 16) : undefined;
  }
  if (prefix === 'z') {
    const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    if (!rest || [...rest].some((c) => A.indexOf(c) < 0)) return undefined;
    if (rest[0] === '1') return 0;   // a leading zero byte
    let n = 0n;
    for (const c of rest) n = n * 58n + BigInt(A.indexOf(c));
    const hex = n.toString(16);
    return parseInt((hex.length % 2 ? '0' : '') + hex.slice(0, hex.length % 2 ? 1 : 2), 16);
  }
  return undefined;
}

/** Whether a source CID is an S5 encrypted capability CID (first byte 0xae, any multibase s5js reads): it carries its own key. */
export function isCapabilityCid(sourceCid: string): boolean {
  const body = sourceCid.includes('://') ? sourceCid.slice(sourceCid.indexOf('://') + 3) : sourceCid;
  return multibaseFirstByte(body) === 0xae;
}

/**
 * Whether a transcode exposes keys to the host running it (1.39.18): an encrypted job (`isEncrypted` defaults to true), or
 * a source CID that carries its own key whatever `isEncrypted` says. Such a job goes only to an allowlisted host.
 */
export function isEncryptedTranscode(sourceCid: string, isEncrypted?: boolean): boolean {
  return isEncrypted !== false || isCapabilityCid(sourceCid);
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

/** Build one HLS format per resolution with hls: true */
export function buildHlsFormats(
  resolutions: string[], codec: string, hlsTime?: number,
): VideoFormat[] {
  const cd = CODEC_DEFAULTS[codec] ?? CODEC_DEFAULTS.h264;
  const formats: VideoFormat[] = [];
  let nextId = 1;
  for (const res of resolutions) {
    const rm = RESOLUTION_MAP[res];
    if (!rm) continue;
    const fmt: VideoFormat = {
      id: nextId++, ext: 'mp4', vcodec: cd.vcodec, acodec: 'aac',
      preset: cd.preset, ar: '48k', ch: 2, vf: rm.vf, b_v: cd.bitrates[res],
      dest: 's5', hls: true,
    };
    if (hlsTime !== undefined) fmt.hls_time = hlsTime;
    formats.push(fmt);
  }
  return formats;
}

/** Generate HLS master playlist with #EXT-X-STREAM-INF per source */
export function buildMasterPlaylist(
  sources: HlsTranscodedSource[], variantUrlFn: (resolution: string) => string,
): string {
  const lines: string[] = ['#EXTM3U'];
  for (const src of sources) {
    const rm = RESOLUTION_MAP[src.resolution];
    if (!rm) continue;
    const [w, h] = rm.vf.replace('scale=', '').split('x');
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${src.bitrateKbps * 1000},RESOLUTION=${w}x${h}`,
      variantUrlFn(src.resolution),
    );
  }
  return lines.join('\n') + '\n';
}

/** Generate HLS variant playlist for one resolution (fMP4/version 7) */
export function buildVariantPlaylist(
  source: HlsTranscodedSource, segmentUrlFn: (cid: string) => string,
): string {
  const maxDur = Math.ceil(Math.max(...source.segments.map(s => s.duration)));
  const lines: string[] = [
    '#EXTM3U', '#EXT-X-VERSION:7',
    `#EXT-X-TARGETDURATION:${maxDur}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    `#EXT-X-MAP:URI="${segmentUrlFn(source.initSegmentCid)}"`,
  ];
  for (const seg of source.segments) {
    lines.push(`#EXTINF:${seg.duration.toFixed(6)},`, segmentUrlFn(seg.cid));
  }
  lines.push('#EXT-X-ENDLIST');
  return lines.join('\n') + '\n';
}

/** Map HLS transcode results into HlsContentMetadata */
export function assembleHlsContentMetadata(
  result: TranscodeResult, formats: VideoFormat[], sourceCid: string,
  previewPercent: number, jobId: number,
): HlsContentMetadata {
  const sources: HlsTranscodedSource[] = [];
  for (const fmt of formats) {
    const output = result.outputs.find(o => o.id === fmt.id);
    if (!output || !isHlsOutput(output)) continue;
    sources.push({
      resolution: vfToResolution(fmt.vf!),
      codec: normalizeCodec(fmt.vcodec!),
      container: fmt.ext,
      bitrateKbps: parseBitrateKbps(fmt.b_v!),
      initSegmentCid: output.initSegmentCid,
      segments: output.segments,
      previewSegments: output.previewSegments,
      totalDuration: output.totalDuration,
    });
  }
  // Guarded conditional spread. Absent (or unusable) adds no key at all, so "not moderated"
  // stays absent on the object AND once it is serialised to S5 — never a present-but-undefined,
  // -null or -empty key. Both assemblers are public exports, so the result may have come from a
  // consumer's JSON/DB round trip rather than from the WS parser, where `undefined` becomes
  // `null`. The shallow copy makes the record a point-in-time snapshot rather than a live alias.
  return {
    sourceCid, transcodedAt: Date.now(), freePreviewPercent: previewPercent, sources, jobId,
    ...(isTranscodeModerationStatus(result.moderation)
      && { moderation: cloneTranscodeModerationStatus(result.moderation) }),
  };
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
  // Guarded conditional spread — see assembleHlsContentMetadata.
  return {
    sourceCid, transcodedAt: Date.now(), freePreviewPercent: previewPercent, sources, jobId,
    ...(isTranscodeModerationStatus(result.moderation)
      && { moderation: cloneTranscodeModerationStatus(result.moderation) }),
  };
}
