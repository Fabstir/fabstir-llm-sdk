import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BridgeConfig,
  validateConfig,
  loadConfigFromEnv,
  DEFAULT_PORT,
  DEFAULT_CHAIN_ID,
  DEFAULT_DEPOSIT_AMOUNT,
} from '../src/config';

describe('BridgeConfig', () => {
  it('default port is 3456', () => {
    expect(DEFAULT_PORT).toBe(3456);
  });

  it('default chainId is 84532', () => {
    expect(DEFAULT_CHAIN_ID).toBe(84532);
  });

  it('default depositAmount is 0.0002', () => {
    expect(DEFAULT_DEPOSIT_AMOUNT).toBe('0.0002');
  });

  it('validateConfig throws on missing privateKey', () => {
    expect(() =>
      validateConfig({ hostAddress: '0xabc', modelName: 'test-model' })
    ).toThrow('privateKey');
  });

  it('validateConfig accepts missing hostAddress for auto-discovery', () => {
    const config = validateConfig({ privateKey: '0xkey', modelName: 'test-model' });
    expect(config.hostAddress).toBeUndefined();
    expect(config.privateKey).toBe('0xkey');
    expect(config.modelName).toBe('test-model');
  });

  it('validateConfig throws on missing modelName', () => {
    expect(() =>
      validateConfig({ privateKey: '0xkey', hostAddress: '0xabc' })
    ).toThrow('modelName');
  });

  it('validateConfig preserves hostAddress when explicitly provided', () => {
    const config = validateConfig({ privateKey: '0xkey', modelName: 'test-model', hostAddress: '0xExplicitHost' });
    expect(config.hostAddress).toBe('0xExplicitHost');
  });

  describe('loadConfigFromEnv', () => {
    const savedEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
      savedEnv.CLAUDE_BRIDGE_PORT = process.env.CLAUDE_BRIDGE_PORT;
      savedEnv.CLAUDE_BRIDGE_PRIVATE_KEY = process.env.CLAUDE_BRIDGE_PRIVATE_KEY;
      savedEnv.CLAUDE_BRIDGE_HOST = process.env.CLAUDE_BRIDGE_HOST;
    });

    afterEach(() => {
      if (savedEnv.CLAUDE_BRIDGE_PORT === undefined) delete process.env.CLAUDE_BRIDGE_PORT;
      else process.env.CLAUDE_BRIDGE_PORT = savedEnv.CLAUDE_BRIDGE_PORT;
      if (savedEnv.CLAUDE_BRIDGE_PRIVATE_KEY === undefined) delete process.env.CLAUDE_BRIDGE_PRIVATE_KEY;
      else process.env.CLAUDE_BRIDGE_PRIVATE_KEY = savedEnv.CLAUDE_BRIDGE_PRIVATE_KEY;
      if (savedEnv.CLAUDE_BRIDGE_HOST === undefined) delete process.env.CLAUDE_BRIDGE_HOST;
      else process.env.CLAUDE_BRIDGE_HOST = savedEnv.CLAUDE_BRIDGE_HOST;
    });

    it('reads CLAUDE_BRIDGE_PORT, CLAUDE_BRIDGE_PRIVATE_KEY, CLAUDE_BRIDGE_HOST env vars', () => {
      process.env.CLAUDE_BRIDGE_PORT = '9999';
      process.env.CLAUDE_BRIDGE_PRIVATE_KEY = '0xenvkey';
      process.env.CLAUDE_BRIDGE_HOST = '0xenvhost';

      const config = loadConfigFromEnv();
      expect(config.port).toBe(9999);
      expect(config.privateKey).toBe('0xenvkey');
      expect(config.hostAddress).toBe('0xenvhost');
    });
  });
});
