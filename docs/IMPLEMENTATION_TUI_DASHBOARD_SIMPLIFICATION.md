# TUI Dashboard Simplification - Implementation Plan

**Status:** In Progress
**Branch:** `feature/host-tui-dashboard`
**Created:** 2025-12-20

## Problem

The TUI dashboard currently requires a **separate management server** (`fabstir-host serve` on port 3001) to function. This is unnecessarily complex because:

1. `fabstir-llm-node` already exposes `/health`, `/status`, and `/v1/version` endpoints
2. Users run `fabstir-llm-node` directly (via Docker) - they don't use `fabstir-host serve`
3. Two separate processes adds confusion and complexity

## Solution

**Modify the TUI dashboard to connect directly to `fabstir-llm-node` (port 8080) instead of requiring a separate management server.**

### Before (Current - Complex)
```bash
# User must run TWO things:
fabstir-llm-node                           # LLM inference (port 8080)
fabstir-host serve --port 3001             # Management API (port 3001)
fabstir-host dashboard --mgmt-url http://localhost:3001
```

### After (Simplified)
```bash
# User just runs their node normally:
docker-compose up -d                       # fabstir-llm-node on port 8080

# Dashboard connects directly:
fabstir-host dashboard --url http://localhost:8080
```

---

## fabstir-llm-node API (Already Available)

| Endpoint | Data |
|----------|------|
| `GET /health` | `{ status: "healthy", issues: null }` |
| `GET /status` | `{ status, uptime_seconds, active_sessions, total_jobs_completed, models_loaded, version }` |
| `GET /v1/version` | `{ version, build, features, chains }` |

---

## Implementation Tasks

