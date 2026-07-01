import 'fake-indexeddb/auto';
import { WebSocket } from 'ws';
(globalThis as any).WebSocket = WebSocket;
import 'dotenv/config';
import { ethers } from 'ethers';
import { FabstirSDKCore, ChainRegistry, ChainId } from '@fabstir/sdk-core';
import { OrchestratorManager } from '../core/OrchestratorManager';
import { OrchestratorA2AServer } from '../a2a/server/OrchestratorA2AServer';
import { SessionPool } from '../core/SessionPool';
import { ModelRouter } from '../core/ModelRouter';
import { OpenAIServer } from '../openai/OpenAIServer';
import { resolveBindHost, AuthGate } from '../openai/gating';
import { DelegateControlPlane } from '../delegate/control-plane';
import { loadOrCreateDelegateKey, defaultDelegateKeyPath } from '../delegate/delegate-key';
import { buildSmartDelegate } from '../delegate/smart-account';

/** CDP base-sepolia 4337 endpoint (the one chat uses) — the zero-config bundler/paymaster default. */
export const CDP_BASE_SEPOLIA_RPC = 'https://api.developer.coinbase.com/rpc/v1/base-sepolia';

/** Minimum hot-EOA ETH for the legacy delegate path (matches the 0.0002 ETH min deposit). */
const MIN_DELEGATE_GAS_WEI = ethers.parseEther('0.0002');

/**
 * First present env var among the given names — accepts the `NEXT_PUBLIC_` prefix the
 * rest of the chain config uses (mirrors sdk-core's environment.ts resolution), so
 * operators don't need a duplicate bare var. NOT a fallback: returns undefined → caller throws.
 */
function firstEnv(env: NodeJS.ProcessEnv, names: string[]): string | undefined {
  for (const n of names) if (env[n]) return env[n];
  return undefined;
}
const ENTRY_POINT_ENV_NAMES = [
  'ENTRY_POINT_ADDRESS',
  'NEXT_PUBLIC_ENTRY_POINT_ADDRESS',
  'BASE_ENTRY_POINT_ADDRESS',
  'NEXT_PUBLIC_BASE_ENTRY_POINT_ADDRESS',
];
const ACCOUNT_FACTORY_ENV_NAMES = ['FABSTIR_ACCOUNT_FACTORY', 'NEXT_PUBLIC_FABSTIR_ACCOUNT_FACTORY'];

export interface DelegateContext {
  signer: ethers.Signer;
  address: string;
  gasless: boolean;
}

/**
 * Build the delegate signer + address. Loads the stable hot key in BOTH modes
 * (Constraint 8); only FABSTIR_GASLESS=1 wraps it as a SimpleAccount owner and
 * emits the loud one-time re-auth notice (Constraint 5/7). The returned signer
 * is a drop-in ethers signer — no SDK auth-method change.
 */
