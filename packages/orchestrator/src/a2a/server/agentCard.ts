import type { A2AAgentCard, A2AServerConfig } from '../types';

export function buildAgentCard(config: A2AServerConfig): A2AAgentCard {
  return {
    name: config.agentName ?? 'Fabstir Orchestrator',
    description:
      'Multi-agent orchestration with encrypted inference and on-chain settlement',
    url: config.publicUrl,
    version: '0.1.0',
    skills: [
      {
        id: 'encrypted-orchestration',
        name: 'Encrypted Multi-Agent Orchestration',
        description:
          'Decomposes complex tasks into parallel sub-tasks across decentralised GPU hosts',
        tags: ['orchestration', 'multi-agent', 'encrypted', 'blockchain'],
      },
    ],
    securitySchemes: [
      {
        type: 'http',
        scheme: 'bearer',
        description: 'Wallet-signed JWT authentication',
      },
    ],
  };
}
