// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  SessionOptions,
  PaymentOptions,
  AuthResult,
  SDKError,
  SDKConfig
} from '../../src/types/index';

describe('Type Definitions', () => {
  it('should export SessionOptions interface', () => {
    const options: SessionOptions = {
      hostAddress: '0x123',
      paymentAmount: '0.001',
      pricePerToken: 1000,
      duration: 3600,
      proofInterval: 100
    };
    
    expect(options.hostAddress).toBe('0x123');
    expect(options.paymentAmount).toBe('0.001');
    expect(options.pricePerToken).toBe(1000);
    expect(options.duration).toBe(3600);
    expect(options.proofInterval).toBe(100);
  });

  it('should export PaymentOptions interface', () => {
    const ethPayment: PaymentOptions = {
      type: 'ETH',
      amount: '0.005',
      recipient: '0xabc'
    };
    
    const usdcPayment: PaymentOptions = {
      type: 'USDC',
      amount: '5.0',
      recipient: '0xdef'
    };
    
    expect(ethPayment.type).toBe('ETH');
    expect(usdcPayment.type).toBe('USDC');
  });

  it('should export AuthResult interface', () => {
    const authResult: AuthResult = {
      user: { address: '0x123' },
      signer: {} as any, // Mock signer
      s5Seed: 'test seed phrase here'
    };
    
    expect(authResult.user.address).toBe('0x123');
    expect(authResult.s5Seed).toBe('test seed phrase here');
  });

  it('should export SDKError interface', () => {
    const error: SDKError = {
      name: 'SDKError',
      message: 'Test error',
      code: 'TEST_ERROR',
      details: { info: 'additional details' }
    };
    
    expect(error.code).toBe('TEST_ERROR');
    expect(error.details.info).toBe('additional details');
  });

  it('should export SDKConfig interface', () => {
    const config: SDKConfig = {
      rpcUrl: 'http://localhost:8545',
      s5PortalUrl: 'https://s5.ninja',
      contractAddresses: {
        jobMarketplace: '0x123',
        nodeRegistry: '0x456',
        fabToken: '0x789',
        usdcToken: '0xabc'
      }
    };
    
    expect(config.rpcUrl).toBe('http://localhost:8545');
    expect(config.s5PortalUrl).toBe('https://s5.ninja');
    expect(config.contractAddresses?.jobMarketplace).toBe('0x123');
  });
});