// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for V2 Delegation Error Types
 *
 * February 2026 Contract Update: V2 Direct Payment Delegation
 * Custom error types for delegation-related contract errors.
 */

import { describe, it, expect } from 'vitest';
import {
  DELEGATION_ERRORS,
  parseDelegationError
} from '../../src/types/errors';

describe('Delegation Error Types (Feb 2026)', () => {
  describe('DELEGATION_ERRORS constants', () => {
    it('should export NOT_DELEGATE error constant', () => {
      expect(DELEGATION_ERRORS.NOT_DELEGATE).toBe('NotDelegate');
    });

    it('should export ERC20_ONLY error constant', () => {
      expect(DELEGATION_ERRORS.ERC20_ONLY).toBe('ERC20Only');
    });

    it('should export BAD_PARAMS error constant', () => {
      expect(DELEGATION_ERRORS.BAD_PARAMS).toBe('BadDelegateParams');
    });
  });

  describe('parseDelegationError()', () => {
    it('should parse NotDelegate error', () => {
      const error = { message: 'execution reverted: NotDelegate' };
      const result = parseDelegationError(error);
      expect(result).toBe('Caller not authorized as delegate for payer');
    });

    it('should parse ERC20Only error', () => {
      const error = { message: 'execution reverted: ERC20Only' };
      const result = parseDelegationError(error);
      expect(result).toBe('Direct delegation requires ERC-20 token (no ETH)');
    });

    it('should parse BadDelegateParams error', () => {
      const error = { message: 'execution reverted: BadDelegateParams' };
      const result = parseDelegationError(error);
      expect(result).toBe('Invalid delegation parameters');
    });

    it('should return null for unknown errors', () => {
      const error = { message: 'some other error' };
      const result = parseDelegationError(error);
      expect(result).toBeNull();
    });

    it('should handle undefined error message', () => {
      const error = {};
      const result = parseDelegationError(error);
      expect(result).toBeNull();
    });

    it('should handle null error', () => {
      const result = parseDelegationError(null);
      expect(result).toBeNull();
    });
  });
});
