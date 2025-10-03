# Host CLI Production-Ready Implementation Plan (v1.0)

## Overview

Systematic upgrade of the Fabstir Host CLI (`@fabstir/host-cli`) to provide turnkey host node management for real-world deployment. Integrates fabstir-llm-node process lifecycle with blockchain registration, enabling hosts with public IP addresses to become marketplace providers with a single command.

## Current System Context

**What Exists:**
-  ProcessManager (`src/process/manager.ts`) - Can spawn fabstir-llm-node binary
-  DaemonManager (`src/daemon/manager.ts`) - Background process management
-  Registration logic (`src/registration/manager.ts`) - Blockchain registration
-  Config storage (`src/config/storage.ts`) - Persistent configuration
-  Stop command (`src/commands/stop.ts`) - Process termination
-  SDK integration (`src/sdk/client.ts`) - FabstirSDKCore wrapper

**What's Missing:**
- L Node startup in `register` command - Only does blockchain tx, doesn't start server
- L Node startup in `start` command - Has TODO placeholder
- L Public URL verification - No check if host is accessible from internet
- L Network diagnostics - No help when firewall blocks traffic
- L Process PID tracking - Can't reliably stop/restart nodes
- L Production deployment warnings - No distinction between localhost and public IPs

**Critical Gap:**
Running `fabstir-host register` creates a blockchain entry but doesn't start the inference server, resulting in non-functional hosts. Real-world hosts need public IP/domain addresses and must bind to `0.0.0.0` to accept connections from clients worldwide.

## Key Principles

1. **Test-Driven Development (TDD)**: Write tests FIRST, then implementation
2. **Bounded Autonomy**: Each sub-phase has strict boundaries and line limits
3. **Incremental Progress**: Build on existing infrastructure without breaking it
4. **Real-World Deployment**: Optimize for public IP hosts, not localhost
5. **No Mocks**: Use real fabstir-llm-node binary for testing
6. **Clear Error Messages**: Guide users through network/firewall issues
7. **Pre-MVP Freedom**: No backward compatibility needed, can break freely

## Development Constraints

- **Max Lines Per File**: Specified for each sub-phase (typically 50-200 lines)
- **Test First**: Tests must be written before implementation
- **Single Responsibility**: Each sub-phase does ONE thing
- **No Side Effects**: Don't modify files outside sub-phase scope
- **Clear Boundaries**: Each sub-phase is independently verifiable
- **Real Binary Required**: Integration tests need fabstir-llm-node installed
- **Network Tests**: Use actual HTTP requests, no mocking

## Phase 1: Network Utilities & Validation

### Sub-phase 1.1: Public Endpoint Verification
**Goal**: Create utilities to verify a host URL is accessible from the internet

**Tasks**:
- [ ] Write tests in `tests/utils/network.test.ts` (150 lines)
- [ ] Create `packages/host-cli/src/utils/network.ts` (120 lines max)
- [ ] Implement verifyPublicEndpoint(url) - Tests /health from outside
- [ ] Implement isLocalhostUrl(url) - Detects localhost/127.0.0.1
- [ ] Implement warnIfLocalhost(url) - Shows production warning
- [ ] Implement extractHostPort(url) - Parses URL to host:port

**Test Requirements**:
```typescript
// Tests must verify:
- verifyPublicEndpoint('http://203.0.113.45:8080') returns true if accessible
- verifyPublicEndpoint('http://invalid-host:8080') returns false
- isLocalhostUrl('http://localhost:8080') returns true
- isLocalhostUrl('http://127.0.0.1:8080') returns true
- isLocalhostUrl('http://203.0.113.45:8080') returns false
- extractHostPort('http://example.com:8080') returns { host: 'example.com', port: 8080 }
- warnIfLocalhost shows yellow warning for localhost URLs
```

