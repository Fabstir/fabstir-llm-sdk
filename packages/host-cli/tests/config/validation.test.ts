import { describe, it, expect } from 'vitest';
import * as ConfigValidator from '../../src/config/validator';
import { ConfigData } from '../../src/config/types';

describe('Configuration Validation', () => {
  describe('validateConfig', () => {
    it('should validate complete valid configuration', () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        network: 'base-sepolia',
        rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/key',
        inferencePort: 8080,
        publicUrl: 'https://host.example.com',
        models: ['llama-70b'],
        pricePerToken: 0.0001,
        minSessionDeposit: 0.01
      };

      const result = ConfigValidator.validateConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const config = {
        version: '1.0.0',
        walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      } as ConfigData;

      const result = ConfigValidator.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required field: network');
      expect(result.errors).toContain('Missing required field: rpcUrl');
    });

    it('should validate wallet address format', () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: 'invalid-address',
        network: 'base-sepolia',
        rpcUrl: 'https://test.rpc',
        inferencePort: 8080,
        publicUrl: 'https://host.example.com',
        models: ['model1'],
        pricePerToken: 0.0001,
        minSessionDeposit: 0.01
      };

      const result = ConfigValidator.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid wallet address format');
    });

    it('should validate network selection', () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        network: 'invalid-network' as any,
        rpcUrl: 'https://test.rpc',
        inferencePort: 8080,
        publicUrl: 'https://host.example.com',
        models: ['model1'],
        pricePerToken: 0.0001,
        minSessionDeposit: 0.01
      };

      const result = ConfigValidator.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid network selection');
    });

    it('should validate RPC URL format', () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        network: 'base-sepolia',
        rpcUrl: 'not-a-url',
        inferencePort: 8080,
        publicUrl: 'https://host.example.com',
        models: ['model1'],
        pricePerToken: 0.0001,
        minSessionDeposit: 0.01
      };

      const result = ConfigValidator.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid RPC URL format');
    });

    it('should validate port range', () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        network: 'base-sepolia',
        rpcUrl: 'https://test.rpc',
        inferencePort: 99999,
        publicUrl: 'https://host.example.com',
        models: ['model1'],
        pricePerToken: 0.0001,
        minSessionDeposit: 0.01
      };

      const result = ConfigValidator.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid port number');
    });

    it('should validate public URL format', () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        network: 'base-sepolia',
        rpcUrl: 'https://test.rpc',
        inferencePort: 8080,
        publicUrl: 'not-a-url',
        models: ['model1'],
        pricePerToken: 0.0001,
        minSessionDeposit: 0.01
      };

      const result = ConfigValidator.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid public URL format');
    });

    it('should require at least one model', () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        network: 'base-sepolia',
        rpcUrl: 'https://test.rpc',
        inferencePort: 8080,
        publicUrl: 'https://host.example.com',
        models: [],
        pricePerToken: 0.0001,
        minSessionDeposit: 0.01
      };

      const result = ConfigValidator.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('At least one model must be configured');
    });

    it('should validate price values are positive', () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        network: 'base-sepolia',
        rpcUrl: 'https://test.rpc',
        inferencePort: 8080,
        publicUrl: 'https://host.example.com',
        models: ['model1'],
        pricePerToken: -0.01,
        minSessionDeposit: 0.01
      };

      const result = ConfigValidator.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Price per token must be positive');
    });
  });

  describe('validatePartial', () => {
    it('should validate partial configuration', () => {
      const partial = {
        walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        network: 'base-sepolia'
      };

      const result = ConfigValidator.validatePartial(partial);
      expect(result.isValid).toBe(true);
    });

    it('should detect invalid fields in partial config', () => {
      const partial = {
        walletAddress: 'invalid',
        network: 'base-sepolia'
      };

      const result = ConfigValidator.validatePartial(partial);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid wallet address format');
    });
  });

  describe('isValidUrl', () => {
    it('should validate URLs', () => {
      expect(ConfigValidator.isValidUrl('https://example.com')).toBe(true);
      expect(ConfigValidator.isValidUrl('http://localhost:8080')).toBe(true);
      expect(ConfigValidator.isValidUrl('wss://example.com/ws')).toBe(true);
      expect(ConfigValidator.isValidUrl('not-a-url')).toBe(false);
      expect(ConfigValidator.isValidUrl('ftp://example.com')).toBe(false);
    });
  });

  describe('isValidPort', () => {
    it('should validate port numbers', () => {
      expect(ConfigValidator.isValidPort(80)).toBe(true);
      expect(ConfigValidator.isValidPort(8080)).toBe(true);
      expect(ConfigValidator.isValidPort(65535)).toBe(true);
      expect(ConfigValidator.isValidPort(0)).toBe(false);
      expect(ConfigValidator.isValidPort(65536)).toBe(false);
      expect(ConfigValidator.isValidPort(-1)).toBe(false);
    });
  });

  describe('isValidAddress', () => {
    it('should validate Ethereum addresses', () => {
      expect(ConfigValidator.isValidAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')).toBe(true);
      expect(ConfigValidator.isValidAddress('0x0000000000000000000000000000000000000000')).toBe(true);
      expect(ConfigValidator.isValidAddress('invalid')).toBe(false);
      expect(ConfigValidator.isValidAddress('0xshort')).toBe(false);
    });
  });
});