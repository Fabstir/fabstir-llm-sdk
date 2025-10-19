# Transcoding Configuration Specification

**Version**: 1.0.0
**Status**: Design Specification
**Target**: Post-LLM MVP (Separate Branch)
**Last Updated**: October 19, 2025

---

## Overview

This document specifies the configuration extensions needed to support video/audio transcoding in the SDK ChainRegistry and environment configuration.

---

## Phase 2.3: ChainRegistry Transcoding Extensions

### Current ChainConfig Interface

```typescript
// packages/sdk-core/src/types/chain.types.ts - Current
export interface ChainConfig {
  chainId: number;
  name: string;
  nativeToken: NativeToken;
  rpcUrl: string;
  contracts: ChainContracts;
  minDeposit: string; // In native token units
  blockExplorer: string;
}
```

### Extended ChainConfig Interface

```typescript
// packages/sdk-core/src/types/chain.types.ts - Extended

/**
 * Transcoding-specific configuration for a chain
 */
export interface TranscodeConfig {
  // Minimum deposit for transcode jobs (in USDC)
  minTranscodeDeposit: string; // e.g., "1.0" USDC for 1-minute video

  // Proof interval (in GOPs) - how often hosts must submit proofs
  defaultProofIntervalGOPs: number; // e.g., 100 GOPs

  // Maximum video duration for single job (in seconds)
  maxVideoDuration: number; // e.g., 3600 (1 hour)

  // Supported resolutions on this chain (based on gas costs)
  supportedResolutions: Resolution[]; // [R720p, R1080p, R4k]

  // Supported codecs on this chain
  supportedCodecs: Codec[]; // [H264, AV1]

  // Price bounds (in USDC per second)
  priceBounds: {
    minPricePerSecond: string; // e.g., "0.001"
    maxPricePerSecond: string; // e.g., "1.0"
  };

  // Quality requirements
  qualityThresholds: {
    minPSNR: number; // e.g., 38.0 dB
    minSSIM?: number; // e.g., 0.90 (optional)
  };

  // S5 storage configuration
  s5Config: {
    maxFileSize: number; // Max input file size in MB
    encryptionRequired: boolean; // Force Blake3 encryption
  };
}

/**
 * Extended chain configuration with transcoding support
 */
export interface ChainConfig {
  // Existing fields (unchanged)
  chainId: number;
  name: string;
  nativeToken: NativeToken;
  rpcUrl: string;
  contracts: ChainContracts;
  minDeposit: string;
  blockExplorer: string;

  // New transcode field
  transcode?: TranscodeConfig; // Optional, only if chain supports transcoding
}
```

### Updated ChainRegistry Implementation

