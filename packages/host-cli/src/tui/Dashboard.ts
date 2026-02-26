// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * TUI Dashboard Main Screen
 * Interactive terminal dashboard for host node management
 */

import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { ethers } from 'ethers';
import { DashboardState } from './types.js';
import { formatHeader } from './components/Header.js';
import { formatStatusPanel } from './components/StatusPanel.js';
import { formatEarningsPanel } from './components/EarningsPanel.js';
import { formatLogEntry } from './components/LogsPanel.js';
import { fetchStatus } from './services/MgmtClient.js';
import { fetchEarnings, deriveAddressFromPrivateKey } from './services/EarningsClient.js';
import { withdrawAllEarnings } from './services/WithdrawalService.js';
import { formatPrice, formatNativePrice } from './services/PricingService.js';
import { fetchHostModelPrices, updateModelStablePricing, updateModelNativePricing, clearModelPricingOnChain } from './services/ModelPricingService.js';
import { fetchAllModels } from '../services/ModelRegistryClient.js';
import { DockerLogStream } from './services/DockerLogs.js';
import { showMessage, showError } from './actions.js';

export interface CreateDashboardOptions {
  nodeUrl: string;
  refreshInterval: number;
  rpcUrl?: string;
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

  // Derive host address from private key if available
  const hostPrivateKey = process.env.HOST_PRIVATE_KEY;
  let hostAddress = options.hostAddress;
  if (!hostAddress && hostPrivateKey) {
    try {
      hostAddress = deriveAddressFromPrivateKey(hostPrivateKey);
    } catch {
      // Invalid private key, will show error in earnings panel
    }
  }

  const rpcUrl = options.rpcUrl || process.env.RPC_URL || 'https://sepolia.base.org';

  const screen = blessed.screen({
    smartCSR: true,
    title: 'Fabstir Host Dashboard',
  });

  const grid = new contrib.grid({ rows: 12, cols: 12, screen });

  // Header (row 0)
  const headerContent = hostAddress
    ? formatHeader(hostAddress, options.chainName || 'Base Sepolia', options.stake || '0')
    : ' Fabstir Host Dashboard | Set HOST_PRIVATE_KEY to see earnings';
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
    content: ' [R]efresh  [P]ricing  [M]odel Pricing  [W]ithdraw  [Q]uit ',
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
      const status = await fetchStatus(options.nodeUrl);
      state.nodeStatus = status;

      if (status) {
        statusBox.setContent(formatStatusPanel(status));
      } else {
        statusBox.setContent('Unable to connect to node at ' + options.nodeUrl);
      }

