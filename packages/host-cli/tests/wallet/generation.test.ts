// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Wallet } from 'ethers';
import * as WalletManager from '../../src/wallet/manager';

describe('Wallet Generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateWallet', () => {
    it('should generate a new wallet with valid address', async () => {
      const wallet = await WalletManager.generateWallet();
      expect(wallet).toBeDefined();
      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should generate unique wallets each time', async () => {
      const wallet1 = await WalletManager.generateWallet();
      const wallet2 = await WalletManager.generateWallet();
      expect(wallet1.address).not.toBe(wallet2.address);
    });

    it('should generate wallet with mnemonic phrase', async () => {
      const wallet = await WalletManager.generateWallet();
      expect(wallet.mnemonic).toBeDefined();
      expect(wallet.mnemonic?.phrase).toBeDefined();
      const words = wallet.mnemonic?.phrase.split(' ');
      expect(words).toHaveLength(12);
    });

    it('should generate wallet with private key', async () => {
      const wallet = await WalletManager.generateWallet();
      expect(wallet.privateKey).toBeDefined();
      expect(wallet.privateKey).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe('generateWalletWithEntropy', () => {
    it('should generate wallet with custom entropy', async () => {
      const entropy = '0x1234567890abcdef1234567890abcdef';
      const wallet = await WalletManager.generateWalletWithEntropy(entropy);
      expect(wallet).toBeDefined();
      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should generate same wallet with same entropy', async () => {
      const entropy = '0x1234567890abcdef1234567890abcdef';
      const wallet1 = await WalletManager.generateWalletWithEntropy(entropy);
      const wallet2 = await WalletManager.generateWalletWithEntropy(entropy);
      expect(wallet1.address).toBe(wallet2.address);
    });

    it('should reject invalid entropy', async () => {
      const invalidEntropy = 'invalid';
      await expect(
        WalletManager.generateWalletWithEntropy(invalidEntropy)
      ).rejects.toThrow('Invalid entropy');
    });
  });

  describe('deriveWalletFromMnemonic', () => {
    it('should derive wallet from valid mnemonic', async () => {
      const mnemonic = 'test test test test test test test test test test test junk';
      const wallet = await WalletManager.deriveWalletFromMnemonic(mnemonic);
      expect(wallet).toBeDefined();
      expect(wallet.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    });

    it('should derive wallet with custom derivation path', async () => {
      const mnemonic = 'test test test test test test test test test test test junk';
      const path = "m/44'/60'/0'/0/1";
      const wallet = await WalletManager.deriveWalletFromMnemonic(mnemonic, path);
      expect(wallet).toBeDefined();
      expect(wallet.address).not.toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    });

    it('should reject invalid mnemonic', async () => {
      const invalidMnemonic = 'invalid mnemonic phrase';
      await expect(
        WalletManager.deriveWalletFromMnemonic(invalidMnemonic)
      ).rejects.toThrow('Invalid mnemonic');
    });

    it('should reject mnemonic with wrong word count', async () => {
      const shortMnemonic = 'test test test';
      await expect(
        WalletManager.deriveWalletFromMnemonic(shortMnemonic)
      ).rejects.toThrow('Invalid mnemonic');
    });
  });

  describe('validateWallet', () => {
    it('should validate a correct wallet', async () => {
      const wallet = await WalletManager.generateWallet();
      const isValid = await WalletManager.validateWallet(wallet);
      expect(isValid).toBe(true);
    });

    it('should detect invalid wallet address', async () => {
      const invalidWallet = {
        address: 'invalid',
        privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      };
      const isValid = await WalletManager.validateWallet(invalidWallet as any);
      expect(isValid).toBe(false);
    });

    it('should detect mismatched private key and address', async () => {
      const wallet1 = await WalletManager.generateWallet();
      const wallet2 = await WalletManager.generateWallet();
      const mismatchedWallet = {
        address: wallet1.address,
        privateKey: wallet2.privateKey
      };
      const isValid = await WalletManager.validateWallet(mismatchedWallet as any);
      expect(isValid).toBe(false);
    });
  });
});