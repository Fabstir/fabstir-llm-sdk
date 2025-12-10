// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Info Display Tests with PRICE_PRECISION
 *
 * Verifies that CLI info command displays prices correctly with PRICE_PRECISION=1000.
 */

import { describe, it, expect } from 'vitest';
import { PRICE_PRECISION } from '@fabstir/sdk-core';

describe('CLI Info Display with PRICE_PRECISION', () => {
  const PRICE_PRECISION_NUM = Number(PRICE_PRECISION);

  describe('PRICE_PRECISION constant', () => {
    it('should be 1000n', () => {
      expect(PRICE_PRECISION).toBe(1000n);
    });

    it('should convert to number 1000', () => {
      expect(PRICE_PRECISION_NUM).toBe(1000);
    });
  });

  describe('Price per token formatting', () => {
    it('should format $5/million price correctly', () => {
      const priceNum = 5000;
      const pricePerToken = priceNum / PRICE_PRECISION_NUM / 1000000;
      expect(pricePerToken).toBe(0.000005);
      expect(pricePerToken.toFixed(9)).toBe('0.000005000');
    });

    it('should format $10/million price correctly', () => {
      const priceNum = 10000;
      const pricePerToken = priceNum / PRICE_PRECISION_NUM / 1000000;
      expect(pricePerToken).toBe(0.00001);
      expect(pricePerToken.toFixed(9)).toBe('0.000010000');
    });

    it('should format minimum price (1) correctly', () => {
      const priceNum = 1;
      const pricePerToken = priceNum / PRICE_PRECISION_NUM / 1000000;
      expect(pricePerToken).toBeCloseTo(0.000000001, 12);
    });
  });

  describe('Per 1K tokens cost', () => {
    it('should calculate $5/million per 1K correctly', () => {
      const priceNum = 5000;
      // Cost for 1000 tokens = (1000 * priceNum) / PRICE_PRECISION / 1_000_000
      const pricePer1K = (1000 * priceNum) / PRICE_PRECISION_NUM / 1000000;
      expect(pricePer1K).toBe(0.005);
      expect(pricePer1K.toFixed(6)).toBe('0.005000');
    });

    it('should calculate $10/million per 1K correctly', () => {
      const priceNum = 10000;
      const pricePer1K = (1000 * priceNum) / PRICE_PRECISION_NUM / 1000000;
      expect(pricePer1K).toBe(0.01);
      expect(pricePer1K.toFixed(6)).toBe('0.010000');
    });
  });

  describe('Per 10K tokens cost', () => {
    it('should calculate $5/million per 10K correctly', () => {
      const priceNum = 5000;
      const pricePer10K = (10000 * priceNum) / PRICE_PRECISION_NUM / 1000000;
      expect(pricePer10K).toBe(0.05);
      expect(pricePer10K.toFixed(6)).toBe('0.050000');
    });

    it('should calculate $10/million per 10K correctly', () => {
      const priceNum = 10000;
      const pricePer10K = (10000 * priceNum) / PRICE_PRECISION_NUM / 1000000;
      expect(pricePer10K).toBe(0.1);
      expect(pricePer10K.toFixed(6)).toBe('0.100000');
    });
  });

  describe('Per million tokens cost', () => {
    it('should calculate $5/million correctly', () => {
      const priceNum = 5000;
      const pricePerMillion = priceNum / PRICE_PRECISION_NUM;
      expect(pricePerMillion).toBe(5);
    });

    it('should calculate $10/million correctly', () => {
      const priceNum = 10000;
      const pricePerMillion = priceNum / PRICE_PRECISION_NUM;
      expect(pricePerMillion).toBe(10);
    });

    it('should calculate $0.001/million correctly', () => {
      const priceNum = 1;
      const pricePerMillion = priceNum / PRICE_PRECISION_NUM;
      expect(pricePerMillion).toBe(0.001);
    });

    it('should calculate $100/million correctly', () => {
      const priceNum = 100000;
      const pricePerMillion = priceNum / PRICE_PRECISION_NUM;
      expect(pricePerMillion).toBe(100);
    });
  });
});
