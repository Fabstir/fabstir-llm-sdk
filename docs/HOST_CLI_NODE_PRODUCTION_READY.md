Host CLI Node Lifecycle Integration Plan (Production-Ready)

**See also**: [IMPLEMENTATION-HOST-PRODUCTION-READY.md](./IMPLEMENTATION-HOST-PRODUCTION-READY.md) for detailed phase-by-phase implementation plan.

## Critical Technical Facts (from fabstir-llm-node v7.0.27 Source Code)

**Node Execution Method**: Uses **environment variables only**, NO command-line arguments
```bash
# Node expects these env vars:
export MODEL_PATH=./models/model.gguf  # REQUIRED - must exist
export API_PORT=8080
export P2P_PORT=9000
export HOST_PRIVATE_KEY=0x...
fabstir-llm-node  # No arguments!
```

**Health Check Caveat**: `/health` returns 200 OK **immediately** when HTTP starts, NOT when model loads. Must monitor logs instead:
- ✅ Model loaded successfully
- ✅ P2P node started
- ✅ API server started
- 🎉 Fabstir LLM Node is running

**Model Requirements**: Models must **pre-exist on disk** - no auto-download

**Chain Configuration**: Hardcoded to 84532 (Base Sepolia) for blockchain ops

**Network Binding**: Node already binds to 0.0.0.0 by default (main.rs:87)

Architecture Understanding

Real Host Deployment:

- Host operator has a server with public IP (e.g., 203.0.113.45) or domain (ai-host.example.com)
- fabstir-llm-node runs on that server, binding to 0.0.0.0:8080 (accept connections from anywhere
- Blockchain stores the PUBLIC URL: http://203.0.113.45:8080
- Clients worldwide discover and connect to this URL  


Development/Testing:

- Use localhost:8080 for local testing only
- These registrations won't be usable by real clients  


Implementation Plan

1. Update register Command  


Flow:

# User on their server runs:

$ fabstir-host register \  
 --url http://203.0.113.45:8080 \  
 --models "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf"

→ Parse URL to extract host:port (0.0.0.0:8080)  
→ Start fabstir-llm-node binding to 0.0.0.0:8080  
→ Verify node is running via PUBLIC URL health check  
→ If health check fails, show firewall/network troubleshooting  
→ Approve FAB tokens on blockchain  
→ Register PUBLIC URL on blockchain  
→ Save PID + config to ~/.fabstir/config.json  
→ Run as daemon (background process)

Code changes in src/commands/register.ts:
async function executeRegistration(config: RegistrationConfig) {
 // 1. Parse the public URL to get port
 const url = new URL(config.apiUrl);
 const port = parseInt(url.port) || 8080;

// 2. Start node using ENVIRONMENT VARIABLES (not CLI args!)
 console.log(`🚀 Starting inference node on port ${port}...`);
 const processHandle = await spawnInferenceServer({
 port,
 host: '0.0.0.0', // Node already binds to this, but kept for config
 models: config.models,
 logLevel: 'info',
 env: {
   MODEL_PATH: config.models[0],  // REQUIRED - must exist on disk!
   API_PORT: port.toString(),
   P2P_PORT: (port + 1).toString(),
   HOST_PRIVATE_KEY: config.privateKey,
   CONTRACT_JOB_MARKETPLACE: process.env.CONTRACT_JOB_MARKETPLACE,
   CONTRACT_NODE_REGISTRY: process.env.CONTRACT_NODE_REGISTRY,
   CONTRACT_HOST_EARNINGS: process.env.CONTRACT_HOST_EARNINGS,
   CONTRACT_PROOF_SYSTEM: process.env.CONTRACT_PROOF_SYSTEM,
   RUST_LOG: 'info'
 }
 });

// 3. Wait for node startup by monitoring logs (not just /health!)
 console.log(`⏳ Waiting for node startup (monitoring logs)...`);
 await waitForStartupLogs(processHandle);  // Watches for "Fabstir LLM Node is running"

// 4. Then verify PUBLIC URL is accessible
 console.log(`🔍 Verifying node at ${config.apiUrl}/health...`);
 const isAccessible = await verifyPublicEndpoint(config.apiUrl);

if (!isAccessible) {
 await stopInferenceServer(processHandle);
 throw new Error(
 `Node started but not accessible at ${config.apiUrl}\n` +
 `Check firewall rules and port forwarding.`
 );
 }

// 5. Proceed with blockchain registration
 console.log('✅ Node is publicly accessible');

// ... existing blockchain registration code ...
}

2. Add Public Endpoint Verification  


New file: src/utils/network.ts  
/\*\*

- Verify a public URL is accessible from outside  
   \*/  
  export async function verifyPublicEndpoint(url: string): Promise<boolean> {  
   try {  
   const response = await fetch(`${url}/health`, {  
   timeout: 5000,  
   signal: AbortSignal.timeout(5000)  
   });  
   return response.ok;  
   } catch (error) {  
   return false;  
   }  
  }  


/\*\*

- Detect if URL is localhost (not production-ready)  
   \*/  
  export function isLocalhostUrl(url: string): boolean {  
   const parsed = new URL(url);  
   return ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(parsed.hostname);  
  }  


/\*\*

- Show warning for localhost registration  
   \*/  
  export function warnIfLocalhost(url: string): void {  
   if (isLocalhostUrl(url)) {  
   console.warn(  
   chalk.yellow('⚠️ WARNING: Registering with localhost URL\n') +  
   chalk.yellow(' This host will NOT be accessible to real clients.\n') +  
   chalk.yellow(' Use your public IP or domain for production.')  
   );  
   }  
  }  


3. Update ProcessManager for Environment Variables


Modify src/process/manager.ts:
// CRITICAL: fabstir-llm-node uses environment variables ONLY
export function getDefaultProcessConfig(): ProcessConfig {
 return {
 port: 8080,
 host: '0.0.0.0', // Node already binds to this by default
 models: [],      // Will become MODEL_PATH env var
 maxConnections: 10,
 logLevel: 'info',
 env: {}          // Custom env vars go here
 };
}

// In ProcessManager.spawn():
async spawn(config: ProcessConfig): Promise<ProcessHandle> {
  const env = {
    ...process.env,  // Inherit existing environment
    MODEL_PATH: config.models[0],  // REQUIRED
    API_PORT: config.port.toString(),
    P2P_PORT: (config.port + 1).toString(),
    RUST_LOG: config.logLevel || 'info',
    ...config.env  // User overrides
  };

  // No CLI arguments! Only env vars
  const childProcess = spawn('fabstir-llm-node', [], { env });
  // ...
}

4. Update start Command  


Replace TODO in src/commands/start.ts:
async function startHost(options: any): Promise<void> {
 const config = await ConfigStorage.loadConfig();
 if (!config || !config.apiUrl) {
 throw new Error('No registration found. Run "fabstir-host register" first');
 }

// Parse registered URL to get port
 const url = new URL(config.apiUrl);
 const port = parseInt(url.port) || 8080;

console.log(chalk.blue(`🚀 Starting inference node on port ${port}...`));

// CRITICAL: Use environment variables, not CLI arguments
const handle = await spawnInferenceServer({
 port,
 host: '0.0.0.0',
 models: config.models || [],
 logLevel: options.logLevel || 'info',
 env: {
   MODEL_PATH: config.models?.[0],  // REQUIRED - must exist!
   API_PORT: port.toString(),
   P2P_PORT: (port + 1).toString(),
   HOST_PRIVATE_KEY: config.privateKey,
   CONTRACT_JOB_MARKETPLACE: process.env.CONTRACT_JOB_MARKETPLACE,
   CONTRACT_NODE_REGISTRY: process.env.CONTRACT_NODE_REGISTRY,
   CONTRACT_HOST_EARNINGS: process.env.CONTRACT_HOST_EARNINGS,
   CONTRACT_PROOF_SYSTEM: process.env.CONTRACT_PROOF_SYSTEM,
   RUST_LOG: options.logLevel || 'info'
 }
 });

// Wait for startup logs before considering it ready
 await waitForStartupLogs(handle);

// Save PID for stop command
 await ConfigStorage.saveConfig({
 ...config,
 processPid: handle.pid
 });

console.log(chalk.green(`✅ Node running at ${config.apiUrl}`));

console.log(chalk.gray('Press Ctrl+C to stop'));

// Keep alive in foreground mode
 if (!options.daemon) {
 await waitForever();
 }
}

5. Configuration Changes  


Update src/config/types.ts:  
export interface ConfigData {  
 version: string;  
 network: string;  
 walletAddress: string;  
 privateKey: string;  
 apiUrl: string; // PUBLIC URL (http://203.0.113.45:8080)  
 models: string[];  
 processPid?: number; // PID of running fabstir-llm-node  
 stakeAmount: string;  
 pricePerToken: number;  
 // ... other fields  
}

6. Add Network Troubleshooting  


New file: src/utils/diagnostics.ts  
/\*\*

- Show network troubleshooting steps  
   \*/  
  export function showNetworkTroubleshooting(url: string): void {  
   console.log(chalk.yellow('\n🔧 Troubleshooting Steps:\n'));  
   console.log(chalk.gray('1. Check if node is running:'));  
   console.log(chalk.white(`   curl http://localhost:${new URL(url).port}/health\n`));  


console.log(chalk.gray('2. Check firewall allows incoming connections:'));  
 console.log(chalk.white(`   sudo ufw allow ${new URL(url).port}/tcp\n`));

console.log(chalk.gray('3. Verify port is listening on all interfaces:'));  
 console.log(chalk.white(`   netstat -tuln | grep ${new URL(url).port}\n`));

console.log(chalk.gray('4. Test from another machine:'));  
 console.log(chalk.white(`   curl ${url}/health\n`));  
}

User Workflows

Production Deployment

# On server with public IP 203.0.113.45

$ fabstir-host register \  
 --url http://203.0.113.45:8080 \  
 --models "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf"

→ 🚀 Starting inference node on port 8080...  
→ 🔍 Verifying node at http://203.0.113.45:8080/health...  
→ ✅ Node is publicly accessible

→ 💰 Approving 1000 FAB tokens...  
→ 📝 Registering on blockchain...  
→ ✅ Registration successful!

# Restart after server reboot

$ fabstir-host start  
→ 🚀 Starting inference node on port 8080...  
→ ✅ Node running at http://203.0.113.45:8080

Development/Testing

# Local testing only

$ fabstir-host register --url http://localhost:8080 --models "..."

⚠️ WARNING: Registering with localhost URL  
 This host will NOT be accessible to real clients.  
 Use your public IP or domain for production.

→ 🚀 Starting inference node on port 8080...  
→ ✅ Node accessible at http://localhost:8080 (local only)

→ 💰 Approving tokens...  
→ 📝 Registering on blockchain...

Files to Modify

1. ✏️ src/commands/register.ts - Add node startup + public URL verification
2. ✏️ src/commands/start.ts - Implement actual node startup
3. ✏️ src/process/manager.ts - Change default host to 0.0.0.0
4. ✏️ src/config/types.ts - Add processPid field
5. ✏️ src/utils/network.ts - NEW: Public endpoint verification
6. ✏️ src/utils/diagnostics.ts - NEW: Network troubleshooting  


Testing Checklist

- Register with public IP, verify accessible from another machine
- Register with localhost, see warning message
- Health check fails → show troubleshooting steps
- Stop command kills the process
- Start command restarts from saved config
- Node binds to 0.0.0.0, not 127.0.0.1  


Key Differences from Original Plan

1. Bind to 0.0.0.0 - Accept connections from anywhere
2. Verify PUBLIC URL - Not just localhost health check
3. User provides URL - CLI doesn't auto-detect public IP
4. Show warnings - Alert if using localhost in production
5. Network diagnostics - Help users debug firewall/port issues
