// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as WalletStorage from '../../src/wallet/storage';
import { Wallet } from 'ethers';

// Mock keytar since it requires native module
vi.mock('keytar', () => ({
  setPassword: vi.fn(),
  getPassword: vi.fn(),
  deletePassword: vi.fn(),
  findCredentials: vi.fn(),
}));

describe('Wallet Storage', () => {
  const SERVICE_NAME = 'fabstir-host-cli';
  const ACCOUNT_NAME = 'wallet';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('saveWallet', () => {
    it('should save encrypted wallet to keychain', async () => {
      const wallet = Wallet.createRandom();
      const password = 'test-password-123!';

      const saved = await WalletStorage.saveWallet(wallet, password);
      expect(saved).toBe(true);
    });

    it('should overwrite existing wallet', async () => {
      const wallet1 = Wallet.createRandom();
      const wallet2 = Wallet.createRandom();
      const password = 'test-password-123!';

      await WalletStorage.saveWallet(wallet1, password);
      const saved = await WalletStorage.saveWallet(wallet2, password);
      expect(saved).toBe(true);
    });

    it('should handle save errors gracefully', async () => {
      const keytar = await import('keytar');
      vi.mocked(keytar.setPassword).mockRejectedValue(new Error('Keychain error'));

      const wallet = Wallet.createRandom();
      const password = 'test-password-123!';

      await expect(
        WalletStorage.saveWallet(wallet, password)
      ).rejects.toThrow('Failed to save wallet');
    });

    it('should not save wallet with weak password', async () => {
      const wallet = Wallet.createRandom();
      const weakPassword = '123';

      await expect(
        WalletStorage.saveWallet(wallet, weakPassword)
      ).rejects.toThrow('Password too weak');
    });
  });

  describe('loadWallet', () => {
    it('should load wallet from keychain', async () => {
      const wallet = Wallet.createRandom();
      const password = 'test-password-123!';

      // Mock the encrypted data
      const keytar = await import('keytar');
      const encryptedData = await wallet.encrypt(password);
      vi.mocked(keytar.getPassword).mockResolvedValue(encryptedData);

      const loaded = await WalletStorage.loadWallet(password);
      expect(loaded).toBeDefined();
      expect(loaded?.address.toLowerCase()).toBe(wallet.address.toLowerCase());
    });

    it('should return null if no wallet stored', async () => {
      const keytar = await import('keytar');
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      const loaded = await WalletStorage.loadWallet('password');
      expect(loaded).toBeNull();
    });

    it('should fail with wrong password', async () => {
      const wallet = Wallet.createRandom();
      const correctPassword = 'correct-password-123!';
      const wrongPassword = 'wrong-password-123!';

      const keytar = await import('keytar');
      const encryptedData = await wallet.encrypt(correctPassword);
      vi.mocked(keytar.getPassword).mockResolvedValue(encryptedData);

      await expect(
        WalletStorage.loadWallet(wrongPassword)
      ).rejects.toThrow();
    });

    it('should handle corrupted data', async () => {
      const keytar = await import('keytar');
      vi.mocked(keytar.getPassword).mockResolvedValue('corrupted-data');

      await expect(
        WalletStorage.loadWallet('password')
      ).rejects.toThrow('Failed to load wallet');
    });
  });

  describe('deleteWallet', () => {
    it('should delete wallet from keychain', async () => {
      const keytar = await import('keytar');
      vi.mocked(keytar.deletePassword).mockResolvedValue(true);

      const deleted = await WalletStorage.deleteWallet();
      expect(deleted).toBe(true);
    });

    it('should return false if no wallet to delete', async () => {
      const keytar = await import('keytar');
      vi.mocked(keytar.deletePassword).mockResolvedValue(false);

      const deleted = await WalletStorage.deleteWallet();
      expect(deleted).toBe(false);
    });

    it('should handle delete errors gracefully', async () => {
      const keytar = await import('keytar');
      vi.mocked(keytar.deletePassword).mockRejectedValue(new Error('Keychain error'));

      await expect(
        WalletStorage.deleteWallet()
      ).rejects.toThrow('Failed to delete wallet');
    });
  });

  describe('walletExists', () => {
    it('should return true if wallet exists', async () => {
      const keytar = await import('keytar');
      vi.mocked(keytar.getPassword).mockResolvedValue('encrypted-wallet-data');

      const exists = await WalletStorage.walletExists();
      expect(exists).toBe(true);
    });

    it('should return false if wallet does not exist', async () => {
      const keytar = await import('keytar');
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      const exists = await WalletStorage.walletExists();
      expect(exists).toBe(false);
    });
  });

  describe('updatePassword', () => {
    it('should update wallet password', async () => {
      const wallet = Wallet.createRandom();
      const oldPassword = 'old-password-123!';
      const newPassword = 'new-password-456!';

      // Setup existing wallet
      const keytar = await import('keytar');
      const encryptedData = await wallet.encrypt(oldPassword);
      vi.mocked(keytar.getPassword).mockResolvedValue(encryptedData);

      const updated = await WalletStorage.updatePassword(oldPassword, newPassword);
      expect(updated).toBe(true);
    });

    it('should fail with wrong old password', async () => {
      const wallet = Wallet.createRandom();
      const correctPassword = 'correct-password-123!';
      const wrongPassword = 'wrong-password-123!';
      const newPassword = 'new-password-456!';

      const keytar = await import('keytar');
      const encryptedData = await wallet.encrypt(correctPassword);
      vi.mocked(keytar.getPassword).mockResolvedValue(encryptedData);

      await expect(
        WalletStorage.updatePassword(wrongPassword, newPassword)
      ).rejects.toThrow('Invalid password');
    });

    it('should reject weak new password', async () => {
      const oldPassword = 'old-password-123!';
      const weakNewPassword = '123';

      await expect(
        WalletStorage.updatePassword(oldPassword, weakNewPassword)
      ).rejects.toThrow('New password too weak');
    });
  });

  describe('getWalletInfo', () => {
    it('should return wallet address without exposing private key', async () => {
      const wallet = Wallet.createRandom();
      const password = 'test-password-123!';

      const keytar = await import('keytar');
      const encryptedData = await wallet.encrypt(password);
      vi.mocked(keytar.getPassword).mockResolvedValue(encryptedData);

      const info = await WalletStorage.getWalletInfo();
      expect(info).toBeDefined();
      expect(info?.address).toBe(wallet.address);
      expect(info?.hasPrivateKey).toBe(false);
    });

    it('should return null if no wallet exists', async () => {
      const keytar = await import('keytar');
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      const info = await WalletStorage.getWalletInfo();
      expect(info).toBeNull();
    });
  });

  describe('backupWallet', () => {
    it('should create wallet backup file', async () => {
      const wallet = Wallet.createRandom();
      const password = 'test-password-123!';
      const backupPath = '/tmp/wallet-backup.json';

      const keytar = await import('keytar');
      const encryptedData = await wallet.encrypt(password);
      vi.mocked(keytar.getPassword).mockResolvedValue(encryptedData);

      const backed = await WalletStorage.backupWallet(password, backupPath);
      expect(backed).toBe(true);
    });

    it('should fail backup with wrong password', async () => {
      const wallet = Wallet.createRandom();
      const correctPassword = 'correct-password-123!';
      const wrongPassword = 'wrong-password-123!';
      const backupPath = '/tmp/wallet-backup.json';

      const keytar = await import('keytar');
      const encryptedData = await wallet.encrypt(correctPassword);
      vi.mocked(keytar.getPassword).mockResolvedValue(encryptedData);

      await expect(
        WalletStorage.backupWallet(wrongPassword, backupPath)
      ).rejects.toThrow();
    });
  });
});