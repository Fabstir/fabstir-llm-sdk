# Host CLI TUI Dashboard Implementation Plan (v1.0)

> Terminal-based dashboard for managing Fabstir host nodes with real-time monitoring
>
> **Status**: ✅ COMPLETE (8/8 sub-phases complete) | **Target**: Multi-GPU Host Management | **Total Time**: ~5 hours

## Overview

Add a Terminal User Interface (TUI) dashboard to the existing Host CLI. This provides a visual, interactive way to manage host nodes directly in the terminal - ideal for headless servers accessed via SSH.

**Use Case**: Hosts running multiple GPUs want a single dashboard to monitor all workers, view logs, manage pricing, and track earnings without switching between multiple CLI commands.

**Command**: `fabstir-host dashboard`

## Prerequisites

Before starting implementation, ensure:

- [ ] Host CLI working (`packages/host-cli/`)
- [ ] Management server running (`fabstir-host serve`)
- [ ] Node registered on blockchain
- [ ] Docker container accessible
- [ ] Terminal with UTF-8 support (for box drawing characters)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Host Machine (1 Host Address)                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ GPU 0: LLaMA-70B│  │ GPU 1: Mixtral  │  │ GPU 2: Future   │  │
│  │ Port: 8080      │  │ Port: 8081      │  │ Port: 8082      │  │
│  │ Worker #1       │  │ Worker #2       │  │ Worker #3       │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│           └──────────┬─────────┴─────────┬──────────┘           │
│                      │                   │                      │
│              ┌───────▼───────────────────▼────────┐             │
│              │      fabstir-host-mgmt              │             │
│              │      (Management Server)            │             │
│              │      Port: 3001                     │             │
│              └───────────────────┬────────────────┘             │
│                                  │                              │
│              ┌───────────────────▼────────────────┐             │
│              │      fabstir-host dashboard         │             │
│              │      (TUI - This Feature)           │             │
│              └────────────────────────────────────┘             │
├─────────────────────────────────────────────────────────────────┤
│  Blockchain: Base Sepolia                                        │
│  - Single host registration (one address)                        │
│  - Multiple model IDs registered                                 │
│  - Unified stake, combined earnings                              │
└─────────────────────────────────────────────────────────────────┘
```

## TUI Dashboard Layout

```
┌─ Fabstir Host Dashboard ─────────────────────────────────────────┐
│ Host: 0x1234...abcd | Chain: Base Sepolia | Stake: 1000 FAB      │
├──────────────────────────────────────────────────────────────────┤
│ ┌─ Node Status ──────────────────────────────────────────────┐   │
│ │ Status: 🟢 Running | PID: 256 | Uptime: 5h 32m             │   │
│ │ URL: http://localhost:8080 | Version: v1.2.3               │   │
│ └────────────────────────────────────────────────────────────┘   │
│ ┌─ Earnings ──────────┐ ┌─ Live Logs ───────────────────────┐   │
│ │ Today:  $12.45      │ │ [07:30:15] Model loaded           │   │
│ │ Week:   $87.23      │ │ [07:30:16] User session started   │   │
│ │ Total:  $1,234.56   │ │ [07:30:17] Inference: 128 tokens  │   │
│ │                     │ │ [07:30:18] Session completed      │   │
│ │ [W]ithdraw          │ │ [07:30:19] Health check OK        │   │
│ └─────────────────────┘ └────────────────────────────────────┘   │
│ ┌─ Actions ──────────────────────────────────────────────────┐   │
│ │ [R]egister  [P]ricing  [S]tart  [X] Stop  [L]ogs  [Q]uit   │   │
│ └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

## Implementation Status

✅ **Phase 1: Dependencies & Setup** (2/2 sub-phases complete)
✅ **Phase 2: Dashboard Framework** (2/2 sub-phases complete)
✅ **Phase 3: Status & Logs Panels** (2/2 sub-phases complete)
✅ **Phase 4: Actions & Documentation** (2/2 sub-phases complete)

🎉 **IMPLEMENTATION COMPLETE** - 62/62 tests passing

## Key Principles

1. **Test-Driven Development (TDD)**: Write tests FIRST, then implementation
2. **Bounded Autonomy**: Each sub-phase has strict boundaries and line limits
3. **Reuse Existing Infrastructure**: Leverage display.ts, management API, SDK
4. **Single Worker First**: Build for single worker, design for multi-worker extension
5. **Keyboard-Driven**: All actions accessible via keyboard shortcuts
6. **Real-Time Updates**: Status and logs update automatically

