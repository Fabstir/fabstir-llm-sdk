// Copyright (c) 2025 Fabstir — BUSL-1.1
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { ChainId } from '../../src/types/chain.types';

const MN = ['BASE_CONTRACT_JOB_MARKETPLACE','BASE_CONTRACT_NODE_REGISTRY','BASE_CONTRACT_PROOF_SYSTEM',
  'BASE_CONTRACT_HOST_EARNINGS','BASE_CONTRACT_MODEL_REGISTRY','BASE_CONTRACT_USDC_TOKEN',
  'BASE_CONTRACT_FAB_TOKEN','RPC_URL_BASE_MAINNET','BASE_ENTRY_POINT_ADDRESS'] as const;
const SP = ['CONTRACT_JOB_MARKETPLACE','CONTRACT_NODE_REGISTRY','CONTRACT_PROOF_SYSTEM',
  'CONTRACT_HOST_EARNINGS','CONTRACT_MODEL_REGISTRY','CONTRACT_USDC_TOKEN',
  'CONTRACT_FAB_TOKEN','RPC_URL_BASE_SEPOLIA','ENTRY_POINT_ADDRESS'] as const;
const saved: Record<string,string|undefined> = {};

describe('ChainRegistry - Base Mainnet', () => {
  beforeEach(() => {
    for (const k of SP) { saved[k] = process.env[k]; process.env[k] = process.env[k] || '0x'+'9'.repeat(40); }
    saved.RPC_URL_BASE_SEPOLIA = process.env.RPC_URL_BASE_SEPOLIA;
    if (!process.env.RPC_URL_BASE_SEPOLIA) process.env.RPC_URL_BASE_SEPOLIA = 'https://sepolia.base.org';
    const hex = 'abcdef12'; // chars for per-key mock addresses
    MN.forEach((k,i) => { process.env[k] = k.includes('RPC') ? 'https://mainnet.base.org' : '0x'+hex[i%8].repeat(40); });
    (ChainRegistry as any).chains = undefined;
  });
  afterEach(() => {
    for (const k of MN) delete process.env[k];
    for (const k of SP) { saved[k] !== undefined ? process.env[k]=saved[k] : delete process.env[k]; }
    (ChainRegistry as any).chains = undefined;
  });

  it('ChainId.BASE_MAINNET equals 8453', () => { expect(ChainId.BASE_MAINNET).toBe(8453); });
  it('returns config when env vars set', () => {
    const c = ChainRegistry.getChain(ChainId.BASE_MAINNET);
    expect(c).toBeDefined(); expect(c.contracts.jobMarketplace).toBeTruthy();
  });
  it('has chainId 8453 and name "Base"', () => {
    const c = ChainRegistry.getChain(ChainId.BASE_MAINNET);
    expect(c.chainId).toBe(8453); expect(c.name).toBe('Base');
  });
  it('reads USDC from BASE_CONTRACT_USDC_TOKEN env var', () => {
    const usdc = process.env.BASE_CONTRACT_USDC_TOKEN!;
    expect(ChainRegistry.getChain(ChainId.BASE_MAINNET).contracts.usdcToken).toBe(usdc);
  });
  it('skips Base mainnet gracefully when env vars missing', () => {
    for (const k of MN) delete process.env[k];
    (ChainRegistry as any).chains = undefined;
    expect(() => ChainRegistry.getChain(ChainId.BASE_SEPOLIA)).not.toThrow();
    expect(ChainRegistry.isChainSupported(8453)).toBe(false);
  });
  it('isChainSupported(8453) returns true when configured', () => { expect(ChainRegistry.isChainSupported(8453)).toBe(true); });
});
