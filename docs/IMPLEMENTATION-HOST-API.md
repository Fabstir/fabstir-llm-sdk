# Host CLI Management API Implementation Plan (v1.0)

> Complete implementation plan for adding browser-based node management to Fabstir Host CLI
>
> **Status**: 🟡 Not Started | **Target**: Local Docker Development | **Est. Time**: 12-17 hours

## Overview

Add browser-based node management to the Fabstir Host CLI by creating an HTTP + WebSocket management server inside the Docker container. This enables users to start, stop, register, and unregister nodes through a web interface instead of CLI commands.

**Use Case**: Local development and testing with visual feedback. Production deployments should continue using CLI commands for reliability and scriptability.

## Prerequisites

Before starting implementation, ensure:

✅ Docker deployment working (see `DOCKER_DEPLOYMENT.md`)
✅ Node registration tested with `register-host.sh`
✅ Test harness running at `http://localhost:3000`
✅ Ports available: 3001 (management API)
✅ Node.js packages: express, cors, ws (will be installed in Phase 1)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Host Machine (localhost)                                        │
│                                                                 │
│  Browser                    Next.js Test Harness               │
│  http://localhost:3000  ←→  apps/harness/pages/                │
│                             node-management-enhanced.tsx        │
│         │                                                       │
│         │ HTTP/WS                                               │
│         ↓                                                       │
└─────────┼───────────────────────────────────────────────────────┘
          │
          │ Port 3001 (mapped 3001:3001)
          ↓
┌─────────────────────────────────────────────────────────────────┐
│ Docker Container (fabstir-host-test)                           │
│                                                                 │
│  Management Server (Express on :3001)                          │
│  ├── REST API                                                  │
│  │   ├── GET  /health                                          │
│  │   ├── GET  /api/status                                      │
│  │   ├── GET  /api/discover-nodes                              │
│  │   ├── POST /api/start                                       │
│  │   ├── POST /api/stop                                        │
│  │   ├── POST /api/register                                    │
│  │   ├── POST /api/unregister                                  │
│  │   ├── POST /api/add-stake                                   │
│  │   ├── POST /api/withdraw-earnings                           │
│  │   ├── POST /api/update-models                               │
│  │   └── POST /api/update-metadata                             │
│  └── WebSocket (/ws/logs)                                      │
│      └── Real-time log streaming                               │
│                                                                 │
│  packages/host-cli/src/                                        │
│  ├── server/                                                   │
│  │   ├── api.ts (ManagementServer)                            │
│  │   └── ws.ts (LogWebSocketServer)                           │
│  ├── commands/                                                 │
│  │   ├── serve.ts (new)                                        │
│  │   ├── start.ts (reused)                                     │
│  │   ├── stop.ts (reused)                                      │
│  │   ├── register.ts (reused)                                  │
│  │   └── unregister.ts (reused)                                │
│  └── daemon/                                                   │
│      ├── pid.ts (reused)                                       │
│      └── logs/ (tailed for WebSocket)                          │
│                                                                 │
│  fabstir-llm-node (Rust binary on :8080 internal)             │
│  └── Controlled by CLI commands                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Security Model

**Scope**: Localhost-only development environment

- **CORS**: Restricted to `http://localhost:3000` (Next.js harness)
- **API Keys**: Optional authentication for POST endpoints
- **Network**: Management server only accessible from host machine
- **Process Control**: Same permissions as CLI commands
- **No Remote Access**: Not designed for remote management (use SSH + CLI for production)

**Production Deployment**: For remote servers, use SSH tunneling + CLI commands instead of exposing management API

## Browser Requirements

- **Modern Browsers**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **WebSocket Support**: Required (all modern browsers support this)
- **JavaScript**: Must be enabled
- **Localhost Access**: Browser must be on same machine as Docker host
- **Recommended**: Use Chrome DevTools or Firefox Developer Tools for debugging

## Environment Variables

### New Variables (Added in this implementation)

| Variable | Default | Description | Example |
|----------|---------|-------------|---------|
| `MANAGEMENT_API_PORT` | 3001 | Port for management server | `3001` |
| `MANAGEMENT_API_KEY` | (none) | Optional API authentication | `secret123` |
| `MANAGEMENT_CORS_ORIGINS` | `http://localhost:3000` | Allowed CORS origins | `http://localhost:3000,http://localhost:3001` |

### Existing Variables (Reused)

All environment variables from `.env.test` are reused (see `DOCKER_DEPLOYMENT.md` for full list).

## CLI vs Browser: When to Use Each

| Task | CLI (Recommended) | Browser (This Feature) | Reason |
|------|-------------------|------------------------|--------|
| **Initial Setup** | ✅ | ❌ | Requires shell scripts and env vars |
| **Production Deployment** | ✅ | ❌ | More reliable, scriptable, no extra port |
| **Local Testing** | ⚠️ | ✅ | Browser provides visual feedback |
| **Debugging** | ⚠️ | ✅ | Real-time logs in UI |
| **Remote Management** | ✅ (via SSH) | ❌ | SSH tunnel + CLI is more secure |
| **Automated Scripts** | ✅ | ❌ | CLI easier to script |
| **Learning/Exploration** | ⚠️ | ✅ | Visual interface easier for beginners |

**Recommendation**: Use browser interface for local development/testing. Use CLI for production deployments and automation.

## Phase Dependencies

```
Phase 1 (API Server)  →  Phase 2 (WebSocket)  →  Phase 3 (Serve Command)
                                                          ↓
                                                    Phase 5 (Docker)
                                                          ↓
                                                    Phase 4 (Browser UI)
                                                          ↓
                                                    Phase 6 (Testing/Docs)
```

**Critical Path**: Phase 1 → Phase 2 → Phase 3 → Phase 5 → Phase 4 → Phase 6
**Parallelizable**: Phase 4 can start once Phase 3 is deployed to Docker

## Rollback Strategy

If implementation fails or causes issues:

1. **Remove serve command**: Comment out `registerServeCommand()` in `src/index.ts`
2. **Rebuild Docker**: `docker build --no-cache -f packages/host-cli/Dockerfile -t fabstir-host-cli:local .`
3. **Remove port mapping**: Remove `-p 3001:3001` from `start-fabstir-docker.sh`
4. **Revert browser UI**: Keep existing register/unregister functionality, remove management API client code
5. **Keep tests**: Tests remain for future implementation attempts

**No Data Loss**: All node data (config, PID files, logs) remain in `/root/.fabstir/` - only management interface is removed.

## Debugging & Monitoring

### Management Server Logs

```bash
# Inside container
docker exec fabstir-host-test cat /var/log/management-server.log

# Follow logs in real-time
docker exec fabstir-host-test tail -f /var/log/management-server.log
```

### Check if Server is Running

```bash
# Health check from host
curl http://localhost:3001/health

# Check process inside container
docker exec fabstir-host-test ps aux | grep "fabstir-host serve"
```

### WebSocket Connection Issues

```bash
# Test WebSocket connection (use websocat or browser DevTools)
# Browser DevTools → Network tab → WS filter → Check connection status
```

### Port Conflicts

