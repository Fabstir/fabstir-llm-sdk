import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { ethers } from 'ethers';
import * as fs from 'fs';
import { registerUpdateModelsCommand } from '../../src/commands/update-models';

// Mock ethers
vi.mock('ethers', () => ({
  ethers: {
    Wallet: vi.fn(),
    JsonRpcProvider: vi.fn(),
    Contract: vi.fn(),
    formatUnits: vi.fn((value) => '1000'),
    zeroPadValue: vi.fn((val) => val),
    toBeHex: vi.fn((val) => '0x' + val.toString(16)),
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

describe('Update Models Command', () => {
  let program: Command;
  let mockWallet: any;
  let mockProvider: any;
  let mockSigner: any;
  let mockContract: any;
  let mockModelRegistry: any;
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
    mockContract = {
      nodes: vi.fn(),
      updateSupportedModels: vi.fn(),
      getNodeModels: vi.fn(),
    };

    mockModelRegistry = {
      isModelApproved: vi.fn(),
    };

    // Configure mocks
    (ethers.Wallet as any).mockImplementation(() => mockWallet);
    (ethers.JsonRpcProvider as any).mockImplementation(() => mockProvider);
    (ethers.Contract as any).mockImplementation((address: string) => {
      if (address.includes('ModelRegistry')) {
        return mockModelRegistry;
      }
      return mockContract;
    });
    mockWallet.connect.mockReturnValue(mockSigner);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Command Registration', () => {
    it('should register update-models command', () => {
      registerUpdateModelsCommand(program);
      const command = program.commands.find(cmd => cmd.name() === 'update-models');

      expect(command).toBeDefined();
      expect(command?.description()).toContain('Update supported models');
    });

    it('should have correct options', () => {
      registerUpdateModelsCommand(program);
      const command = program.commands.find(cmd => cmd.name() === 'update-models');

      const options = command?.options;
      expect(options).toBeDefined();

      const privateKeyOption = options?.find(opt => opt.flags === '-k, --private-key <key>');
      expect(privateKeyOption).toBeDefined();

      const fileOption = options?.find(opt => opt.flags === '-f, --file <path>');
      expect(fileOption).toBeDefined();
      expect(fileOption?.description).toContain('JSON file');
    });

    it('should accept model IDs as arguments', () => {
      registerUpdateModelsCommand(program);
      const command = program.commands.find(cmd => cmd.name() === 'update-models');

      expect(command?._args).toBeDefined();
      expect(command?._args[0].variadic).toBe(true);
    });
  });

  describe('Model Updates', () => {
    it('should update models from command line arguments', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);
      mockContract.getNodeModels.mockResolvedValue(['0x0001']);
      mockModelRegistry.isModelApproved.mockResolvedValue(true);

      const mockTx = {
        hash: '0xTransactionHash',
        wait: vi.fn().mockResolvedValue({
          status: 1,
          hash: '0xTransactionHash',
        }),
      };
      mockContract.updateSupportedModels.mockResolvedValue(mockTx);

      registerUpdateModelsCommand(program);
      await program.parseAsync(['node', 'update-models', '0x0001', '0x0002', '-k', '0xTestKey']);

      expect(mockContract.updateSupportedModels).toHaveBeenCalledWith(
        expect.arrayContaining(['0x0001', '0x0002'])
      );
      expect(mockTx.wait).toHaveBeenCalledWith(3);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully updated'));
    });

    it('should update models from JSON file', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);
      mockContract.getNodeModels.mockResolvedValue(['0x0001']);
      mockModelRegistry.isModelApproved.mockResolvedValue(true);

      const mockTx = {
        hash: '0xTransactionHash',
        wait: vi.fn().mockResolvedValue({
          status: 1,
          hash: '0xTransactionHash',
        }),
      };
      mockContract.updateSupportedModels.mockResolvedValue(mockTx);

      // Mock file read
      (fs.readFileSync as any).mockReturnValue(JSON.stringify(['0x0003', '0x0004']));
      (fs.existsSync as any).mockReturnValue(true);

      registerUpdateModelsCommand(program);
      await program.parseAsync(['node', 'update-models', '-f', 'models.json', '-k', '0xTestKey']);

      expect(fs.readFileSync).toHaveBeenCalledWith('models.json', 'utf-8');
      expect(mockContract.updateSupportedModels).toHaveBeenCalledWith(
        expect.arrayContaining(['0x0003', '0x0004'])
      );
    });

    it('should show current and new models', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);
      mockContract.getNodeModels.mockResolvedValue(['0x0001']);
      mockModelRegistry.isModelApproved.mockResolvedValue(true);

      const mockTx = {
        hash: '0xTransactionHash',
        wait: vi.fn().mockResolvedValue({
          status: 1,
          hash: '0xTransactionHash',
        }),
      };
      mockContract.updateSupportedModels.mockResolvedValue(mockTx);

      registerUpdateModelsCommand(program);
      await program.parseAsync(['node', 'update-models', '0x0002', '-k', '0xTestKey']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Current models'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('0x0001'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('New models'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('0x0002'));
    });
  });

  describe('Validation', () => {
    it('should check if node is registered', async () => {
      const nodeInfo = {
        active: false,
        stakedAmount: BigInt(0),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerUpdateModelsCommand(program);

      try {
        await program.parseAsync(['node', 'update-models', '0x0001', '-k', '0xTestKey']);
      } catch (e) {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('not registered')
      );
      expect(mockContract.updateSupportedModels).not.toHaveBeenCalled();

      processExitSpy.mockRestore();
    });

    it('should validate model approval', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);
      mockContract.getNodeModels.mockResolvedValue([]);
      mockModelRegistry.isModelApproved.mockResolvedValue(false); // Model not approved

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerUpdateModelsCommand(program);

      try {
        await program.parseAsync(['node', 'update-models', '0x0001', '-k', '0xTestKey']);
      } catch (e) {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('not approved')
      );

      processExitSpy.mockRestore();
    });

    it('should require at least one model', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerUpdateModelsCommand(program);

      try {
        await program.parseAsync(['node', 'update-models', '-k', '0xTestKey']);
      } catch (e) {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('No models provided')
      );

      processExitSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle transaction failure', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);
      mockContract.getNodeModels.mockResolvedValue([]);
      mockModelRegistry.isModelApproved.mockResolvedValue(true);

      const mockTx = {
        hash: '0xTransactionHash',
        wait: vi.fn().mockResolvedValue({
          status: 0, // Failed transaction
          hash: '0xTransactionHash',
        }),
      };
      mockContract.updateSupportedModels.mockResolvedValue(mockTx);

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerUpdateModelsCommand(program);

      try {
        await program.parseAsync(['node', 'update-models', '0x0001', '-k', '0xTestKey']);
      } catch (e) {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Transaction failed')
      );

      processExitSpy.mockRestore();
    });

    it('should handle invalid JSON file', async () => {
      const nodeInfo = {
        active: true,
        stakedAmount: BigInt('1000000000000000000000'),
      };
      mockContract.nodes.mockResolvedValue(nodeInfo);

      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue('invalid json');

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerUpdateModelsCommand(program);

      try {
        await program.parseAsync(['node', 'update-models', '-f', 'invalid.json', '-k', '0xTestKey']);
      } catch (e) {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Invalid JSON')
      );

      processExitSpy.mockRestore();
    });
  });
});