## Development Constraints

- **Max Lines Per File**: Specified for each sub-phase
- **Test First**: Tests must be written before implementation
- **Single Responsibility**: Each sub-phase does ONE thing
- **No Side Effects**: Don't modify files outside sub-phase scope
- **TUI Library**: Use `blessed` + `blessed-contrib`

## Existing Infrastructure (80% Reuse)

| Component | Location | Status |
|-----------|----------|--------|
| Display utilities | `src/monitoring/display.ts` | ✅ Tables, charts, progress bars |
| Management API | `src/server/api.ts` | ✅ REST endpoints ready |
| WebSocket logs | `src/server/ws.ts` | ✅ Real-time streaming |
| SDK integration | `src/sdk/client.ts` | ✅ All blockchain ops |
| Interactive prompts | Uses `inquirer` | ✅ Wizard patterns |
| Status tracking | `src/monitoring/tracker.ts` | ✅ Metrics/earnings |

---

## Phase 1: Dependencies & Setup

### Sub-phase 1.1: Add TUI Dependencies ✅

**Goal**: Add blessed and blessed-contrib packages to host-cli

**Status**: ✅ Complete (December 19, 2025)

**Tasks**:
- [x] Update `packages/host-cli/package.json`
  - [x] Add `blessed: ^0.1.81` to dependencies
  - [x] Add `blessed-contrib: ^4.11.0` to dependencies
  - [x] Add `@types/blessed: ^0.1.25` to devDependencies
- [x] Run `pnpm install` to install packages
- [x] Verify packages install correctly
- [x] Create `packages/host-cli/src/tui/` directory structure

**Files to Modify**:
- `packages/host-cli/package.json` (+4 lines)

**Directory Structure to Create**:
```
packages/host-cli/src/tui/
├── Dashboard.ts           # Main TUI screen (Phase 2)
├── types.ts               # TUI type definitions (Phase 1)
├── components/            # UI components (Phase 3)
└── services/              # API/WS wrappers (Phase 3)
```

**Verification**:
```bash
cd packages/host-cli
pnpm install
# Should complete without errors
ls node_modules/blessed
# Should exist
```

**Acceptance Criteria**:
- `blessed` and `blessed-contrib` installed
- TypeScript types available
- Directory structure created

---

### Sub-phase 1.2: Dashboard Command Registration ✅

**Goal**: Create `fabstir-host dashboard` command entry point

**Status**: ✅ Complete (December 19, 2025)

**Tasks**:
- [x] Write tests in `packages/host-cli/tests/commands/dashboard.test.ts` (80 lines max)
  - [x] Test: should export registerDashboardCommand function
  - [x] Test: should register dashboard command with program
  - [x] Test: should show dashboard in help output
  - [x] Test: should accept --mgmt-url option
  - [x] Test: should accept --refresh-interval option
  - [x] Test: should have default mgmt-url of http://localhost:3001
  - [x] Test: should have default refresh-interval of 5000ms
- [x] Create `packages/host-cli/src/commands/dashboard.ts` (60 lines max)
  - [x] Implement registerDashboardCommand(program: Command)
  - [x] Define command options (--mgmt-url, --refresh-interval)
  - [x] Import and call createDashboard() (stub for now)
- [x] Create stub `packages/host-cli/src/tui/Dashboard.ts` (25 lines)
  - [x] Export createDashboard function
  - [x] Export CreateDashboardOptions interface
  - [x] Add testMode support for testing
- [x] Update `packages/host-cli/src/index.ts` (+3 lines)
  - [x] Import registerDashboardCommand
  - [x] Call registerDashboardCommand(program)
- [x] Verify tests pass (7/7 dashboard tests + 3 CLI integration tests)

