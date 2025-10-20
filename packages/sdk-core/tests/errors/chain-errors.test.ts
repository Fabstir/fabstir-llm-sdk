// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  UnsupportedChainError,
  ChainMismatchError,
  InsufficientDepositError,
  NodeChainMismatchError,
  DepositAccountNotAvailableError
} from '../../src/errors/ChainErrors';

describe('Chain-Aware Error System', () => {
  describe('UnsupportedChainError', () => {
    it('should create error with chain ID and supported chains', () => {
      const error = new UnsupportedChainError(999999, [84532, 5611]);

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('UnsupportedChainError');
      expect(error.chainId).toBe(999999);
      expect(error.supportedChains).toEqual([84532, 5611]);
      expect(error.message).toContain('999999');
      expect(error.message).toContain('84532');
      expect(error.message).toContain('5611');
    });

    it('should include chain ID in error message', () => {
      const error = new UnsupportedChainError(1337, [84532]);
      expect(error.message).toContain('Chain ID 1337 is not supported');
    });

    it('should list supported chains in message', () => {
      const error = new UnsupportedChainError(1, [84532, 5611]);
      expect(error.message).toContain('Supported chains: 84532, 5611');
    });

    it('should have proper error structure', () => {
      const error = new UnsupportedChainError(42, [1, 2, 3]);
      expect(error.chainId).toBe(42);
      expect(error.supportedChains).toEqual([1, 2, 3]);
      expect(error.name).toBe('UnsupportedChainError');
    });
  });

  describe('ChainMismatchError', () => {
    it('should create error with expected and actual chain IDs', () => {
      const error = new ChainMismatchError(84532, 5611, 'createSession');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ChainMismatchError');
      expect(error.expectedChainId).toBe(84532);
      expect(error.actualChainId).toBe(5611);
      expect(error.operation).toBe('createSession');
    });

    it('should include both chain IDs in message', () => {
      const error = new ChainMismatchError(84532, 5611, 'sendTransaction');
      expect(error.message).toContain('84532');
      expect(error.message).toContain('5611');
    });

    it('should include operation in message', () => {
      const error = new ChainMismatchError(1, 2, 'deployContract');
      expect(error.message).toContain('deployContract');
    });

    it('should format message correctly', () => {
      const error = new ChainMismatchError(84532, 5611, 'submitProof');
      expect(error.message).toBe(
        'Chain mismatch during submitProof: expected chain 84532 but connected to chain 5611'
      );
    });
  });

  describe('InsufficientDepositError', () => {
    it('should create error with required and available amounts', () => {
      const error = new InsufficientDepositError('0.001', '0.0005', 84532);

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('InsufficientDepositError');
      expect(error.required).toBe('0.001');
      expect(error.available).toBe('0.0005');
      expect(error.chainId).toBe(84532);
    });

    it('should include amounts in message', () => {
      const error = new InsufficientDepositError('1.5', '0.5', 84532);
      expect(error.message).toContain('1.5');
      expect(error.message).toContain('0.5');
    });

    it('should include chain ID in message', () => {
      const error = new InsufficientDepositError('100', '50', 5611);
      expect(error.message).toContain('chain 5611');
    });

    it('should format message correctly', () => {
      const error = new InsufficientDepositError('0.002', '0.001', 84532);
      expect(error.message).toBe(
        'Insufficient deposit on chain 84532: required 0.002 but only 0.001 available'
      );
    });

    it('should handle large amounts', () => {
      const error = new InsufficientDepositError('1000000', '999', 1);
      expect(error.required).toBe('1000000');
      expect(error.available).toBe('999');
    });
  });

  describe('NodeChainMismatchError', () => {
    it('should create error with node and SDK chain IDs', () => {
      const error = new NodeChainMismatchError(5611, 84532);

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('NodeChainMismatchError');
      expect(error.nodeChainId).toBe(5611);
      expect(error.sdkChainId).toBe(84532);
    });

    it('should include both chain IDs in message', () => {
      const error = new NodeChainMismatchError(1, 2);
      expect(error.message).toContain('1');
      expect(error.message).toContain('2');
    });

    it('should format message correctly', () => {
      const error = new NodeChainMismatchError(5611, 84532);
      expect(error.message).toBe(
        'Node is on chain 5611 but SDK is configured for chain 84532'
      );
    });

    it('should indicate communication error', () => {
      const error = new NodeChainMismatchError(100, 200);
      expect(error.message).toContain('Node is on chain');
      expect(error.message).toContain('SDK is configured for chain');
    });
  });

  describe('DepositAccountNotAvailableError', () => {
    it('should create error with wallet type', () => {
      const error = new DepositAccountNotAvailableError('MetaMask');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('DepositAccountNotAvailableError');
      expect(error.walletType).toBe('MetaMask');
    });

    it('should include wallet type in message', () => {
      const error = new DepositAccountNotAvailableError('Rainbow');
      expect(error.message).toContain('Rainbow');
    });

    it('should format message correctly', () => {
      const error = new DepositAccountNotAvailableError('EOA');
      expect(error.message).toBe(
        'Deposit account not available for wallet type: EOA'
      );
    });

    it('should handle various wallet types', () => {
      const walletTypes = ['MetaMask', 'WalletConnect', 'Coinbase', 'Trust'];

      walletTypes.forEach(type => {
        const error = new DepositAccountNotAvailableError(type);
        expect(error.walletType).toBe(type);
        expect(error.message).toContain(type);
      });
    });
  });

  describe('Error Inheritance', () => {
    it('all errors should extend base Error class', () => {
      const errors = [
        new UnsupportedChainError(1, [2]),
        new ChainMismatchError(1, 2, 'test'),
        new InsufficientDepositError('1', '0', 1),
        new NodeChainMismatchError(1, 2),
        new DepositAccountNotAvailableError('test')
      ];

      errors.forEach(error => {
        expect(error).toBeInstanceOf(Error);
        expect(error.stack).toBeDefined();
        expect(error.toString()).toContain(error.name);
      });
    });

    it('errors should be throwable and catchable', () => {
      expect(() => {
        throw new UnsupportedChainError(1, [2]);
      }).toThrow(UnsupportedChainError);

      expect(() => {
        throw new ChainMismatchError(1, 2, 'test');
      }).toThrow(ChainMismatchError);

      expect(() => {
        throw new InsufficientDepositError('1', '0', 1);
      }).toThrow(InsufficientDepositError);
    });

    it('errors should have unique names', () => {
      const names = new Set([
        new UnsupportedChainError(1, [2]).name,
        new ChainMismatchError(1, 2, 'test').name,
        new InsufficientDepositError('1', '0', 1).name,
        new NodeChainMismatchError(1, 2).name,
        new DepositAccountNotAvailableError('test').name
      ]);

      expect(names.size).toBe(5);
    });
  });

  describe('Error Properties', () => {
    it('UnsupportedChainError should expose properties', () => {
      const error = new UnsupportedChainError(42, [1, 2, 3]);
      expect(error.chainId).toBe(42);
      expect(error.supportedChains).toEqual([1, 2, 3]);
    });

    it('ChainMismatchError should expose properties', () => {
      const error = new ChainMismatchError(100, 200, 'operation');
      expect(error.expectedChainId).toBe(100);
      expect(error.actualChainId).toBe(200);
      expect(error.operation).toBe('operation');
    });

    it('InsufficientDepositError should expose properties', () => {
      const error = new InsufficientDepositError('10', '5', 123);
      expect(error.required).toBe('10');
      expect(error.available).toBe('5');
      expect(error.chainId).toBe(123);
    });

    it('NodeChainMismatchError should expose properties', () => {
      const error = new NodeChainMismatchError(111, 222);
      expect(error.nodeChainId).toBe(111);
      expect(error.sdkChainId).toBe(222);
    });

    it('DepositAccountNotAvailableError should expose properties', () => {
      const error = new DepositAccountNotAvailableError('WalletType');
      expect(error.walletType).toBe('WalletType');
    });
  });
});