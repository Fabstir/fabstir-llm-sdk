import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as ConfigEnv from '../../src/config/env';
import { ConfigData } from '../../src/config/types';

describe('Config Environment Override', () => {
  let originalEnv: NodeJS.ProcessEnv;

  const mockConfig: ConfigData = {
    version: '1.0.0',
    walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    network: 'base-sepolia',
    rpcUrl: 'https://test.rpc',
    inferencePort: 8080,
    publicUrl: 'https://host.example.com',
    models: ['llama-70b'],
    pricePerToken: 0.0001,
    minSessionDeposit: 0.01
  };

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('applyEnvOverrides', () => {
    it('should override config with env variables', () => {
      process.env.FABSTIR_NETWORK = 'base-mainnet';
      process.env.FABSTIR_RPC_URL = 'https://env.rpc';
      process.env.FABSTIR_INFERENCE_PORT = '9090';

      const overridden = ConfigEnv.applyEnvOverrides(mockConfig);

      expect(overridden.network).toBe('base-mainnet');
      expect(overridden.rpcUrl).toBe('https://env.rpc');
      expect(overridden.inferencePort).toBe(9090);
      expect(overridden.walletAddress).toBe(mockConfig.walletAddress);
    });

    it('should parse numeric env values', () => {
      process.env.FABSTIR_INFERENCE_PORT = '3000';
      process.env.FABSTIR_PRICE_PER_TOKEN = '0.0002';
      process.env.FABSTIR_MIN_SESSION_DEPOSIT = '0.05';

      const overridden = ConfigEnv.applyEnvOverrides(mockConfig);

      expect(overridden.inferencePort).toBe(3000);
      expect(overridden.pricePerToken).toBe(0.0002);
      expect(overridden.minSessionDeposit).toBe(0.05);
    });

    it('should parse array env values', () => {
      process.env.FABSTIR_MODELS = 'llama-70b,gpt-j-6b,mistral-7b';

      const overridden = ConfigEnv.applyEnvOverrides(mockConfig);

      expect(overridden.models).toEqual(['llama-70b', 'gpt-j-6b', 'mistral-7b']);
    });

    it('should ignore invalid env values', () => {
      process.env.FABSTIR_INFERENCE_PORT = 'invalid';
      process.env.FABSTIR_NETWORK = 'invalid-network';

      const overridden = ConfigEnv.applyEnvOverrides(mockConfig);

      expect(overridden.inferencePort).toBe(mockConfig.inferencePort);
      expect(overridden.network).toBe(mockConfig.network);
    });

    it('should not override wallet address from env', () => {
      process.env.FABSTIR_WALLET_ADDRESS = '0x1234567890123456789012345678901234567890';

      const overridden = ConfigEnv.applyEnvOverrides(mockConfig);

      // Wallet address should not be overridden for security
      expect(overridden.walletAddress).toBe(mockConfig.walletAddress);
    });
  });

  describe('getEnvMapping', () => {
    it('should return environment variable mapping', () => {
      const mapping = ConfigEnv.getEnvMapping();

      expect(mapping).toHaveProperty('FABSTIR_NETWORK', 'network');
      expect(mapping).toHaveProperty('FABSTIR_RPC_URL', 'rpcUrl');
      expect(mapping).toHaveProperty('FABSTIR_INFERENCE_PORT', 'inferencePort');
      expect(mapping).toHaveProperty('FABSTIR_PUBLIC_URL', 'publicUrl');
      expect(mapping).toHaveProperty('FABSTIR_MODELS', 'models');
      expect(mapping).toHaveProperty('FABSTIR_PRICE_PER_TOKEN', 'pricePerToken');
      expect(mapping).toHaveProperty('FABSTIR_MIN_SESSION_DEPOSIT', 'minSessionDeposit');
    });

    it('should not include sensitive fields', () => {
      const mapping = ConfigEnv.getEnvMapping();

      expect(mapping).not.toHaveProperty('FABSTIR_WALLET_ADDRESS');
      expect(mapping).not.toHaveProperty('FABSTIR_VERSION');
    });
  });

  describe('validateEnvValue', () => {
    it('should validate network values', () => {
      expect(ConfigEnv.validateEnvValue('network', 'base-mainnet')).toBe(true);
      expect(ConfigEnv.validateEnvValue('network', 'base-sepolia')).toBe(true);
      expect(ConfigEnv.validateEnvValue('network', 'invalid')).toBe(false);
    });

    it('should validate port values', () => {
      expect(ConfigEnv.validateEnvValue('inferencePort', '8080')).toBe(true);
      expect(ConfigEnv.validateEnvValue('inferencePort', '65535')).toBe(true);
      expect(ConfigEnv.validateEnvValue('inferencePort', '0')).toBe(false);
      expect(ConfigEnv.validateEnvValue('inferencePort', '65536')).toBe(false);
      expect(ConfigEnv.validateEnvValue('inferencePort', 'abc')).toBe(false);
    });

    it('should validate URL values', () => {
      expect(ConfigEnv.validateEnvValue('rpcUrl', 'https://valid.url')).toBe(true);
      expect(ConfigEnv.validateEnvValue('rpcUrl', 'http://localhost:8545')).toBe(true);
      expect(ConfigEnv.validateEnvValue('rpcUrl', 'not-a-url')).toBe(false);
    });

    it('should validate numeric values', () => {
      expect(ConfigEnv.validateEnvValue('pricePerToken', '0.0001')).toBe(true);
      expect(ConfigEnv.validateEnvValue('pricePerToken', '-0.01')).toBe(false);
      expect(ConfigEnv.validateEnvValue('pricePerToken', 'invalid')).toBe(false);
    });
  });

  describe('exportEnvTemplate', () => {
    it('should generate env template', () => {
      const template = ConfigEnv.exportEnvTemplate(mockConfig);

      expect(template).toContain('FABSTIR_NETWORK=base-sepolia');
      expect(template).toContain('FABSTIR_RPC_URL=https://test.rpc');
      expect(template).toContain('FABSTIR_INFERENCE_PORT=8080');
      expect(template).toContain('FABSTIR_PUBLIC_URL=https://host.example.com');
      expect(template).toContain('FABSTIR_MODELS=llama-70b');
      expect(template).toContain('FABSTIR_PRICE_PER_TOKEN=0.0001');
      expect(template).toContain('FABSTIR_MIN_SESSION_DEPOSIT=0.01');
    });

    it('should include comments in template', () => {
      const template = ConfigEnv.exportEnvTemplate(mockConfig);

      expect(template).toContain('# Fabstir Host Configuration');
      expect(template).toContain('# Network: base-mainnet or base-sepolia');
    });

    it('should not include sensitive values', () => {
      const template = ConfigEnv.exportEnvTemplate(mockConfig);

      expect(template).not.toContain(mockConfig.walletAddress);
    });
  });
});