**Test Requirements**:
```typescript
// packages/host-cli/tests/commands/dashboard.test.ts
import { describe, test, expect, vi } from 'vitest';
import { Command } from 'commander';
import { registerDashboardCommand } from '../../src/commands/dashboard';

describe('dashboard command', () => {
  test('should export registerDashboardCommand function', () => {
    expect(typeof registerDashboardCommand).toBe('function');
  });

  test('should register dashboard command with program', () => {
    const program = new Command();
    registerDashboardCommand(program);
    const dashboardCmd = program.commands.find(c => c.name() === 'dashboard');
    expect(dashboardCmd).toBeDefined();
  });

  test('should show dashboard in help output', () => {
    const program = new Command();
    registerDashboardCommand(program);
    const helpText = program.helpInformation();
    expect(helpText).toContain('dashboard');
  });

  test('should accept --mgmt-url option', () => {
    const program = new Command();
    registerDashboardCommand(program);
    const dashboardCmd = program.commands.find(c => c.name() === 'dashboard');
    const options = dashboardCmd?.options.map(o => o.long);
    expect(options).toContain('--mgmt-url');
  });

  test('should accept --refresh-interval option', () => {
    const program = new Command();
    registerDashboardCommand(program);
    const dashboardCmd = program.commands.find(c => c.name() === 'dashboard');
    const options = dashboardCmd?.options.map(o => o.long);
    expect(options).toContain('--refresh-interval');
  });
});
```

**Implementation Requirements**:
```typescript
// packages/host-cli/src/commands/dashboard.ts
import { Command } from 'commander';

export interface DashboardOptions {
  mgmtUrl: string;
  refreshInterval: number;
}

export function registerDashboardCommand(program: Command): void {
  program
    .command('dashboard')
    .description('Open interactive TUI dashboard for node management')
    .option('--mgmt-url <url>', 'Management server URL', 'http://localhost:3001')
    .option('--refresh-interval <ms>', 'Status refresh interval in ms', '5000')
    .action(async (options: DashboardOptions) => {
      // Import dynamically to avoid loading blessed on every CLI invocation
      const { createDashboard } = await import('../tui/Dashboard');
      await createDashboard(options);
    });
}
```

**Verification**:
```bash
cd packages/host-cli
pnpm test tests/commands/dashboard.test.ts
# Should pass 5/5 tests

pnpm build
fabstir-host --help
# Should show: dashboard  Open interactive TUI dashboard for node management
```

**Acceptance Criteria**:
- Command registered in CLI
- All 5 tests pass
- Help shows dashboard command
- Options parsed correctly

---

## Phase 2: Dashboard Framework

### Sub-phase 2.1: Dashboard Screen Layout ✅

**Goal**: Create main blessed screen with grid layout and keyboard handling

**Status**: ✅ Complete (December 19, 2025)

**Tasks**:
- [x] Write tests in `packages/host-cli/tests/tui/Dashboard.test.ts` (120 lines max)
  - [x] Test: should export createDashboard function
  - [x] Test: should skip rendering in testMode
  - [x] Test: should create blessed screen when not in testMode
  - [x] Test: should setup quit key handler
  - [x] Test: should setup refresh key handler
  - [x] Test: should setup start/stop key handlers
  - [x] Test: should call screen.render()
  - [x] Test: types module exports (DashboardState, NodeStatus, LogEntry, EarningsData)
- [x] Create `packages/host-cli/src/tui/types.ts` (35 lines)
  - [x] Define DashboardState interface
  - [x] Define NodeStatus interface
  - [x] Define LogEntry interface
  - [x] Define EarningsData interface
- [x] Create `packages/host-cli/src/tui/Dashboard.ts` (195 lines)
  - [x] Import blessed and blessed-contrib
  - [x] Implement createDashboard(options) function
  - [x] Create blessed screen with title
  - [x] Create grid layout (12x12)
  - [x] Add header box (row 0, cols 0-11)
  - [x] Add status box placeholder (row 1-4, cols 0-7)
  - [x] Add earnings box placeholder (row 1-4, cols 8-11)
  - [x] Add logs box placeholder (row 5-10, cols 0-11)
  - [x] Add actions bar (row 11, cols 0-11)
  - [x] Setup keyboard handlers (q, r, s, x, p, w)
  - [x] Implement cleanup and exit
  - [x] Add status refresh with management API
  - [x] Call screen.render()
- [x] Verify tests pass (12/12)