```bash
# Check if port 3001 is already in use
lsof -i :3001

# Kill process using port (if needed)
kill -9 $(lsof -t -i:3001)
```

## Performance Impact

- **Management Server**: ~50MB RAM, negligible CPU when idle
- **WebSocket Log Tailing**: ~10MB RAM, minimal CPU
- **Node Performance**: No impact - management server is separate process
- **Startup Time**: +2 seconds for management server initialization
- **Network Bandwidth**: ~1-5 KB/s for log streaming (depends on node activity)

**Conclusion**: Management API has minimal performance impact on inference node.

## Implementation Status

⬜ **Phase 1: Management API Server** (0/3 sub-phases complete)
⬜ **Phase 2: WebSocket Log Streaming** (0/2 sub-phases complete)
⬜ **Phase 3: Serve Command** (0/2 sub-phases complete)
⬜ **Phase 4: Browser UI Integration** (0/3 sub-phases complete)
⬜ **Phase 5: Docker Integration** (0/2 sub-phases complete)
⬜ **Phase 6: Testing & Documentation** (0/2 sub-phases complete)

## Key Principles

1. **Test-Driven Development (TDD)**: Write tests FIRST, then implementation
2. **Bounded Autonomy**: Each sub-phase has strict boundaries and line limits
3. **Reuse CLI Logic**: Don't duplicate - call existing command functions
4. **Security First**: API key authentication, CORS restrictions
5. **Real-time Updates**: WebSocket for logs and status changes
6. **Clean Separation**: Management server is separate from inference node

## Development Constraints

- **Max Lines Per File**: Specified for each sub-phase
- **Test First**: Tests must be written before implementation
- **Single Responsibility**: Each sub-phase does ONE thing
- **No Side Effects**: Don't modify files outside sub-phase scope
- **Real Node Testing**: Integration tests use actual fabstir-llm-node

---

## Phase 1: Management API Server

### Sub-phase 1.1: API Server Core & Health Endpoint ⬜

**Goal**: Create Express server with basic health endpoint

**Tasks**:
- [ ] Write tests in `packages/host-cli/tests/server/api.test.ts` (80 lines)
  - [ ] Test: should start server on specified port
  - [ ] Test: should respond to health check at GET /health
  - [ ] Test: should enable CORS for localhost origins
  - [ ] Test: should reject requests without API key (if auth enabled)
  - [ ] Test: should gracefully shutdown server
- [ ] Create `packages/host-cli/src/server/api.ts` (120 lines)
  - [ ] Define ServerConfig interface
  - [ ] Implement ManagementServer class constructor
  - [ ] Implement start() method
  - [ ] Implement stop() method
  - [ ] Implement setupRoutes() method
  - [ ] Implement handleHealth() route handler
  - [ ] Add CORS middleware
  - [ ] Add optional API key authentication middleware
- [ ] Verify all tests pass
- [ ] Verify acceptance criteria met

**Implementation Requirements**:
```typescript
// packages/host-cli/src/server/api.ts
import express from 'express';
import cors from 'cors';

export interface ServerConfig {
  port: number;
  apiKey?: string;
  corsOrigins: string[];
}

export class ManagementServer {
  private app: express.Application;
  private server: any;

  constructor(config: ServerConfig);
  async start(): Promise<void>;
  async stop(): Promise<void>;

  // Route handlers
  private setupRoutes(): void;
  private handleHealth(req, res): void;
}
```

**Acceptance Criteria**:
- Server starts on specified port
- Health endpoint returns `{ status: 'ok', uptime: number }`
- CORS headers present for allowed origins
- Server can be stopped cleanly

**Verification Steps**:
```bash
# 1. Run tests
cd packages/host-cli && pnpm test tests/server/api.test.ts

# 2. Manual verification (optional)
node dist/server/api.js  # Start server
curl http://localhost:3001/health  # Should return { "status": "ok", "uptime": N }
curl -I http://localhost:3001/health | grep -i cors  # Should show CORS headers
```

**Expected Output**:
```
✓ should start server on specified port (50ms)
✓ should respond to health check at GET /health (20ms)
✓ should enable CORS for localhost origins (15ms)
✓ should reject requests without API key (10ms)
✓ should gracefully shutdown server (30ms)

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

---

### Sub-phase 1.2: Node Status Endpoint ⬜

**Goal**: Add GET /api/status endpoint that reads PID file and checks process

**Tasks**:
- [ ] Write tests in `packages/host-cli/tests/server/api.test.ts` (+50 lines)
  - [ ] Test: should return running status when node is active
  - [ ] Test: should return stopped status when no PID file exists
  - [ ] Test: should return stopped status when PID exists but process dead
  - [ ] Test: should include PID, uptime, and publicUrl in response
  - [ ] Test: should handle missing config gracefully
- [ ] Update `packages/host-cli/src/server/api.ts` (+60 lines)
  - [ ] Implement handleStatus() route handler
  - [ ] Integrate PIDManager to read PID file
  - [ ] Integrate loadConfig() to get publicUrl
  - [ ] Calculate uptime from startTime
  - [ ] Add GET /api/status route
- [ ] Verify all tests pass
- [ ] Verify acceptance criteria met

**Test Requirements**:
```typescript
describe('GET /api/status', () => {
  test('should return running status when node is active');
  test('should return stopped status when no PID file exists');
  test('should return stopped status when PID exists but process dead');
  test('should include PID, uptime, and publicUrl in response');
  test('should handle missing config gracefully');
});
```

**Implementation Requirements**:
```typescript
private async handleStatus(req, res): Promise<void> {
  // Read PID file using PIDManager
  // Check if process is running
  // Read config for publicUrl
  // Calculate uptime from startTime
  // Return JSON response
}

