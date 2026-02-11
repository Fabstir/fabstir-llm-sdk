// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * @file Host Selection Service
 * @description Weighted host selection algorithm with multiple modes
 */

import { HostInfo } from '../types/models';
import { HostSelectionMode } from '../types/settings.types';
import {
  IHostSelectionService,
  ModeWeights,
  ScoreFactors,
  RankedHost,
} from '../interfaces/IHostSelectionService';
import { IHostManager } from '../interfaces/IHostManager';

/**
 * Price precision multiplier used in contracts
 * Prices are stored as price * PRICE_PRECISION
 */
const PRICE_PRECISION = 1000n;

/**
 * Price range for normalization (in PRICE_PRECISION units)
 * Min: 0.0001 USDC/token = 100
 * Max: 0.1 USDC/token = 100000
 */
const MIN_PRICE = 100n;
const MAX_PRICE = 100000n;

/**
 * Maximum stake for normalization (10,000 FAB tokens)
 */
const MAX_STAKE = 10000n * 10n ** 18n;

/**
 * Placeholder values until metrics system is available
 */
const PLACEHOLDER_UPTIME = 0.95;
const PLACEHOLDER_LATENCY = 0.9;

/**
 * Host Selection Service
 *
 * Implements weighted host selection algorithm with multiple modes.
 * Uses a scoring formula that balances stake, price, uptime, and latency
 * based on the selected mode.
 *
 * @example
 * ```typescript
 * const service = new HostSelectionService();
 * const score = service.calculateHostScore(host, HostSelectionMode.AUTO);
 * ```
 */
export class HostSelectionService implements IHostSelectionService {
  private hostManager?: IHostManager;

  /**
   * Weight configurations per selection mode
   */
  private readonly MODE_WEIGHTS: Record<HostSelectionMode, ModeWeights> = {
    [HostSelectionMode.AUTO]: {
      stake: 0.35,
      price: 0.30,
      uptime: 0.20,
      latency: 0.15,
    },
    [HostSelectionMode.CHEAPEST]: {
      stake: 0.15,
      price: 0.70,
      uptime: 0.10,
      latency: 0.05,
    },
    [HostSelectionMode.RELIABLE]: {
      stake: 0.50,
      price: 0.05,
      uptime: 0.40,
      latency: 0.05,
    },
    [HostSelectionMode.FASTEST]: {
      stake: 0.10,
      price: 0.20,
      uptime: 0.10,
      latency: 0.60,
    },
    [HostSelectionMode.SPECIFIC]: {
      // Not used - SPECIFIC mode bypasses scoring
      stake: 0,
      price: 0,
      uptime: 0,
      latency: 0,
    },
  };

  /**
   * Create a new HostSelectionService
   * @param hostManager - Optional HostManager for host discovery (required for selectHostForModel)
   */
  constructor(hostManager?: IHostManager) {
    this.hostManager = hostManager;
  }

  /**
   * Set the HostManager after construction
   * @param hostManager - HostManager instance
   */
  setHostManager(hostManager: IHostManager): void {
    this.hostManager = hostManager;
  }

  /**
   * Calculate score for a single host based on mode
   *
   * Formula: score = (stake_weight × stakeScore) + (price_weight × priceScore) +
   *                  (uptime_weight × uptimeScore) + (latency_weight × latencyScore)
   *
   * @param host - Host to score
   * @param mode - Selection mode determining weights
   * @returns Score between 0 and 1
   */
  calculateHostScore(host: HostInfo, mode: HostSelectionMode): number {
    const weights = this.MODE_WEIGHTS[mode];
    const factors = this.getScoreFactors(host);

    return (
      weights.stake * factors.stakeScore +
      weights.price * factors.priceScore +
      weights.uptime * factors.uptimeScore +
      weights.latency * factors.latencyScore
    );
  }

  /**
   * Get individual score factors for a host
   * All factors are normalized to 0-1 range
   *
   * @param host - Host to analyze
   * @returns Individual factor scores
   */
  getScoreFactors(host: HostInfo): ScoreFactors {
    return {
      stakeScore: this.normalizeStake(host.stake),
      priceScore: this.normalizePrice(host.minPricePerTokenStable),
      uptimeScore: PLACEHOLDER_UPTIME,
      latencyScore: PLACEHOLDER_LATENCY,
    };
  }

