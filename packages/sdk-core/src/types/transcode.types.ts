/**
 * Type definitions for video/audio transcoding in Platformless AI
 *
 * @module transcode.types
 * @version 1.0.0
 */

/**
 * Job type enumeration (matches contract enum)
 */
export enum JobType {
  LLM_INFERENCE = 0,
  VIDEO_TRANSCODE = 1,
  AUDIO_TRANSCODE = 2,
  IMAGE_GENERATION = 3, // Future
  THREE_D_RENDER = 4, // Future
}

/**
 * Pricing unit enumeration (matches contract enum)
 */
export enum PricingUnit {
  PER_TOKEN = 0, // LLM inference
  PER_SECOND = 1, // Transcode by duration
  PER_MEGABYTE = 2, // Transcode by file size
  PER_FRAME = 3, // Image generation
  PER_POLYGON = 4, // 3D rendering
}

/**
 * Video resolution options
 */
export enum Resolution {
  R720p = 0,
  R1080p = 1,
  R4k = 2,
}

/**
 * Video codec options
 */
export enum Codec {
  H264 = 0,
  AV1 = 1,
}

/**
 * Audio codec options
 */
export enum AudioCodec {
  AAC = 0,
  OPUS = 1,
  FLAC = 2,
  MP3 = 3,
}

/**
 * Quality tier options
 */
export enum QualityTier {
  STANDARD = 0, // PSNR 38-42 dB
  HIGH = 1, // PSNR 42-46 dB
  LOSSLESS = 2, // PSNR > 50 dB
}

/**
 * Proof generation strategy
 */
export enum ProofStrategy {
  PER_GOP = 'per_gop', // Generate proof for each GOP
  PER_SEGMENT = 'per_segment', // Generate proof for GOP segments
  FULL_VIDEO = 'full_video', // Single proof for entire video
}

/**
 * Format specification for transcoding jobs (stored on S5)
 */
export interface TranscodeFormatSpec {
  version: '1.0.0';

  input: {
    cid: string; // S5 CID of input video
    encryptionKey?: string; // Blake3 key if encrypted
  };

  output: {
    video: {
      codec: 'h264' | 'av1';
      profile?: string; // e.g., 'main', 'high'
      level?: string; // e.g., '4.0', '5.1'
      resolution: {
        width: number;
        height: number;
      };
      frameRate: number;
      bitrate: {
        target: number; // kbps
        min?: number;
        max?: number;
      };
      pixelFormat?: string; // e.g., 'yuv420p'
    };

    audio: {
      codec: 'aac' | 'opus' | 'flac' | 'mp3';
      sampleRate: number; // Hz (e.g., 48000)
      channels: number; // 2 = stereo, 6 = 5.1
      bitrate?: number; // kbps
    };

    container: 'mp4' | 'webm' | 'mkv';
  };

  quality: {
    tier: 'standard' | 'high' | 'lossless';
    minPSNR?: number; // Minimum PSNR in dB
    minSSIM?: number; // Minimum SSIM (0.0-1.0)
  };

  gop: {
    size: number; // GOP size in frames
    structure: string; // e.g., 'IBBPBBP'
  };

  proof: {
    strategy: ProofStrategy;
    interval?: number; // If per_segment, GOPs per segment
    requireQualityMetrics: boolean;
    spotCheckCount?: number; // Random GOPs to verify
  };
}

/**
 * Transcoding pricing structure (from NodeRegistry)
 */
export interface TranscodePricing {
  enabled: boolean;
  pricingUnit: PricingUnit;
  basePricePerUnit: string; // In USDC (6 decimals)

  // Multipliers (10000 = 1.0x)
  multipliers: {
    resolution: {
      '720p': number;
      '1080p': number;
      '4k': number;
    };
    codec: {
      h264: number;
      av1: number;
    };
    quality: {
      standard: number;
      high: number;
      lossless: number;
    };
  };
}

/**
 * Host transcode capabilities
 */
export interface HostTranscodeCapabilities {
  enabled: boolean;
  supportedFormats: string[]; // ['h264', 'av1']
  maxResolution: Resolution;
  hardwareAcceleration: boolean; // NVENC/VAAPI
  pricing: TranscodePricing;
}

