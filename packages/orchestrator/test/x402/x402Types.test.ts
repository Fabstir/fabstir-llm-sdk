import { describe, it, expect } from 'vitest';
import type { X402PaymentRequirement, X402PaymentRequired, X402Authorization, X402PaymentPayload, X402PaymentResponse, X402PricingConfig } from '../../src/x402/types';
import type { OrchestratorConfig } from '../../src/types';
import type { A2AAgentCard } from '../../src/a2a/types';

const req = (): X402PaymentRequirement => ({ scheme: 'exact', network: 'base-sepolia', maxAmountRequired: '1000000', resource: '/v1/orchestrate', description: 'Fee', payTo: '0xPayTo', asset: '0xUSDC', maxTimeoutSeconds: 300 });

describe('x402 Types', () => {
  it('X402PaymentRequirement has scheme, network, maxAmountRequired, payTo, asset', () => {
    const r = req();
    expect(r.scheme).toBe('exact');
    expect(r.network).toBe('base-sepolia');
    expect(r.payTo).toBe('0xPayTo');
    expect(r.asset).toBe('0xUSDC');
  });

  it('X402PaymentRequired has x402Version 1 and accepts array', () => {
    const pr: X402PaymentRequired = { x402Version: 1, accepts: [req()], error: 'Payment required' };
    expect(pr.x402Version).toBe(1);
    expect(pr.accepts).toHaveLength(1);
  });

  it('X402Authorization has EIP-3009 fields', () => {
    const auth: X402Authorization = { from: '0xFrom', to: '0xTo', value: '1M', validAfter: '0', validBefore: '9', nonce: '0xa' };
    expect(auth.from).toBe('0xFrom');
    expect(auth.value).toBe('1M');
  });

  it('X402PaymentPayload wraps signature and authorization', () => {
    const p: X402PaymentPayload = { x402Version: 1, scheme: 'exact', network: 'base-sepolia',
      payload: { signature: '0xsig', authorization: { from: '0xA', to: '0xB', value: '100', validAfter: '0', validBefore: '99', nonce: '0x1' } } };
    expect(p.scheme).toBe('exact');
    expect(p.payload.signature).toBe('0xsig');
  });

  it('X402PaymentResponse reports success with tx hash', () => {
    const resp: X402PaymentResponse = { success: true, transaction: '0xtx', network: 'base-sepolia', payer: '0xP' };
    expect(resp.success).toBe(true);
    expect(resp.transaction).toBe('0xtx');
  });

  it('X402PricingConfig has orchestratePrice, payTo, asset, network', () => {
    const cfg: X402PricingConfig = { orchestratePrice: '1M', payTo: '0xP', asset: '0xU', network: 'base-sepolia', maxTimeoutSeconds: 300 };
    expect(cfg.orchestratePrice).toBe('1M');
  });

  it('OrchestratorConfig accepts optional x402 field', () => {
    const config: OrchestratorConfig = { sdk: {} as any, chainId: 84532, privateKey: '0x1',
      models: { fast: 'f', deep: 'd' }, maxConcurrentSessions: 3,
      budget: { maxDepositPerSubTask: '0.001', maxTotalDeposit: '0.01', maxSubTasks: 10 },
      x402: { pricing: { orchestratePrice: '1M', payTo: '0xP', asset: '0xU', network: 'base-sepolia', maxTimeoutSeconds: 60 }, budget: { maxX402Spend: '10M' } } };
    expect(config.x402?.pricing?.orchestratePrice).toBe('1M');
  });

  it('A2AAgentCard accepts optional x402 field', () => {
    const card: A2AAgentCard = { name: 'Test', description: 'Test', url: 'http://localhost', version: '0.1.0', skills: [], securitySchemes: [], x402: { accepts: [req()] } };
    expect(card.x402?.accepts).toHaveLength(1);
  });
});