**Test Requirements**:
```typescript
// packages/host-cli/tests/tui/Dashboard.test.ts
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock blessed to avoid terminal dependency in tests
vi.mock('blessed', () => ({
  screen: vi.fn(() => ({
    key: vi.fn(),
    append: vi.fn(),
    render: vi.fn(),
    destroy: vi.fn(),
  })),
  box: vi.fn(() => ({
    setContent: vi.fn(),
  })),
}));

vi.mock('blessed-contrib', () => ({
  grid: vi.fn(() => ({
    set: vi.fn(() => ({ setContent: vi.fn() })),
  })),
}));

describe('Dashboard', () => {
  test('should export createDashboard function', async () => {
    const { createDashboard } = await import('../../src/tui/Dashboard');
    expect(typeof createDashboard).toBe('function');
  });

  test('should create blessed screen', async () => {
    const blessed = await import('blessed');
    const { createDashboard } = await import('../../src/tui/Dashboard');

    // Don't actually render - just verify setup
    const dashboard = createDashboard({
      mgmtUrl: 'http://localhost:3001',
      refreshInterval: 5000,
      testMode: true // Skip actual rendering
    });

    expect(blessed.screen).toHaveBeenCalled();
  });

  // ... more tests
});
```

**Implementation Requirements**:
```typescript
// packages/host-cli/src/tui/types.ts
export interface DashboardState {
  nodeStatus: NodeStatus | null;
  logs: LogEntry[];
  earnings: EarningsData | null;
  isRefreshing: boolean;
}

export interface NodeStatus {
  status: 'running' | 'stopped';
  pid?: number;
  uptime?: number;
  publicUrl?: string;
  version?: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'stdout' | 'stderr';
  message: string;
}

export interface EarningsData {
  today: string;
  week: string;
  total: string;
  currency: string;
}
```

```typescript
// packages/host-cli/src/tui/Dashboard.ts
import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { DashboardOptions } from '../commands/dashboard';
import { DashboardState } from './types';

export async function createDashboard(options: DashboardOptions & { testMode?: boolean }): Promise<void> {
  if (options.testMode) return; // Skip rendering in tests

  const screen = blessed.screen({
    smartCSR: true,
    title: 'Fabstir Host Dashboard',
  });

  const grid = new contrib.grid({ rows: 12, cols: 12, screen });

  // Header (row 0)
  const header = grid.set(0, 0, 1, 12, blessed.box, {
    content: ' Fabstir Host Dashboard | Loading...',
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

  // Keyboard handlers
  screen.key(['q', 'C-c'], () => {
    screen.destroy();
    process.exit(0);
  });

  screen.key(['r'], async () => {
    // Refresh status
  });

  screen.key(['s'], async () => {
    // Start node
  });

  screen.key(['x'], async () => {
    // Stop node
  });

  screen.render();
}
```

**Verification**:
```bash
cd packages/host-cli
pnpm test tests/tui/Dashboard.test.ts
# Should pass 6/6 tests
```

**Acceptance Criteria**:
- Dashboard screen renders
- Grid layout correct
- Keyboard shortcuts work
- Clean exit on 'q'

---

### Sub-phase 2.2: Header Component with Host Info ✅

**Goal**: Display host address, chain, stake in header

**Status**: ✅ Complete (December 19, 2025)

**Tasks**:
- [x] Write tests in `packages/host-cli/tests/tui/components/Header.test.ts` (60 lines)
  - [x] Test: should truncate long addresses to 0x1234...5678 format
  - [x] Test: should handle short addresses without truncation
  - [x] Test: should return empty string for empty input
  - [x] Test: should format header with host address, chain, and stake
  - [x] Test: should include proper separators
  - [x] Test: should handle zero stake
  - [x] Test: should format large stake with commas
- [x] Create `packages/host-cli/src/tui/components/Header.ts` (40 lines)
  - [x] Implement truncateAddress() function
  - [x] Implement formatNumber() for comma formatting
  - [x] Implement formatHeader(hostAddress, chainName, stake) function
  - [x] Truncate address to 0x1234...5678 format
  - [x] Format stake with FAB suffix and comma separators
  - [x] Return formatted string for header box
- [x] Update Dashboard.ts to use Header component
  - [x] Import formatHeader from Header component
  - [x] Add hostAddress, chainName, stake to options interface
  - [x] Update header content to use formatHeader
- [x] Verify tests pass (7/7)

**Implementation Requirements**:
```typescript
// packages/host-cli/src/tui/components/Header.ts
export function formatHeader(hostAddress: string, chainName: string, stake: string): string {
  const truncatedAddr = `${hostAddress.slice(0, 6)}...${hostAddress.slice(-4)}`;
  return ` Host: ${truncatedAddr} | Chain: ${chainName} | Stake: ${stake} FAB `;
}
```

**Acceptance Criteria**:
- Header shows host info
- Address properly truncated
- Updates on refresh

---

## Phase 3: Status & Logs Panels

### Sub-phase 3.1: Node Status Panel ✅

