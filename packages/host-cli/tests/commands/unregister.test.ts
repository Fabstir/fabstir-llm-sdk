import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { registerUnregisterCommand } from '../../src/commands/unregister';

// Mock ethers
vi.mock('ethers', () => ({
  ethers: {
    Wallet: vi.fn(),
    JsonRpcProvider: vi.fn(),
    Contract: vi.fn(),
    formatUnits: vi.fn((value) => '2000'),
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
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

describe('Unregister Command', () => {
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
      unregisterNode: vi.fn(),
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
    it('should register unregister command', () => {
      registerUnregisterCommand(program);
      const command = program.commands.find(cmd => cmd.name() === 'unregister');

      expect(command).toBeDefined();
      expect(command?.description()).toContain('Unregister as a host node');
    });

    it('should have correct options', () => {
      registerUnregisterCommand(program);
      const command = program.commands.find(cmd => cmd.name() === 'unregister');

      const options = command?.options;
      expect(options).toBeDefined();

      const privateKeyOption = options?.find(opt => opt.flags === '-k, --private-key <key>');
      expect(privateKeyOption).toBeDefined();

      const rpcUrlOption = options?.find(opt => opt.flags === '-r, --rpc-url <url>');
      expect(rpcUrlOption).toBeDefined();
    });
  });

  describe('Registration Status Check', () => {
    it('should check if node is registered before attempting unregister', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: ethers.parseUnits('2000', 18),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);

      registerUnregisterCommand(program);

      // Execute with private key
      await program.parseAsync(['node', 'unregister', '-k', '0xTestKey']);

      expect(mockContract.nodes).toHaveBeenCalledWith('0xTestAddress');
    });

    it('should exit if node is not registered', async () => {
      const nodeInfo = {
        active: false,
        stakedAmount: 0n,
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);

      registerUnregisterCommand(program);

      await program.parseAsync(['node', 'unregister', '-k', '0xTestKey']);

      expect(mockContract.unregisterNode).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Node is not currently registered')
      );
    });
  });

  describe('Unregistration Process', () => {
    it('should submit unregister transaction when node is active', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: ethers.parseUnits('2000', 18),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);

      const mockTx = {
        hash: '0xTransactionHash',
        wait: vi.fn().mockResolvedValue({
          status: 1,
          hash: '0xTransactionHash',
        }),
      };
      mockContract.unregisterNode.mockResolvedValue(mockTx);

      registerUnregisterCommand(program);

      await program.parseAsync(['node', 'unregister', '-k', '0xTestKey']);

      expect(mockContract.unregisterNode).toHaveBeenCalled();
      expect(mockTx.wait).toHaveBeenCalledWith(3);
    });

    it('should display success message after successful unregistration', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: ethers.parseUnits('2000', 18),
      };
      mockContract.nodes
        .mockResolvedValueOnce(nodeInfo) // First check
        .mockResolvedValueOnce({ active: false, stakedAmount: 0n }); // After unregister

      const mockTx = {
        hash: '0xTransactionHash',
        wait: vi.fn().mockResolvedValue({
          status: 1,
          hash: '0xTransactionHash',
        }),
      };
      mockContract.unregisterNode.mockResolvedValue(mockTx);

      registerUnregisterCommand(program);

      await program.parseAsync(['node', 'unregister', '-k', '0xTestKey']);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Successfully unregistered')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Recovered 2000 FAB tokens')
      );
    });
  });

  describe('Wallet Loading', () => {
    it('should use private key when provided', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: ethers.parseUnits('2000', 18),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);

      registerUnregisterCommand(program);

      await program.parseAsync(['node', 'unregister', '-k', '0xPrivateKey']);

      expect(ethers.Wallet).toHaveBeenCalledWith('0xPrivateKey');
    });

    it('should load wallet from file when no private key provided', async () => {
      const walletData = { privateKey: '0xFilePrivateKey' };
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(JSON.stringify(walletData));

      const nodeInfo = {
        active: true,
        stakedAmount: ethers.parseUnits('2000', 18),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);

      registerUnregisterCommand(program);

      await program.parseAsync(['node', 'unregister']);

      expect(fs.existsSync).toHaveBeenCalledWith(
        path.join(os.homedir(), '.fabstir', 'wallet.json')
      );
      expect(ethers.Wallet).toHaveBeenCalledWith('0xFilePrivateKey');
    });

    it('should show error if no wallet file and no private key', async () => {
      (fs.existsSync as any).mockReturnValue(false);

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerUnregisterCommand(program);

      try {
        await program.parseAsync(['node', 'unregister']);
      } catch (e) {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('No wallet file found')
      );

      processExitSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle transaction failure', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: ethers.parseUnits('2000', 18),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);

      const mockTx = {
        hash: '0xTransactionHash',
        wait: vi.fn().mockResolvedValue({
          status: 0, // Failed transaction
          hash: '0xTransactionHash',
        }),
      };
      mockContract.unregisterNode.mockResolvedValue(mockTx);

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerUnregisterCommand(program);

      try {
        await program.parseAsync(['node', 'unregister', '-k', '0xTestKey']);
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
        stakedAmount: ethers.parseUnits('2000', 18),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);
      mockContract.unregisterNode.mockRejectedValue(new Error('execution reverted'));

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerUnregisterCommand(program);

      try {
        await program.parseAsync(['node', 'unregister', '-k', '0xTestKey']);
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