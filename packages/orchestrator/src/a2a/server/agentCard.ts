import type { A2AAgentCard, A2AServerConfig } from '../types';
import type { X402PricingConfig } from '../../x402/types';

export function buildAgentCard(
  config: A2AServerConfig & { x402Pricing?: X402PricingConfig },
): A2AAgentCard {
  const card: A2AAgentCard = {
    name: config.agentName ?? 'Fabstir Orchestrator',
    description: 'Multi-agent orchestration with encrypted inference and on-chain settlement',
    url: config.publicUrl,
    version: '0.1.0',
    skills: [{
      id: 'encrypted-orchestration',
      name: 'Encrypted Multi-Agent Orchestration',
      description: 'Decomposes complex tasks into parallel sub-tasks across decentralised GPU hosts',
      tags: ['orchestration', 'multi-agent', 'encrypted', 'blockchain'],
    }],
    securitySchemes: [
      { type: 'http', scheme: 'bearer', description: 'Wallet-signed JWT authentication' },
    ],
  };
  if (config.x402Pricing) {
    const p = config.x402Pricing;
    card.x402 = { accepts: [{
      scheme: 'exact', network: p.network, maxAmountRequired: p.orchestratePrice,
      resource: '/v1/orchestrate', description: 'Orchestration fee',
      payTo: p.payTo, asset: p.asset, maxTimeoutSeconds: p.maxTimeoutSeconds,
    }] };
  }
  return card;
}