export async function buildDelegateContext(opts: {
  payer: string;
  rpcUrl: string;
  chainId: number;
  provider: ethers.Provider;
  env?: NodeJS.ProcessEnv;
  log?: (msg: string) => void;
}): Promise<DelegateContext> {
  const env = opts.env ?? process.env;
  const log = opts.log ?? console.log;
  const delegate = loadOrCreateDelegateKey({ envKey: env.FABSTIR_DELEGATE_KEY, provider: opts.provider });

  if (env.FABSTIR_GASLESS === '1') {
    const factory = firstEnv(env, ACCOUNT_FACTORY_ENV_NAMES);
    if (!factory) throw new Error(`FABSTIR_GASLESS=1 requires a SimpleAccount factory address (${ACCOUNT_FACTORY_ENV_NAMES.join(' / ')}) — no fallback`);
    const entryPoint = firstEnv(env, ENTRY_POINT_ENV_NAMES);
    if (!entryPoint) throw new Error(`FABSTIR_GASLESS=1 requires an EntryPoint address (${ENTRY_POINT_ENV_NAMES.join(' / ')}) — no fallback`);
    const smart = await buildSmartDelegate({
      eoaKey: delegate.wallet.privateKey, // SAME stable key wrapped as the SA owner (Constraint 8)
      rpcUrl: opts.rpcUrl,
      chainId: opts.chainId,
      entryPoint,
      factory,
      bundlerUrl: env.FABSTIR_BUNDLER_URL ?? CDP_BASE_SEPOLIA_RPC,
      paymasterUrl: env.FABSTIR_PAYMASTER_URL ?? CDP_BASE_SEPOLIA_RPC,
      addrPath: `${defaultDelegateKeyPath()}.sa`,
      paymasterContext: env.FABSTIR_PAYMASTER_CONTEXT ? JSON.parse(env.FABSTIR_PAYMASTER_CONTEXT) : {},
      autoDeploy: env.FABSTIR_GASLESS_AUTODEPLOY !== '0', // pre-deploy the SA on first use (opt out with =0)
      log,
    });
    log(`⚠️  GASLESS delegate (SimpleAccount v0.7): ${smart.address}`);
    log(`    Authorize + USDC-approve THIS address. The prior hot-EOA (${delegate.address}) authorization does NOT carry over.`);
    return { signer: smart.signer, address: smart.address, gasless: true };
  }

  // Legacy preflight: a 0-ETH hot EOA hangs silently at createSessionForModelAsDelegate.
  const balance = await opts.provider.getBalance(delegate.address);
  if (balance < MIN_DELEGATE_GAS_WEI) {
    const err = new Error(
      `Delegate ${delegate.address} has insufficient ETH for gas (${ethers.formatEther(balance)} < ${ethers.formatEther(MIN_DELEGATE_GAS_WEI)} ETH). Fund it, or set FABSTIR_GASLESS=1 to run sponsored (USDC-only).`,
    ) as Error & { code: string };
    err.code = 'DELEGATE_UNFUNDED';
    throw err;
  }
  log(`Delegate EOA: ${delegate.address} (payer ${opts.payer})`); // never log the key
  return { signer: delegate.wallet, address: delegate.address, gasless: false };
}

