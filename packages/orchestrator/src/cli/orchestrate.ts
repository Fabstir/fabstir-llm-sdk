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
import { loadOrCreateDelegateKey } from '../delegate/delegate-key';

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

  // Build the delegate hot EOA and authenticate as delegate; otherwise self-funded.
  let delegate: { wallet: ethers.Wallet; address: string } | undefined;
  if (payer) {
    delegate = loadOrCreateDelegateKey({
      envKey: process.env.FABSTIR_DELEGATE_KEY,
      provider: new ethers.JsonRpcProvider(rpcUrl),
    });
    console.log(`Delegate EOA: ${delegate.address} (payer ${payer})`); // never log the key
    await sdk.authenticateAsDelegate({ signer: delegate.wallet, payer });
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
    ...(payer ? { signer: delegate!.wallet as any, delegatePayer: payer } : { privateKey: privateKey! }),
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
      sdk, chainId, signer: delegate!.wallet as any, delegatePayer: payer,
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