/**
 * GOP (Group of Pictures) proof data
 */
export interface GOPProof {
  gopIndex: number;
  inputGOPHash: string; // Blake3 hash
  outputGOPHash: string; // Blake3 hash
  psnrDB: number; // PSNR in dB
  ssim?: number; // SSIM (0.0-1.0)
  actualBitrate: number; // kbps
  starkProofHash: string; // Hash of STARK proof
}

/**
 * Merkle tree of GOP proofs
 */
export interface TranscodeProofTree {
  rootHash: string; // Merkle root
  gopCount: number;
  spotCheckHashes: string[];
  treeCID: string; // S5 CID of full tree
}

/**
 * Quality metrics for transcoded output
 */
export interface QualityMetrics {
  psnrDB: number; // Peak Signal-to-Noise Ratio
  ssim?: number; // Structural Similarity Index
  actualBitrate: number; // Achieved bitrate
  averageGOPSize: number; // Average GOP size in frames
}

/**
 * Transcode job creation parameters
 */
export interface CreateTranscodeJobParams {
  hostAddress: string;
  inputCID: string; // S5 CID of source video
  formatSpec: TranscodeFormatSpec;
  maxDuration: number; // Max job duration in seconds
  proofInterval: number; // GOPs between proof submissions
  chainId: number;
  paymentToken?: string; // Address of payment token (default: USDC)
}

/**
 * Transcode job status
 */
