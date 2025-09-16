import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as WalletSecurity from '../../src/wallet/security';
import { Wallet } from 'ethers';

describe('Wallet Security', () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let consoleOutput: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    consoleOutput = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = vi.fn((...args) => {
      consoleOutput.push(args.join(' '));
    });
    console.error = vi.fn((...args) => {
      consoleOutput.push(args.join(' '));
    });
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    vi.restoreAllMocks();
  });

  describe('encryptWallet', () => {
    it('should encrypt wallet with password', async () => {
      const wallet = Wallet.createRandom();
      const password = 'strong-password-123';
      const encrypted = await WalletSecurity.encryptWallet(wallet, password);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toContain(wallet.privateKey);
    });

    it('should produce different encrypted outputs for same wallet', async () => {
      const wallet = Wallet.createRandom();
      const password = 'test-password';
      const encrypted1 = await WalletSecurity.encryptWallet(wallet, password);
      const encrypted2 = await WalletSecurity.encryptWallet(wallet, password);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should reject weak password', async () => {
      const wallet = Wallet.createRandom();
      const weakPassword = '123';

      await expect(
        WalletSecurity.encryptWallet(wallet, weakPassword)
      ).rejects.toThrow('Password too weak');
    });

    it('should reject empty password', async () => {
      const wallet = Wallet.createRandom();

      await expect(
        WalletSecurity.encryptWallet(wallet, '')
      ).rejects.toThrow('Password required');
    });
  });

  describe('decryptWallet', () => {
    it('should decrypt wallet with correct password', async () => {
      const wallet = Wallet.createRandom();
      const password = 'test-password-123';
      const encrypted = await WalletSecurity.encryptWallet(wallet, password);

      const decrypted = await WalletSecurity.decryptWallet(encrypted, password);
      expect(decrypted.address).toBe(wallet.address);
      expect(decrypted.privateKey).toBe(wallet.privateKey);
    });

    it('should fail with wrong password', async () => {
      const wallet = Wallet.createRandom();
      const password = 'correct-password';
      const encrypted = await WalletSecurity.encryptWallet(wallet, password);

      await expect(
        WalletSecurity.decryptWallet(encrypted, 'wrong-password')
      ).rejects.toThrow();
    });

    it('should reject corrupted encrypted data', async () => {
      const corruptedData = 'corrupted-encrypted-data';

      await expect(
        WalletSecurity.decryptWallet(corruptedData, 'password')
      ).rejects.toThrow('Invalid encrypted wallet');
    });
  });

  describe('Private Key Protection', () => {
    it('should never log private keys', async () => {
      const wallet = Wallet.createRandom();
      await WalletSecurity.processWalletSafely(wallet);

      const allOutput = consoleOutput.join(' ');
      expect(allOutput).not.toContain(wallet.privateKey);
      expect(allOutput).not.toContain(wallet.privateKey.slice(2)); // without 0x
    });

    it('should mask private key in error messages', async () => {
      const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

      try {
        await WalletSecurity.throwErrorWithPrivateKey(privateKey);
      } catch (error: any) {
        expect(error.message).not.toContain(privateKey);
        expect(error.message).toContain('***');
      }
    });

    it('should sanitize wallet object for logging', async () => {
      const wallet = Wallet.createRandom();
      const sanitized = await WalletSecurity.sanitizeWalletForLogging(wallet);

      expect(sanitized.address).toBe(wallet.address);
      expect(sanitized.privateKey).toBe('[REDACTED]');
      expect(sanitized.mnemonic).toBe('[REDACTED]');
    });
  });

  describe('Password Validation', () => {
    it('should accept strong password', async () => {
      const strongPassword = 'MyStr0ng!P@ssw0rd123';
      const isValid = await WalletSecurity.validatePassword(strongPassword);
      expect(isValid).toBe(true);
    });

    it('should reject short password', async () => {
      const shortPassword = 'Pass1!';
      const isValid = await WalletSecurity.validatePassword(shortPassword);
      expect(isValid).toBe(false);
    });

    it('should reject password without numbers', async () => {
      const noNumbers = 'MyPassword!';
      const isValid = await WalletSecurity.validatePassword(noNumbers);
      expect(isValid).toBe(false);
    });

    it('should reject password without special chars', async () => {
      const noSpecial = 'MyPassword123';
      const isValid = await WalletSecurity.validatePassword(noSpecial);
      expect(isValid).toBe(false);
    });

    it('should reject common passwords', async () => {
      const commonPassword = 'Password123!';
      const isValid = await WalletSecurity.validatePassword(commonPassword);
      expect(isValid).toBe(false);
    });
  });

  describe('Secure Backup', () => {
    it('should create encrypted backup', async () => {
      const wallet = Wallet.createRandom();
      const password = 'backup-password-123!';
      const backup = await WalletSecurity.createBackup(wallet, password);

      expect(backup).toBeDefined();
      expect(backup.version).toBeDefined();
      expect(backup.encrypted).toBeDefined();
      expect(backup.checksum).toBeDefined();
    });

    it('should restore from backup', async () => {
      const wallet = Wallet.createRandom();
      const password = 'backup-password-123!';
      const backup = await WalletSecurity.createBackup(wallet, password);

      const restored = await WalletSecurity.restoreFromBackup(backup, password);
      expect(restored.address).toBe(wallet.address);
    });

    it('should detect tampered backup', async () => {
      const wallet = Wallet.createRandom();
      const password = 'backup-password-123!';
      const backup = await WalletSecurity.createBackup(wallet, password);

      backup.checksum = 'tampered';

      await expect(
        WalletSecurity.restoreFromBackup(backup, password)
      ).rejects.toThrow('Backup integrity check failed');
    });
  });

  describe('Memory Cleanup', () => {
    it('should clear sensitive data from memory', async () => {
      const sensitiveData = { privateKey: '0x1234...', mnemonic: 'test phrase' };
      await WalletSecurity.clearSensitiveData(sensitiveData);

      expect(sensitiveData.privateKey).toBe('');
      expect(sensitiveData.mnemonic).toBe('');
    });

    it('should handle cleanup errors gracefully', async () => {
      const readOnlyData = Object.freeze({ privateKey: '0x1234' });

      // Should not throw, just log warning
      await expect(
        WalletSecurity.clearSensitiveData(readOnlyData)
      ).resolves.not.toThrow();
    });
  });
});