// Response format:
{
  status: 'running' | 'stopped',
  pid?: number,
  uptime?: number,  // seconds
  publicUrl?: string,
  startTime?: string  // ISO 8601
}
```

**Dependencies**:
- `src/daemon/pid.ts` - PIDManager
- `src/config/storage.ts` - loadConfig()

**Acceptance Criteria**:
- Correctly identifies running vs stopped nodes
- Returns accurate uptime calculation
- Handles missing PID file without errors
- Response matches TypeScript interface

---

### Sub-phase 1.3: Lifecycle Control Endpoints ⬜

**Goal**: Add POST endpoints for start, stop, register, unregister, and host management

**Tasks**:
- [ ] Write tests in `packages/host-cli/tests/server/api.test.ts` (+180 lines)
  - [ ] Test POST /api/start: should start node in daemon mode
  - [ ] Test POST /api/start: should return error if already running
  - [ ] Test POST /api/start: should return error if not registered
  - [ ] Test POST /api/start: should return PID and status on success
  - [ ] Test POST /api/stop: should stop running node
  - [ ] Test POST /api/stop: should return success if already stopped
  - [ ] Test POST /api/stop: should wait for graceful shutdown
  - [ ] Test POST /api/register: should register on blockchain and start node
  - [ ] Test POST /api/register: should validate required parameters
  - [ ] Test POST /api/register: should return transaction hash and host address
  - [ ] Test POST /api/unregister: should stop node and unregister from blockchain
  - [ ] Test POST /api/unregister: should return transaction hash
  - [ ] Test POST /api/unregister: should cleanup config
  - [ ] Test POST /api/add-stake: should add FAB to existing stake
  - [ ] Test POST /api/add-stake: should validate stake amount
  - [ ] Test POST /api/add-stake: should return transaction hash
  - [ ] Test POST /api/withdraw-earnings: should withdraw host earnings
  - [ ] Test POST /api/withdraw-earnings: should return transaction hash
  - [ ] Test POST /api/update-models: should update supported models list
  - [ ] Test POST /api/update-models: should validate model IDs
  - [ ] Test POST /api/update-metadata: should update host metadata
  - [ ] Test POST /api/update-metadata: should validate JSON format
  - [ ] Test GET /api/discover-nodes: should return all active hosts
- [ ] Update `packages/host-cli/src/server/api.ts` (+280 lines)
  - [ ] Implement handleStart() route handler
  - [ ] Implement handleStop() route handler
  - [ ] Implement handleRegister() route handler
  - [ ] Implement handleUnregister() route handler
  - [ ] Implement handleAddStake() route handler (NEW)
  - [ ] Implement handleWithdrawEarnings() route handler (NEW)
  - [ ] Implement handleUpdateModels() route handler (NEW)
  - [ ] Implement handleUpdateMetadata() route handler (NEW)
  - [ ] Implement handleDiscoverNodes() route handler (NEW)
  - [ ] Add POST /api/start route
  - [ ] Add POST /api/stop route
  - [ ] Add POST /api/register route
  - [ ] Add POST /api/unregister route
  - [ ] Add POST /api/add-stake route (NEW)
  - [ ] Add POST /api/withdraw-earnings route (NEW)
  - [ ] Add POST /api/update-models route (NEW)
  - [ ] Add POST /api/update-metadata route (NEW)
  - [ ] Add GET /api/discover-nodes route (NEW)
  - [ ] Add request validation middleware
- [ ] Verify all tests pass
- [ ] Verify acceptance criteria met

**Test Requirements**:
```typescript
describe('POST /api/start', () => {
  test('should start node in daemon mode');
  test('should return error if already running');
  test('should return error if not registered');
  test('should return PID and status on success');
});

describe('POST /api/stop', () => {
  test('should stop running node');
  test('should return success if already stopped');
  test('should wait for graceful shutdown');
});

describe('POST /api/register', () => {
  test('should register on blockchain and start node');
  test('should validate required parameters');
  test('should return transaction hash and host address');
});

describe('POST /api/unregister', () => {
  test('should stop node and unregister from blockchain');
  test('should return transaction hash');
  test('should cleanup config');
});
```

**Implementation Requirements**:
```typescript
private async handleStart(req, res): Promise<void> {
  // Import startHost from commands/start.ts
  // Call with daemon: true
  // Return PID and status
}

private async handleStop(req, res): Promise<void> {
  // Import stop logic from commands/stop.ts
  // Return success/error
}

private async handleRegister(req, res): Promise<void> {
  // Import register logic from commands/register.ts
  // Validate: walletAddress, publicUrl, models, stake
  // Execute registration
  // Return transaction hash
}

private async handleUnregister(req, res): Promise<void> {
  // Import unregister logic from commands/unregister.ts
  // Stop node first, then unregister
  // Return transaction hash
}
```

**Request/Response Formats**:
```typescript
// POST /api/start
Request: { daemon?: boolean }
Response: { pid: number, status: 'running' }

// POST /api/stop
Request: { force?: boolean }
Response: { success: true }

// POST /api/register
Request: {
  walletAddress: string,
  publicUrl: string,
  models: string[],
  stakeAmount: string,
  metadata?: object
}
Response: {
  transactionHash: string,
  hostAddress: string,
  pid: number
}

// POST /api/unregister
Request: {}
Response: { transactionHash: string }

// POST /api/add-stake (NEW)
Request: { amount: string }  // Amount in FAB tokens
Response: { transactionHash: string, newStake: string }

// POST /api/withdraw-earnings (NEW)
Request: { tokenAddress?: string }  // Defaults to native token
Response: { transactionHash: string, amount: string }

// POST /api/update-models (NEW)
Request: { modelIds: string[] }  // Array of model IDs
Response: { transactionHash: string, models: string[] }

// POST /api/update-metadata (NEW)
Request: {
  metadata: {
    hardware?: { gpu: string, vram: number, ram: number },
    capabilities?: string[],
    location?: string,
    maxConcurrent?: number,
    costPerToken?: number
  }
}
Response: { transactionHash: string }

// GET /api/discover-nodes (NEW)
Request: (none)
Response: {
  nodes: Array<{
    nodeAddress: string,
    apiUrl: string,
    supportedModels: string[],
    isActive: boolean,
    metadata?: object
  }>
}
```

**Dependencies**:
- `src/commands/start.ts` - startHost()
- `src/commands/stop.ts` - stopCommand.action()
- `src/commands/register.ts` - register logic
- `src/commands/unregister.ts` - unregister logic

**Acceptance Criteria**:
- All lifecycle operations work correctly
- Proper error handling and status codes
- Async operations don't block server
- Commands reuse existing CLI logic (no duplication)

---

## Phase 2: WebSocket Log Streaming

### Sub-phase 2.1: WebSocket Server Setup ⬜

**Goal**: Add WebSocket server for real-time log streaming

**Tasks**:
- [ ] Write tests in `packages/host-cli/tests/server/ws.test.ts` (80 lines)
  - [ ] Test: should accept WebSocket connections
  - [ ] Test: should authenticate connections via API key
  - [ ] Test: should reject invalid authentication
  - [ ] Test: should handle client disconnection
  - [ ] Test: should broadcast messages to all connected clients
- [ ] Create `packages/host-cli/src/server/ws.ts` (150 lines)
  - [ ] Define LogWebSocketServer class
  - [ ] Implement constructor with server and apiKey
  - [ ] Implement start() method
  - [ ] Implement stop() method
  - [ ] Implement broadcast() method
  - [ ] Implement handleConnection() private method
  - [ ] Implement handleDisconnection() private method
  - [ ] Add WebSocket authentication logic
  - [ ] Manage clients Set<WebSocket>
- [ ] Verify all tests pass
- [ ] Verify acceptance criteria met

**Test Requirements**:
```typescript
describe('WebSocket Log Server', () => {
  test('should accept WebSocket connections');
  test('should authenticate connections via API key');
  test('should reject invalid authentication');
  test('should handle client disconnection');
  test('should broadcast messages to all connected clients');
});
```

**Implementation Requirements**:
```typescript
// packages/host-cli/src/server/ws.ts
import WebSocket from 'ws';

export class LogWebSocketServer {
  private wss: WebSocket.Server;
  private clients: Set<WebSocket>;

  constructor(server: any, apiKey?: string);
  start(): void;
  stop(): void;

  // Broadcasting
  broadcast(message: any): void;

  // Client management
  private handleConnection(ws: WebSocket): void;
  private handleDisconnection(ws: WebSocket): void;
}
```

**Dependencies**:
- `ws` package (WebSocket library)

**Acceptance Criteria**:
- WebSocket server starts on same port as HTTP
- Clients can connect via `ws://localhost:3001/ws/logs`
- Authentication via query parameter or header
- Clean disconnection handling