**Goal**: Display node status, PID, uptime, URL from management API

**Status**: ✅ Complete (December 19, 2025)

**Tasks**:
- [x] Write tests in `packages/host-cli/tests/tui/components/StatusPanel.test.ts` (80 lines)
  - [x] Test: should format seconds to hours and minutes
  - [x] Test: should handle zero seconds
  - [x] Test: should handle large values (24h)
  - [x] Test: should handle minutes only
  - [x] Test: should format running status correctly
  - [x] Test: should format stopped status correctly
  - [x] Test: should show PID when available
  - [x] Test: should show uptime when available
  - [x] Test: should show URL when available
  - [x] Test: should show version when available
- [x] Write tests in `packages/host-cli/tests/tui/services/MgmtClient.test.ts` (80 lines)
  - [x] Test: should fetch status from management API
  - [x] Test: should return null on HTTP error
  - [x] Test: should return null on network error
  - [x] Test: should handle stopped status
- [x] Create `packages/host-cli/src/tui/services/MgmtClient.ts` (60 lines)
  - [x] Implement fetchStatus(mgmtUrl) function
  - [x] Implement startNode(mgmtUrl) function
  - [x] Implement stopNode(mgmtUrl) function
  - [x] Return NodeStatus interface
  - [x] Handle connection errors gracefully
- [x] Create `packages/host-cli/src/tui/components/StatusPanel.ts` (45 lines)
  - [x] Implement formatUptime(seconds) function
  - [x] Implement formatStatusPanel(status: NodeStatus) function
  - [x] Format uptime (5h 32m format)
  - [x] Use emoji indicators (🟢/🔴)
  - [x] Return formatted string for status box
- [x] Update Dashboard.ts to use modular components
- [x] Add refresh interval polling
- [x] Verify tests pass (14/14 for 3.1)

**Implementation Requirements**:
```typescript
// packages/host-cli/src/tui/services/MgmtClient.ts
import { NodeStatus } from '../types';

export async function fetchStatus(mgmtUrl: string): Promise<NodeStatus> {
  try {
    const response = await fetch(`${mgmtUrl}/api/status`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    return { status: 'stopped' };
  }
}
```

```typescript
// packages/host-cli/src/tui/components/StatusPanel.ts
import { NodeStatus } from '../types';

export function formatStatusPanel(status: NodeStatus): string {
  const indicator = status.status === 'running' ? '🟢' : '🔴';
  const lines = [
    `Status: ${indicator} ${status.status.toUpperCase()}`,
  ];

  if (status.status === 'running') {
    if (status.pid) lines.push(`PID: ${status.pid}`);
    if (status.uptime) lines.push(`Uptime: ${formatUptime(status.uptime)}`);
    if (status.publicUrl) lines.push(`URL: ${status.publicUrl}`);
    if (status.version) lines.push(`Version: ${status.version}`);
  }

  return lines.join('\n');
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
```

**Acceptance Criteria**:
- Status panel shows current node state
- Auto-refreshes at configured interval
- Handles connection errors gracefully

---

### Sub-phase 3.2: Live Logs Panel ✅

**Goal**: Stream logs from management server WebSocket

**Status**: ✅ Complete (December 19, 2025)

**Tasks**:
- [x] Write tests in `packages/host-cli/tests/tui/services/LogStream.test.ts` (80 lines)
  - [x] Test: should export LogStreamClient class
  - [x] Test: should create WebSocket URL from management URL
  - [x] Test: should handle https to wss conversion
  - [x] Test: should emit log events on message
  - [x] Test: should close WebSocket on disconnect
- [x] Write tests in `packages/host-cli/tests/tui/components/LogsPanel.test.ts` (80 lines)
  - [x] Test: should format ISO timestamp to HH:MM:SS
  - [x] Test: should handle empty/invalid timestamp
  - [x] Test: should format info/warn/error log entries
  - [x] Test: should format stdout/stderr log entries
  - [x] Test: should include timestamp in formatted output
- [x] Create `packages/host-cli/src/tui/services/LogStream.ts` (85 lines)
  - [x] Implement LogStreamClient class extending EventEmitter
  - [x] Convert http/https to ws/wss
  - [x] Connect to ws://mgmtUrl/ws/logs
  - [x] Parse incoming messages
  - [x] Emit 'log', 'connect', 'disconnect', 'error' events
  - [x] Handle automatic reconnection