      screen.render();
    } finally {
      state.isRefreshing = false;
    }
  }

  // Update earnings display
  async function refreshEarnings(): Promise<void> {
    if (!hostAddress) {
      earningsBox.setContent('No HOST_PRIVATE_KEY set');
      screen.render();
      return;
    }

    try {
      earningsBox.setContent(`Fetching...\n\n${hostAddress.slice(0, 10)}...`);
      screen.render();

      const earnings = await fetchEarnings(hostAddress, rpcUrl);
      state.earnings = earnings;
      earningsBox.setContent(formatEarningsPanel(earnings, hostAddress));
      screen.render();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      earningsBox.setContent(`Error:\n${errMsg.slice(0, 50)}`);
      screen.render();
    }
  }

  // Keyboard handlers
  screen.key(['q', 'C-c'], () => {
    screen.destroy();
    process.exit(0);
  });

  screen.key(['r'], async () => {
    logsBox.log('Refreshing...');
    await Promise.all([refreshStatus(), refreshEarnings()]);
  });

  // Phase 18: Per-host base pricing removed — redirect to model pricing (m key)
  screen.key(['p'], async () => {
    logsBox.log('[PRICING] Per-host base pricing has been replaced by per-model pricing (Phase 18).');
    logsBox.log('[PRICING] Press [m] to manage per-model pricing instead.');
    screen.render();
  });

  screen.key(['m'], async () => {
    if (!hostPrivateKey || !hostAddress) {
      logsBox.log(showError('Cannot manage model pricing: HOST_PRIVATE_KEY not set'));
      screen.render();
      return;
    }

    logsBox.log('[MODEL PRICING] Fetching models and pricing...');
    screen.render();

    // Phase 18: Fetch per-token model prices (USDC + native separately)
    const usdcAddr = process.env.CONTRACT_USDC_TOKEN || '';
    const [usdcPrices, nativePrices, allModels] = await Promise.all([
      usdcAddr ? fetchHostModelPrices(hostAddress, rpcUrl, usdcAddr) : Promise.resolve([]),
      fetchHostModelPrices(hostAddress, rpcUrl, ethers.ZeroAddress),
      fetchAllModels(rpcUrl),
    ]);

    if (allModels.length === 0) {
      logsBox.log(showError('No approved models found'));
      screen.render();
      return;
    }

    // Build display items: model name + current price per token
    const modelItems = allModels.map((model) => {
      const usdcPricing = usdcPrices.find((p) => p.modelId === model.modelId);
      const nativePricing = nativePrices.find((p) => p.modelId === model.modelId);
      const parts: string[] = [];
      if (usdcPricing) parts.push(`USDC: ${formatPrice(usdcPricing.price)}`);
      if (nativePricing) parts.push(`ETH: ${formatNativePrice(nativePricing.price)}`);
      const priceStr = parts.length > 0 ? parts.join(' | ') : '(no pricing set)';
      return `${model.displayName} - ${priceStr}`;
    });
    modelItems.push('[ESC] Cancel');

    // Show model selection menu
    const modelMenu = blessed.list({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: Math.min(modelItems.length + 2, 15),
      border: { type: 'line' },
      label: ' Select model to price ',
      style: {
        fg: 'white',
        bg: 'blue',
        border: { fg: 'white' },
        selected: { bg: 'green', fg: 'white' },
      },
      keys: true,
      vi: true,
      items: modelItems,
    });

    modelMenu.focus();
    screen.render();

    modelMenu.key(['escape'], () => {
      modelMenu.destroy();
      logsBox.log('[MODEL PRICING] Cancelled');
      screen.render();
    });

    modelMenu.on('select', (_item: blessed.Widgets.BoxElement, index: number) => {
      if (index >= allModels.length) {
        modelMenu.destroy();
        logsBox.log('[MODEL PRICING] Cancelled');
        screen.render();
        return;
      }

      const selectedModel = allModels[index];
      modelMenu.destroy();
      screen.render();

      // Show price type menu
      const priceMenu = blessed.list({
        parent: screen,
        top: 'center',
        left: 'center',
        width: 40,
        height: 7,
        border: { type: 'line' },
        label: ` ${selectedModel.displayName} `,
        style: {
          fg: 'white',
          bg: 'blue',
          border: { fg: 'white' },
          selected: { bg: 'green', fg: 'white' },
        },
        keys: true,
        vi: true,
        items: ['[U] USDC (stablecoin)', '[E] ETH (native token)', '[C] Clear (use default)', '[ESC] Cancel'],
      });

      priceMenu.focus();
      screen.render();

      const handleModelPriceUpdate = async (priceType: 'usdc' | 'eth') => {
        priceMenu.destroy();
        screen.render();

        const label = priceType === 'usdc'
          ? ' New USDC price ($/million) or ESC to cancel '
          : ' New ETH price (Gwei/million) or ESC to cancel ';

        const inputBox = blessed.textbox({
          parent: screen,
          top: 'center',
          left: 'center',
          width: 50,
          height: 3,
          border: { type: 'line' },
          label,
          style: { fg: 'white', bg: 'blue', border: { fg: 'white' } },
          inputOnFocus: true,
        });

        inputBox.focus();
        screen.render();

        inputBox.on('submit', async (value: string) => {
          inputBox.destroy();
          screen.render();

          const newPrice = parseFloat(value);
          if (isNaN(newPrice) || newPrice <= 0) {
            logsBox.log(showError('Invalid price entered'));
            screen.render();
            return;
          }

          if (priceType === 'usdc') {
            logsBox.log(`[MODEL PRICING] Setting ${selectedModel.displayName} USDC to $${newPrice.toFixed(2)}/million...`);
            screen.render();
            const result = await updateModelStablePricing(hostPrivateKey, rpcUrl, selectedModel.modelId, newPrice, (status) => {
              logsBox.log(`[MODEL PRICING] ${status}`);
              screen.render();
            });
            if (result.success) {
              logsBox.log(showMessage(`${selectedModel.displayName} USDC price set to $${result.newPrice}/million`));
              logsBox.log(`[MODEL PRICING] TX: ${result.txHash}`);
            } else {
              logsBox.log(showError(`Model price update failed: ${result.error}`));
            }
          } else {
            logsBox.log(`[MODEL PRICING] Setting ${selectedModel.displayName} ETH to ${newPrice} Gwei/million...`);
            screen.render();
            const result = await updateModelNativePricing(hostPrivateKey, rpcUrl, selectedModel.modelId, newPrice, (status) => {
              logsBox.log(`[MODEL PRICING] ${status}`);
              screen.render();
            });
            if (result.success) {
              logsBox.log(showMessage(`${selectedModel.displayName} ETH price set to ${result.newPrice} Gwei/million`));
              logsBox.log(`[MODEL PRICING] TX: ${result.txHash}`);
            } else {
              logsBox.log(showError(`Model price update failed: ${result.error}`));
            }
          }
          screen.render();
        });

        inputBox.on('cancel', () => {
          inputBox.destroy();
          logsBox.log('[MODEL PRICING] Cancelled');
          screen.render();
        });

        inputBox.readInput();
      };

      priceMenu.key(['u'], () => handleModelPriceUpdate('usdc'));
      priceMenu.key(['e'], () => handleModelPriceUpdate('eth'));
      priceMenu.key(['c'], async () => {
        priceMenu.destroy();
        screen.render();
        logsBox.log(`[MODEL PRICING] Clearing ${selectedModel.displayName} pricing (USDC + ETH)...`);
        screen.render();
        // Phase 18: Clear both USDC and native pricing separately
        const clearUsdcAddr = process.env.CONTRACT_USDC_TOKEN || '';
        if (clearUsdcAddr) {
          const usdcResult = await clearModelPricingOnChain(hostPrivateKey, rpcUrl, selectedModel.modelId, clearUsdcAddr, (status) => {
            logsBox.log(`[MODEL PRICING] USDC: ${status}`);
            screen.render();
          });
          if (usdcResult.success) {
            logsBox.log(showMessage(`${selectedModel.displayName} USDC pricing cleared. TX: ${usdcResult.txHash}`));
          } else {
            logsBox.log(showError(`Clear USDC pricing failed: ${usdcResult.error}`));
          }
        }
        const nativeResult = await clearModelPricingOnChain(hostPrivateKey, rpcUrl, selectedModel.modelId, ethers.ZeroAddress, (status) => {
          logsBox.log(`[MODEL PRICING] ETH: ${status}`);
          screen.render();
        });
        if (nativeResult.success) {
          logsBox.log(showMessage(`${selectedModel.displayName} ETH pricing cleared. TX: ${nativeResult.txHash}`));
        } else {
          logsBox.log(showError(`Clear ETH pricing failed: ${nativeResult.error}`));
        }
        screen.render();
      });
      priceMenu.key(['escape'], () => {
        priceMenu.destroy();
        logsBox.log('[MODEL PRICING] Cancelled');
        screen.render();
      });
      priceMenu.on('select', (_item2: blessed.Widgets.BoxElement, idx: number) => {
        if (idx === 0) handleModelPriceUpdate('usdc');
        else if (idx === 1) handleModelPriceUpdate('eth');
        else if (idx === 2) {
          priceMenu.destroy();
          screen.render();
          // Phase 18: Clear pricing inline — both USDC and native
          (async () => {
            logsBox.log(`[MODEL PRICING] Clearing ${selectedModel.displayName} pricing (USDC + ETH)...`);
            screen.render();
            const inlineUsdcAddr = process.env.CONTRACT_USDC_TOKEN || '';
            if (inlineUsdcAddr) {
              const usdcRes = await clearModelPricingOnChain(hostPrivateKey, rpcUrl, selectedModel.modelId, inlineUsdcAddr, (status) => {
                logsBox.log(`[MODEL PRICING] USDC: ${status}`);
                screen.render();
              });
              if (usdcRes.success) {
                logsBox.log(showMessage(`${selectedModel.displayName} USDC pricing cleared. TX: ${usdcRes.txHash}`));
              } else {
                logsBox.log(showError(`Clear USDC pricing failed: ${usdcRes.error}`));
              }
            }
            const nativeRes = await clearModelPricingOnChain(hostPrivateKey, rpcUrl, selectedModel.modelId, ethers.ZeroAddress, (status) => {
              logsBox.log(`[MODEL PRICING] ETH: ${status}`);
              screen.render();
            });
            if (nativeRes.success) {
              logsBox.log(showMessage(`${selectedModel.displayName} ETH pricing cleared. TX: ${nativeRes.txHash}`));
            } else {
              logsBox.log(showError(`Clear ETH pricing failed: ${nativeRes.error}`));
            }
            screen.render();
          })();
        } else {
          priceMenu.destroy();
          logsBox.log('[MODEL PRICING] Cancelled');
          screen.render();
        }
      });
    });
  });

  screen.key(['w'], async () => {
    if (!hostPrivateKey) {
      logsBox.log(showError('Cannot withdraw: HOST_PRIVATE_KEY not set'));
      screen.render();
      return;
    }

    if (!state.earnings) {
      logsBox.log(showError('Cannot withdraw: No earnings data'));
      screen.render();
      return;
    }

    const ethNum = parseFloat(state.earnings.eth);
    const usdcNum = parseFloat(state.earnings.usdc);

    if (ethNum === 0 && usdcNum === 0) {
      logsBox.log(showError('No earnings to withdraw'));
      screen.render();
      return;
    }

    logsBox.log('Starting withdrawal...');
    screen.render();

    const result = await withdrawAllEarnings(hostPrivateKey, rpcUrl, (status) => {
      logsBox.log(`[WITHDRAW] ${status}`);
      screen.render();
    });

    if (result.success) {
      const amounts = [];
      if (result.ethAmount) amounts.push(`${result.ethAmount} ETH`);
      if (result.usdcAmount) amounts.push(`$${result.usdcAmount} USDC`);
      logsBox.log(showMessage(`Withdrawn: ${amounts.join(' + ')}`));
      logsBox.log(`[WITHDRAW] TX: ${result.txHash}`);
      // Refresh earnings after withdrawal
      await refreshEarnings();
    } else {
      logsBox.log(showError(`Withdrawal failed: ${result.error}`));
    }
    screen.render();
  });

  // Initial refresh
  await Promise.all([refreshStatus(), refreshEarnings()]);
  logsBox.log('Dashboard v1.2.1 (USDC+Gwei Pricing). Press R to refresh, Q to quit.');

  // Set up Docker log streaming (auto-detects container)
  const logStream = new DockerLogStream();

  logStream.on('log', (entry) => {
    logsBox.log(formatLogEntry(entry));
    screen.render();
  });

  logStream.on('connect', (containerName: string) => {
    logsBox.log(`[DOCKER] Connected to container: ${containerName}`);
    screen.render();
  });

  logStream.on('disconnect', () => {
    logsBox.log('[DOCKER] Disconnected from container logs');
    screen.render();
  });

  logStream.on('error', (error: Error) => {
    logsBox.log(`[DOCKER] ${error.message}`);
    screen.render();
  });

  // Connect to Docker logs
  logStream.connect();

  // Set up refresh interval
  const refreshTimer = setInterval(async () => {
    await Promise.all([refreshStatus(), refreshEarnings()]);
  }, options.refreshInterval);

  // Cleanup on exit
  screen.on('destroy', () => {
    clearInterval(refreshTimer);
    logStream.disconnect();
  });

  screen.render();
}