  /**
   * Select best host for a model using weighted algorithm
   *
   * For SPECIFIC mode, returns the preferred host if available.
   * For other modes, uses weighted random selection based on scores.
   *
   * @param modelId - Model ID (bytes32 hash)
   * @param mode - Selection mode
   * @param preferredHostAddress - Required for SPECIFIC mode
   * @returns Selected host or null if none available
   * @throws Error if SPECIFIC mode without preferredHostAddress
   * @throws Error if preferred host unavailable in SPECIFIC mode
   */
  async selectHostForModel(
    modelId: string,
    mode: HostSelectionMode,
    preferredHostAddress?: string
  ): Promise<HostInfo | null> {
    if (!this.hostManager) {
      throw new Error('HostManager not set - call setHostManager() first');
    }

    // SPECIFIC mode - return preferred host or throw error
    if (mode === HostSelectionMode.SPECIFIC) {
      if (!preferredHostAddress) {
        throw new Error('preferredHostAddress required for SPECIFIC mode');
      }

      const host = await this.hostManager.getHostInfo(preferredHostAddress);
      if (!host || !host.isActive) {
        throw new Error(`Preferred host ${preferredHostAddress} is not available`);
      }

      const supportsModel = await this.hostManager.hostSupportsModel(
        preferredHostAddress,
        modelId
      );
      if (!supportsModel) {
        throw new Error(
          `Preferred host ${preferredHostAddress} does not support model ${modelId}`
        );
      }

      return host;
    }

    // Other modes - get ranked hosts and use weighted random
    const rankedHosts = await this.getRankedHostsForModel(modelId, mode);
    if (rankedHosts.length === 0) {
      return null;
    }

    return this.weightedRandomSelect(rankedHosts);
  }

  /**
   * Get ranked list of hosts for a model
   *
   * @param modelId - Model ID (bytes32 hash)
   * @param mode - Selection mode for scoring
   * @param limit - Maximum hosts to return (default 10)
   * @returns Sorted list of hosts with scores (highest first)
   */
  async getRankedHostsForModel(
    modelId: string,
    mode: HostSelectionMode,
    limit: number = 10
  ): Promise<RankedHost[]> {
    if (!this.hostManager) {
      throw new Error('HostManager not set - call setHostManager() first');
    }

    const hosts = await this.hostManager.findHostsForModel(modelId);
    console.log(`[HostSelectionService] Scoring ${hosts.length} hosts, first host:`, hosts[0] ? { address: hosts[0].address, stake: hosts[0].stake, stakeType: typeof hosts[0].stake } : 'none');

    const ranked: RankedHost[] = hosts.map((host) => ({
      host,
      score: this.calculateHostScore(host, mode),
      factors: this.getScoreFactors(host),
    }));

    // Sort by score descending (highest first)
    return ranked.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Normalize stake to 0-1 range
   * Higher stake = higher score (direct correlation)
   *
   * @param stake - Stake amount in wei
   * @returns Normalized score 0-1
   */
  private normalizeStake(stake: bigint): number {
    if (stake === undefined || stake === null || stake <= 0n) return 0;

    // Cap at MAX_STAKE
    const cappedStake = stake > MAX_STAKE ? MAX_STAKE : stake;

    // Convert to number and normalize
    return Number(cappedStake) / Number(MAX_STAKE);
  }

  /**
   * Normalize price to 0-1 range
   * Lower price = higher score (inverse correlation)
   *
   * @param price - Price in PRICE_PRECISION units
   * @returns Normalized score 0-1
   */
  private normalizePrice(price: bigint): number {
    // Handle edge cases
    if (price === undefined || price === null || price <= 0n) {
      // Zero or negative price gets max score (best deal)
      return 1;
    }

    if (price <= MIN_PRICE) {
      return 1;
    }

    if (price >= MAX_PRICE) {
      return 0;
    }

    // Inverse normalization: lower price = higher score
    const priceRange = MAX_PRICE - MIN_PRICE;
    const normalized = Number(MAX_PRICE - price) / Number(priceRange);

    return Math.max(0, Math.min(1, normalized));
  }

  /**
   * Select host using weighted random based on scores
   * Higher scores have higher probability of selection
   *
   * @param rankedHosts - Hosts with scores
   * @returns Selected host
   */
  private weightedRandomSelect(rankedHosts: RankedHost[]): HostInfo {
    const totalScore = rankedHosts.reduce((sum, rh) => sum + rh.score, 0);

    // If all scores are 0, pick randomly
    if (totalScore === 0) {
      const randomIndex = Math.floor(Math.random() * rankedHosts.length);
      return rankedHosts[randomIndex].host;
    }

    // Weighted random selection
    let random = Math.random() * totalScore;

    for (const rh of rankedHosts) {
      random -= rh.score;
      if (random <= 0) {
        return rh.host;
      }
    }

    // Fallback to first (shouldn't happen)
    return rankedHosts[0].host;
  }
}