export async function runCLI(argv: string[]): Promise<void> {
  const privateKey = process.env.FABSTIR_PRIVATE_KEY;
  // Delegate-pays mode (Constraint 10): FABSTIR_PAYER is the bridge sub-account
  // whose USDC allowance funds sessions; the daemon's hot EOA is its delegate.
  const payer = process.env.FABSTIR_PAYER;
  if (!privateKey && !payer) {
    console.error('FABSTIR_PRIVATE_KEY is required (or FABSTIR_PAYER for delegate-pays mode)');
    process.exit(1);
    return;
  }

  const fastModel = process.env.FABSTIR_FAST_MODEL;
  const deepModel = process.env.FABSTIR_DEEP_MODEL;
  const planningModel = process.env.FABSTIR_PLANNING_MODEL ?? deepModel;
  const maxSessions = parseInt(process.env.FABSTIR_MAX_SESSIONS ?? '3', 10);
  const chainId = parseInt(process.env.FABSTIR_CHAIN_ID ?? '84532', 10);
  const a2aPort = parseInt(process.env.FABSTIR_A2A_PORT ?? '3100', 10);
  const a2aPublicUrl = process.env.FABSTIR_A2A_PUBLIC_URL ?? `http://localhost:${a2aPort}`;

  const chain = ChainRegistry.getChain(chainId as ChainId);
  const rpcUrl = process.env.FABSTIR_RPC_URL ?? chain.rpcUrl;

  const sdk = new FabstirSDKCore({
    chainId,
    rpcUrl,
    contractAddresses: chain.contracts,
    // Delegate/coding-agent daemon proxies chat — no S5 persistence/RAG needed.
    // (orchestrate/A2A paths keep S5 for conversation/RAG features.)
    skipS5: !!payer,
  } as any);

  // Build the delegate (legacy EOA or, on FABSTIR_GASLESS=1, a SimpleAccount AASigner)
  // and authenticate as delegate; otherwise self-funded.
  let delegate: DelegateContext | undefined;
  if (payer) {
    delegate = await buildDelegateContext({
      payer,
      rpcUrl,
      chainId,
      provider: new ethers.JsonRpcProvider(rpcUrl),
    });
    await sdk.authenticateAsDelegate({ signer: delegate.signer, payer });
  } else {
    await sdk.authenticate('privatekey', { privateKey: privateKey! });
  }

  const paymentToken = process.env.FABSTIR_PAYMENT_TOKEN;
  // Self-funded only: in delegate mode the PAYER (not the daemon) approves the marketplace.
  if (paymentToken && !payer) {
    await (sdk.getPaymentManager() as any).approveToken(
      chain.contracts.jobMarketplace, BigInt(1000_000_000), paymentToken,
    );
  }

  // Wire HostManager into ModelManager (sdk-core doesn't do this automatically)
  const modelMgr = sdk.getModelManager();
  const hostMgr = sdk.getClientManager().getHostManager();
  (modelMgr as any).setHostManager(hostMgr);

  const proofGracePeriodMs = parseInt(process.env.FABSTIR_PROOF_GRACE_MS ?? '30000', 10);

  const managerConfig = {
    sdk,
    chainId,
    // Delegate mode supplies signer + delegatePayer; self-funded supplies privateKey.
    ...(payer ? { signer: delegate!.signer as any, delegatePayer: payer } : { privateKey: privateKey! }),
    models: { fast: fastModel, deep: deepModel, planning: planningModel },
    maxConcurrentSessions: maxSessions,
    proofGracePeriodMs,
    paymentToken,
    budget: {
      maxDepositPerSubTask: process.env.FABSTIR_MAX_DEPOSIT_PER_TASK ?? '0.001',
      maxTotalDeposit: process.env.FABSTIR_MAX_TOTAL_DEPOSIT ?? '0.01',
      maxSubTasks: parseInt(process.env.FABSTIR_MAX_SUB_TASKS ?? '10', 10),
    },
  };

  const goal = argv.slice(2).join(' ').trim();

  if (goal) {
    // Multi-agent orchestrate path needs OrchestratorManager (planning + fan-out).
    const manager = new OrchestratorManager(managerConfig);
    await manager.initialize();
    try {
      const result = await manager.orchestrate(goal, {
        onProgress: (p) => {
          process.stderr.write(`[${p.phase}] ${p.message}\n`);
        },
      });
      console.log(JSON.stringify({
        taskGraphId: result.taskGraphId,
        synthesis: result.synthesis,
        proofCIDs: result.proofCIDs,
        totalTokensUsed: result.totalTokensUsed,
      }, null, 2));
    } finally {
      await manager.destroy();
    }
  } else if (payer) {
    // Delegate-pays OpenAI daemon: gated /v1/* + control plane on loopback.
    const openaiPort = parseInt(process.env.FABSTIR_OPENAI_PORT ?? '3457', 10);
    const bindHost = resolveBindHost(process.env);
    const sessionDeposit = process.env.FABSTIR_SESSION_DEPOSIT ?? '0.001';
    const fallbackModel = deepModel ?? fastModel;

    const pool = new SessionPool({
      sdk, chainId, signer: delegate!.signer as any, delegatePayer: payer,
      models: { fast: fastModel, deep: deepModel }, maxConcurrentSessions: maxSessions,
      budget: { maxDepositPerSubTask: sessionDeposit, maxTotalDeposit: process.env.FABSTIR_MAX_TOTAL_DEPOSIT ?? '0.01', maxSubTasks: 1000 },
      proofGracePeriodMs, paymentToken,
    });
    const modelRouter = new ModelRouter(sdk, { fast: fastModel, deep: deepModel });
    await modelRouter.initialize();

    const gate: AuthGate = {
      check: async () => {
        const s = await (sdk.getPaymentManager() as any).getDelegateAuthorization({ payer, delegate: delegate!.address });
        return { authorized: !!s.authorized, allowanceRemaining: s.remaining ?? 0n };
      },
      authorizeUrl: process.env.FABSTIR_AUTHORIZE_URL,
    };
    const openai = new OpenAIServer({
      pool, modelRouter, gate,
      config: { chainId, depositAmount: sessionDeposit, paymentToken, imageModel: fallbackModel, defaultModel: fallbackModel },
    });
    new DelegateControlPlane({ sdk, delegateAddress: delegate!.address, chainId, initialPayer: payer }).mount(openai.app);
    await openai.start(openaiPort, bindHost);
    console.log(`OpenAI delegate daemon on http://${bindHost}:${openaiPort} (delegate ${delegate!.address})`);
  } else {
    // A2A server path needs OrchestratorManager (orchestrate over A2A).
    const manager = new OrchestratorManager(managerConfig);
    await manager.initialize();
    const server = new OrchestratorA2AServer(manager, {
      publicUrl: a2aPublicUrl,
      port: a2aPort,
    });
    await server.start();
    console.log(`Orchestrator A2A server listening on port ${a2aPort}`);
  }
}

if (require.main === module) {
  runCLI(process.argv).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
