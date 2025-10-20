// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Balance monitoring module
 * Monitors balance changes in real-time
 */

import { EventEmitter } from 'events';
import { getETHBalance, getFABBalance, getStakingStatus } from './checker';
import { checkAllRequirements } from './requirements';

/**
 * Balance update event data
 */
export interface BalanceUpdate {
  eth: bigint;
  fab: bigint;
  staked: bigint;
  timestamp: number;
}

/**
 * Monitor configuration
 */
export interface MonitorConfig {
  interval?: number; // Polling interval in ms (default: 30000)
  checkRequirements?: boolean; // Check requirements on each update (default: true)
}

/**
 * Balance monitor class
 */
export class BalanceMonitor extends EventEmitter {
  private interval: number;
  private shouldCheckRequirements: boolean;
  private timer?: NodeJS.Timer;
  private lastBalances?: BalanceUpdate;
  private lastRequirementsMet?: boolean;
  public forceError?: boolean; // For testing

  constructor(config: MonitorConfig = {}) {
    super();
    this.interval = config.interval || 30000;
    this.shouldCheckRequirements = config.checkRequirements !== false;
  }

  /**
   * Start monitoring balances
   */
  start(): void {
    if (this.timer) {
      return; // Already running
    }

    // Initial check (don't await to avoid blocking)
    this.updateBalances().catch(error => {
      this.emit('error', error);
    });

    // Set up interval
    this.timer = setInterval(() => {
      this.updateBalances().catch(error => {
        this.emit('error', error);
      });
    }, this.interval);

    this.emit('started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      // Clear any cached state
      this.lastBalances = undefined;
      this.lastRequirementsMet = undefined;
      this.emit('stopped');
    }
  }

  /**
   * Force an immediate balance check
   */
  async checkNow(): Promise<void> {
    await this.updateBalances();
  }

  /**
   * Check requirements status
   */
  async checkRequirements(): Promise<void> {
    try {
      if (this.forceError) {
        throw new Error('Forced error for testing');
      }

      const requirements = await checkAllRequirements();
      const meetsAll = requirements.meetsAll;

      // Check if requirements status changed
      if (this.lastRequirementsMet !== undefined && this.lastRequirementsMet !== meetsAll) {
        this.emit('requirements-changed', {
          previousMet: this.lastRequirementsMet,
          currentMet: meetsAll,
          requirements
        });
      }

      this.lastRequirementsMet = meetsAll;
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Update balances and emit events
   */
  private async updateBalances(): Promise<void> {
    // Check if monitor was stopped
    if (!this.timer && !this.forceError) {
      return;
    }

    try {
      if (this.forceError) {
        throw new Error('Forced error for testing');
      }

      // Get current balances
      const [eth, fab, staking] = await Promise.all([
        getETHBalance(),
        getFABBalance(),
        getStakingStatus()
      ]);

      const update: BalanceUpdate = {
        eth,
        fab,
        staked: staking.stakedAmount,
        timestamp: Date.now()
      };

      // Check for changes
      if (this.lastBalances) {
        const changes: string[] = [];

        if (this.lastBalances.eth !== update.eth) {
          changes.push('ETH');
          this.emit('eth-changed', {
            previous: this.lastBalances.eth,
            current: update.eth
          });
        }

        if (this.lastBalances.fab !== update.fab) {
          changes.push('FAB');
          this.emit('fab-changed', {
            previous: this.lastBalances.fab,
            current: update.fab
          });
        }

        if (this.lastBalances.staked !== update.staked) {
          changes.push('Staking');
          this.emit('staking-changed', {
            previous: this.lastBalances.staked,
            current: update.staked
          });
        }

        if (changes.length > 0) {
          this.emit('balances-changed', {
            changes,
            previous: this.lastBalances,
            current: update
          });
        }
      }

      // Always emit update
      this.emit('balance-update', update);

      // Store for next comparison
      this.lastBalances = update;

      // Check requirements if enabled
      if (this.shouldCheckRequirements) {
        await this.checkRequirements();
      }

    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Get last known balances
   */
  getLastBalances(): BalanceUpdate | undefined {
    return this.lastBalances;
  }

  /**
   * Check if monitoring is active
   */
  isActive(): boolean {
    return !!this.timer;
  }
}

/**
 * Create and start a balance monitor
 */
export async function monitorBalances(config?: MonitorConfig): Promise<BalanceMonitor> {
  const monitor = new BalanceMonitor(config);
  return monitor;
}

/**
 * Monitor balance with console output
 */
export function monitorBalancesWithOutput(config?: MonitorConfig): BalanceMonitor {
  const monitor = new BalanceMonitor(config);

  monitor.on('balance-update', (update: BalanceUpdate) => {
    console.log(`[${new Date(update.timestamp).toLocaleTimeString()}] Balance Update`);
    console.log(`  ETH: ${update.eth}`);
    console.log(`  FAB: ${update.fab}`);
    console.log(`  Staked: ${update.staked}`);
  });

  monitor.on('balances-changed', (data) => {
    console.log(`[Balance Change] ${data.changes.join(', ')} changed`);
  });

  monitor.on('requirements-changed', (data) => {
    const status = data.currentMet ? 'MET' : 'NOT MET';
    console.log(`[Requirements Change] Status: ${status}`);
  });

  monitor.on('error', (error) => {
    console.error(`[Monitor Error] ${error.message}`);
  });

  return monitor;
}