---

### Sub-phase 2.2: Log Tailing & Broadcasting ⬜

**Goal**: Tail log files and broadcast updates to connected WebSocket clients

**Tasks**:
- [ ] Write tests in `packages/host-cli/tests/server/ws.test.ts` (+100 lines)
  - [ ] Test: should tail stdout log file
  - [ ] Test: should tail stderr log file
  - [ ] Test: should broadcast new log lines to clients
  - [ ] Test: should handle log file rotation
  - [ ] Test: should stop tailing when all clients disconnect
  - [ ] Test: should send historical logs on connection
- [ ] Update `packages/host-cli/src/server/ws.ts` (+120 lines)
  - [ ] Implement LogTailer class
  - [ ] Implement tailFile() method with fs.watch()
  - [ ] Implement readLastLines() method
  - [ ] Integrate LogTailer into LogWebSocketServer
  - [ ] Send historical logs on connection
  - [ ] Broadcast new log lines in real-time
  - [ ] Start/stop tailing based on client count
  - [ ] Define log message format (type, timestamp, level, message)
- [ ] Verify all tests pass
- [ ] Verify acceptance criteria met

**Test Requirements**:
```typescript
describe('Log Tailing', () => {
  test('should tail stdout log file');
  test('should tail stderr log file');
  test('should broadcast new log lines to clients');
  test('should handle log file rotation');
  test('should stop tailing when all clients disconnect');
  test('should send historical logs on connection');
});
```

**Implementation Requirements**:
```typescript
import * as fs from 'fs';

export class LogTailer {
  private watchers: fs.FSWatcher[];
  private logDir: string;

  constructor(logDir: string, callback: (line: string) => void);

  start(): void;
  stop(): void;

  // Tailing
  private tailFile(filepath: string): void;
  private readLastLines(filepath: string, lines: number): string[];
}

// Integration with WebSocketServer
export class LogWebSocketServer {
  private tailer: LogTailer;

  private handleConnection(ws: WebSocket): void {
    // Send last 50 lines on connection
    // Start tailing if first client
  }

  private onLogLine(line: string): void {
    // Broadcast to all connected clients
  }
}
```

**Message Format**:
```typescript
// Client receives:
{
  type: 'log',
  timestamp: '2025-10-06T07:30:00.000Z',
  level: 'stdout' | 'stderr',
  message: string
}

// Or historical logs:
{
  type: 'history',
  lines: string[]
}
```

**Acceptance Criteria**:
- New log lines broadcast in real-time
- Historical logs sent on connection (last 50 lines)
- File watching stops when no clients connected
- Both stdout and stderr logs are tailed
- Handles log file not existing yet

---

## Phase 3: Serve Command

### Sub-phase 3.1: Serve Command Implementation ⬜

**Goal**: Create `fabstir-host serve` command to start management server

**Tasks**:
- [ ] Write tests in `packages/host-cli/tests/commands/serve.test.ts` (100 lines)
  - [ ] Test: should start server on default port 3001
  - [ ] Test: should start server on custom port via --port flag
  - [ ] Test: should load API key from config or env
  - [ ] Test: should configure CORS origins
  - [ ] Test: should handle port already in use
  - [ ] Test: should gracefully shutdown on SIGTERM/SIGINT
- [ ] Create `packages/host-cli/src/commands/serve.ts` (200 lines)
  - [ ] Implement registerServeCommand() function
  - [ ] Define command options (port, api-key, cors)
  - [ ] Implement startServer() function
  - [ ] Create ManagementServer instance
  - [ ] Create LogWebSocketServer instance
  - [ ] Start both servers
  - [ ] Setup SIGTERM/SIGINT handlers
  - [ ] Keep process alive
  - [ ] Log server URL and status
- [ ] Verify all tests pass
- [ ] Verify acceptance criteria met

**Test Requirements**:
```typescript
describe('serve command', () => {
  test('should start server on default port 3001');
  test('should start server on custom port via --port flag');
  test('should load API key from config or env');
  test('should configure CORS origins');
  test('should handle port already in use');
  test('should gracefully shutdown on SIGTERM/SIGINT');
});
```

**Implementation Requirements**:
```typescript
// packages/host-cli/src/commands/serve.ts
import { Command } from 'commander';
import { ManagementServer } from '../server/api';
import { LogWebSocketServer } from '../server/ws';

export function registerServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Start management API server for browser control')
    .option('-p, --port <number>', 'Server port', '3001')
    .option('--api-key <key>', 'API key for authentication')
    .option('--cors <origins>', 'Comma-separated CORS origins', 'http://localhost:3000')
    .action(async (options) => {
      await startServer(options);
    });
}

async function startServer(options: any): Promise<void> {
  // Load config
  // Create ManagementServer
  // Create LogWebSocketServer
  // Start both
  // Setup signal handlers
  // Keep process alive
}
```

**Acceptance Criteria**:
- Command available via `fabstir-host serve`
- Server starts and stays running
- Graceful shutdown on Ctrl+C
- Logs server URL and status
- Environment variable support for all options

---

### Sub-phase 3.2: Register Serve Command in CLI ⬜

**Goal**: Wire up serve command to main CLI entry point

**Tasks**:
- [ ] Write tests in `packages/host-cli/tests/integration/cli.test.ts` (+30 lines)
  - [ ] Test: should show serve command in help output
  - [ ] Test: should execute serve command
  - [ ] Test: should pass options correctly
- [ ] Update `packages/host-cli/src/index.ts` (+5 lines)
  - [ ] Import registerServeCommand
  - [ ] Call registerServeCommand(program)
- [ ] Verify all tests pass
- [ ] Verify acceptance criteria met

**Test Requirements**:
```typescript
describe('CLI integration', () => {
  test('should show serve command in help output');
  test('should execute serve command');
  test('should pass options correctly');
});
```

**Implementation Requirements**:
```typescript
// packages/host-cli/src/index.ts
import { registerServeCommand } from './commands/serve';

// In main():
registerServeCommand(program);
```

**Acceptance Criteria**:
- `fabstir-host --help` shows serve command
- `fabstir-host serve --help` shows serve options
- Command executes without errors

---

## Phase 4: Browser UI Integration

### Sub-phase 4.1: API Client Module ⬜

**Goal**: Create API client for NodeManagementClient.tsx to call management server

**Tasks**:
- [ ] Write tests in `apps/harness/lib/hostApiClient.test.ts` (160 lines)
  - [ ] Test: should call GET /api/status
  - [ ] Test: should call GET /api/discover-nodes
  - [ ] Test: should call POST /api/start with daemon flag
  - [ ] Test: should call POST /api/stop with force flag
  - [ ] Test: should call POST /api/register with params
  - [ ] Test: should call POST /api/unregister
  - [ ] Test: should call POST /api/add-stake with amount
  - [ ] Test: should call POST /api/withdraw-earnings
  - [ ] Test: should call POST /api/update-models with model IDs
  - [ ] Test: should call POST /api/update-metadata with metadata object
  - [ ] Test: should handle network errors gracefully
  - [ ] Test: should include API key in headers when provided
  - [ ] Test: should retry on transient failures
