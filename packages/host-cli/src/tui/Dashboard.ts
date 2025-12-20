// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * TUI Dashboard Main Screen
 * Interactive terminal dashboard for host node management
 */

import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { DashboardState } from './types';
import { formatHeader } from './components/Header';
import { formatStatusPanel } from './components/StatusPanel';
import { formatLogEntry } from './components/LogsPanel';
import { fetchStatus } from './services/MgmtClient';
import { LogStreamClient } from './services/LogStream';
import { handleStart, handleStop, showMessage, showError } from './actions';

export interface CreateDashboardOptions {
  mgmtUrl: string;
  refreshInterval: number;
  testMode?: boolean;
  hostAddress?: string;
  chainName?: string;
  stake?: string;
}

export async function createDashboard(options: CreateDashboardOptions): Promise<void> {
  // Skip rendering in test mode
  if (options.testMode) {
    return;
  }

  const screen = blessed.screen({
    smartCSR: true,
    title: 'Fabstir Host Dashboard',
  });

  const grid = new contrib.grid({ rows: 12, cols: 12, screen });

  // Header (row 0)
  const headerContent = options.hostAddress
    ? formatHeader(options.hostAddress, options.chainName || 'Unknown', options.stake || '0')
    : ' Fabstir Host Dashboard | Loading...';
  const header = grid.set(0, 0, 1, 12, blessed.box, {
    content: headerContent,
    style: { fg: 'white', bg: 'blue' },
  });

  // Status panel (rows 1-4, cols 0-7)
  const statusBox = grid.set(1, 0, 4, 8, blessed.box, {
    label: ' Node Status ',
    border: { type: 'line' },
    content: 'Loading...',
  });

  // Earnings panel (rows 1-4, cols 8-11)
  const earningsBox = grid.set(1, 8, 4, 4, blessed.box, {
    label: ' Earnings ',
    border: { type: 'line' },
    content: 'Loading...',
  });

  // Logs panel (rows 5-10)
  const logsBox = grid.set(5, 0, 6, 12, contrib.log, {
    label: ' Live Logs ',
    border: { type: 'line' },
    fg: 'green',
    selectedFg: 'green',
    bufferLength: 50,
  });

  // Actions bar (row 11)
  const actionsBar = grid.set(11, 0, 1, 12, blessed.box, {
    content: ' [R]efresh  [S]tart  [X]Stop  [P]ricing  [W]ithdraw  [Q]uit ',
    style: { fg: 'white', bg: 'gray' },
  });

  // State
  const state: DashboardState = {
    nodeStatus: null,
    logs: [],
    earnings: null,
    isRefreshing: false,
  };

  // Update status display
  async function refreshStatus(): Promise<void> {
    if (state.isRefreshing) return;
    state.isRefreshing = true;

    try {
      const status = await fetchStatus(options.mgmtUrl);
      state.nodeStatus = status;

      if (status) {
        statusBox.setContent(formatStatusPanel(status));
      } else {
        statusBox.setContent('⚠️ Unable to connect to management server');
      }

      screen.render();
    } finally {
      state.isRefreshing = false;
    }
  }

  // Keyboard handlers
  screen.key(['q', 'C-c'], () => {
    screen.destroy();
    process.exit(0);
  });

  screen.key(['r'], async () => {
    logsBox.log('Refreshing status...');
    await refreshStatus();
  });

  screen.key(['s'], async () => {
    logsBox.log('Starting node...');
    const result = await handleStart(options.mgmtUrl, async () => {
      await refreshStatus();
    });
    if (result.success) {
      logsBox.log(showMessage('Node started'));
    } else {
      logsBox.log(showError(`Start failed: ${result.error}`));
    }
    screen.render();
  });

  screen.key(['x'], async () => {
    logsBox.log('Stopping node...');
    const result = await handleStop(options.mgmtUrl, async () => {
      await refreshStatus();
    });
    if (result.success) {
      logsBox.log(showMessage('Node stopped'));
    } else {
      logsBox.log(showError(`Stop failed: ${result.error}`));
    }
    screen.render();
  });

  screen.key(['p'], () => {
    logsBox.log(showError('Pricing management not yet implemented'));
    screen.render();
  });

  screen.key(['w'], () => {
    logsBox.log(showError('Withdrawal not yet implemented'));
    screen.render();
  });

  // Initial refresh
  await refreshStatus();
  logsBox.log('Dashboard started. Press Q to quit.');

  // Set up log streaming
  const logStream = new LogStreamClient(options.mgmtUrl);

  logStream.on('log', (entry) => {
    logsBox.log(formatLogEntry(entry));
    screen.render();
  });

  logStream.on('connect', () => {
    logsBox.log('[STREAM] Connected to log stream');
    screen.render();
  });

  logStream.on('disconnect', () => {
    logsBox.log('[STREAM] Disconnected from log stream');
    screen.render();
  });

  logStream.on('error', (error: Error) => {
    logsBox.log(`[STREAM] Error: ${error.message}`);
    screen.render();
  });

  // Connect to log stream
  logStream.connect();

  // Set up refresh interval
  const refreshTimer = setInterval(async () => {
    await refreshStatus();
  }, options.refreshInterval);

  // Cleanup on exit
  screen.on('destroy', () => {
    clearInterval(refreshTimer);
    logStream.disconnect();
  });

  screen.render();
}
