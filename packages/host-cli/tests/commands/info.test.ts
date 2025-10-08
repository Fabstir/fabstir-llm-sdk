import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { registerInfoCommand } from '../../src/commands/info';

// Mock getWallet utility
vi.mock('../../src/utils/wallet', () => ({
  getWallet: vi.fn()
}));

// Mock dotenv
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn()
  }
}));

// Mock ethers
vi.mock('ethers', () => ({
  ethers: {
    Wallet: vi.fn(),
    JsonRpcProvider: vi.fn(),
    Contract: vi.fn(),
    formatUnits: vi.fn((value) => '1000'),
    formatEther: vi.fn((value) => '0.5'),
    ZeroAddress: '0x0000000000000000000000000000000000000000',
    isAddress: vi.fn((addr) => addr && addr.startsWith('0x'))
  }
}));

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const mockABI = JSON.stringify([
    {
      "inputs": [{"name": "nodeAddress", "type": "address"}],
      "name": "getNodeFullInfo",
      "outputs": [
        {"name": "operator", "type": "address"},
        {"name": "stakedAmount", "type": "uint256"},
        {"name": "active", "type": "bool"},
        {"name": "metadata", "type": "string"},
        {"name": "apiUrl", "type": "string"},
        {"name": "modelIds", "type": "bytes32[]"},
        {"name": "minPricePerToken", "type": "uint256"}
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ]);
  return {
    ...actual,
    default: {
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue(mockABI),
    },
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue(mockABI),
  };
});

// Mock chalk to avoid color codes in tests
vi.mock('chalk', () => {
  const chainableFunc = (...args: any[]) => args[0] || '';
  const chainable: any = new Proxy(chainableFunc, {
    get: () => chainable,
    apply: (_target, _this, args) => args[0] || ''
  });
  return {
    default: chainable
  };
});

describe('Info Command', () => {
  let program: Command;
  let mockWallet: any;
  let mockProvider: any;
  let mockSigner: any;
  let mockContract: any;
  let consoleSpy: any;

  beforeEach(async () => {
    program = new Command();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      // Log errors for debugging
      if (args[0]?.includes && args[0].includes('❌ Info failed:')) {
        console.warn('ERROR:', ...args);
      }
    });
    vi.spyOn(process, 'exit').mockImplementation(((code: any) => {
      throw new Error(`Process exit with code ${code}`);
    }) as any);

    // Set environment variables
    process.env.CONTRACT_NODE_REGISTRY = '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218';
    process.env.CONTRACT_FAB_TOKEN = '0xC78949004B4EB6dEf2D66e49Cd81231472612D62';

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

    // Configure getWallet mock
    const { getWallet } = await import('../../src/utils/wallet');
    (getWallet as any).mockResolvedValue(mockWallet);
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
        modelIds,
        BigInt(2000)  // minPricePerToken (7th field)
      ]);

      registerInfoCommand(program);
      await program.parseAsync(['node', 'test', 'info', '-k', '0xTestKey']);

      expect(mockContract.getNodeFullInfo).toHaveBeenCalledWith('0xTestAddress');

      // Check that various expected strings appear in the console output
      const allOutput = consoleSpy.mock.calls.flat().join(' ');
      expect(allOutput).toContain('Host Information');
      expect(allOutput).toContain('0xTestAddress');
      expect(allOutput).toContain('Active');
      expect(allOutput).toContain('1000 FAB');
      expect(allOutput).toContain('https://api.example.com');
      expect(allOutput).toContain('RTX 4090');
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
        ['0x0001'],
        BigInt(2000)  // minPricePerToken (7th field)
      ]);

      registerInfoCommand(program);
      await program.parseAsync(['node', 'test', 'info', '-k', '0xTestKey', '--json']);

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

    it('should display pricing information', async () => {
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
        ['0x0001'],
        BigInt(3500)  // minPricePerToken (7th field)
      ]);

      registerInfoCommand(program);
      await program.parseAsync(['node', 'test', 'info', '-k', '0xTestKey']);

      // Should display pricing in multiple formats
      const allOutput = consoleSpy.mock.calls.flat().join(' ');
      expect(allOutput).toContain('Pricing');
      expect(allOutput).toContain('3500');
      expect(allOutput).toContain('0.003500');
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
        [],
        BigInt(0)  // minPricePerToken (7th field)
      ]);

      registerInfoCommand(program);
      await program.parseAsync(['node', 'test', 'info', '-k', '0xTestKey']);

      const allOutput = consoleSpy.mock.calls.flat().join(' ');
      expect(allOutput).toContain('Not Registered');
      expect(allOutput).toContain('This address is not registered as a host');
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
        [],
        BigInt(2000)  // minPricePerToken (7th field)
      ]);

      registerInfoCommand(program);
      await program.parseAsync(['node', 'test', 'info', '-k', '0xTestKey', '-a', otherAddress]);

      expect(mockContract.getNodeFullInfo).toHaveBeenCalledWith(otherAddress);

      const allOutput = consoleSpy.mock.calls.flat().join(' ');
      expect(allOutput).toContain(otherAddress);
    });

    it('should validate address format', async () => {
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerInfoCommand(program);

      try {
        await program.parseAsync(['node', 'test', 'info', '-k', '0xTestKey', '-a', 'invalid-address']);
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
        [],
        BigInt(2000)  // minPricePerToken (7th field)
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
      await program.parseAsync(['node', 'test', 'info', '-k', '0xTestKey']);

      const allOutput = consoleSpy.mock.calls.flat().join(' ');
      expect(allOutput).toContain('0.5 ETH');
      expect(allOutput).toContain('Balance');
    });
  });

  describe('Error Handling', () => {
    it('should handle contract call failures', async () => {
      mockContract.getNodeFullInfo.mockRejectedValue(new Error('Network error'));
      mockContract.nodes.mockRejectedValue(new Error('Network error'));

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerInfoCommand(program);

      try {
        await program.parseAsync(['node', 'test', 'info', '-k', '0xTestKey']);
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

      // Override getWallet to throw error
      const { getWallet } = await import('../../src/utils/wallet');
      (getWallet as any).mockRejectedValue(new Error('No wallet file found at /workspace/packages/host-cli/.wallet'));

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      registerInfoCommand(program);

      try {
        await program.parseAsync(['node', 'test', 'info']);
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