- [ ] Create `apps/harness/lib/hostApiClient.ts` (280 lines)
  - [ ] Define HostApiConfig interface
  - [ ] Define NodeStatus interface
  - [ ] Define RegisterParams interface
  - [ ] Define DiscoveredNode interface
  - [ ] Implement HostApiClient class constructor
  - [ ] Implement getStatus() method
  - [ ] Implement discoverNodes() method (NEW)
  - [ ] Implement start(daemon?: boolean) method
  - [ ] Implement stop(force?: boolean) method
  - [ ] Implement register(params: RegisterParams) method
  - [ ] Implement unregister() method
  - [ ] Implement addStake(amount: string) method (NEW)
  - [ ] Implement withdrawEarnings(tokenAddress?: string) method (NEW)
  - [ ] Implement updateModels(modelIds: string[]) method (NEW)
  - [ ] Implement updateMetadata(metadata: object) method (NEW)
  - [ ] Add error handling wrapper
  - [ ] Add request retry logic
- [ ] Verify all tests pass
- [ ] Verify acceptance criteria met

**Files to Create**:
- `apps/harness/lib/hostApiClient.ts` (200 lines max)
- `apps/harness/lib/hostApiClient.test.ts` (120 lines)

**Test Requirements**:
```typescript
describe('HostApiClient', () => {
  test('should call GET /api/status');
  test('should call POST /api/start');
  test('should call POST /api/stop');
  test('should call POST /api/register');
  test('should call POST /api/unregister');
  test('should handle network errors');
  test('should include API key in headers');
});
```

**Implementation Requirements**:
```typescript
// apps/harness/lib/hostApiClient.ts
export interface HostApiConfig {
  baseUrl: string;
  apiKey?: string;
}

export interface DiscoveredNode {
  nodeAddress: string;
  apiUrl: string;
  supportedModels: string[];
  isActive: boolean;
  metadata?: object;
}

export class HostApiClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: HostApiConfig);

  // Status & Discovery
  async getStatus(): Promise<NodeStatus>;
  async discoverNodes(): Promise<{ nodes: DiscoveredNode[] }>;

  // Lifecycle
  async start(daemon?: boolean): Promise<{ pid: number }>;
  async stop(force?: boolean): Promise<{ success: boolean }>;

  // Registration
  async register(params: RegisterParams): Promise<RegisterResponse>;
  async unregister(): Promise<{ transactionHash: string }>;

  // Stake Management
  async addStake(amount: string): Promise<{ transactionHash: string, newStake: string }>;
  async withdrawEarnings(tokenAddress?: string): Promise<{ transactionHash: string, amount: string }>;

  // Host Configuration
  async updateModels(modelIds: string[]): Promise<{ transactionHash: string, models: string[] }>;
  async updateMetadata(metadata: object): Promise<{ transactionHash: string }>;
}
```

**Acceptance Criteria**:
- All API methods implemented
- Proper error handling
- TypeScript types match server responses
- Can be mocked for testing

---

### Sub-phase 4.2: WebSocket Log Viewer ⬜

**Goal**: Add WebSocket connection and live log display to UI

**Tasks**:
- [ ] Write tests in `apps/harness/lib/hostWsClient.test.ts` (80 lines)
  - [ ] Test: should connect to WebSocket server
  - [ ] Test: should receive log messages via onLog callback
  - [ ] Test: should receive historical logs on connection
  - [ ] Test: should handle disconnection gracefully
  - [ ] Test: should reconnect on connection loss
  - [ ] Test: should clean up on disconnect
- [ ] Create `apps/harness/lib/hostWsClient.ts` (100 lines)
  - [ ] Define LogMessage interface
  - [ ] Implement HostWsClient class constructor
  - [ ] Implement connect() method
  - [ ] Implement disconnect() method
  - [ ] Implement onLog(callback) method
  - [ ] Implement onHistory(callback) method
  - [ ] Add reconnection logic
  - [ ] Add connection state tracking
- [ ] Update `apps/harness/components/NodeManagementClient.tsx` (+150 lines)
  - [ ] Add wsClient state variable
  - [ ] Add liveLog state variable (string array)
  - [ ] Add useEffect for WebSocket connection lifecycle
  - [ ] Add Live Log Viewer panel component
  - [ ] Add auto-scroll toggle functionality
  - [ ] Add clear logs button
  - [ ] Add log level filter (stdout/stderr)
  - [ ] Style log viewer with monospace font and scrolling
- [ ] Verify all tests pass
- [ ] Verify acceptance criteria met

**Files to Update**:
- `apps/harness/components/NodeManagementClient.tsx` (+150 lines)
- `apps/harness/lib/hostWsClient.ts` (new file, 100 lines)

**Test Requirements**:
```typescript
describe('HostWsClient', () => {
  test('should connect to WebSocket server');
  test('should receive log messages');
  test('should handle disconnection');
  test('should reconnect on connection loss');
});
```

**Implementation Requirements**:
```typescript
// apps/harness/lib/hostWsClient.ts
export class HostWsClient {
  private ws: WebSocket | null;
  private url: string;

  constructor(url: string, apiKey?: string);

  connect(): Promise<void>;
  disconnect(): void;
  onLog(callback: (log: LogMessage) => void): void;
  onHistory(callback: (logs: string[]) => void): void;
}

// In NodeManagementClient.tsx:
const [wsClient, setWsClient] = useState<HostWsClient | null>(null);
const [liveLog, setLiveLog] = useState<string[]>([]);

useEffect(() => {
  // Connect to WebSocket when API connected
  const client = new HostWsClient('ws://localhost:3001/ws/logs');
  client.onLog((log) => setLiveLog(prev => [...prev, log.message]));
  client.connect();
  setWsClient(client);

  return () => client.disconnect();
}, []);
```

**UI Components to Add**:
- Live log viewer panel
- Auto-scroll toggle
- Clear logs button
- Filter by log level (stdout/stderr)

**Acceptance Criteria**:
- WebSocket connects automatically
- Logs appear in real-time
- Historical logs loaded on connection
- Clean disconnection on unmount

---

### Sub-phase 4.3: Lifecycle Control Buttons ⬜

**Goal**: Add Start/Stop Node buttons with status display

**Tasks**:
- [ ] Update `apps/harness/components/NodeManagementClient.tsx` (+100 lines)
  - [ ] Add nodeStatus state variable ('running' | 'stopped')
  - [ ] Add nodePid state variable (number | null)
  - [ ] Add nodeUptime state variable (number)
  - [ ] Implement handleStart() function
  - [ ] Implement handleStop() function
  - [ ] Implement refreshStatus() function
  - [ ] Add Node Status panel component
  - [ ] Add Start Node button with loading state
  - [ ] Add Stop Node button with loading state
  - [ ] Add Refresh Status button
  - [ ] Add status polling (every 10 seconds)
  - [ ] Add uptime display formatter
  - [ ] Enable/disable buttons based on node status
  - [ ] Add visual status indicator (● running/stopped)
