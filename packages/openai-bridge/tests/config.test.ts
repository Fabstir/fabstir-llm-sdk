import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateConfig, loadConfigFromEnv, DEFAULT_PORT, DEFAULT_CHAIN_ID, DEFAULT_DEPOSIT_AMOUNT } from '../src/config';

describe('Config', () => {
  it('validates with minimal required fields (privateKey + modelName)', () => {
    const config = validateConfig({ privateKey: '0xabc', modelName: 'TestModel:test.gguf' });
    expect(config.privateKey).toBe('0xabc');
    expect(config.modelName).toBe('TestModel:test.gguf');
  });

  it('applies default port 3457', () => {
    const config = validateConfig({ privateKey: '0xabc', modelName: 'model' });
    expect(config.port).toBe(3457);
    expect(DEFAULT_PORT).toBe(3457);
  });

  it('applies default chainId 84532', () => {
    const config = validateConfig({ privateKey: '0xabc', modelName: 'model' });
    expect(config.chainId).toBe(84532);
    expect(DEFAULT_CHAIN_ID).toBe(84532);
  });

  it('applies default depositAmount 0.0002', () => {
    const config = validateConfig({ privateKey: '0xabc', modelName: 'model' });
    expect(config.depositAmount).toBe('0.0002');
    expect(DEFAULT_DEPOSIT_AMOUNT).toBe('0.0002');
  });

  it('throws on missing privateKey', () => {
    expect(() => validateConfig({ modelName: 'model' })).toThrow('privateKey');
  });

  it('throws on missing modelName', () => {
    expect(() => validateConfig({ privateKey: '0xabc' })).toThrow('modelName');
  });

  describe('env vars', () => {
    const envBackup: Record<string, string | undefined> = {};
    const envKeys = [
      'OPENAI_BRIDGE_PORT', 'OPENAI_BRIDGE_PRIVATE_KEY', 'OPENAI_BRIDGE_HOST',
      'OPENAI_BRIDGE_MODEL', 'OPENAI_BRIDGE_RPC_URL', 'OPENAI_BRIDGE_CHAIN_ID',
      'OPENAI_BRIDGE_DEPOSIT', 'OPENAI_BRIDGE_API_KEY',
    ];

    beforeEach(() => {
      envKeys.forEach(k => { envBackup[k] = process.env[k]; delete process.env[k]; });
    });
    afterEach(() => {
      envKeys.forEach(k => {
        if (envBackup[k] !== undefined) process.env[k] = envBackup[k];
        else delete process.env[k];
      });
    });

    it('reads from OPENAI_BRIDGE_* env vars', () => {
      process.env.OPENAI_BRIDGE_PRIVATE_KEY = '0xFromEnv';
      process.env.OPENAI_BRIDGE_MODEL = 'EnvModel:file.gguf';
      process.env.OPENAI_BRIDGE_PORT = '4000';
      const envConfig = loadConfigFromEnv();
      expect(envConfig.privateKey).toBe('0xFromEnv');
      expect(envConfig.modelName).toBe('EnvModel:file.gguf');
      expect(envConfig.port).toBe(4000);
    });

    it('CLI args override env vars', () => {
      process.env.OPENAI_BRIDGE_PORT = '4000';
      const envConfig = loadConfigFromEnv();
      const config = validateConfig({
        ...envConfig,
        port: 5000,
        privateKey: '0xCli',
        modelName: 'CliModel',
      });
      expect(config.port).toBe(5000);
    });
  });
});