- [x] Create `packages/host-cli/src/tui/components/LogsPanel.ts` (50 lines)
  - [x] Implement formatTimestamp() function
  - [x] Implement getLevelLabel() function
  - [x] Implement formatLogEntry(entry: LogEntry) function
  - [x] Format timestamp to HH:MM:SS
- [x] Update Dashboard.ts to connect and display logs
  - [x] Import LogStreamClient and formatLogEntry
  - [x] Connect to log stream on startup
  - [x] Display formatted log entries in logs panel
  - [x] Handle connect/disconnect/error events
  - [x] Clean up on exit
- [x] Verify tests pass (14/14 for 3.2)

**Implementation Requirements**:
```typescript
// packages/host-cli/src/tui/services/LogStream.ts
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { LogEntry } from '../types';

export class LogStreamClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(mgmtUrl: string) {
    super();
    this.url = mgmtUrl.replace('http', 'ws') + '/ws/logs';
  }

  connect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'log') {
          this.emit('log', msg as LogEntry);
        } else if (msg.type === 'history') {
          msg.lines.forEach((line: string) => {
            this.emit('log', { timestamp: '', level: 'info', message: line });
          });
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    this.ws.on('close', () => {
      this.emit('disconnect');
      this.scheduleReconnect();
    });

    this.ws.on('error', () => {
      this.emit('error');
    });
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.ws) {
      this.ws.close();
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, 3000);
  }
}
```

**Acceptance Criteria**:
- Logs stream in real-time
- Color-coded by level
- Auto-reconnects on disconnect

---

## Phase 4: Actions & Documentation

### Sub-phase 4.1: Action Handlers ✅

**Goal**: Implement keyboard actions (start, stop, pricing, withdraw)

**Status**: ✅ Complete (December 19, 2025)

**Tasks**:
- [x] Write tests in `packages/host-cli/tests/tui/actions.test.ts` (100 lines)
  - [x] Test: should export handleStart function
  - [x] Test: should export handleStop function
  - [x] Test: should export showMessage function
  - [x] Test: should export showError function
  - [x] Test: handleStart should call start API and return success
  - [x] Test: handleStart should return error on failure
  - [x] Test: handleStop should call stop API and return success
  - [x] Test: handleStop should return error on failure
- [x] Create `packages/host-cli/src/tui/actions.ts` (110 lines)
  - [x] Define ActionResult interface
  - [x] Implement handleStart(mgmtUrl, onComplete) function
  - [x] Implement handleStop(mgmtUrl, onComplete) function
  - [x] Implement handleWithdraw() placeholder
  - [x] Implement handleUpdatePricing() placeholder
  - [x] Implement showMessage() function
  - [x] Implement showError() function
- [x] Update Dashboard.ts to use action handlers
  - [x] Import action handlers
  - [x] Replace inline start/stop logic with handleStart/handleStop
  - [x] Use showMessage/showError for consistent UI feedback
- [x] Verify tests pass (8/8)

**Implementation Requirements**:
```typescript
// packages/host-cli/src/tui/actions.ts
import blessed from 'blessed';

export async function handleStart(
  mgmtUrl: string,
  screen: blessed.Widgets.Screen,
  onComplete: () => void
): Promise<void> {
  try {
    const response = await fetch(`${mgmtUrl}/api/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daemon: true }),
    });

    if (!response.ok) {
      const error = await response.json();
      showError(screen, `Start failed: ${error.error}`);
      return;
    }

    showMessage(screen, '✅ Node started');
    onComplete();
  } catch (error) {
    showError(screen, `Start failed: ${error}`);
  }
}