**Utility Structure**:
```typescript
/**
 * Verify a public URL is accessible via HTTP health check
 */
export async function verifyPublicEndpoint(url: string, timeout?: number): Promise<boolean> {
  // Try to fetch ${url}/health with timeout
  // Return true if 200 OK, false otherwise
}

/**
 * Check if URL points to localhost
 */
export function isLocalhostUrl(url: string): boolean {
  const hostname = new URL(url).hostname;
  return ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname);
}

/**
 * Show warning if URL is localhost
 */
export function warnIfLocalhost(url: string): void {
  if (isLocalhostUrl(url)) {
    console.warn(chalk.yellow('   WARNING: Using localhost URL'));
    console.warn(chalk.yellow('   This host will NOT be accessible to clients.'));
    console.warn(chalk.yellow('   Use your public IP or domain for production.'));
  }
}

/**
 * Extract host and port from URL
 */
export function extractHostPort(url: string): { host: string; port: number } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port) || 8080
  };
}
```

### Sub-phase 1.2: Network Diagnostics
**Goal**: Create troubleshooting helpers for network/firewall issues

**Tasks**:
- [ ] Write tests in `tests/utils/diagnostics.test.ts` (100 lines)
- [ ] Create `packages/host-cli/src/utils/diagnostics.ts` (150 lines max)
- [ ] Implement showNetworkTroubleshooting(url) - Display help steps
- [ ] Implement checkLocalHealth(port) - Test localhost access
- [ ] Implement suggestFirewallCommands(port, os) - Show firewall rules
- [ ] Implement formatHealthCheckError(error) - Explain common errors

**Test Requirements**:
```typescript
// Tests must verify:
- showNetworkTroubleshooting displays curl commands
- checkLocalHealth(8080) returns true if localhost:8080 responds
- suggestFirewallCommands(8080, 'linux') includes ufw/iptables
- suggestFirewallCommands(8080, 'windows') includes Windows Firewall
- formatHealthCheckError(ECONNREFUSED) explains likely causes
```

**Diagnostic Structure**:
```typescript
/**
 * Show network troubleshooting steps
 */
export function showNetworkTroubleshooting(url: string): void {
  const { port } = extractHostPort(url);

  console.log(chalk.yellow('\n=' Troubleshooting Steps:\n'));
  console.log(chalk.gray('1. Check if node is running locally:'));
  console.log(chalk.white(`   curl http://localhost:${port}/health\n`));

  console.log(chalk.gray('2. Check firewall allows incoming connections:'));
  console.log(chalk.white(`   ${suggestFirewallCommands(port, process.platform)}\n`));

  console.log(chalk.gray('3. Verify port is listening on all interfaces:'));
  console.log(chalk.white(`   netstat -tuln | grep ${port}\n`));

  console.log(chalk.gray('4. Test from another machine:'));
  console.log(chalk.white(`   curl ${url}/health\n`));
}

/**
 * Test if localhost endpoint is healthy
 */