```typescript
// packages/sdk-core/src/config/ChainRegistry.ts - Extended

import { Resolution, Codec } from '../types/transcode.types';

export class ChainRegistry {
  private static initializeChains(): Map<number, ChainConfig> {
    if (this.chains) {
      return this.chains;
    }

    const baseSepolia = getBaseSepolia();

    this.chains = new Map([
      [
        ChainId.BASE_SEPOLIA,
        {
          chainId: baseSepolia.chainId,
          name: 'Base Sepolia',
          nativeToken: 'ETH' as NativeToken,
          rpcUrl: baseSepolia.rpcUrl,
          contracts: baseSepolia.contracts,
          minDeposit: '0.0002', // For LLM jobs
          blockExplorer: 'https://sepolia.basescan.org',

          // NEW: Transcoding configuration
          transcode: {
            minTranscodeDeposit: '1.0', // 1 USDC minimum
            defaultProofIntervalGOPs: 100, // Submit proof every 100 GOPs
            maxVideoDuration: 3600, // 1 hour max
            supportedResolutions: [Resolution.R720p, Resolution.R1080p, Resolution.R4k],
            supportedCodecs: [Codec.H264, Codec.AV1],
            priceBounds: {
              minPricePerSecond: '0.001', // $0.001/sec minimum
              maxPricePerSecond: '1.0', // $1.00/sec maximum
            },
            qualityThresholds: {
              minPSNR: 38.0, // Minimum 38 dB PSNR
              minSSIM: 0.90, // Minimum 0.90 SSIM
            },
            s5Config: {
              maxFileSize: 10000, // 10 GB max input file
              encryptionRequired: true, // Always encrypt
            },
          },
        },
      ],
    ]);

    // opBNB Testnet (post-MVP)
    try {
      const opBNB = getOpBNBTestnet();
      this.chains.set(ChainId.OPBNB_TESTNET, {
        chainId: opBNB.chainId,
        name: 'opBNB Testnet',
        nativeToken: 'BNB' as NativeToken,
        rpcUrl: opBNB.rpcUrl,
        contracts: opBNB.contracts,
        minDeposit: '0.001',
        blockExplorer: 'https://testnet.opbnbscan.com',

        // NEW: opBNB transcoding config (lower gas costs = lower prices)
        transcode: {
          minTranscodeDeposit: '0.5', // 0.5 USDC (cheaper than Base)
          defaultProofIntervalGOPs: 150, // More GOPs per proof (cheaper gas)
          maxVideoDuration: 7200, // 2 hours max
          supportedResolutions: [Resolution.R720p, Resolution.R1080p, Resolution.R4k],
          supportedCodecs: [Codec.H264, Codec.AV1],
          priceBounds: {
            minPricePerSecond: '0.0005', // Cheaper on opBNB
            maxPricePerSecond: '0.5',
          },
          qualityThresholds: {
            minPSNR: 38.0,
            minSSIM: 0.90,
          },
          s5Config: {
            maxFileSize: 10000,
            encryptionRequired: true,
          },
        },
      });
    } catch (error) {
      console.debug('opBNB Testnet not configured');
    }

    return this.chains;
  }

  /**
   * Get transcoding configuration for a chain
   * @throws Error if chain doesn't support transcoding
   */
  public static getTranscodeConfig(chainId: ChainId): TranscodeConfig {
    const chain = this.getChain(chainId);
    if (!chain.transcode) {
      throw new Error(`Chain ${chain.name} does not support transcoding`);
    }
    return chain.transcode;
  }

  /**
   * Check if a chain supports transcoding
   */
  public static supportsTranscoding(chainId: ChainId): boolean {
    const chain = this.getChain(chainId);
    return !!chain.transcode;
  }

  /**
   * Get all chains that support transcoding
   */
  public static getTranscodingChains(): ChainConfig[] {
    const chains = this.initializeChains();
    return Array.from(chains.values()).filter((chain) => chain.transcode);
  }
}
```

---

## Environment Variables (.env.test)

### New Transcoding-Specific Variables

```bash
# Transcoding Configuration
TRANSCODE_MIN_DEPOSIT_USDC=1.0
TRANSCODE_MAX_VIDEO_DURATION=3600
TRANSCODE_DEFAULT_PROOF_INTERVAL_GOPS=100

# S5 Storage Configuration
S5_MAX_FILE_SIZE_MB=10000
S5_ENCRYPTION_REQUIRED=true

# Quality Thresholds
TRANSCODE_MIN_PSNR_DB=38.0
TRANSCODE_MIN_SSIM=0.90

# Price Bounds (per second in USDC)
TRANSCODE_MIN_PRICE_PER_SECOND=0.001
TRANSCODE_MAX_PRICE_PER_SECOND=1.0
```

### Updated environment.ts