- [ ] Manual UI testing checklist (see Test Requirements section)
- [ ] Verify acceptance criteria met

**Files to Update**:
- `apps/harness/components/NodeManagementClient.tsx` (+100 lines)

**Test Requirements** (manual UI testing):
- Start button works when node stopped
- Stop button works when node running
- Status updates after operations
- Error messages display clearly
- Loading states prevent double-clicks

**Implementation Requirements**:
```typescript
// In NodeManagementClient.tsx:
const [nodeStatus, setNodeStatus] = useState<'running' | 'stopped'>('stopped');
const [nodePid, setNodePid] = useState<number | null>(null);
const [nodeUptime, setNodeUptime] = useState<number>(0);

const handleStart = async () => {
  setLoading(true);
  try {
    const result = await apiClient.start(true); // daemon mode
    setNodePid(result.pid);
    await refreshStatus();
    addLog(`✅ Node started (PID: ${result.pid})`);
  } catch (error) {
    addLog(`❌ Start failed: ${error.message}`);
  } finally {
    setLoading(false);
  }
};

const handleStop = async () => {
  setLoading(true);
  try {
    await apiClient.stop();
    setNodePid(null);
    await refreshStatus();
    addLog('✅ Node stopped');
  } catch (error) {
    addLog(`❌ Stop failed: ${error.message}`);
  } finally {
    setLoading(false);
  }
};
```

**UI Layout**:
```
┌─ Node Status ─────────────────┐
│ Status: ● Running             │
│ PID: 256                      │
│ Uptime: 5m 32s                │
│ URL: http://localhost:8083    │
└───────────────────────────────┘

[Start Node] [Stop Node] [Refresh Status]

┌─ Live Logs ───────────────────┐
│ [07:30:15] Model loaded       │
│ [07:30:16] P2P started        │
│ [07:30:17] API started        │
│ [Auto-scroll ☑] [Clear]       │
└───────────────────────────────┘
```

**Acceptance Criteria**:
- Buttons enable/disable based on node status
- Status updates in real-time
- Uptime displays and updates
- Clear visual feedback for all operations

---

## Phase 5: Docker Integration

### Sub-phase 5.1: Docker Configuration ⬜

**Goal**: Update Docker setup to expose management server port

**Tasks**:
- [ ] Update `packages/host-cli/Dockerfile` (+2 lines)
  - [ ] Add EXPOSE 3001 directive for management API port
  - [ ] Verify build still works with new port
- [ ] Update `start-fabstir-docker.sh` (+1 line)
  - [ ] Add port mapping: -p 3001:3001
  - [ ] Test container starts with new port mapping
- [ ] Update `packages/host-cli/docs/DOCKER_DEPLOYMENT.md` (+50 lines)
  - [ ] Add "Browser-Based Management" section
  - [ ] Document fabstir-host serve command usage
  - [ ] Document how to access UI at http://localhost:3000
  - [ ] Explain port 3001 mapping and purpose
  - [ ] Add example workflow with serve command
  - [ ] Update port mapping table with 3001 entry
- [ ] Verify Docker rebuild works
- [ ] Verify acceptance criteria met

**Files to Update**:
- `packages/host-cli/Dockerfile` (+2 lines)
- `start-fabstir-docker.sh` (+1 line)
- `packages/host-cli/docs/DOCKER_DEPLOYMENT.md` (+50 lines)

**Changes Required**:
```dockerfile
# packages/host-cli/Dockerfile
EXPOSE 8080 9000 3001
```

```bash
# start-fabstir-docker.sh
docker run -d \
  --name fabstir-host-test \
  --gpus all \
  -p 8083:8080 \
  -p 9000:9000 \
  -p 3001:3001 \  # Add this line
  ...
```

**Documentation Updates**:
- Add section: "Browser-Based Management"
- Document `fabstir-host serve` command
- Show how to access UI at `http://localhost:3000`
- Explain port 3001 mapping

**Acceptance Criteria**:
- Port 3001 accessible from host machine
- Documentation clear and complete
- Example workflow provided

---

### Sub-phase 5.2: Startup Scripts ⬜

**Goal**: Create convenient startup script for management server

