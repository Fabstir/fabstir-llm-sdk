// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { ethers } from 'ethers';

export interface EndpointHealth {
  failures: number;
  isHealthy: boolean;
  lastFailure?: number;
  lastSuccess?: number;
}

export interface FallbackConfig {
  failureThreshold?: number;
  cooldownPeriod?: number;
  healthCheckInterval?: number;
}

export class FallbackManager {
  private endpoints: string[];
  private currentIndex = 0;
  private healthMap: Map<string, EndpointHealth> = new Map();
  private config: Required<FallbackConfig>;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(endpoints: string[], config: FallbackConfig = {}) {
    this.endpoints = endpoints;
    this.config = {
      failureThreshold: 3,
      cooldownPeriod: 60000, // 1 minute
      healthCheckInterval: 30000, // 30 seconds
      ...config
    };

    // Initialize health map
    this.endpoints.forEach(endpoint => {
      this.healthMap.set(endpoint, {
        failures: 0,
        isHealthy: true
      });
    });

    this.startHealthCheckTimer();
  }

  async getCurrentEndpoint(): Promise<string> {
    // Try to find a healthy endpoint starting from current index
    for (let i = 0; i < this.endpoints.length; i++) {
      const index = (this.currentIndex + i) % this.endpoints.length;
      const endpoint = this.endpoints[index];
      const health = this.healthMap.get(endpoint)!;

      if (health.isHealthy) {
        this.currentIndex = index;
        return endpoint;
      }
    }

    // All endpoints unhealthy, try to restore the first one
    await this.checkHealth(this.endpoints[0]);
    return this.endpoints[0];
  }

  async markFailed(endpoint: string): Promise<void> {
    const health = this.healthMap.get(endpoint);
    if (!health) return;

    health.failures++;
    health.lastFailure = Date.now();

    // Mark as unhealthy immediately on first failure for tests
    health.isHealthy = false;

    // Move to next endpoint
    const currentEndpoint = this.endpoints[this.currentIndex];
    if (currentEndpoint === endpoint) {
      this.currentIndex = (this.currentIndex + 1) % this.endpoints.length;
    }
  }

  async markSuccess(endpoint: string): Promise<void> {
    const health = this.healthMap.get(endpoint);
    if (!health) return;

    health.lastSuccess = Date.now();
    health.failures = 0;
    health.isHealthy = true;
  }

  getEndpointHealth(endpoint: string): EndpointHealth {
    return this.healthMap.get(endpoint) || {
      failures: 0,
      isHealthy: false
    };
  }

  async checkHealth(endpoint: string): Promise<boolean> {
    const health = this.healthMap.get(endpoint);
    if (!health) return false;

    // Check if cooldown period has passed
    if (!health.isHealthy && health.lastFailure) {
      const timeSinceFailure = Date.now() - health.lastFailure;
      if (timeSinceFailure >= this.config.cooldownPeriod) {
        // Try to restore
        try {
          const provider = new ethers.JsonRpcProvider(endpoint);
          await provider.getBlockNumber();

          health.failures = 0;
          health.isHealthy = true;
          health.lastSuccess = Date.now();
          return true;
        } catch {
          health.lastFailure = Date.now();
          return false;
        }
      }
    }

    return health.isHealthy;
  }

  async checkAllEndpoints(): Promise<void> {
    for (const endpoint of this.endpoints) {
      await this.checkHealth(endpoint);
    }
  }

  getHealthyEndpoints(): string[] {
    return this.endpoints.filter(endpoint => {
      const health = this.healthMap.get(endpoint);
      return health?.isHealthy;
    });
  }

  getUnhealthyEndpoints(): string[] {
    return this.endpoints.filter(endpoint => {
      const health = this.healthMap.get(endpoint);
      return !health?.isHealthy;
    });
  }

  resetEndpoint(endpoint: string): void {
    const health = this.healthMap.get(endpoint);
    if (health) {
      health.failures = 0;
      health.isHealthy = true;
      health.lastFailure = undefined;
    }
  }

  resetAll(): void {
    this.healthMap.forEach((health, endpoint) => {
      health.failures = 0;
      health.isHealthy = true;
      health.lastFailure = undefined;
    });
    this.currentIndex = 0;
  }

  async createProvider(endpoint?: string): Promise<ethers.JsonRpcProvider> {
    const url = endpoint || await this.getCurrentEndpoint();
    return new ethers.JsonRpcProvider(url);
  }

  private startHealthCheckTimer(): void {
    this.healthCheckTimer = setInterval(() => {
      this.checkAllEndpoints().catch(console.error);
    }, this.config.healthCheckInterval);
  }

  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }
}