```typescript
// packages/sdk-core/src/config/environment.ts - Extended

export interface TranscodeEnvConfig {
  minDepositUSDC: string;
  maxVideoDuration: number;
  defaultProofIntervalGOPs: number;
  s5MaxFileSizeMB: number;
  s5EncryptionRequired: boolean;
  minPSNR: number;
  minSSIM?: number;
  minPricePerSecond: string;
  maxPricePerSecond: string;
}

/**
 * Get transcoding configuration from environment
 */
export function getTranscodeConfig(): TranscodeEnvConfig {
  return {
    minDepositUSDC: process.env.TRANSCODE_MIN_DEPOSIT_USDC || '1.0',
    maxVideoDuration: parseInt(process.env.TRANSCODE_MAX_VIDEO_DURATION || '3600', 10),
    defaultProofIntervalGOPs: parseInt(
      process.env.TRANSCODE_DEFAULT_PROOF_INTERVAL_GOPS || '100',
      10
    ),
    s5MaxFileSizeMB: parseInt(process.env.S5_MAX_FILE_SIZE_MB || '10000', 10),
    s5EncryptionRequired: process.env.S5_ENCRYPTION_REQUIRED !== 'false',
    minPSNR: parseFloat(process.env.TRANSCODE_MIN_PSNR_DB || '38.0'),
    minSSIM: process.env.TRANSCODE_MIN_SSIM
      ? parseFloat(process.env.TRANSCODE_MIN_SSIM)
      : undefined,
    minPricePerSecond: process.env.TRANSCODE_MIN_PRICE_PER_SECOND || '0.001',
    maxPricePerSecond: process.env.TRANSCODE_MAX_PRICE_PER_SECOND || '1.0',
  };
}
```

---

## Usage Examples

### 1. Check if Chain Supports Transcoding

```typescript
import { ChainRegistry, ChainId } from '@fabstir/sdk-core/config';

const supportsTranscode = ChainRegistry.supportsTranscoding(ChainId.BASE_SEPOLIA);
if (!supportsTranscode) {
  throw new Error('This chain does not support transcoding');
}
```

### 2. Get Transcoding Configuration

```typescript
const transcodeConfig = ChainRegistry.getTranscodeConfig(ChainId.BASE_SEPOLIA);

console.log('Min deposit:', transcodeConfig.minTranscodeDeposit, 'USDC');
console.log('Max duration:', transcodeConfig.maxVideoDuration, 'seconds');
console.log('Supported resolutions:', transcodeConfig.supportedResolutions);
console.log('Min PSNR:', transcodeConfig.qualityThresholds.minPSNR, 'dB');
```

### 3. Validate Transcode Job Parameters

```typescript
import { ChainRegistry, ChainId } from '@fabstir/sdk-core/config';
import { Resolution, Codec } from '@fabstir/sdk-core/types/transcode.types';

function validateTranscodeJob(
  chainId: ChainId,
  duration: number,
  resolution: Resolution,
  codec: Codec,
  pricePerSecond: string
): { valid: boolean; errors: string[] } {
  const config = ChainRegistry.getTranscodeConfig(chainId);
  const errors: string[] = [];

  // Check duration
  if (duration > config.maxVideoDuration) {
    errors.push(`Duration ${duration}s exceeds maximum ${config.maxVideoDuration}s`);
  }

  // Check resolution support
  if (!config.supportedResolutions.includes(resolution)) {
    errors.push(`Resolution ${Resolution[resolution]} not supported on this chain`);
  }

  // Check codec support
  if (!config.supportedCodecs.includes(codec)) {
    errors.push(`Codec ${Codec[codec]} not supported on this chain`);
  }

  // Check price bounds
  const price = parseFloat(pricePerSecond);
  const minPrice = parseFloat(config.priceBounds.minPricePerSecond);
  const maxPrice = parseFloat(config.priceBounds.maxPricePerSecond);

  if (price < minPrice) {
    errors.push(`Price ${price} below minimum ${minPrice}`);
  }
  if (price > maxPrice) {
    errors.push(`Price ${price} exceeds maximum ${maxPrice}`);
  }

  return { valid: errors.length === 0, errors };
}

// Usage
const validation = validateTranscodeJob(
  ChainId.BASE_SEPOLIA,
  600, // 10 minutes
  Resolution.R1080p,
  Codec.AV1,
  '0.01' // $0.01/second
);

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
}
```

### 4. Find Cheapest Chain for Transcoding