export async function handleStop(
  mgmtUrl: string,
  screen: blessed.Widgets.Screen,
  onComplete: () => void
): Promise<void> {
  const confirmed = await showConfirmation(screen, 'Stop node?');
  if (!confirmed) return;

  try {
    const response = await fetch(`${mgmtUrl}/api/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json();
      showError(screen, `Stop failed: ${error.error}`);
      return;
    }

    showMessage(screen, '✅ Node stopped');
    onComplete();
  } catch (error) {
    showError(screen, `Stop failed: ${error}`);
  }
}

function showConfirmation(screen: blessed.Widgets.Screen, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = blessed.question({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 40,
      height: 5,
      border: { type: 'line' },
      style: { border: { fg: 'yellow' } },
    });

    dialog.ask(message, (err, value) => {
      resolve(value);
    });
  });
}

function showError(screen: blessed.Widgets.Screen, message: string): void {
  const errorBox = blessed.message({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 50,
    height: 5,
    border: { type: 'line' },
    style: { border: { fg: 'red' } },
  });

  errorBox.error(message, 3); // Auto-close after 3 seconds
}

function showMessage(screen: blessed.Widgets.Screen, message: string): void {
  const msgBox = blessed.message({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 50,
    height: 5,
    border: { type: 'line' },
    style: { border: { fg: 'green' } },
  });

  msgBox.display(message, 2); // Auto-close after 2 seconds
}
```

**Acceptance Criteria**:
- All keyboard actions work
- Confirmations before destructive actions
- Error messages displayed clearly

---

### Sub-phase 4.2: Documentation & Docker ✅

**Goal**: Documentation and Docker integration

**Status**: ✅ Complete (December 19, 2025)

**Tasks**:
- [x] Update `packages/host-cli/docs/API_REFERENCE.md` (+50 lines)
  - [x] Add dashboard command documentation
  - [x] Document keyboard shortcuts
  - [x] Add example usage
- [x] Create `packages/host-cli/docs/DASHBOARD_GUIDE.md` (278 lines)
  - [x] Write Overview section
  - [x] Write Quick Start section
  - [x] Write Keyboard Shortcuts reference
  - [x] Write Troubleshooting section
  - [x] Add screenshots/ASCII mockups
- [x] Update `packages/host-cli/Dockerfile` (+2 lines)
  - [x] Ensure TERM environment variable set (line 165)
  - [x] Test TUI works in container
- [x] Update `packages/host-cli/README.md` (+50 lines)
  - [x] Add Terminal Dashboard (TUI) section
  - [x] Link to DASHBOARD_GUIDE.md

**Documentation Contents**:
```markdown
# packages/host-cli/docs/DASHBOARD_GUIDE.md

# Host Dashboard Guide

## Overview

The Host Dashboard provides a terminal-based interface for managing your
Fabstir host node. It displays real-time status, logs, and earnings, with
keyboard shortcuts for common operations.

## Quick Start

1. Start your Docker container
2. Start the management server: `fabstir-host serve`
3. Open the dashboard: `fabstir-host dashboard`

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `q` | Quit dashboard |
| `r` | Refresh status |
| `s` | Start node |
| `x` | Stop node |
| `p` | Update pricing |
| `w` | Withdraw earnings |

## Requirements

- Terminal with UTF-8 support
- Management server running (`fabstir-host serve`)
- Registered host address

## Troubleshooting

### Dashboard won't render
- Ensure your terminal supports UTF-8
- Try setting: `export TERM=xterm-256color`
- Run inside screen/tmux if using SSH

### Can't connect to management server
- Verify server running: `curl http://localhost:3001/health`
- Check port 3001 is accessible
- Verify Docker port mapping: `-p 3001:3001`
```

**Acceptance Criteria**:
- Documentation complete
- Dashboard works in Docker
- README updated

---

## Multi-Worker Extension (Phase B - Future)

**Current State**: fabstir-host-mgmt is single-worker only

This phase is planned for after single-worker TUI is complete:

1. Extend fabstir-host-mgmt with multi-worker API:
   - `GET /api/workers` - List all workers
   - `POST /api/workers/:id/start` - Start specific worker
   - `POST /api/workers/:id/stop` - Stop specific worker
   - `WebSocket /ws/logs?worker=:id` - Per-worker filtering

2. Update TUI to show worker table (as designed in layout mockup)

3. Add per-GPU model assignment

---

## Estimated Effort

| Phase | Sub-phases | Time |
|-------|------------|------|
| Phase 1 | 1.1, 1.2 | 50 min |
| Phase 2 | 2.1, 2.2 | 1h 30min |
| Phase 3 | 3.1, 3.2 | 1h 45min |
| Phase 4 | 4.1, 4.2 | 1h 15min |
| **Total** | 8 sub-phases | **~5 hours** |

---

## Success Criteria

- [x] `fabstir-host dashboard` command works
- [x] Real-time status updates
- [x] Live log streaming
- [x] Keyboard actions functional
- [x] Works in Docker container (TERM=xterm-256color)
- [x] All tests pass (62/62 tests)
- [x] Documentation complete

---

**Document Version**: v1.0
**Created**: December 2025
**Status**: ✅ Implementation Complete (December 19, 2025)
**Maintainer**: Fabstir Development Team
