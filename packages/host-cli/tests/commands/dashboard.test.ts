// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Dashboard Command Tests
 * TDD tests for fabstir-host dashboard command
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// Mock the TUI Dashboard to avoid actual rendering
vi.mock('../../src/tui/Dashboard', () => ({
  createDashboard: vi.fn().mockResolvedValue(undefined),
}));

describe('dashboard command', () => {
  let program: Command;

  beforeEach(async () => {
    program = new Command();
    program.exitOverride(); // Prevent process.exit in tests

    // Dynamically import to get fresh module
    const { registerDashboardCommand } = await import('../../src/commands/dashboard');
    registerDashboardCommand(program);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should export registerDashboardCommand function', async () => {
    const module = await import('../../src/commands/dashboard');
    expect(typeof module.registerDashboardCommand).toBe('function');
  });

  test('should register dashboard command with program', () => {
    const dashboardCmd = program.commands.find(c => c.name() === 'dashboard');
    expect(dashboardCmd).toBeDefined();
    expect(dashboardCmd?.description()).toContain('TUI');
  });

  test('should show dashboard in help output', () => {
    const helpText = program.helpInformation();
    expect(helpText).toContain('dashboard');
  });

  test('should accept --mgmt-url option', () => {
    const dashboardCmd = program.commands.find(c => c.name() === 'dashboard');
    const options = dashboardCmd?.options.map(o => o.long);
    expect(options).toContain('--mgmt-url');
  });

  test('should accept --refresh-interval option', () => {
    const dashboardCmd = program.commands.find(c => c.name() === 'dashboard');
    const options = dashboardCmd?.options.map(o => o.long);
    expect(options).toContain('--refresh-interval');
  });

  test('should have default mgmt-url of http://localhost:3001', () => {
    const dashboardCmd = program.commands.find(c => c.name() === 'dashboard');
    const mgmtUrlOption = dashboardCmd?.options.find(o => o.long === '--mgmt-url');
    expect(mgmtUrlOption?.defaultValue).toBe('http://localhost:3001');
  });

  test('should have default refresh-interval of 5000ms', () => {
    const dashboardCmd = program.commands.find(c => c.name() === 'dashboard');
    const refreshOption = dashboardCmd?.options.find(o => o.long === '--refresh-interval');
    expect(refreshOption?.defaultValue).toBe('5000');
  });
});