### Task 1: Update MgmtClient.ts
- [x] Change `/api/status` → `/status`
- [x] Remove `startNode()` function (can't control external node via API)
- [x] Remove `stopNode()` function (can't control external node via API)
- [x] Update response parsing for fabstir-llm-node format

**File:** `packages/host-cli/src/tui/services/MgmtClient.ts`

**New NodeStatus type:**
```typescript
export interface NodeStatus {
  status: 'active' | 'busy' | 'maintenance';  // Not 'running' | 'stopped'
  uptime_seconds: number;      // Not 'uptime'
  active_sessions: number;     // New field
  total_jobs_completed: number; // New field
  models_loaded: string[];     // New field
  version: string;
}
```

### Task 2: Update types.ts
- [x] Update `NodeStatus` interface to match fabstir-llm-node response
- [x] Keep `LogEntry` interface (still used)
- [x] Keep `EarningsData` interface (still used)
- [x] Keep `DashboardState` interface (still used)

**File:** `packages/host-cli/src/tui/types.ts`

### Task 3: Update Dashboard.ts
- [x] Change default URL: `http://localhost:3001` → `http://localhost:8080`
- [x] Replace `LogStreamClient` import with `DockerLogStream`
- [x] Remove `handleStart` and `handleStop` imports
- [x] Remove 's' key handler (start node)
- [x] Remove 'x' key handler (stop node)
- [x] Update actions bar text (remove [S]tart and [X]Stop)
- [x] Update error message: "Unable to connect to node" instead of "management server"
- [x] Update log stream instantiation to use `DockerLogStream`

**File:** `packages/host-cli/src/tui/Dashboard.ts`

### Task 4: Update dashboard.ts command
- [x] Rename `--mgmt-url` → `--url`
- [x] Change default: `http://localhost:3001` → `http://localhost:8080`
- [x] Update description: "Node URL" instead of "Management server URL"
- [x] Update option help text

**File:** `packages/host-cli/src/commands/dashboard.ts`

### Task 5: Update StatusPanel.ts
- [x] Update status display: `'running'|'stopped'` → `'active'|'busy'|'maintenance'`
- [x] Update field: `uptime` → `uptime_seconds`
- [x] Add display for `active_sessions`
- [x] Add display for `total_jobs_completed`
- [x] Add display for `models_loaded`
- [x] Update formatting for new fields

**File:** `packages/host-cli/src/tui/components/StatusPanel.ts`

### Task 6: Create DockerLogs.ts (NEW FILE)
- [x] Create `DockerLogStream` class extending EventEmitter
- [x] Implement `detectContainer()` method using `docker ps --filter`
- [x] Implement `connect()` method that spawns `docker logs -f`
- [x] Implement `disconnect()` method to kill subprocess
- [x] Emit 'log', 'connect', 'disconnect', 'error' events
- [x] Handle case when no container found gracefully

**File:** `packages/host-cli/src/tui/services/DockerLogs.ts`

```typescript
import { spawn, ChildProcess, execSync } from 'child_process';
import { EventEmitter } from 'events';

export class DockerLogStream extends EventEmitter {
  private process: ChildProcess | null = null;
  private containerName: string | null = null;

  async connect(): Promise<void> {
    // Auto-detect fabstir container
    this.containerName = await this.detectContainer();
    if (!this.containerName) {
      this.emit('error', new Error('No fabstir Docker container detected'));
      return;
    }

    // Spawn docker logs -f
    this.process = spawn('docker', ['logs', '-f', '--tail', '50', this.containerName]);

    this.process.stdout?.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line) {
          this.emit('log', { level: 'stdout', message: line, timestamp: new Date().toISOString() });
        }
      }
    });

    this.process.stderr?.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line) {
          this.emit('log', { level: 'stderr', message: line, timestamp: new Date().toISOString() });
        }
      }
    });

    this.process.on('close', (code) => {
      this.emit('disconnect', code);
    });

    this.emit('connect', this.containerName);
  }

  private async detectContainer(): Promise<string | null> {
    try {
      const result = execSync('docker ps --filter "name=fabstir" --format "{{.Names}}"', {
        encoding: 'utf-8',
        timeout: 5000,
      });
      const containers = result.trim().split('\n').filter(Boolean);
      return containers[0] || null;
    } catch {
      return null;
    }
  }

  disconnect(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}
```

### Task 7: Delete LogStream.ts
- [x] Remove file (no longer needed - was WebSocket to management server)

**File:** `packages/host-cli/src/tui/services/LogStream.ts`

### Task 8: Update actions.ts
- [x] Remove `handleStart` function (can't control external node)
- [x] Remove `handleStop` function (can't control external node)
- [x] Keep `showMessage` and `showError` functions

**File:** `packages/host-cli/src/tui/actions.ts`

### Task 9: Build and Test
- [x] Run `pnpm build` in packages/host-cli
- [x] Fix any TypeScript errors
- [ ] Test dashboard locally (will show "Unable to connect" since no node)
- [ ] Update tests if needed

### Task 10: Test on Production Server
- [ ] SSH into Ubuntu server
- [ ] Verify node is running: `docker ps | grep fabstir`
- [ ] Run dashboard: `fabstir-host dashboard --url http://localhost:8080`
- [ ] Verify status panel shows node status
- [ ] Verify log panel shows Docker logs (auto-detected)
- [ ] Verify keyboard shortcuts work (R for refresh, Q for quit)

---

## API Mapping

| Current (MgmtClient) | fabstir-llm-node | Notes |
|---------------------|------------------|-------|
| `/api/status` | `/status` | Field names differ |
| `/api/logs/stream` | Docker logs | WebSocket → subprocess |
| `/health` | `/health` | Same |

---

## Summary

**Before:** Host operators needed to run `fabstir-host serve` separately just for the dashboard to work.

**After:** Dashboard connects directly to `fabstir-llm-node`. Just run the node however you want, then run the dashboard. Zero extra setup.

| What Changed | Before | After |
|--------------|--------|-------|
| Status API | `localhost:3001/api/status` | `localhost:8080/status` |
| Log source | WebSocket to mgmt server | Docker logs (auto-detect) |
| Required processes | Node + Management server | Node only |
| User input needed | Container name, port, etc. | None (auto-detect) |
