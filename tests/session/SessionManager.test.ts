import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers, utils } from 'ethers';
import { SessionManager } from '../../packages/sdk-client/src/session/SessionManager';
import type { SessionParams } from '../../packages/sdk-client/src/session/types';

describe('SessionManager', () => {
  let mockSigner: any;
  let mockContract: any;
  
  beforeEach(() => {
    // Create mock signer
    mockSigner = {
      getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
      provider: {}
    };
    
    // We'll mock the contract in SessionManager
  });

  it('creates session manager with signer and contract address', async () => {
    const manager = new SessionManager(mockSigner, '0x445882e14b22E921c7d4Fe32a7736a32197578AF');
    expect(manager).toBeDefined();
    // Should load ABI and create contract instance
  });

  it('creates session with valid parameters', async () => {
    const manager = new SessionManager(mockSigner, '0x445882e14b22E921c7d4Fe32a7736a32197578AF');
    const params: SessionParams = {
      hostAddress: '0xHost1234567890123456789012345678901234567890',
      depositAmount: utils.parseEther('0.1').toString(),
      pricePerToken: '1000000000000', // 0.000001 ETH per token
      maxDuration: 3600 // 1 hour
    };
    
    // Mock the contract call
    const result = await manager.createSession(params);
    expect(result.jobId).toBeDefined();
    expect(result.status).toBe('Active');
  });

  it('rejects session creation with invalid deposit', async () => {
    const manager = new SessionManager(mockSigner, '0x445882e14b22E921c7d4Fe32a7736a32197578AF');
    const params: SessionParams = {
      hostAddress: '0xHost1234567890123456789012345678901234567890',
      depositAmount: '0', // Invalid
      pricePerToken: '1000000000000',
      maxDuration: 3600
    };
    
    await expect(manager.createSession(params)).rejects.toThrow('Invalid deposit amount');
  });

  it('completes session with token count', async () => {
    const manager = new SessionManager(mockSigner, '0x445882e14b22E921c7d4Fe32a7736a32197578AF');
    const receipt = await manager.completeSession(1, 1500);
    expect(receipt.transactionHash).toBeDefined();
  });

  it('gets session status for valid job ID', async () => {
    const manager = new SessionManager(mockSigner, '0x445882e14b22E921c7d4Fe32a7736a32197578AF');
    const status = await manager.getSessionStatus(1);
    expect(status.status).toBeDefined();
    expect(status.provenTokens).toBeGreaterThanOrEqual(0);
  });

  it('handles timeout trigger correctly', async () => {
    const manager = new SessionManager(mockSigner, '0x445882e14b22E921c7d4Fe32a7736a32197578AF');
    const receipt = await manager.triggerTimeout(1);
    expect(receipt.transactionHash).toBeDefined();
  });

  it('emits correct events on state changes', async () => {
    const manager = new SessionManager(mockSigner, '0x445882e14b22E921c7d4Fe32a7736a32197578AF');
    const listener = vi.fn();
    
    manager.on('session:created', listener);
    await manager.createSession({
      hostAddress: '0xHost1234567890123456789012345678901234567890',
      depositAmount: utils.parseEther('0.1').toString(),
      pricePerToken: '1000000000000',
      maxDuration: 3600
    });
    
    expect(listener).toHaveBeenCalled();
  });

  it('handles contract revert errors gracefully', async () => {
    const manager = new SessionManager(mockSigner, '0x445882e14b22E921c7d4Fe32a7736a32197578AF');
    // Force an error by using invalid job ID
    await expect(manager.getSessionStatus(999999)).rejects.toThrow();
  });
});