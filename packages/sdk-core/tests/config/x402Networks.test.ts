// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import { chainIdToX402Network, x402NetworkToChainId } from '../../src/config/x402Networks';

describe('x402 Network Mapping', () => {
  describe('chainIdToX402Network', () => {
    it('maps 84532 to "base-sepolia"', () => {
      expect(chainIdToX402Network(84532)).toBe('base-sepolia');
    });

    it('maps 8453 to "base"', () => {
      expect(chainIdToX402Network(8453)).toBe('base');
    });

    it('maps 5611 to "opbnb-testnet"', () => {
      expect(chainIdToX402Network(5611)).toBe('opbnb-testnet');
    });

    it('throws for unknown chain ID', () => {
      expect(() => chainIdToX402Network(999999)).toThrow('Unknown chain ID for x402: 999999');
    });
  });

  describe('x402NetworkToChainId', () => {
    it('maps "base-sepolia" to 84532', () => {
      expect(x402NetworkToChainId('base-sepolia')).toBe(84532);
    });

    it('maps "base" to 8453', () => {
      expect(x402NetworkToChainId('base')).toBe(8453);
    });

    it('throws for unknown network string', () => {
      expect(() => x402NetworkToChainId('unknown-net')).toThrow('Unknown x402 network: unknown-net');
    });
  });
});
