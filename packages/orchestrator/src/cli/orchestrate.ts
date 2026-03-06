import 'fake-indexeddb/auto';
import { WebSocket } from 'ws';
(globalThis as any).WebSocket = WebSocket;
import 'dotenv/config';
import { FabstirSDKCore, ChainRegistry, ChainId } from '@fabstir/sdk-core';
import { OrchestratorManager } from '../core/OrchestratorManager';
import { OrchestratorA2AServer } from '../a2a/server/OrchestratorA2AServer';

export async function runCLI(argv: string[]): Promise<void> {
  const privateKey = process.env.FABSTIR_PRIVATE_KEY;
  if (!privateKey) {
    console.error('FABSTIR_PRIVATE_KEY is required');
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
  } as any);

  await sdk.authenticate('privatekey', { privateKey });

  // Wire HostManager into ModelManager (sdk-core doesn't do this automatically)
  const modelMgr = sdk.getModelManager();
  const hostMgr = sdk.getClientManager().getHostManager();
  (modelMgr as any).setHostManager(hostMgr);

  const proofGracePeriodMs = parseInt(process.env.FABSTIR_PROOF_GRACE_MS ?? '30000', 10);

  const manager = new OrchestratorManager({
    sdk,
    chainId,
    privateKey,
    models: { fast: fastModel, deep: deepModel, planning: planningModel },
    maxConcurrentSessions: maxSessions,
    proofGracePeriodMs,
    budget: {
      maxDepositPerSubTask: process.env.FABSTIR_MAX_DEPOSIT_PER_TASK ?? '0.001',
      maxTotalDeposit: process.env.FABSTIR_MAX_TOTAL_DEPOSIT ?? '0.01',
      maxSubTasks: parseInt(process.env.FABSTIR_MAX_SUB_TASKS ?? '10', 10),
    },
  });

  await manager.initialize();

  const goal = argv.slice(2).join(' ').trim();

  if (goal) {
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
  } else {
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