```typescript
function findCheapestTranscodeChain(): { chainId: number; name: string; minPrice: string } {
  const transcodeChains = ChainRegistry.getTranscodingChains();

  let cheapest = transcodeChains[0];
  let cheapestPrice = parseFloat(cheapest.transcode!.priceBounds.minPricePerSecond);

  for (const chain of transcodeChains) {
    const price = parseFloat(chain.transcode!.priceBounds.minPricePerSecond);
    if (price < cheapestPrice) {
      cheapest = chain;
      cheapestPrice = price;
    }
  }

  return {
    chainId: cheapest.chainId,
    name: cheapest.name,
    minPrice: cheapest.transcode!.priceBounds.minPricePerSecond,
  };
}

// Usage
const cheapest = findCheapestTranscodeChain();
console.log(`Cheapest chain: ${cheapest.name} at $${cheapest.minPrice}/second`);
```

---

## Configuration Best Practices

### 1. **Price Bounds**

Set realistic price bounds based on:

- **GPU costs**: NVIDIA RTX 4090 costs ~$2/hour to run
- **Transcoding speed**: 1080p H264 ~10x realtime, AV1 ~3x realtime
- **Competition**: Check centralized providers (AWS MediaConvert, Mux)
- **Gas costs**: Higher gas = need higher minimum prices

**Example calculation** (Base Sepolia):

```
GPU cost: $2/hour = $0.00055/second
Transcode speed: 10x realtime for H264 1080p
Actual cost: $0.00055 / 10 = $0.000055/second of video
Add 50% margin: $0.000055 * 1.5 = $0.000083/second
Min price: $0.001/second (safety margin)
Max price: $1.00/second (prevent price manipulation)
```

### 2. **Proof Intervals**

Balance between:

- **Verification granularity**: More frequent proofs = better verification
- **Gas costs**: Each proof submission costs ~150k gas
- **Host overhead**: Proof generation takes time

**Recommendations**:

- **Base Sepolia**: 100 GOPs (gas expensive) = ~200 seconds of video
- **opBNB Testnet**: 150 GOPs (gas cheap) = ~300 seconds of video
- **Mainnet**: Could go lower (50 GOPs) for tighter verification

### 3. **Quality Thresholds**

Based on industry standards:

| Quality Tier | PSNR (dB) | SSIM | Use Case                    |
| ------------ | --------- | ---- | --------------------------- |
| Standard     | 38-42     | 0.90 | Web streaming, social media |
| High         | 42-46     | 0.95 | Professional video, YouTube |
| Lossless     | > 50      | 0.99 | Archival, production work   |

**Configuration**:

- **minPSNR**: 38.0 dB (ensures acceptable quality for all tiers)
- **minSSIM**: 0.90 (optional, adds verification overhead)

### 4. **S5 File Size Limits**

Consider:

- **S5 upload time**: 10 GB at 100 Mbps = ~13 minutes
- **S5 download time**: Same for host to retrieve input
- **Cost**: Larger files = more S5 storage fees

**Recommendations**:

- **MVP**: 10 GB max (covers 99% of use cases)
- **Future**: Could increase to 50 GB for professional workflows

---

## Migration Strategy

### Phase 1: Add Optional Transcode Config

1. Add `transcode?: TranscodeConfig` to `ChainConfig` (optional field)
2. Existing LLM-only chains continue to work without changes
3. No breaking changes to current SDK

### Phase 2: Enable Transcoding on Base Sepolia

1. Add transcode config to Base Sepolia in `ChainRegistry`
2. Deploy updated contracts with `JobType` enum
3. Update `.env.test` with transcode variables

### Phase 3: Enable Transcoding on opBNB

1. Add transcode config to opBNB in `ChainRegistry`
2. Deploy contracts to opBNB testnet
3. Benchmark gas costs, adjust proof intervals

### Phase 4: Mainnet Deployment

1. Audit transcode contracts
2. Deploy to Base mainnet
3. Update mainnet configs with production values

---

## Testing Checklist

- [ ] Validate price bounds enforcement
- [ ] Test resolution/codec support filtering
- [ ] Verify quality threshold validation
- [ ] Test S5 file size limits
- [ ] Benchmark proof interval gas costs
- [ ] Test multi-chain transcode job creation
- [ ] Verify backward compatibility (LLM jobs still work)

---

**End of Configuration Specification**
