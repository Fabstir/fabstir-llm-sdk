// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getWallet } from '../../src/utils/wallet';

// Mock modules
vi.mock('ethers', () => ({
  ethers: {
    Wallet: vi.fn(),
  }
}));

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

describe('Wallet Utility', () => {
  let mockWallet: any;

  beforeEach(() => {
    mockWallet = {
      address: '0xTestWallet',
      privateKey: '0xTestPrivateKey',
    };

    (ethers.Wallet as any).mockImplementation((key: string) => ({
      ...mockWallet,
      privateKey: key,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getWallet', () => {
    it('should create wallet from provided private key', async () => {
      const privateKey = '0xProvidedPrivateKey';
      const wallet = await getWallet(privateKey);

      expect(ethers.Wallet).toHaveBeenCalledWith(privateKey);
      expect(wallet.privateKey).toBe(privateKey);
    });

    it('should load wallet from file when no private key provided', async () => {
      const walletData = { privateKey: '0xFilePrivateKey' };
      const walletPath = path.join(os.homedir(), '.fabstir', 'wallet.json');

      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(JSON.stringify(walletData));

      const wallet = await getWallet();

      expect(fs.existsSync).toHaveBeenCalledWith(walletPath);
      expect(fs.readFileSync).toHaveBeenCalledWith(walletPath, 'utf-8');
      expect(ethers.Wallet).toHaveBeenCalledWith('0xFilePrivateKey');
      expect(wallet.privateKey).toBe('0xFilePrivateKey');
    });

    it('should throw error if no wallet file exists and no key provided', async () => {
      const walletPath = path.join(os.homedir(), '.fabstir', 'wallet.json');
      (fs.existsSync as any).mockReturnValue(false);

      await expect(getWallet()).rejects.toThrow(
        'No wallet file found. Please import a wallet first using "fabstir-host wallet import"'
      );

      expect(fs.existsSync).toHaveBeenCalledWith(walletPath);
    });

    it('should handle malformed wallet file', async () => {
      const walletPath = path.join(os.homedir(), '.fabstir', 'wallet.json');

      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue('invalid json');

      await expect(getWallet()).rejects.toThrow();
    });

    it('should handle wallet file with missing private key', async () => {
      const walletData = { address: '0xSomeAddress' }; // Missing privateKey
      const walletPath = path.join(os.homedir(), '.fabstir', 'wallet.json');

      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(JSON.stringify(walletData));

      const wallet = await getWallet();

      expect(ethers.Wallet).toHaveBeenCalledWith(undefined);
    });

    it('should use correct wallet file path on different platforms', async () => {
      // Test on Unix-like system path
      const unixPath = '/home/user/.fabstir/wallet.json';
      (fs.existsSync as any).mockReturnValue(false);

      // Mock os.homedir for Unix
      const originalHomedir = os.homedir;
      Object.defineProperty(os, 'homedir', {
        value: () => '/home/user',
        configurable: true,
      });

      await expect(getWallet()).rejects.toThrow();
      expect(fs.existsSync).toHaveBeenCalledWith(unixPath);

      // Mock os.homedir for Windows
      Object.defineProperty(os, 'homedir', {
        value: () => 'C:\\Users\\user',
        configurable: true,
      });

      await expect(getWallet()).rejects.toThrow();
      expect(fs.existsSync).toHaveBeenCalledWith(
        path.join('C:\\Users\\user', '.fabstir', 'wallet.json')
      );

      // Restore original
      Object.defineProperty(os, 'homedir', {
        value: originalHomedir,
        configurable: true,
      });
    });

    it('should prioritize provided private key over wallet file', async () => {
      const walletData = { privateKey: '0xFilePrivateKey' };
      const walletPath = path.join(os.homedir(), '.fabstir', 'wallet.json');

      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(JSON.stringify(walletData));

      const wallet = await getWallet('0xProvidedKey');

      // Should not even check for file existence when key is provided
      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(fs.readFileSync).not.toHaveBeenCalled();
      expect(ethers.Wallet).toHaveBeenCalledWith('0xProvidedKey');
      expect(wallet.privateKey).toBe('0xProvidedKey');
    });
  });
});