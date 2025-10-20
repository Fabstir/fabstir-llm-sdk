// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Connection Status Management
 * Tracks SDK connection state and health
 */

import { EventEmitter } from 'events';

/**
 * Connection status states
 */
export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
  RECONNECTING = 'reconnecting'
}

/**
 * Connection statistics
 */
export interface ConnectionStats {
  status: ConnectionStatus;
  lastConnected?: Date;
  lastError?: Error;
  reconnectAttempts: number;
  uptime: number;
}

/**
 * Status manager class
 */
class StatusManager extends EventEmitter {
  private status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private lastConnected?: Date;
  private lastError?: Error;
  private reconnectAttempts: number = 0;
  private connectionStartTime?: Date;

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Set connection status
   */
  setStatus(status: ConnectionStatus, error?: Error): void {
    const previousStatus = this.status;
    this.status = status;

    if (status === ConnectionStatus.CONNECTED) {
      this.lastConnected = new Date();
      this.connectionStartTime = new Date();
      this.reconnectAttempts = 0;
      this.lastError = undefined;
    } else if (status === ConnectionStatus.ERROR) {
      this.lastError = error;
      this.connectionStartTime = undefined;
    } else if (status === ConnectionStatus.RECONNECTING) {
      this.reconnectAttempts++;
    }

    // Emit status change event
    if (previousStatus !== status) {
      this.emit('statusChange', status, previousStatus);
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): ConnectionStats {
    return {
      status: this.status,
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      reconnectAttempts: this.reconnectAttempts,
      uptime: this.calculateUptime()
    };
  }

  /**
   * Calculate uptime in seconds
   */
  private calculateUptime(): number {
    if (!this.connectionStartTime || this.status !== ConnectionStatus.CONNECTED) {
      return 0;
    }
    return Math.floor((Date.now() - this.connectionStartTime.getTime()) / 1000);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.status === ConnectionStatus.CONNECTED;
  }

  /**
   * Reset status
   */
  reset(): void {
    this.status = ConnectionStatus.DISCONNECTED;
    this.lastConnected = undefined;
    this.lastError = undefined;
    this.reconnectAttempts = 0;
    this.connectionStartTime = undefined;
    this.removeAllListeners();
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(callback: (status: ConnectionStatus, previousStatus: ConnectionStatus) => void): () => void {
    this.on('statusChange', callback);
    return () => this.off('statusChange', callback);
  }
}

// Singleton instance
let statusManager: StatusManager | null = null;

/**
 * Get or create status manager instance
 */
export function getStatusManager(): StatusManager {
  if (!statusManager) {
    statusManager = new StatusManager();
  }
  return statusManager;
}

/**
 * Get current connection status
 */
export function getConnectionStatus(): ConnectionStatus {
  return getStatusManager().getStatus();
}

/**
 * Set connection status
 */
export function setConnectionStatus(status: ConnectionStatus, error?: Error): void {
  getStatusManager().setStatus(status, error);
}

/**
 * Get connection statistics
 */
export function getConnectionStats(): ConnectionStats {
  return getStatusManager().getStats();
}

/**
 * Check if connected
 */
export function isConnected(): boolean {
  return getStatusManager().isConnected();
}

/**
 * Reset status manager
 */
export function resetStatus(): void {
  if (statusManager) {
    statusManager.reset();
    statusManager = null;
  }
}