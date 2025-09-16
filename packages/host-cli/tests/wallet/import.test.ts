import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Wallet } from 'ethers';
import * as WalletManager from '../../src/wallet/manager';

describe('Wallet Import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('importFromPrivateKey', () => {
    it('should import wallet from valid private key', async () => {
      const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
      const wallet = await WalletManager.importFromPrivateKey(privateKey);
      expect(wallet).toBeDefined();
      expect(wallet.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    });

    it('should import wallet from private key without 0x prefix', async () => {
      const privateKey = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
      const wallet = await WalletManager.importFromPrivateKey(privateKey);
      expect(wallet).toBeDefined();
      expect(wallet.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    });

    it('should reject invalid private key', async () => {
      const invalidKey = 'invalid_key';
      await expect(
        WalletManager.importFromPrivateKey(invalidKey)
      ).rejects.toThrow('Invalid private key');
    });

    it('should reject private key with wrong length', async () => {
      const shortKey = '0x1234';
      await expect(
        WalletManager.importFromPrivateKey(shortKey)
      ).rejects.toThrow('Invalid private key');
    });

    it('should sanitize private key input', async () => {
      const privateKeyWithSpaces = ' 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 ';
      const wallet = await WalletManager.importFromPrivateKey(privateKeyWithSpaces);
      expect(wallet.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    });
  });

  describe('importFromMnemonic', () => {
    it('should import wallet from valid mnemonic', async () => {
      const mnemonic = 'test test test test test test test test test test test junk';
      const wallet = await WalletManager.importFromMnemonic(mnemonic);
      expect(wallet).toBeDefined();
      expect(wallet.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    });

    it('should import wallet from mnemonic with custom path', async () => {
      const mnemonic = 'test test test test test test test test test test test junk';
      const path = "m/44'/60'/0'/0/1";
      const wallet = await WalletManager.importFromMnemonic(mnemonic, path);
      expect(wallet).toBeDefined();
      expect(wallet.address).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    });

    it('should reject invalid mnemonic', async () => {
      const invalidMnemonic = 'invalid mnemonic phrase here';
      await expect(
        WalletManager.importFromMnemonic(invalidMnemonic)
      ).rejects.toThrow('Invalid mnemonic');
    });

    it('should reject mnemonic with wrong word count', async () => {
      const shortMnemonic = 'test test test';
      await expect(
        WalletManager.importFromMnemonic(shortMnemonic)
      ).rejects.toThrow('Invalid mnemonic');
    });

    it('should sanitize mnemonic input', async () => {
      const mnemonicWithExtraSpaces = '  test  test  test  test  test  test  test  test  test  test  test  junk  ';
      const wallet = await WalletManager.importFromMnemonic(mnemonicWithExtraSpaces);
      expect(wallet.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    });
  });

  describe('importFromJSON', () => {
    it('should import wallet from JSON with password', async () => {
      const wallet = Wallet.createRandom();
      const password = 'test-password-123';
      const json = await wallet.encrypt(password);

      const importedWallet = await WalletManager.importFromJSON(json, password);
      expect(importedWallet.address.toLowerCase()).toBe(wallet.address.toLowerCase());
    });

    it('should reject wrong password', async () => {
      const wallet = Wallet.createRandom();
      const password = 'correct-password';
      const json = await wallet.encrypt(password);

      await expect(
        WalletManager.importFromJSON(json, 'wrong-password')
      ).rejects.toThrow();
    });

    it('should reject invalid JSON', async () => {
      const invalidJson = 'not-valid-json';
      await expect(
        WalletManager.importFromJSON(invalidJson, 'password')
      ).rejects.toThrow('Invalid JSON wallet');
    });

    it('should reject malformed JSON wallet', async () => {
      const malformedJson = '{"invalid": "wallet"}';
      await expect(
        WalletManager.importFromJSON(malformedJson, 'password')
      ).rejects.toThrow('Invalid JSON wallet');
    });
  });

  describe('validateImportedWallet', () => {
    it('should validate imported wallet has all required properties', async () => {
      const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
      const wallet = await WalletManager.importFromPrivateKey(privateKey);
      const isValid = await WalletManager.validateImportedWallet(wallet);
      expect(isValid).toBe(true);
    });

    it('should detect corrupted wallet', async () => {
      const corruptedWallet = {
        address: '0xinvalid',
        privateKey: 'invalid'
      };
      const isValid = await WalletManager.validateImportedWallet(corruptedWallet as any);
      expect(isValid).toBe(false);
    });
  });
});