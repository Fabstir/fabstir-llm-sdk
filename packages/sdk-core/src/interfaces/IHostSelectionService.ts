// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * @file Host Selection Service Interface
 * @description Interface for weighted host selection with multiple modes
 */

import { HostInfo } from '../types/models';
import { HostSelectionMode } from '../types/settings.types';

/**
 * Weight configuration for each scoring factor
 */
export interface ModeWeights {
  stake: number;
  price: number;
  uptime: number;
  latency: number;
}

/**
 * Individual score factors for a host
 */
export interface ScoreFactors {
  stakeScore: number;
  priceScore: number;
  uptimeScore: number;
  latencyScore: number;
}

/**
 * Host with calculated score and factor breakdown
 */
export interface RankedHost {
  host: HostInfo;
  score: number;
  factors: ScoreFactors;
}

/**
 * Host Selection Service Interface
 *
 * Provides weighted host selection with multiple modes:
 * - AUTO: Balanced weights (stake=0.35, price=0.30, uptime=0.20, latency=0.15)
 * - CHEAPEST: Prioritizes price (0.70)
 * - RELIABLE: Prioritizes stake and uptime (0.50 + 0.40)
 * - FASTEST: Prioritizes latency (0.60)
 * - SPECIFIC: Uses preferred host address
 */
export interface IHostSelectionService {
  /**
   * Calculate score for a single host based on mode
   * @param host - Host to score
   * @param mode - Selection mode determining weights
   * @returns Score between 0 and 1
   */
  calculateHostScore(host: HostInfo, mode: HostSelectionMode): number;

  /**
   * Get individual score factors for a host
   * @param host - Host to analyze
   * @returns Individual factor scores (all 0-1)
   */
  getScoreFactors(host: HostInfo): ScoreFactors;

  /**
   * Select best host for a model using weighted algorithm
   * @param modelId - Model ID (bytes32 hash)
   * @param mode - Selection mode
   * @param preferredHostAddress - Required for SPECIFIC mode
   * @returns Selected host or null if none available
   */
  selectHostForModel(
    modelId: string,
    mode: HostSelectionMode,
    preferredHostAddress?: string
  ): Promise<HostInfo | null>;

  /**
   * Get ranked list of hosts for a model
   * @param modelId - Model ID (bytes32 hash)
   * @param mode - Selection mode for scoring
   * @param limit - Maximum hosts to return (default 10)
   * @returns Sorted list of hosts with scores
   */
  getRankedHostsForModel(
    modelId: string,
    mode: HostSelectionMode,
    limit?: number
  ): Promise<RankedHost[]>;
}
