// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerUpdateMetadataCommand } from '../../src/commands/update-metadata';
import * as walletUtils from '../../src/utils/wallet';
import { ethers } from 'ethers';

vi.mock('../../src/utils/wallet');
vi.mock('fs');

describe('Update Metadata Command', () => {
  let program: Command;
  let mockWallet: any;
  let mockProvider: any;
  let mockNodeRegistry: any;

  beforeEach(() => {
    vi.resetAllMocks();
    program = new Command();

    // Mock wallet
    mockWallet = {
      connect: vi.fn().mockReturnThis(),
      getAddress: vi.fn().mockResolvedValue('0xTestAddress')
    };

    // Mock provider
    mockProvider = new ethers.JsonRpcProvider();

    // Mock NodeRegistry contract
    mockNodeRegistry = {
      nodes: vi.fn(),
      updateMetadata: vi.fn(),
      address: '0xNodeRegistry'
    };

    vi.mocked(walletUtils.getWallet).mockResolvedValue(mockWallet);

    // Mock ethers.Contract
    vi.spyOn(ethers, 'Contract').mockReturnValue(mockNodeRegistry);
  });

  it('should register update-metadata command', () => {
    registerUpdateMetadataCommand(program);
    const command = program.commands.find(cmd => cmd.name() === 'update-metadata');
    expect(command).toBeDefined();
    expect(command?.description()).toContain('metadata');
  });

  it('should accept JSON file input', async () => {
    const fs = await import('fs');
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
      name: 'Test Host',
      description: 'Test description'
    }));

    mockNodeRegistry.nodes.mockResolvedValue({
      active: true,
      metadata: '{}',
      apiUrl: 'http://test.com',
      stakedAmount: ethers.parseUnits('1000', 18)
    });

    const tx = { hash: '0xTxHash', wait: vi.fn().mockResolvedValue({ status: 1, hash: '0xTxHash' }) };
    mockNodeRegistry.updateMetadata.mockResolvedValue(tx);

    registerUpdateMetadataCommand(program);

    await program.parseAsync(['node', 'test', 'update-metadata', '-f', 'metadata.json', '-k', '0xPrivateKey']);

    expect(mockNodeRegistry.updateMetadata).toHaveBeenCalled();
  });

  it('should accept inline JSON string', async () => {
    mockNodeRegistry.nodes.mockResolvedValue({
      active: true,
      metadata: '{}',
      apiUrl: 'http://test.com',
      stakedAmount: ethers.parseUnits('1000', 18)
    });

    const tx = { hash: '0xTxHash', wait: vi.fn().mockResolvedValue({ status: 1, hash: '0xTxHash' }) };
    mockNodeRegistry.updateMetadata.mockResolvedValue(tx);

    registerUpdateMetadataCommand(program);

    const jsonStr = JSON.stringify({ name: 'Test', description: 'Desc' });
    await program.parseAsync(['node', 'test', 'update-metadata', '-j', jsonStr, '-k', '0xPrivateKey']);

    expect(mockNodeRegistry.updateMetadata).toHaveBeenCalledWith(jsonStr);
  });

  it('should validate metadata size limit', async () => {
    const largeMetadata = { data: 'x'.repeat(11000) }; // Over 10KB limit

    registerUpdateMetadataCommand(program);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await program.parseAsync(['node', 'test', 'update-metadata', '-j', JSON.stringify(largeMetadata), '-k', '0xKey']);
    } catch (e) {
      // Expected to throw
    }

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('exceeds maximum size'));
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('should validate required fields', async () => {
    const invalidMetadata = { random: 'field' }; // Missing required fields

    registerUpdateMetadataCommand(program);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await program.parseAsync(['node', 'test', 'update-metadata', '-j', JSON.stringify(invalidMetadata), '-k', '0xKey']);
    } catch (e) {
      // Expected to throw
    }

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('required field'));
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('should show current metadata before update', async () => {
    const currentMetadata = { name: 'Old Name', description: 'Old Desc' };

    mockNodeRegistry.nodes.mockResolvedValue({
      active: true,
      metadata: JSON.stringify(currentMetadata),
      apiUrl: 'http://test.com',
      stakedAmount: ethers.parseUnits('1000', 18)
    });

    const tx = { hash: '0xTxHash', wait: vi.fn().mockResolvedValue({ status: 1, hash: '0xTxHash' }) };
    mockNodeRegistry.updateMetadata.mockResolvedValue(tx);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    registerUpdateMetadataCommand(program);

    await program.parseAsync(['node', 'test', 'update-metadata', '-j', '{"name":"New","description":"New Desc"}', '-k', '0xKey']);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Current metadata:'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Old Name'));
    consoleSpy.mockRestore();
  });

  it('should handle merge strategy', async () => {
    const currentMetadata = { name: 'Host', description: 'Desc', extra: 'field' };
    const updateMetadata = { name: 'New Host' }; // Only update name

    mockNodeRegistry.nodes.mockResolvedValue({
      active: true,
      metadata: JSON.stringify(currentMetadata),
      apiUrl: 'http://test.com',
      stakedAmount: ethers.parseUnits('1000', 18)
    });

    const tx = { hash: '0xTxHash', wait: vi.fn().mockResolvedValue({ status: 1, hash: '0xTxHash' }) };
    mockNodeRegistry.updateMetadata.mockResolvedValue(tx);

    registerUpdateMetadataCommand(program);

    await program.parseAsync(['node', 'test', 'update-metadata', '-j', JSON.stringify(updateMetadata), '--merge', '-k', '0xKey']);

    // Should merge, keeping existing fields
    expect(mockNodeRegistry.updateMetadata).toHaveBeenCalledWith(
      expect.stringContaining('"description":"Desc"')
    );
    expect(mockNodeRegistry.updateMetadata).toHaveBeenCalledWith(
      expect.stringContaining('"extra":"field"')
    );
  });

  it('should use template when specified', async () => {
    mockNodeRegistry.nodes.mockResolvedValue({
      active: true,
      metadata: '{}',
      apiUrl: 'http://test.com',
      stakedAmount: ethers.parseUnits('1000', 18)
    });

    const tx = { hash: '0xTxHash', wait: vi.fn().mockResolvedValue({ status: 1, hash: '0xTxHash' }) };
    mockNodeRegistry.updateMetadata.mockResolvedValue(tx);

    registerUpdateMetadataCommand(program);

    await program.parseAsync(['node', 'test', 'update-metadata', '-t', 'basic', '-k', '0xKey']);

    // Should use template
    expect(mockNodeRegistry.updateMetadata).toHaveBeenCalledWith(
      expect.stringContaining('"name"')
    );
  });

  it('should handle unregistered host error', async () => {
    mockNodeRegistry.nodes.mockResolvedValue({
      active: false,
      metadata: '{}',
      apiUrl: '',
      stakedAmount: 0n
    });

    registerUpdateMetadataCommand(program);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await program.parseAsync(['node', 'test', 'update-metadata', '-j', '{"name":"Test"}', '-k', '0xKey']);
    } catch (e) {
      // Expected to throw
    }

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not registered'));
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('should confirm transaction on-chain', async () => {
    mockNodeRegistry.nodes.mockResolvedValue({
      active: true,
      metadata: '{}',
      apiUrl: 'http://test.com',
      stakedAmount: ethers.parseUnits('1000', 18)
    });

    const tx = {
      hash: '0xTxHash',
      wait: vi.fn().mockResolvedValue({
        status: 1,
        hash: '0xTxHash'
      })
    };
    mockNodeRegistry.updateMetadata.mockResolvedValue(tx);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    registerUpdateMetadataCommand(program);

    await program.parseAsync(['node', 'test', 'update-metadata', '-j', '{"name":"Test","description":"Desc"}', '-k', '0xKey']);

    expect(tx.wait).toHaveBeenCalledWith(3);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully updated metadata'));
    consoleSpy.mockRestore();
  });
});