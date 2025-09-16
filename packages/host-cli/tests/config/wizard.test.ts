import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import inquirer from 'inquirer';
import * as ConfigWizard from '../../src/config/wizard';
import { ConfigData } from '../../src/config/types';

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn()
  }
}));

describe('Configuration Wizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runWizard', () => {
    it('should complete full configuration flow', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ walletChoice: 'generate' })
        .mockResolvedValueOnce({
          network: 'base-sepolia',
          rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/key'
        })
        .mockResolvedValueOnce({
          inferencePort: 8080,
          publicUrl: 'https://my-host.example.com'
        })
        .mockResolvedValueOnce({
          models: ['llama-70b', 'gpt-j-6b'],
          pricePerToken: 0.0001,
          minSessionDeposit: 0.01
        })
        .mockResolvedValueOnce({ confirm: true });

      const config = await ConfigWizard.runWizard();

      expect(config).toBeDefined();
      expect(config.network).toBe('base-sepolia');
      expect(config.rpcUrl).toBe('https://base-sepolia.g.alchemy.com/v2/key');
      expect(config.models).toContain('llama-70b');
    });

    it('should handle wallet import flow', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ walletChoice: 'import' })
        .mockResolvedValueOnce({ importMethod: 'privateKey' })
        .mockResolvedValueOnce({
          privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
        })
        .mockResolvedValueOnce({
          network: 'base-mainnet',
          rpcUrl: 'https://mainnet.base.org'
        })
        .mockResolvedValueOnce({
          inferencePort: 8080,
          publicUrl: 'https://host.example.com'
        })
        .mockResolvedValueOnce({
          models: ['llama-70b'],
          pricePerToken: 0.0001,
          minSessionDeposit: 0.01
        })
        .mockResolvedValueOnce({ confirm: true });

      const config = await ConfigWizard.runWizard();
      expect(config.walletAddress).toBeDefined();
    });

    it('should validate RPC URL format', async () => {
      vi.mocked(inquirer.prompt).mockImplementation(async (questions: any) => {
        if (Array.isArray(questions)) {
          const rpcQuestion = questions.find(q => q.name === 'rpcUrl');
          if (rpcQuestion && rpcQuestion.validate) {
            expect(rpcQuestion.validate('invalid-url')).toBe('Please enter a valid URL');
            expect(rpcQuestion.validate('https://valid.url')).toBe(true);
          }
        }
        return {
          walletChoice: 'generate',
          network: 'base-sepolia',
          rpcUrl: 'https://valid.url',
          inferencePort: 8080,
          publicUrl: 'https://host.example.com',
          models: ['model1'],
          pricePerToken: 0.0001,
          minSessionDeposit: 0.01,
          confirm: true
        };
      });

      await ConfigWizard.runWizard();
      expect(vi.mocked(inquirer.prompt)).toHaveBeenCalled();
    });

    it('should validate port number', async () => {
      vi.mocked(inquirer.prompt).mockImplementation(async (questions: any) => {
        if (Array.isArray(questions)) {
          const portQuestion = questions.find(q => q.name === 'inferencePort');
          if (portQuestion && portQuestion.validate) {
            expect(portQuestion.validate('abc')).toBe('Please enter a valid port number');
            expect(portQuestion.validate('99999')).toBe('Port must be between 1 and 65535');
            expect(portQuestion.validate('8080')).toBe(true);
          }
        }
        return {
          walletChoice: 'generate',
          network: 'base-sepolia',
          rpcUrl: 'https://valid.url',
          inferencePort: 8080,
          publicUrl: 'https://host.example.com',
          models: ['model1'],
          pricePerToken: 0.0001,
          minSessionDeposit: 0.01,
          confirm: true
        };
      });

      await ConfigWizard.runWizard();
    });
  });

  describe('promptWalletSetup', () => {
    it('should handle new wallet generation', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({
        walletChoice: 'generate'
      });

      const wallet = await ConfigWizard.promptWalletSetup();
      expect(wallet).toBeDefined();
      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should handle private key import', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ walletChoice: 'import' })
        .mockResolvedValueOnce({ importMethod: 'privateKey' })
        .mockResolvedValueOnce({
          privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
        });

      const wallet = await ConfigWizard.promptWalletSetup();
      expect(wallet.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    });

    it('should handle mnemonic import', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ walletChoice: 'import' })
        .mockResolvedValueOnce({ importMethod: 'mnemonic' })
        .mockResolvedValueOnce({
          mnemonic: 'test test test test test test test test test test test junk'
        });

      const wallet = await ConfigWizard.promptWalletSetup();
      expect(wallet.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    });

    it('should handle existing wallet', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({
        walletChoice: 'existing'
      });

      const wallet = await ConfigWizard.promptWalletSetup();
      expect(wallet).toBeNull();
    });
  });

  describe('promptNetworkConfig', () => {
    it('should collect network configuration', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({
        network: 'base-sepolia',
        rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/key'
      });

      const config = await ConfigWizard.promptNetworkConfig();
      expect(config.network).toBe('base-sepolia');
      expect(config.rpcUrl).toBe('https://base-sepolia.g.alchemy.com/v2/key');
    });

    it('should provide default RPC URLs', async () => {
      vi.mocked(inquirer.prompt).mockImplementation(async (questions: any) => {
        const networkQuestion = questions.find((q: any) => q.name === 'network');
        expect(networkQuestion.choices).toContain('base-mainnet');
        expect(networkQuestion.choices).toContain('base-sepolia');
        return {
          network: 'base-mainnet',
          rpcUrl: 'https://mainnet.base.org'
        };
      });

      await ConfigWizard.promptNetworkConfig();
    });
  });

  describe('promptHostConfig', () => {
    it('should collect host configuration', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({
        inferencePort: 8080,
        publicUrl: 'https://my-host.example.com'
      });

      const config = await ConfigWizard.promptHostConfig();
      expect(config.inferencePort).toBe(8080);
      expect(config.publicUrl).toBe('https://my-host.example.com');
    });

    it('should validate public URL format', async () => {
      vi.mocked(inquirer.prompt).mockImplementation(async (questions: any) => {
        const urlQuestion = questions.find((q: any) => q.name === 'publicUrl');
        if (urlQuestion.validate) {
          expect(urlQuestion.validate('not-a-url')).toBe('Please enter a valid URL');
          expect(urlQuestion.validate('https://valid.example.com')).toBe(true);
        }
        return {
          inferencePort: 8080,
          publicUrl: 'https://valid.example.com'
        };
      });

      await ConfigWizard.promptHostConfig();
    });
  });

  describe('promptModelConfig', () => {
    it('should collect model configuration', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({
        models: ['llama-70b', 'gpt-j-6b'],
        pricePerToken: 0.0001,
        minSessionDeposit: 0.01
      });

      const config = await ConfigWizard.promptModelConfig();
      expect(config.models).toHaveLength(2);
      expect(config.pricePerToken).toBe(0.0001);
      expect(config.minSessionDeposit).toBe(0.01);
    });

    it('should validate price values', async () => {
      vi.mocked(inquirer.prompt).mockImplementation(async (questions: any) => {
        const priceQuestion = questions.find((q: any) => q.name === 'pricePerToken');
        if (priceQuestion.validate) {
          expect(priceQuestion.validate('-1')).toBe('Price must be positive');
          expect(priceQuestion.validate('0.0001')).toBe(true);
        }
        return {
          models: ['model1'],
          pricePerToken: 0.0001,
          minSessionDeposit: 0.01
        };
      });

      await ConfigWizard.promptModelConfig();
    });
  });

  describe('confirmConfiguration', () => {
    it('should display configuration summary', async () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia',
        rpcUrl: 'https://test.rpc',
        inferencePort: 8080,
        publicUrl: 'https://host.example.com',
        models: ['model1'],
        pricePerToken: 0.0001,
        minSessionDeposit: 0.01
      };

      vi.mocked(inquirer.prompt).mockResolvedValueOnce({
        confirm: true
      });

      const confirmed = await ConfigWizard.confirmConfiguration(config);
      expect(confirmed).toBe(true);
    });

    it('should allow user to reject configuration', async () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia',
        rpcUrl: 'https://test.rpc',
        inferencePort: 8080,
        publicUrl: 'https://host.example.com',
        models: ['model1'],
        pricePerToken: 0.0001,
        minSessionDeposit: 0.01
      };

      vi.mocked(inquirer.prompt).mockResolvedValueOnce({
        confirm: false
      });

      const confirmed = await ConfigWizard.confirmConfiguration(config);
      expect(confirmed).toBe(false);
    });
  });
});