// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { ethers } from 'ethers';
import * as fs from 'fs';
import { registerAddStakeCommand } from '../../src/commands/add-stake';

// Mock ethers
vi.mock('ethers', () => ({
  ethers: {
    Wallet: vi.fn(),
    JsonRpcProvider: vi.fn(),
    Contract: vi.fn(),
    formatUnits: vi.fn((value) => '1000'),
    parseUnits: vi.fn((value, decimals) => BigInt(value) * BigInt(10 ** decimals)),
  }
}));

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    blue: (str: string) => str,
    green: (str: string) => str,
    red: (str: string) => str,
    yellow: (str: string) => str,
    cyan: (str: string) => str,
    bold: (str: string) => str,
  }
}));

describe('Add Stake Command', () => {
  let program: Command;
  let mockWallet: any;
  let mockProvider: any;
  let mockSigner: any;
  let mockNodeRegistry: any;
  let mockFabToken: any;
  let consoleSpy: any;

  beforeEach(() => {
    program = new Command();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Setup mock wallet
    mockWallet = {
      connect: vi.fn().mockReturnThis(),
      getAddress: vi.fn().mockResolvedValue('0xTestAddress'),
    };

    // Setup mock provider
    mockProvider = {};

    // Setup mock signer
    mockSigner = {
      getAddress: vi.fn().mockResolvedValue('0xTestAddress'),
    };

    // Setup mock contracts
    mockNodeRegistry = {
      nodes: vi.fn(),
      stake: vi.fn(),
    };

    mockFabToken = {
      balanceOf: vi.fn(),
      approve: vi.fn(),
      allowance: vi.fn(),
    };

    // Configure mocks
    (ethers.Wallet as any).mockImplementation(() => mockWallet);
    (ethers.JsonRpcProvider as any).mockImplementation(() => mockProvider);
    (ethers.Contract as any).mockImplementation((address: string, abi: any) => {
      if (abi.length < 10) { // ERC20 ABI is smaller
        return mockFabToken;
      }
      return mockNodeRegistry;
    });
    mockWallet.connect.mockReturnValue(mockSigner);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Command Registration', () => {
    it('should register add-stake command', () => {
      registerAddStakeCommand(program);
      const command = program.commands.find(cmd => cmd.name() === 'add-stake');

      expect(command).toBeDefined();
      expect(command?.description()).toContain('Add additional stake');
    });

    it('should have correct options', () => {
      registerAddStakeCommand(program);
      const command = program.commands.find(cmd => cmd.name() === 'add-stake');

      const options = command?.options;
      expect(options).toBeDefined();

      const privateKeyOption = options?.find(opt => opt.flags === '-k, --private-key <key>');
      expect(privateKeyOption).toBeDefined();

      const skipApprovalOption = options?.find(opt => opt.flags === '--skip-approval');
      expect(skipApprovalOption).toBeDefined();
    });

    it('should require amount argument', () => {
      registerAddStakeCommand(program);
      const command = program.commands.find(cmd => cmd.name() === 'add-stake');

      expect(command?._args).toBeDefined();
      expect(command?._args[0].name()).toBe('amount');
      expect(command?._args[0].required).toBe(true);
    });
  });

  describe('Registration Check', () => {
    it('should check if node is registered before adding stake', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'), // 1000 FAB
      };
      mockNodeRegistry.nodes.mockResolvedValue(nodeInfo);
      mockFabToken.balanceOf.mockResolvedValue(BigInt('5000000000000000000000')); // 5000 FAB
      mockFabToken.allowance.mockResolvedValue(BigInt('10000000000000000000000')); // Enough allowance

      const mockTx = {
        hash: '0xTransactionHash',
        wait: vi.fn().mockResolvedValue({
          status: 1,
          hash: '0xTransactionHash',
        }),
      };
      mockNodeRegistry.stake.mockResolvedValue(mockTx);

      registerAddStakeCommand(program);
      await program.parseAsync(['node', 'add-stake', '500', '-k', '0xTestKey']);

      expect(mockNodeRegistry.nodes).toHaveBeenCalledWith('0xTestAddress');
    });

    it('should fail if node is not registered', async () => {
      const nodeInfo = {
        active: false,
        stakedAmount: BigInt(0),
      };
      mockNodeRegistry.nodes.mockResolvedValue(nodeInfo);

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerAddStakeCommand(program);

      try {
        await program.parseAsync(['node', 'add-stake', '500', '-k', '0xTestKey']);
      } catch (e) {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('not registered')
      );
      expect(mockNodeRegistry.stake).not.toHaveBeenCalled();

      processExitSpy.mockRestore();
    });
  });

  describe('Balance Checks', () => {
    it('should check FAB balance before staking', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'),
      };
      mockNodeRegistry.nodes.mockResolvedValue(nodeInfo);
      mockFabToken.balanceOf.mockResolvedValue(BigInt('100000000000000000000')); // 100 FAB

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerAddStakeCommand(program);

      try {
        await program.parseAsync(['node', 'add-stake', '500', '-k', '0xTestKey']); // Trying to stake 500
      } catch (e) {
        // Expected to throw
      }

      expect(mockFabToken.balanceOf).toHaveBeenCalledWith('0xTestAddress');
      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Insufficient FAB balance')
      );

      processExitSpy.mockRestore();
    });

    it('should display current and new stake amounts', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'), // 1000 FAB
      };
      mockNodeRegistry.nodes.mockResolvedValue(nodeInfo);
      mockFabToken.balanceOf.mockResolvedValue(BigInt('5000000000000000000000')); // 5000 FAB
      mockFabToken.allowance.mockResolvedValue(BigInt('10000000000000000000000'));

      const mockTx = {
        hash: '0xTransactionHash',
        wait: vi.fn().mockResolvedValue({
          status: 1,
          hash: '0xTransactionHash',
        }),
      };
      mockNodeRegistry.stake.mockResolvedValue(mockTx);

      registerAddStakeCommand(program);
      await program.parseAsync(['node', 'add-stake', '500', '-k', '0xTestKey']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Current stake: 1000 FAB'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Adding: 500 FAB'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('New total: 1500 FAB'));
    });
  });

  describe('Token Approval', () => {
    it('should handle token approval if needed', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'),
      };
      mockNodeRegistry.nodes.mockResolvedValue(nodeInfo);
      mockFabToken.balanceOf.mockResolvedValue(BigInt('5000000000000000000000'));
      mockFabToken.allowance.mockResolvedValue(BigInt(0)); // No allowance

      const approveTx = {
        hash: '0xApprovalHash',
        wait: vi.fn().mockResolvedValue({
          status: 1,
          hash: '0xApprovalHash',
        }),
      };
      mockFabToken.approve.mockResolvedValue(approveTx);

      const stakeTx = {
        hash: '0xStakeHash',
        wait: vi.fn().mockResolvedValue({
          status: 1,
          hash: '0xStakeHash',
        }),
      };
      mockNodeRegistry.stake.mockResolvedValue(stakeTx);

      registerAddStakeCommand(program);
      await program.parseAsync(['node', 'add-stake', '500', '-k', '0xTestKey']);

      expect(mockFabToken.approve).toHaveBeenCalled();
      expect(approveTx.wait).toHaveBeenCalledWith(3);
      expect(mockNodeRegistry.stake).toHaveBeenCalled();
    });

    it('should skip approval if sufficient allowance exists', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'),
      };
      mockNodeRegistry.nodes.mockResolvedValue(nodeInfo);
      mockFabToken.balanceOf.mockResolvedValue(BigInt('5000000000000000000000'));
      mockFabToken.allowance.mockResolvedValue(BigInt('10000000000000000000000')); // Sufficient

      const stakeTx = {
        hash: '0xStakeHash',
        wait: vi.fn().mockResolvedValue({
          status: 1,
          hash: '0xStakeHash',
        }),
      };
      mockNodeRegistry.stake.mockResolvedValue(stakeTx);

      registerAddStakeCommand(program);
      await program.parseAsync(['node', 'add-stake', '500', '-k', '0xTestKey']);

      expect(mockFabToken.approve).not.toHaveBeenCalled();
      expect(mockNodeRegistry.stake).toHaveBeenCalled();
    });

    it('should respect --skip-approval flag', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'),
      };
      mockNodeRegistry.nodes.mockResolvedValue(nodeInfo);
      mockFabToken.balanceOf.mockResolvedValue(BigInt('5000000000000000000000'));
      mockFabToken.allowance.mockResolvedValue(BigInt(0)); // No allowance

      const stakeTx = {
        hash: '0xStakeHash',
        wait: vi.fn().mockResolvedValue({
          status: 1,
          hash: '0xStakeHash',
        }),
      };
      mockNodeRegistry.stake.mockResolvedValue(stakeTx);

      registerAddStakeCommand(program);
      await program.parseAsync(['node', 'add-stake', '500', '-k', '0xTestKey', '--skip-approval']);

      expect(mockFabToken.approve).not.toHaveBeenCalled();
      expect(mockNodeRegistry.stake).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle stake transaction failure', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'),
      };
      mockNodeRegistry.nodes.mockResolvedValue(nodeInfo);
      mockFabToken.balanceOf.mockResolvedValue(BigInt('5000000000000000000000'));
      mockFabToken.allowance.mockResolvedValue(BigInt('10000000000000000000000'));

      const mockTx = {
        hash: '0xTransactionHash',
        wait: vi.fn().mockResolvedValue({
          status: 0, // Failed transaction
          hash: '0xTransactionHash',
        }),
      };
      mockNodeRegistry.stake.mockResolvedValue(mockTx);

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerAddStakeCommand(program);

      try {
        await program.parseAsync(['node', 'add-stake', '500', '-k', '0xTestKey']);
      } catch (e) {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Transaction failed')
      );

      processExitSpy.mockRestore();
    });

    it('should validate amount is positive', async () => {
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerAddStakeCommand(program);

      try {
        await program.parseAsync(['node', 'add-stake', '0', '-k', '0xTestKey']);
      } catch (e) {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('must be greater than 0')
      );

      processExitSpy.mockRestore();
    });

    it('should handle invalid amount format', async () => {
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerAddStakeCommand(program);

      try {
        await program.parseAsync(['node', 'add-stake', 'invalid', '-k', '0xTestKey']);
      } catch (e) {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Invalid amount')
      );

      processExitSpy.mockRestore();
    });
  });
});