export enum TranscodeJobStatus {
  CREATED = 'created',
  DOWNLOADING = 'downloading', // Downloading input from S5
  TRANSCODING = 'transcoding', // Active transcoding
  GENERATING_PROOFS = 'generating_proofs', // Generating GOP proofs
  UPLOADING = 'uploading', // Uploading output to S5
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Transcode progress update
 */
export interface TranscodeProgress {
  jobId: bigint;
  status: TranscodeJobStatus;
  percentComplete: number; // 0-100
  currentGOP: number;
  totalGOPs: number;
  elapsedSeconds: number;
  estimatedRemainingSeconds?: number;
  currentPhase?: string; // 'downloading', 'transcoding', 'uploading'
}

/**
 * Transcode job result
 */
export interface TranscodeJobResult {
  jobId: bigint;
  outputCID: string; // S5 CID of transcoded video
  proofTreeCID: string; // S5 CID of GOP proof tree
  qualityMetrics: QualityMetrics;
  durationSeconds: number;
  totalCost: string; // In payment token units
}

/**
 * Transcode host discovery filters
 */
export interface TranscodeHostFilters {
  minResolution?: Resolution;
  requiredCodecs?: Codec[];
  maxPricePerSecond?: string;
  hardwareAcceleration?: boolean;
  minReputation?: number;
}

/**
 * Transcode host info (extended from base HostInfo)
 */
export interface TranscodeHostInfo {
  address: string;
  stake: bigint;
  active: boolean;
  transcodeCapabilities: HostTranscodeCapabilities;
  reputation: number;
  completedJobs: number;
  averageQuality: number; // Average PSNR across all jobs
}

/**
 * Price estimate for transcode job
 */
export interface TranscodePriceEstimate {
  baseCost: string; // Base cost in USDC
  resolutionMultiplier: number;
  codecMultiplier: number;
  qualityMultiplier: number;
  totalCost: string; // Final cost in USDC
  breakdown: {
    duration: number; // seconds
    pricePerSecond: string;
    resolution: string; // '720p', '1080p', '4k'
    codec: string; // 'h264', 'av1'
    quality: string; // 'standard', 'high', 'lossless'
  };
}

/**
 * Transcode verification result
 */
export interface TranscodeVerification {
  valid: boolean;
  verifiedGOPs: number[];
  failedGOPs: number[];
  qualityMetricsValid: boolean;
  formatComplianceValid: boolean;
  errors?: string[];
}

/**
 * Event data for transcode job events
 */
export interface TranscodeJobEvent {
  jobId: bigint;
  eventType:
    | 'created'
    | 'started'
    | 'progress'
    | 'proof_submitted'
    | 'completed'
    | 'failed';
  timestamp: number;
  data?: Record<string, unknown>;
}

/**
 * Audio transcode specific parameters
 */
export interface AudioTranscodeParams {
  inputCID: string;
  outputCodec: AudioCodec;
  sampleRate: number;
  channels: number;
  bitrate?: number;
}

/**
 * Preset transcode profiles for common use cases
 */
export interface TranscodePreset {
  name: string;
  description: string;
  formatSpec: Partial<TranscodeFormatSpec>;
  estimatedCostMultiplier: number; // Relative to base preset
}

/**
 * Common transcode presets
 */
export const TRANSCODE_PRESETS: Record<string, TranscodePreset> = {
  WEB_720P_H264: {
    name: 'Web 720p (H264)',
    description: 'Optimized for web streaming, good compatibility',
    formatSpec: {
      output: {
        video: {
          codec: 'h264',
          resolution: { width: 1280, height: 720 },
          frameRate: 30,
          bitrate: { target: 2500 },
        },
        audio: {
          codec: 'aac',
          sampleRate: 48000,
          channels: 2,
          bitrate: 128,
        },
        container: 'mp4',
      },
      quality: { tier: 'standard' },
    },
    estimatedCostMultiplier: 1.0,
  },

  WEB_1080P_H264: {
    name: 'Web 1080p (H264)',
    description: 'High quality web streaming',
    formatSpec: {
      output: {
        video: {
          codec: 'h264',
          resolution: { width: 1920, height: 1080 },
          frameRate: 30,
          bitrate: { target: 5000 },
        },
        audio: {
          codec: 'aac',
          sampleRate: 48000,
          channels: 2,
          bitrate: 192,
        },
        container: 'mp4',
      },
      quality: { tier: 'high' },
    },
    estimatedCostMultiplier: 1.5,
  },

  WEB_4K_AV1: {
    name: 'Web 4K (AV1)',
    description: 'Highest quality, best compression, slower encoding',
    formatSpec: {
      output: {
        video: {
          codec: 'av1',
          resolution: { width: 3840, height: 2160 },
          frameRate: 30,
          bitrate: { target: 15000 },
        },
        audio: {
          codec: 'opus',
          sampleRate: 48000,
          channels: 2,
          bitrate: 256,
        },
        container: 'webm',
      },
      quality: { tier: 'high' },
    },
    estimatedCostMultiplier: 7.5, // 3x resolution, 2.5x codec
  },

  ARCHIVE_LOSSLESS: {
    name: 'Archive (Lossless)',
    description: 'Maximum quality preservation, large file size',
    formatSpec: {
      output: {
        video: {
          codec: 'h264',
          resolution: { width: 1920, height: 1080 },
          frameRate: 30,
          bitrate: { target: 25000 },
        },
        audio: {
          codec: 'flac',
          sampleRate: 48000,
          channels: 2,
        },
        container: 'mkv',
      },
      quality: { tier: 'lossless' },
    },
    estimatedCostMultiplier: 3.75, // 1.5x resolution, 2.5x quality
  },
};

/**
 * Helper function to get preset by name
 */
export function getTranscodePreset(name: string): TranscodePreset | undefined {
  return TRANSCODE_PRESETS[name];
}

/**
 * Helper function to create complete format spec from preset
 */
export function createFormatSpecFromPreset(
  preset: TranscodePreset,
  inputCID: string,
  overrides?: Partial<TranscodeFormatSpec>
): TranscodeFormatSpec {
  return {
    version: '1.0.0',
    input: { cid: inputCID },
    output: {
      video: preset.formatSpec.output!.video!,
      audio: preset.formatSpec.output!.audio!,
      container: preset.formatSpec.output!.container!,
    },
    quality: preset.formatSpec.quality || { tier: 'standard' },
    gop: { size: 60, structure: 'IBBPBBP' },
    proof: {
      strategy: ProofStrategy.PER_GOP,
      requireQualityMetrics: true,
      spotCheckCount: 5,
    },
    ...overrides,
  } as TranscodeFormatSpec;
}
