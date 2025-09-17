import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { registerInfoCommand } from '../../src/commands/info';

// Mock ethers
vi.mock('ethers', () => ({
  ethers: {
    Wallet: vi.fn(),
    JsonRpcProvider: vi.fn(),
    Contract: vi.fn(),
    formatUnits: vi.fn((value) => '1000'),
    formatEther: vi.fn((value) => '0.5'),
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

// Mock chalk to avoid color codes in tests
vi.mock('chalk', () => ({
  default: {
    blue: (str: string) => str,
    green: (str: string) => str,
    red: (str: string) => str,
    yellow: (str: string) => str,
    cyan: (str: string) => str,
    gray: (str: string) => str,
    bold: (str: string) => str,
  }
}));

describe('Info Command', () => {
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
    mockProvider = {
      getBalance: vi.fn().mockResolvedValue(BigInt('500000000000000000')), // 0.5 ETH
    };

    // Setup mock signer
    mockSigner = {
      getAddress: vi.fn().mockResolvedValue('0xTestAddress'),
      provider: mockProvider,
    };

    // Setup mock contract
    mockContract = {
      getNodeFullInfo: vi.fn(),
      nodes: vi.fn(),
      fabToken: vi.fn().mockResolvedValue('0xFabTokenAddress'),
      balanceOf: vi.fn().mockResolvedValue(BigInt('1000000000000000000000')), // 1000 FAB
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
    it('should register info command', () => {
      registerInfoCommand(program);
      const command = program.commands.find(cmd => cmd.name() === 'info');

      expect(command).toBeDefined();
      expect(command?.description()).toContain('Display complete host information');
    });

    it('should have correct options', () => {
      registerInfoCommand(program);
      const command = program.commands.find(cmd => cmd.name() === 'info');

      const options = command?.options;
      expect(options).toBeDefined();

      const privateKeyOption = options?.find(opt => opt.flags === '-k, --private-key <key>');
      expect(privateKeyOption).toBeDefined();

      const addressOption = options?.find(opt => opt.flags === '-a, --address <address>');
      expect(addressOption).toBeDefined();
      expect(addressOption?.description).toContain('Check specific address');

      const jsonOption = options?.find(opt => opt.flags === '-j, --json');
      expect(jsonOption).toBeDefined();
      expect(jsonOption?.description).toContain('Output in JSON format');
    });
  });

  describe('Registered Host Information', () => {
    it('should display complete info for registered host', async () => {
      const nodeInfo = {
        operator: '0xTestAddress',
        stakedAmount: BigInt('1000000000000000000000'), // 1000 FAB
        active: true,
        metadata: JSON.stringify({
          hardware: { gpu: 'RTX 4090', vram: 24, ram: 64 },
          capabilities: ['streaming', 'batch'],
          location: 'US-East',
          maxConcurrent: 10,
          costPerToken: 0.0001
        }),
        apiUrl: 'https://api.example.com',
      };

      const modelIds = ['0x0001', '0x0002'];

      mockContract.getNodeFullInfo.mockResolvedValue([
        nodeInfo.operator,
        nodeInfo.stakedAmount,
        nodeInfo.active,
        nodeInfo.metadata,
        nodeInfo.apiUrl,
        modelIds
      ]);

      registerInfoCommand(program);
      await program.parseAsync(['node', 'info', '-k', '0xTestKey']);

      expect(mockContract.getNodeFullInfo).toHaveBeenCalledWith('0xTestAddress');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Host Information'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('0xTestAddress'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Active'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1000 FAB'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('https://api.example.com'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('RTX 4090'));
    });

    it('should handle JSON output format', async () => {
      const nodeInfo = {
        operator: '0xTestAddress',
        stakedAmount: BigInt('1000000000000000000000'),
        active: true,
        metadata: JSON.stringify({ hardware: { gpu: 'RTX 4090' } }),
        apiUrl: 'https://api.example.com',
      };

      mockContract.getNodeFullInfo.mockResolvedValue([
        nodeInfo.operator,
        nodeInfo.stakedAmount,
        nodeInfo.active,
        nodeInfo.metadata,
        nodeInfo.apiUrl,
        ['0x0001']
      ]);

      registerInfoCommand(program);
      await program.parseAsync(['node', 'info', '-k', '0xTestKey', '--json']);

      const calls = consoleSpy.mock.calls;
      const jsonOutput = calls.find((call: any[]) => {
        try {
          JSON.parse(call[0]);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonOutput).toBeDefined();
      if (jsonOutput) {
        const parsed = JSON.parse(jsonOutput[0]);
        expect(parsed.address).toBe('0xTestAddress');
        expect(parsed.isActive).toBe(true);
        expect(parsed.stakedAmount).toBe('1000');
        expect(parsed.apiUrl).toBe('https://api.example.com');
      }
    });
  });

  describe('Unregistered Host Information', () => {
    it('should handle unregistered host gracefully', async () => {
      mockContract.getNodeFullInfo.mockResolvedValue([
        '0x0000000000000000000000000000000000000000',
        BigInt(0),
        false,
        '',
        '',
        []
      ]);

      registerInfoCommand(program);
      await program.parseAsync(['node', 'info', '-k', '0xTestKey']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Not Registered'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('This address is not registered as a host'));
    });
  });

  describe('Check Other Address', () => {
    it('should allow checking another address info', async () => {
      const otherAddress = '0xOtherAddress';
      const nodeInfo = {
        operator: otherAddress,
        stakedAmount: BigInt('2000000000000000000000'),
        active: true,
        metadata: JSON.stringify({ hardware: { gpu: 'RTX 3080' } }),
        apiUrl: 'https://other.example.com',
      };

      mockContract.getNodeFullInfo.mockResolvedValue([
        nodeInfo.operator,
        nodeInfo.stakedAmount,
        nodeInfo.active,
        nodeInfo.metadata,
        nodeInfo.apiUrl,
        []
      ]);

      registerInfoCommand(program);
      await program.parseAsync(['node', 'info', '-k', '0xTestKey', '-a', otherAddress]);

      expect(mockContract.getNodeFullInfo).toHaveBeenCalledWith(otherAddress);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(otherAddress));
    });

    it('should validate address format', async () => {
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerInfoCommand(program);

      try {
        await program.parseAsync(['node', 'info', '-k', '0xTestKey', '-a', 'invalid-address']);
      } catch (e) {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Invalid address format')
      );

      processExitSpy.mockRestore();
    });
  });

  describe('Balance Information', () => {
    it('should display ETH and FAB balances', async () => {
      const nodeInfo = {
        operator: '0xTestAddress',
        stakedAmount: BigInt('1000000000000000000000'),
        active: true,
        metadata: '{}',
        apiUrl: 'https://api.example.com',
      };

      mockContract.getNodeFullInfo.mockResolvedValue([
        nodeInfo.operator,
        nodeInfo.stakedAmount,
        nodeInfo.active,
        nodeInfo.metadata,
        nodeInfo.apiUrl,
        []
      ]);

      // Mock FAB token contract
      const mockFabToken = {
        balanceOf: vi.fn().mockResolvedValue(BigInt('5000000000000000000000')) // 5000 FAB
      };

      (ethers.Contract as any).mockImplementation((address: string) => {
        if (address === '0xFabTokenAddress') {
          return mockFabToken;
        }
        return mockContract;
      });

      registerInfoCommand(program);
      await program.parseAsync(['node', 'info', '-k', '0xTestKey']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('0.5 ETH'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Balance'));
    });
  });

  describe('Error Handling', () => {
    it('should handle contract call failures', async () => {
      mockContract.getNodeFullInfo.mockRejectedValue(new Error('Network error'));

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerInfoCommand(program);

      try {
        await program.parseAsync(['node', 'info', '-k', '0xTestKey']);
      } catch (e) {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Network error')
      );

      processExitSpy.mockRestore();
    });

    it('should handle missing wallet file when no private key provided', async () => {
      (fs.existsSync as any).mockReturnValue(false);

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerInfoCommand(program);

      try {
        await program.parseAsync(['node', 'info']);
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
});