export async function checkLocalHealth(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Suggest firewall commands for platform
 */
export function suggestFirewallCommands(port: number, platform: string): string {
  switch (platform) {
    case 'linux':
      return `sudo ufw allow ${port}/tcp\n   sudo iptables -A INPUT -p tcp --dport ${port} -j ACCEPT`;
    case 'darwin':
      return `sudo pfctl -d  # Disable firewall temporarily to test`;
    case 'win32':
      return `netsh advfirewall firewall add rule name="Fabstir Host" dir=in action=allow protocol=TCP localport=${port}`;
    default:
      return 'Check your firewall documentation';
  }
}
```

## Phase 2: Process Manager Enhancement

### Sub-phase 2.1: Update ProcessManager for Production
**Goal**: Modify ProcessManager to bind to 0.0.0.0 and track public URLs

**Tasks**:
- [ ] Write tests in `tests/process/manager-production.test.ts` (200 lines)
- [ ] Update `packages/host-cli/src/process/manager.ts` (add 80 lines max)
- [ ] Change default host from '127.0.0.1' to '0.0.0.0'
- [ ] Add publicUrl field to ProcessConfig
- [ ] Add verifyPublicAccess() method using network utils
- [ ] Add getNodeInfo() to retrieve running node details

**Test Requirements**:
```typescript
// Tests must verify:
- Default ProcessConfig has host = '0.0.0.0'
- spawn() starts node binding to all interfaces
- verifyPublicAccess() calls verifyPublicEndpoint()
- getNodeInfo() returns { pid, port, uptime, status }
- Health check waits for public URL if provided
```

**ProcessManager Updates**:
```typescript
export interface ProcessConfig {
  port: number;
  host: string;              // Change default to '0.0.0.0'
  publicUrl?: string;        // NEW: Public URL for verification
  models: string[];
  maxConnections?: number;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  gpuEnabled?: boolean;
  memoryLimit?: string;
  env?: Record<string, string>;
  workingDir?: string;
  maxLogLines?: number;
}

export class ProcessManager extends EventEmitter {
  // ... existing methods ...

  /**
   * Verify public URL is accessible (NEW)
   */
  async verifyPublicAccess(handle: ProcessHandle): Promise<boolean> {
    if (!handle.config.publicUrl) {
      return true; // No public URL to verify
    }
    return await verifyPublicEndpoint(handle.config.publicUrl);
  }

  /**
   * Get running node information (NEW)
   */
  getNodeInfo(handle: ProcessHandle): {
    pid: number;
    port: number;
    publicUrl?: string;
    uptime: number;
    status: string;
  } {
    const startTime = handle.startTime.getTime();
    return {
      pid: handle.pid,
      port: handle.config.port,
      publicUrl: handle.config.publicUrl,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      status: handle.status
    };
  }
}

// Update default config
export function getDefaultProcessConfig(): ProcessConfig {
  return {
    port: 8080,
    host: '0.0.0.0',  // CHANGED from '127.0.0.1'
    models: [],
    maxConnections: 10,
    logLevel: 'info'
  };
}
```

### Sub-phase 2.2: Health Check Enhancement
**Goal**: Improve health check to support both local and public URLs

**Tasks**:
- [ ] Write tests in `tests/process/health-check.test.ts` (120 lines)
- [ ] Update `packages/host-cli/src/process/manager.ts` (modify waitForReady method)
- [ ] Check localhost first for faster startup
- [ ] Then verify publicUrl if provided
- [ ] Show progress during health check wait
- [ ] Fail with diagnostics if unreachable

**Test Requirements**:
```typescript
// Tests must verify:
- waitForReady checks localhost:port first
- waitForReady then checks publicUrl if provided
- Shows "Waiting for node..." during check
- Times out after 30 seconds with error
- Error includes diagnostic suggestions
```

**Health Check Implementation**:
```typescript
private async waitForReady(handle: ProcessHandle): Promise<void> {
  const maxAttempts = 30;
  const delay = 1000;
  const { port, publicUrl } = handle.config;

  // Phase 1: Wait for localhost
  console.log(chalk.gray('  Waiting for node to start...'));
  for (let i = 0; i < maxAttempts; i++) {
    if (await checkLocalHealth(port)) {
      console.log(chalk.green('   Node started on localhost'));
      break;
    }
    await new Promise(resolve => setTimeout(resolve, delay));
    if (i === maxAttempts - 1) {
      throw new Error('Node failed to start on localhost');
    }
  }

  // Phase 2: Verify public URL if provided
  if (publicUrl) {
    console.log(chalk.gray(`  Verifying public access at ${publicUrl}...`));
    const isAccessible = await verifyPublicEndpoint(publicUrl);

    if (!isAccessible) {
      showNetworkTroubleshooting(publicUrl);
      throw new Error(`Node not accessible at public URL: ${publicUrl}`);
    }

    console.log(chalk.green('   Public URL is accessible'));
  }
}
```

## Phase 3: Configuration Management

### Sub-phase 3.1: Add Process Tracking to Config
**Goal**: Extend ConfigData to track running process PID and URL

**Tasks**:
- [ ] Write tests in `tests/config/config-types.test.ts` (80 lines)
- [ ] Update `packages/host-cli/src/config/types.ts` (add 20 lines max)
- [ ] Add processPid?: number field
- [ ] Add nodeStartTime?: string field
- [ ] Add publicUrl: string field (required)
- [ ] Update saveConfig/loadConfig to handle new fields

**Test Requirements**:
```typescript
// Tests must verify:
- ConfigData includes processPid field
- ConfigData includes nodeStartTime ISO string
- ConfigData includes publicUrl (required)
- saveConfig persists all new fields
- loadConfig reads all new fields
```

**Config Type Updates**:
```typescript
export interface ConfigData {
  version: string;
  network: string;              // 'base-sepolia'
  walletAddress: string;
  privateKey: string;

  // Node configuration
  publicUrl: string;            // REQUIRED: http://203.0.113.45:8080
  models: string[];

  // Process tracking (NEW)
  processPid?: number;          // PID of running fabstir-llm-node
  nodeStartTime?: string;       // ISO timestamp when node started

  // Blockchain state
  stakeAmount: string;
  isRegistered?: boolean;
  registrationTxHash?: string;

  // Pricing
  pricePerToken: number;
  minSessionDeposit: number;
}
```

### Sub-phase 3.2: PID File Management
**Goal**: Robust PID tracking for process lifecycle

**Tasks**:
- [ ] Write tests in `tests/daemon/pid-manager.test.ts` (100 lines)
- [ ] Update `packages/host-cli/src/daemon/pid.ts` (add 50 lines max)
- [ ] Add savePIDWithUrl(pid, url) method
- [ ] Add getPIDInfo() to return { pid, url, startTime }
- [ ] Add cleanupStalePID() to remove invalid PIDs
- [ ] Validate PID on load (check if process still running)

**Test Requirements**:
```typescript
// Tests must verify:
- savePIDWithUrl creates PID file with metadata
- getPIDInfo returns correct data
- cleanupStalePID removes file if process not running
- PIDManager detects stale PIDs correctly
```

**PID Manager Enhancement**:
```typescript
export interface PIDInfo {
  pid: number;
  publicUrl: string;
  startTime: string;
}

export class PIDManager {
  // ... existing methods ...

  /**
   * Save PID with metadata (NEW)
   */
  savePIDWithUrl(pid: number, publicUrl: string): void {
    const info: PIDInfo = {
      pid,
      publicUrl,
      startTime: new Date().toISOString()
    };
    fs.writeFileSync(this.pidFilePath, JSON.stringify(info, null, 2));
  }

  /**
   * Get PID info with validation (NEW)
   */
  getPIDInfo(): PIDInfo | null {
    try {
      const content = fs.readFileSync(this.pidFilePath, 'utf8');
      const info: PIDInfo = JSON.parse(content);

      // Validate process is still running
      if (!this.isProcessRunning(info.pid)) {
        return null; // Stale PID
      }

      return info;
    } catch {
      return null;
    }
  }

  /**
   * Remove stale PID files (NEW)
   */
  cleanupStalePID(): boolean {
    const info = this.getPIDInfo();
    if (!info) {
      this.removePID();
      return true;
    }
    return false;
  }
}
```

## Phase 4: Register Command Enhancement

### Sub-phase 4.1: Pre-Registration Node Startup
**Goal**: Start fabstir-llm-node BEFORE blockchain registration

**Tasks**:
- [ ] Write tests in `tests/commands/register-integration.test.ts` (250 lines)
- [ ] Update `packages/host-cli/src/commands/register.ts` (add 150 lines max)
- [ ] Add startNodeBeforeRegistration() helper
- [ ] Warn if URL is localhost
- [ ] Start node with ProcessManager
- [ ] Verify public URL accessibility
- [ ] Save PID to config after successful start
- [ ] Rollback (stop node) if registration fails

**Test Requirements**:
```typescript
// Tests must verify:
- register command starts node before blockchain tx
- Localhost URLs show warning but proceed
- Public URL verification runs before registration
- Node is stopped if blockchain registration fails
- PID is saved to config on success
- Config includes publicUrl and processPid
```

**Register Flow Implementation**:
```typescript
async function executeRegistration(config: RegistrationConfig): Promise<{
  success: boolean;
  transactionHash: string;
  hostInfo: any;
}> {
  const sdk = await initializeSDK();

  // 1. Warn if localhost URL
  warnIfLocalhost(config.apiUrl);

  // 2. Start inference node
  console.log(chalk.blue('=€ Starting inference node...'));
  const { port } = extractHostPort(config.apiUrl);

  let processHandle: ProcessHandle | null = null;
  try {
    processHandle = await spawnInferenceServer({
      port,
      host: '0.0.0.0',
      publicUrl: config.apiUrl,
      models: config.models,
      logLevel: 'info'
    });

    console.log(chalk.green(` Node started (PID: ${processHandle.pid})`));

    // 3. Verify public accessibility
    console.log(chalk.gray(`  Verifying ${config.apiUrl}...`));
    const isAccessible = await verifyPublicEndpoint(config.apiUrl);

    if (!isAccessible) {
      showNetworkTroubleshooting(config.apiUrl);
      throw new Error('Node not accessible at public URL');
    }

    console.log(chalk.green(' Public URL verified'));

    // 4. Check registration status
    const status = await checkRegistrationStatus();
    if (status.isRegistered) {
      throw new Error('Already registered. Use update commands.');
    }

    // 5. Execute blockchain registration
    console.log(chalk.blue('\n=° Approving FAB tokens...'));
    const result = await registerHost(config);

    // 6. Save process info to config
    const currentConfig = await ConfigStorage.loadConfig();
    await ConfigStorage.saveConfig({
      ...currentConfig,
      processPid: processHandle.pid,
      nodeStartTime: new Date().toISOString(),
      publicUrl: config.apiUrl,
      isRegistered: true,
      registrationTxHash: result.transactionHash
    });

    console.log(chalk.green('\n Registration complete!'));
    console.log(chalk.gray(`Node: ${config.apiUrl}`));
    console.log(chalk.gray(`PID: ${processHandle.pid}`));
    console.log(chalk.gray(`Transaction: ${result.transactionHash}`));

    return result;

  } catch (error: any) {
    // Rollback: Stop node if it was started
    if (processHandle) {
      console.log(chalk.yellow('\n   Rolling back: stopping node...'));
      await stopInferenceServer(processHandle, true);
    }
    throw error;
  }
}
```

### Sub-phase 4.2: Registration Validation
**Goal**: Comprehensive pre-flight checks before registration

**Tasks**:
- [ ] Write tests in `tests/registration/validation.test.ts` (150 lines)
- [ ] Create `packages/host-cli/src/registration/validation.ts` (120 lines max)
- [ ] Implement validatePublicUrl(url) - Checks URL format
- [ ] Implement checkBinaryAvailable() - Verifies fabstir-llm-node exists
- [ ] Implement checkPortAvailable(port) - Ensures port not in use
- [ ] Implement validateModels(models) - Checks model format

**Test Requirements**:
```typescript
// Tests must verify:
- validatePublicUrl rejects invalid URLs
- validatePublicUrl accepts valid http/https URLs
- checkBinaryAvailable returns true if node binary found
- checkPortAvailable returns false if port in use
- validateModels accepts "repo:file" format
```

**Validation Utilities**:
```typescript
/**
 * Validate public URL format
 */
export function validatePublicUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'URL must use http or https' };
    }
    if (!parsed.port) {
      return { valid: false, error: 'URL must include port number' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Check if fabstir-llm-node binary is available
 */
export async function checkBinaryAvailable(): Promise<boolean> {
  const manager = getProcessManager();
  const path = await (manager as any).getExecutablePath();
  return path !== null;
}

/**
 * Check if port is available
 */
export async function checkPortAvailable(port: number): Promise<boolean> {
  const net = require('net');
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}
```

## Phase 5: Start/Stop Command Implementation

### Sub-phase 5.1: Implement Start Command
**Goal**: Replace TODO in start.ts with full implementation

**Tasks**:
- [ ] Write tests in `tests/commands/start.test.ts` (180 lines)
- [ ] Update `packages/host-cli/src/commands/start.ts` (replace 150 lines)
- [ ] Load config and extract publicUrl, models, port
- [ ] Check if already running via PID
- [ ] Start node with saved configuration
- [ ] Support --daemon flag for background mode
- [ ] Show logs in foreground, detach in daemon mode
- [ ] Update config with new PID

**Test Requirements**:
```typescript
// Tests must verify:
- start command loads config from ~/.fabstir/config.json
- Fails with error if no registration found
- Detects already running node via PID
- Starts node with saved models and publicUrl
- Foreground mode shows logs
- Daemon mode detaches and returns
```

**Start Command Implementation**:
```typescript
async function startHost(options: any): Promise<void> {
  // 1. Load configuration
  const config = await ConfigStorage.loadConfig();
  if (!config) {
    throw new Error('No configuration found. Run "fabstir-host register" first.');
  }

  if (!config.publicUrl) {
    throw new Error('No public URL configured. Re-register your host.');
  }

  // 2. Check if already running
  const pidManager = new PIDManager();
  const existingPid = pidManager.getPIDInfo();
  if (existingPid && pidManager.isProcessRunning(existingPid.pid)) {
    console.log(chalk.yellow(`   Node already running (PID: ${existingPid.pid})`));
    console.log(chalk.gray(`URL: ${existingPid.publicUrl}`));
    return;
  }

  // Clean up stale PID
  pidManager.cleanupStalePID();

  // 3. Extract config
  const { port } = extractHostPort(config.publicUrl);

  console.log(chalk.blue('=€ Starting Fabstir host node...'));
  console.log(chalk.gray(`  URL: ${config.publicUrl}`));
  console.log(chalk.gray(`  Models: ${config.models.join(', ')}`));

  // 4. Start node
  const handle = await spawnInferenceServer({
    port,
    host: '0.0.0.0',
    publicUrl: config.publicUrl,
    models: config.models,
    logLevel: options.logLevel || 'info'
  });

  // 5. Save PID
  pidManager.savePIDWithUrl(handle.pid, config.publicUrl);
  await ConfigStorage.saveConfig({
    ...config,
    processPid: handle.pid,
    nodeStartTime: new Date().toISOString()
  });

  console.log(chalk.green(`\n Node started successfully (PID: ${handle.pid})`));
  console.log(chalk.gray(`Monitor logs: fabstir-host logs`));
  console.log(chalk.gray(`Stop node: fabstir-host stop`));

  // 6. Daemon vs foreground mode
  if (options.daemon) {
    console.log(chalk.blue('\n( Running in daemon mode'));
    return; // Exit, node keeps running
  } else {
    console.log(chalk.blue('\n=Ê Running in foreground mode (Ctrl+C to stop)'));

    // Stream logs to console
    handle.process.stdout?.on('data', (data) => {
      process.stdout.write(data);
    });
    handle.process.stderr?.on('data', (data) => {
      process.stderr.write(data);
    });

    // Wait forever
    await new Promise(() => {});
  }
}
```

### Sub-phase 5.2: Enhance Stop Command
**Goal**: Verify stop command works with new PID tracking

**Tasks**:
- [ ] Write tests in `tests/commands/stop.test.ts` (120 lines)
- [ ] Update `packages/host-cli/src/commands/stop.ts` (minimal changes)
- [ ] Use PIDManager.getPIDInfo() instead of readPID()
- [ ] Show node URL when stopping
- [ ] Clear processPid from config after stop
- [ ] Verify process actually stopped

**Test Requirements**:
```typescript
// Tests must verify:
- stop command uses getPIDInfo()
- Shows public URL when stopping
- Clears processPid from config
- Handles stale PID gracefully
- Force flag works correctly
```

**Stop Command Updates**:
```typescript
export const stopCommand = {
  name: 'stop',
  description: 'Stop the Fabstir host daemon',

  async action(options: StopOptions = {}): Promise<void> {
    const pidManager = new PIDManager(options.pidFile);
    const daemonManager = new DaemonManager();

    // Read PID info with metadata
    const pidInfo = pidManager.getPIDInfo();

    if (!pidInfo) {
      console.log(chalk.yellow('Host daemon is not running'));
      pidManager.cleanupStalePID();
      return;
    }

    console.log(chalk.blue(`\n=Ñ Stopping host node...`));
    console.log(chalk.gray(`  PID: ${pidInfo.pid}`));
    console.log(chalk.gray(`  URL: ${pidInfo.publicUrl}`));

    // Stop the daemon
    await daemonManager.stopDaemon(pidInfo.pid, {
      timeout: options.timeout || 10000,
      force: options.force || false
    });

    // Remove PID file
    pidManager.removePID();

    // Clear PID from config
    const config = await ConfigStorage.loadConfig();
    if (config) {
      await ConfigStorage.saveConfig({
        ...config,
        processPid: undefined,
        nodeStartTime: undefined
      });
    }

    console.log(chalk.green('\n Node stopped successfully'));
  }
};
```

## Phase 6: Integration & Testing

### Sub-phase 6.1: End-to-End Integration Tests
**Goal**: Test complete lifecycle with real fabstir-llm-node

**Tasks**:
- [ ] Write tests in `tests/integration/host-lifecycle.test.ts` (300 lines)
- [ ] Test full register ’ start ’ stop ’ unregister flow
- [ ] Test with localhost URL (development)
- [ ] Test error scenarios (port in use, binary missing, etc.)
- [ ] Test daemon mode vs foreground mode
- [ ] Verify blockchain state matches node state

**Test Requirements**:
```typescript
// Tests must verify:
- Full registration flow starts node and registers on chain
- Node is accessible at registered URL
- Stop command actually terminates process
- Start command restarts with same config
- Unregister stops node and removes blockchain entry
- Error handling works correctly
```

**Integration Test Structure**:
```typescript
describe('Host Lifecycle Integration', () => {
  it('should complete full registration flow', async () => {
    // 1. Register (should start node + blockchain tx)
    const result = await executeRegistration({
      apiUrl: 'http://localhost:8080',
      models: ['CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf'],
      stakeAmount: ethers.parseEther('1000')
    });

    expect(result.success).toBe(true);

    // 2. Verify node is running
    const health = await fetch('http://localhost:8080/health');
    expect(health.ok).toBe(true);

    // 3. Verify blockchain registration
    const status = await checkRegistrationStatus();
    expect(status.isRegistered).toBe(true);

    // 4. Stop node
    await stopCommand.action({});

    // 5. Verify node stopped
    const pidManager = new PIDManager();
    expect(pidManager.readPID()).toBeNull();

    // 6. Restart node
    await startHost({ daemon: true });

    // 7. Verify node running again
    const health2 = await fetch('http://localhost:8080/health');
    expect(health2.ok).toBe(true);

    // 8. Unregister (should stop node + blockchain tx)
    await unregisterHost();

    // 9. Verify everything cleaned up
    expect(pidManager.readPID()).toBeNull();
  });
});
```

### Sub-phase 6.2: Error Handling & Edge Cases
**Goal**: Robust error handling for production scenarios

**Tasks**:
- [ ] Write tests in `tests/commands/error-scenarios.test.ts` (200 lines)
- [ ] Test missing fabstir-llm-node binary
- [ ] Test port already in use
- [ ] Test firewall blocking public access
- [ ] Test node crash during registration
- [ ] Test duplicate registration attempt
- [ ] Show helpful error messages for each scenario

**Test Requirements**:
```typescript
// Tests must verify:
- Missing binary shows install instructions
- Port in use suggests checking running processes
- Public URL unreachable shows firewall help
- Node crash during registration rolls back
- Duplicate registration prevented with clear message
```

**Error Handling Examples**:
```typescript
// Handle missing binary
if (!await checkBinaryAvailable()) {
  console.error(chalk.red('L fabstir-llm-node binary not found'));
  console.log(chalk.yellow('\n=æ Installation options:'));
  console.log(chalk.white('  1. Build from source:'));
  console.log(chalk.gray('     git clone https://github.com/fabstir/fabstir-llm-node'));
  console.log(chalk.gray('     cd fabstir-llm-node && cargo build --release'));
  console.log(chalk.white('\n  2. Download pre-built binary:'));
  console.log(chalk.gray('     curl -L https://github.com/fabstir/fabstir-llm-node/releases/latest/download/fabstir-llm-node > /usr/local/bin/fabstir-llm-node'));
  throw new Error('Binary not available');
}

// Handle port in use
if (!await checkPortAvailable(port)) {
  console.error(chalk.red(`L Port ${port} is already in use`));
  console.log(chalk.yellow('\n= Check what is using the port:'));
  console.log(chalk.white(`  lsof -i :${port}`));
  console.log(chalk.white(`  netstat -tuln | grep ${port}`));
  throw new Error('Port unavailable');
}
```

## Phase 7: Documentation & User Experience

### Sub-phase 7.1: Update CLI Help & Examples
**Goal**: Clear documentation for production deployment

**Tasks**:
- [ ] Update README with production examples
- [ ] Add firewall configuration guide
- [ ] Document public IP vs localhost usage
- [ ] Create troubleshooting guide
- [ ] Add example systemd service file

**Examples to Include**:
```bash
# Production deployment
$ fabstir-host register \
    --url https://my-host.example.com:8080 \
    --models "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf"

# Development/testing
$ fabstir-host register \
    --url http://localhost:8080 \
    --models "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf"

# Start as background daemon
$ fabstir-host start --daemon

# Monitor logs
$ fabstir-host logs --follow

# Stop node
$ fabstir-host stop
```

### Sub-phase 7.2: Systemd Integration (Optional)
**Goal**: Production-grade service management on Linux

**Tasks**:
- [ ] Create example systemd unit file
- [ ] Add install-service command
- [ ] Support automatic restart on failure
- [ ] Log to journald

**Systemd Example**:
```ini
[Unit]
Description=Fabstir Host Node
After=network.target

[Service]
Type=simple
User=fabstir
ExecStart=/usr/local/bin/fabstir-host start
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
```

## Summary

This implementation plan transforms the Host CLI from a blockchain-only tool into a complete host management solution. After completion:

1.  **One-Command Registration**: `fabstir-host register` starts the node AND registers on blockchain
2.  **Production-Ready**: Binds to 0.0.0.0, verifies public URLs, shows firewall help
3.  **Reliable Lifecycle**: start/stop/restart commands with PID tracking
4.  **Clear Errors**: Network diagnostics and troubleshooting guides
5.  **Real-World Focus**: Optimized for public IPs, warns about localhost

**Success Criteria**:
- Host can register with single command
- Node is publicly accessible after registration
- Start/stop commands work reliably
- Error messages guide users through issues
- Integration tests pass with real fabstir-llm-node
