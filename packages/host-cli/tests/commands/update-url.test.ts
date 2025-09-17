import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { ethers } from 'ethers';
import * as fs from 'fs';
import { registerUpdateUrlCommand } from '../../src/commands/update-url';

// Mock ethers
vi.mock('ethers', () => ({
  ethers: {
    Wallet: vi.fn(),
    JsonRpcProvider: vi.fn(),
    Contract: vi.fn(),
    formatUnits: vi.fn((value) => '1000'),
    isAddress: vi.fn((addr) => addr.startsWith('0x')),
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

describe('Update URL Command', () => {
  let program: Command;
  let mockWallet: any;
  let mockProvider: any;
  let mockSigner: any;
  let mockContract: any;
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

    // Setup mock contract
    mockContract = {
      nodes: vi.fn(),
      updateApiUrl: vi.fn(),
    };

    // Configure mocks
    (ethers.Wallet as any).mockImplementation(() => mockWallet);
    (ethers.JsonRpcProvider as any).mockImplementation(() => mockProvider);
    (ethers.Contract as any).mockImplementation(() => mockContract);
    mockWallet.connect.mockReturnValue(mockSigner);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Command Registration', () => {
    it('should register update-url command', () => {
      registerUpdateUrlCommand(program);
      const command = program.commands.find(cmd => cmd.name() === 'update-url');

      expect(command).toBeDefined();
      expect(command?.description()).toContain('Update the API URL');
    });

    it('should have correct options', () => {
      registerUpdateUrlCommand(program);
      const command = program.commands.find(cmd => cmd.name() === 'update-url');

      const options = command?.options;
      expect(options).toBeDefined();

      const privateKeyOption = options?.find(opt => opt.flags === '-k, --private-key <key>');
      expect(privateKeyOption).toBeDefined();

      const rpcUrlOption = options?.find(opt => opt.flags === '-r, --rpc-url <url>');
      expect(rpcUrlOption).toBeDefined();
    });

    it('should require URL argument', () => {
      registerUpdateUrlCommand(program);
      const command = program.commands.find(cmd => cmd.name() === 'update-url');

      expect(command?._args).toBeDefined();
      expect(command?._args.length).toBeGreaterThan(0);
      expect(command?._args[0].name()).toBe('url');
      expect(command?._args[0].required).toBe(true);
    });
  });

  describe('Registration Check', () => {
    it('should check if node is registered before updating', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);

      const mockTx = {
        hash: '0xTransactionHash',
        wait: vi.fn().mockResolvedValue({
          status: 1,
          hash: '0xTransactionHash',
        }),
      };
      mockContract.updateApiUrl.mockResolvedValue(mockTx);

      registerUpdateUrlCommand(program);
      await program.parseAsync(['node', 'update-url', 'https://new-api.example.com', '-k', '0xTestKey']);

      expect(mockContract.nodes).toHaveBeenCalledWith('0xTestAddress');
    });

    it('should fail if node is not registered', async () => {
      const nodeInfo = {
        active: false,
        stakedAmount: BigInt(0),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerUpdateUrlCommand(program);

      try {
        await program.parseAsync(['node', 'update-url', 'https://api.example.com', '-k', '0xTestKey']);
      } catch (e) {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('not registered')
      );
      expect(mockContract.updateApiUrl).not.toHaveBeenCalled();

      processExitSpy.mockRestore();
    });
  });

  describe('URL Update', () => {
    it('should update API URL successfully', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'),
        apiUrl: 'https://old-api.example.com',
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);

      const mockTx = {
        hash: '0xTransactionHash',
        wait: vi.fn().mockResolvedValue({
          status: 1,
          hash: '0xTransactionHash',
        }),
      };
      mockContract.updateApiUrl.mockResolvedValue(mockTx);

      registerUpdateUrlCommand(program);
      await program.parseAsync(['node', 'update-url', 'https://new-api.example.com', '-k', '0xTestKey']);

      expect(mockContract.updateApiUrl).toHaveBeenCalledWith('https://new-api.example.com');
      expect(mockTx.wait).toHaveBeenCalledWith(3);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully updated'));
    });

    it('should validate URL format', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerUpdateUrlCommand(program);

      try {
        await program.parseAsync(['node', 'update-url', 'invalid-url', '-k', '0xTestKey']);
      } catch (e) {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Invalid URL')
      );
      expect(mockContract.updateApiUrl).not.toHaveBeenCalled();

      processExitSpy.mockRestore();
    });

    it('should show old and new URLs', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'),
        apiUrl: 'https://old-api.example.com',
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);

      const mockTx = {
        hash: '0xTransactionHash',
        wait: vi.fn().mockResolvedValue({
          status: 1,
          hash: '0xTransactionHash',
        }),
      };
      mockContract.updateApiUrl.mockResolvedValue(mockTx);

      registerUpdateUrlCommand(program);
      await program.parseAsync(['node', 'update-url', 'https://new-api.example.com', '-k', '0xTestKey']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('https://old-api.example.com'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('https://new-api.example.com'));
    });
  });

  describe('Error Handling', () => {
    it('should handle transaction failure', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);

      const mockTx = {
        hash: '0xTransactionHash',
        wait: vi.fn().mockResolvedValue({
          status: 0, // Failed transaction
          hash: '0xTransactionHash',
        }),
      };
      mockContract.updateApiUrl.mockResolvedValue(mockTx);

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerUpdateUrlCommand(program);

      try {
        await program.parseAsync(['node', 'update-url', 'https://api.example.com', '-k', '0xTestKey']);
      } catch (e) {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Transaction failed')
      );

      processExitSpy.mockRestore();
    });

    it('should handle contract revert', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);
      mockContract.updateApiUrl.mockRejectedValue(new Error('execution reverted'));

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerUpdateUrlCommand(program);

      try {
        await program.parseAsync(['node', 'update-url', 'https://api.example.com', '-k', '0xTestKey']);
      } catch (e) {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('execution reverted')
      );

      processExitSpy.mockRestore();
    });
  });
});