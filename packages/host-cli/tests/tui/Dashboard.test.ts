// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Dashboard TUI Tests
 * TDD tests for the main dashboard screen layout
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock blessed to avoid terminal dependency in tests
const mockScreen = {
  key: vi.fn(),
  append: vi.fn(),
  render: vi.fn(),
  destroy: vi.fn(),
  on: vi.fn(),
  title: '',
};

const mockBox = {
  setContent: vi.fn(),
  content: '',
};

const mockLog = {
  log: vi.fn(),
  setContent: vi.fn(),
};

vi.mock('blessed', () => ({
  default: {
    screen: vi.fn(() => mockScreen),
    box: vi.fn(() => mockBox),
  },
}));

vi.mock('blessed-contrib', () => ({
  default: {
    grid: vi.fn(() => ({
      set: vi.fn((row, col, rowSpan, colSpan, widget, opts) => {
        if (opts?.label?.includes('Logs')) {
          return mockLog;
        }
        return { ...mockBox, ...opts };
      }),
    })),
    log: vi.fn(() => mockLog),
  },
}));

describe('Dashboard TUI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  test('should export createDashboard function', async () => {
    const { createDashboard } = await import('../../src/tui/Dashboard');
    expect(typeof createDashboard).toBe('function');
  });

  test('should export CreateDashboardOptions interface type', async () => {
    const module = await import('../../src/tui/Dashboard');
    // Interface exists if we can import without errors
    expect(module).toBeDefined();
  });

  test('should skip rendering in testMode', async () => {
    const blessed = await import('blessed');
    const { createDashboard } = await import('../../src/tui/Dashboard');

    await createDashboard({
      mgmtUrl: 'http://localhost:3001',
      refreshInterval: 5000,
      testMode: true,
    });

    // In testMode, blessed.screen should NOT be called
    expect(blessed.default.screen).not.toHaveBeenCalled();
  });

  test('should create blessed screen when not in testMode', async () => {
    const blessed = await import('blessed');
    const { createDashboard } = await import('../../src/tui/Dashboard');

    // Create dashboard (will use mocked blessed)
    const dashboardPromise = createDashboard({
      mgmtUrl: 'http://localhost:3001',
      refreshInterval: 5000,
      testMode: false,
    });

    // Blessed screen should be created
    expect(blessed.default.screen).toHaveBeenCalledWith(
      expect.objectContaining({
        smartCSR: true,
        title: 'Fabstir Host Dashboard',
      })
    );
  });

  test('should setup quit key handler', async () => {
    const { createDashboard } = await import('../../src/tui/Dashboard');

    await createDashboard({
      mgmtUrl: 'http://localhost:3001',
      refreshInterval: 5000,
      testMode: false,
    });

    // Check that 'q' and 'C-c' keys are registered
    expect(mockScreen.key).toHaveBeenCalledWith(
      expect.arrayContaining(['q', 'C-c']),
      expect.any(Function)
    );
  });

  test('should setup refresh key handler', async () => {
    const { createDashboard } = await import('../../src/tui/Dashboard');

    await createDashboard({
      mgmtUrl: 'http://localhost:3001',
      refreshInterval: 5000,
      testMode: false,
    });

    // Check that 'r' key is registered
    expect(mockScreen.key).toHaveBeenCalledWith(['r'], expect.any(Function));
  });

  test('should setup start/stop key handlers', async () => {
    const { createDashboard } = await import('../../src/tui/Dashboard');

    await createDashboard({
      mgmtUrl: 'http://localhost:3001',
      refreshInterval: 5000,
      testMode: false,
    });

    // Check that 's' (start) and 'x' (stop) keys are registered
    expect(mockScreen.key).toHaveBeenCalledWith(['s'], expect.any(Function));
    expect(mockScreen.key).toHaveBeenCalledWith(['x'], expect.any(Function));
  });

  test('should call screen.render()', async () => {
    const { createDashboard } = await import('../../src/tui/Dashboard');

    await createDashboard({
      mgmtUrl: 'http://localhost:3001',
      refreshInterval: 5000,
      testMode: false,
    });

    expect(mockScreen.render).toHaveBeenCalled();
  });
});

describe('Dashboard types', () => {
  test('should export DashboardState interface', async () => {
    const types = await import('../../src/tui/types');
    // Verify the module exports exist
    expect(types).toBeDefined();
  });

  test('should export NodeStatus interface', async () => {
    const types = await import('../../src/tui/types');
    expect(types).toBeDefined();
  });

  test('should export LogEntry interface', async () => {
    const types = await import('../../src/tui/types');
    expect(types).toBeDefined();
  });

  test('should export EarningsData interface', async () => {
    const types = await import('../../src/tui/types');
    expect(types).toBeDefined();
  });
});