**Tasks**:
- [ ] Create `start-management-server.sh` (30 lines)
  - [ ] Add shebang and script header
  - [ ] Add container running check
  - [ ] Add error handling for missing container
  - [ ] Implement management server start via docker exec
  - [ ] Add sleep delay for server startup
  - [ ] Add health check verification (curl http://localhost:3001/health)
  - [ ] Add success/failure messages
  - [ ] Add instructions for accessing UI
  - [ ] Make script executable (chmod +x)
- [ ] Test script with container running
- [ ] Test script with container stopped (should error gracefully)
- [ ] Verify acceptance criteria met

**Files to Create**:
- `start-management-server.sh` (new file, 30 lines)

**Script Contents**:
```bash
#!/bin/bash
# Start management server inside Docker container

# Check if container is running
if ! docker ps | grep -q fabstir-host-test; then
  echo "Error: Container fabstir-host-test not running"
  echo "Run ./start-fabstir-docker.sh first"
  exit 1
fi

# Start management server
echo "Starting management server on port 3001..."
docker exec -d fabstir-host-test sh -c 'cd /app && node --require /app/polyfills.js dist/index.js serve --port 3001'

sleep 2

# Check if server is running
if curl -s http://localhost:3001/health > /dev/null; then
  echo "✅ Management server started"
  echo "Access UI at: http://localhost:3000/node-management-enhanced"
else
  echo "❌ Management server failed to start"
  echo "Check logs: docker exec fabstir-host-test cat /var/log/management.log"
  exit 1
fi
```

**Acceptance Criteria**:
- Script checks prerequisites
- Starts server in background
- Verifies server is running
- Provides clear feedback

---

## Phase 6: Testing & Documentation

### Sub-phase 6.1: Integration Testing ⬜

**Goal**: End-to-end testing of complete browser workflow

**Tasks**:
- [ ] Create `packages/host-cli/tests/integration/management-api.test.ts` (200 lines)
  - [ ] Setup: Start management server, ensure node stopped
  - [ ] Test: Full lifecycle (register → start → stop → unregister)
  - [ ] Test: WebSocket log streaming receives messages
  - [ ] Test: Concurrent operations handling
  - [ ] Test: API authentication with valid/invalid keys
  - [ ] Test: CORS headers present for allowed origins
  - [ ] Test: Error handling for invalid requests
  - [ ] Test: Server graceful shutdown
  - [ ] Teardown: Stop server, clean up resources
- [ ] Run integration tests against Docker container
- [ ] Verify all tests pass reliably
- [ ] Verify tests clean up after themselves
- [ ] Verify acceptance criteria met

**Files to Create**:
- `packages/host-cli/tests/integration/management-api.test.ts` (200 lines)

**Test Requirements**:
```typescript
describe('Management API Integration', () => {
  // Setup: Start server, ensure node stopped

  test('Full lifecycle: register → start → stop → unregister', async () => {
    // 1. Register via API
    const regResult = await apiClient.register({...});
    expect(regResult.transactionHash).toBeTruthy();

    // 2. Check status - should be running
    const status1 = await apiClient.getStatus();
    expect(status1.status).toBe('running');

    // 3. Stop node
    await apiClient.stop();
    const status2 = await apiClient.getStatus();
    expect(status2.status).toBe('stopped');

    // 4. Start node again
    await apiClient.start(true);
    const status3 = await apiClient.getStatus();
    expect(status3.status).toBe('running');

    // 5. Unregister
    const unregResult = await apiClient.unregister();
    expect(unregResult.transactionHash).toBeTruthy();
  });

  test('WebSocket log streaming', async () => {
    const logs: string[] = [];
    wsClient.onLog((log) => logs.push(log.message));
    await wsClient.connect();

    // Start node - should see logs
    await apiClient.start(true);
    await sleep(5000);

    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some(l => l.includes('Model loaded'))).toBe(true);
  });

  test('Concurrent operations handling', async () => {
    // Test that multiple clients can connect
    // Test that operations are queued/locked
  });
});
```

**Acceptance Criteria**:
- All integration tests pass
- Tests run against real Docker container
- Tests clean up after themselves
- Tests are deterministic (no flaky tests)

---

### Sub-phase 6.2: Documentation & User Guide ⬜

**Goal**: Complete documentation for browser-based management

**Tasks**:
- [ ] Update `packages/host-cli/README.md` (+80 lines)
  - [ ] Add "Browser-Based Management" section
  - [ ] Link to BROWSER_MANAGEMENT.md
  - [ ] Link to API_REFERENCE.md
  - [ ] Add quick start example with serve command
  - [ ] Update command list with serve command
- [ ] Create `packages/host-cli/docs/BROWSER_MANAGEMENT.md` (300 lines)
  - [ ] Write Overview section
  - [ ] Write Quick Start section (4-step workflow)
  - [ ] Write Features section with feature list
  - [ ] Add Architecture diagram/explanation
  - [ ] Write Security section (API keys, CORS, localhost)
  - [ ] Write Troubleshooting section with common issues
  - [ ] Add screenshots or ASCII art of UI layout
  - [ ] Add example workflow walkthrough
- [ ] Create `packages/host-cli/docs/API_REFERENCE.md` (250 lines)
  - [ ] Document GET /health endpoint
  - [ ] Document GET /api/status endpoint
  - [ ] Document POST /api/start endpoint
  - [ ] Document POST /api/stop endpoint
  - [ ] Document POST /api/register endpoint
  - [ ] Document POST /api/unregister endpoint
  - [ ] Document WS /ws/logs endpoint
  - [ ] Add Authentication section
  - [ ] Add Rate Limiting section (if implemented)
  - [ ] Add example curl commands for each endpoint
- [ ] Review all documentation for clarity and completeness
- [ ] Verify acceptance criteria met

**Files to Update/Create**:
- `packages/host-cli/README.md` (+80 lines)
- `packages/host-cli/docs/BROWSER_MANAGEMENT.md` (new file, 300 lines)
- `packages/host-cli/docs/API_REFERENCE.md` (new file, 250 lines)

**BROWSER_MANAGEMENT.md Contents**:
```markdown
# Browser-Based Node Management

## Overview
Manage your Fabstir host node through a web interface...

## Quick Start
1. Start Docker container
2. Start management server: `./start-management-server.sh`
3. Open browser: http://localhost:3000/node-management-enhanced
4. Use UI to register, start, stop node

## Features
- Real-time log streaming
- One-click start/stop
- Registration management
- Status monitoring

## Architecture
[Diagram showing browser → API → CLI → Node]

## Security
- API key authentication
- CORS restrictions
- Localhost-only by default

## Troubleshooting
...
```

**API_REFERENCE.md Contents**:
```markdown
# Management API Reference

## REST Endpoints

### GET /health
Returns server health status...

### GET /api/status
Returns node status...

### POST /api/start
Starts the node...

### POST /api/stop
Stops the node...

### POST /api/register
Registers node on blockchain...

### POST /api/unregister
Unregisters node from blockchain...

## WebSocket

### WS /ws/logs
Real-time log streaming...

## Authentication
...

## Rate Limiting
...
```

**Acceptance Criteria**:
- All features documented
- API reference complete
- Quick start guide works
- Troubleshooting section helpful
- Screenshots/examples included

---

## Quick Start (After Implementation)

Once this feature is complete, the workflow will be:

```bash
# 1. Start Docker container (as usual)
bash start-fabstir-docker.sh

# 2. Start management server
bash start-management-server.sh
# Output: ✅ Management server started at http://localhost:3001

# 3. Open browser
# Navigate to: http://localhost:3000/node-management-enhanced

# 4. Use browser UI to:
#    - Register host on blockchain
#    - Start inference node
#    - View real-time logs
#    - Stop node
#    - Unregister host
```

**Total time**: Same as CLI workflow, but with visual feedback.

## Testing Strategy

### Test Pyramid

```
     E2E Tests (Phase 6)
     ├── Browser UI workflow
     └── Full lifecycle tests
          ↑
    Integration Tests (All Phases)
    ├── API endpoints with real node
    ├── WebSocket log streaming
    └── CLI command reuse
          ↑
    Unit Tests (Each Sub-phase)
    ├── Server start/stop
    ├── Route handlers
    ├── WebSocket connections
    └── Log tailing logic
```

### Test Coverage Targets

- **Unit Tests**: 80%+ coverage for new code
- **Integration Tests**: All API endpoints, WebSocket, lifecycle operations
- **E2E Tests**: Complete user workflow (register → start → stop → unregister)

### Test Execution

```bash
# Run all tests
cd packages/host-cli && pnpm test

# Run specific test file
pnpm test tests/server/api.test.ts

# Run with coverage
pnpm test --coverage

# Integration tests (requires Docker)
pnpm test:integration
```

## Dependencies

### New npm Packages Required

**Install before starting Phase 1**:

```bash
cd packages/host-cli

# Add dependencies
pnpm add express cors ws

# Add dev dependencies
pnpm add -D @types/express @types/cors @types/ws
```

**Package Versions**:
```json
{
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "ws": "^8.14.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/cors": "^2.8.0",
    "@types/ws": "^8.5.0"
  }
}
```

**Total Size**: ~2.5MB (dependencies), ~50KB (types)

### Existing Dependencies (Reused)

- `commander` - CLI framework (already present)
- `chalk` - Terminal colors (already present)
- `fs` / `fs/promises` - File system operations (Node.js built-in)
- `child_process` - Process spawning (Node.js built-in)

## Success Criteria

✅ Management server starts and stays running
✅ All REST endpoints functional
✅ WebSocket log streaming works
✅ Browser UI can control full node lifecycle
✅ Works inside Docker container
✅ Integration tests pass
✅ Documentation complete
✅ Security considerations addressed

## Timeline Estimate

### Detailed Breakdown

| Phase | Sub-phases | Dev Time | Testing Time | Total |
|-------|------------|----------|--------------|-------|
| **Phase 1**: API Server Core | 3 | 3-4 hours | 1-1.5 hours | 4-5.5 hours |
| **Phase 2**: WebSocket Streaming | 2 | 1.5-2 hours | 0.5-1 hour | 2-3 hours |
| **Phase 3**: Serve Command | 2 | 0.5-1 hour | 0.5-1 hour | 1-2 hours |
| **Phase 4**: Browser UI | 3 | 2.5-3.5 hours | 1 hour | 3.5-4.5 hours |
| **Phase 5**: Docker Integration | 2 | 0.5 hour | 0.5 hour | 1 hour |
| **Phase 6**: Testing & Docs | 2 | 1.5-2 hours | 1-1.5 hours | 2.5-3.5 hours |
| **Contingency** | - | - | - | 2-3 hours |

**Total: 16-22 hours** (2-3 days of focused work)

**Note**: Original estimate was 14-20 hours. Added +2 hours for 5 additional endpoints discovered in existing UI (addStake, withdrawEarnings, updateModels, updateMetadata, discoverNodes).

### Timeline Assumptions

- Developer familiar with Express, WebSockets, React
- TDD approach (write tests first)
- Access to working Docker environment for integration testing
- No major blockers or dependency issues
- Existing CLI commands work correctly

### Milestones

- **Day 1 PM**: Phase 1-2 complete (API + WebSocket functional)
- **Day 2 AM**: Phase 3-4 complete (Serve command + Browser UI working)
- **Day 2 PM**: Phase 5-6 complete (Docker deployed, docs written, all tests passing)

## Known Limitations

### Current Implementation

- **Single Node Only**: Cannot manage multiple nodes simultaneously
- **Localhost Only**: No remote access (by design for security)
- **No Authentication**: API key is optional and basic
- **No SSL/TLS**: HTTP only (sufficient for localhost)
- **Log Storage**: Logs not persisted beyond current session
- **No Metrics**: No performance metrics or charts
- **File Size**: Log streaming may slow down with very large log files (>100MB)

### Technical Debt

Items to address in future iterations:

1. **Error Recovery**: API server doesn't auto-restart on crash
2. **Rate Limiting**: No protection against request flooding
3. **Log Rotation**: Large log files may cause memory issues
4. **WebSocket Reconnection**: Client must manually reconnect on network issues
5. **Process Monitoring**: No health checks for management server itself
6. **CSRF Protection**: Not implemented (acceptable for localhost)

## Post-Implementation Updates

After completing this implementation, update these files:

### Documentation Updates

- [ ] `packages/host-cli/README.md` - Add serve command to command list
- [ ] `packages/host-cli/docs/GETTING_STARTED.md` - Add browser management option
- [ ] `packages/host-cli/docs/DOCKER_DEPLOYMENT.md` - Document port 3001 and serve command
- [ ] `apps/harness/README.md` - Update with node management feature

### Test Coverage

- [ ] Ensure `pnpm test` passes with new tests
- [ ] Update CI/CD pipeline if needed
- [ ] Add integration test to automated test suite

### Docker Image

- [ ] Tag new image version with browser management support
- [ ] Update Docker Hub description
- [ ] Test image on clean machine

## Future Enhancements (Out of Scope)

- Multi-node management (manage multiple containers)
- Historical metrics/charts
- Automated model downloads via UI
- Remote management (non-localhost)
- Authentication beyond API keys (OAuth, JWT)
- Web-based log search/filtering
- Performance monitoring dashboard
- Model selection and swapping via UI
- Earnings dashboard with charts
- WebRTC for direct peer connections

## Frequently Asked Questions

### Q: Why not use the existing CLI commands directly?

**A**: The management API **does** reuse existing CLI commands. It wraps them in HTTP/WebSocket endpoints for browser access. No duplicate logic.

### Q: Is this secure for production deployment?

**A**: No. This is designed for **localhost development only**. For production, use CLI commands via SSH or scheduled scripts.

### Q: Will this slow down my inference node?

**A**: No. The management server runs as a separate process and has minimal resource usage (~50MB RAM, negligible CPU when idle).

### Q: Can I manage multiple nodes with this?

**A**: Not in v1.0. This implementation manages a single node. Multi-node support is a future enhancement.

### Q: What if port 3001 is already in use?

**A**: Use `--port` flag: `fabstir-host serve --port 3002`. Update `start-management-server.sh` accordingly.

### Q: Do I need to rebuild the Docker image?

**A**: Yes. After implementing Phase 1-3, rebuild with `docker build --no-cache -f packages/host-cli/Dockerfile -t fabstir-host-cli:local .`

### Q: Can I use this without Docker?

**A**: Yes, but you'll need to run `fabstir-host serve` directly on your host machine (not inside container).

### Q: What happens if the management server crashes?

**A**: The inference node continues running independently. Restart the management server with `start-management-server.sh`.

### Q: Can I use this from a different machine?

**A**: Not recommended. This is localhost-only for security. For remote access, use SSH tunneling: `ssh -L 3001:localhost:3001 user@remote-server`

### Q: Does this work with GETTING_STARTED.md workflow?

**A**: Yes. Follow GETTING_STARTED.md for initial setup, then use `start-management-server.sh` instead of CLI commands for lifecycle management.

---

## Missing Features Added (vs. Initial Plan)

After reviewing the existing `node-management-enhanced.tsx` UI component, the following features were **added** to the implementation plan:

### Phase 1.3 Additional Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/add-stake` | POST | Add more FAB tokens to existing stake | ✅ Added |
| `/api/withdraw-earnings` | POST | Withdraw accumulated host earnings | ✅ Added |
| `/api/update-models` | POST | Update list of supported models | ✅ Added |
| `/api/update-metadata` | POST | Update host metadata (hardware/pricing) | ✅ Added |
| `/api/discover-nodes` | GET | Discover all active hosts on network | ✅ Added |

These features are **already present in the browser UI** and needed API backend support.

### Phase 4.1 Additional API Client Methods

The `HostApiClient` class was expanded from 5 methods to **10 methods** to match all existing UI features:

```typescript
// Original 5 methods
getStatus()
start()
stop()
register()
unregister()

// NEW: 5 additional methods
addStake()              // Stake management
withdrawEarnings()      // Earnings management
updateModels()          // Model configuration
updateMetadata()        // Host metadata updates
discoverNodes()         // Network discovery
```

### Impact on Timeline

- **Phase 1**: +1 hour (5 new endpoints + tests)
- **Phase 4**: +0.5 hours (5 new client methods)
- **Phase 6**: +0.5 hours (documentation updates)

**New Total**: 16-22 hours (was 14-20 hours)

### Why These Features Matter

1. **addStake**: Allows hosts to increase their stake without unregistering/re-registering
2. **withdrawEarnings**: Critical for hosts to access their earnings
3. **updateModels**: Enables hosts to add new models as they're approved
4. **updateMetadata**: Allows updating pricing and hardware specs without downtime
5. **discoverNodes**: Essential for testing and debugging network connectivity

All these features are already used in production by the existing UI component and would have been **breaking omissions** if not included in the API backend.

---

**Document Version**: v1.1 (Updated with missing features)
**Last Updated**: January 2025
**Status**: 🟡 Plan Complete, Implementation Not Started
**Maintainer**: Fabstir Development Team
