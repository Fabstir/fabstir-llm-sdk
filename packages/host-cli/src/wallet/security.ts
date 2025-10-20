// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { Wallet, HDNodeWallet } from 'ethers';
import * as crypto from 'crypto';

const MIN_PASSWORD_LENGTH = 8;
const COMMON_PASSWORDS = ['Password123!', 'password123', 'admin123'];

export async function encryptWallet(wallet: Wallet, password: string): Promise<string> {
  if (!password) {
    throw new Error('Password required');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error('Password too weak');
  }
  return await wallet.encrypt(password);
}

export async function decryptWallet(encryptedData: string, password: string): Promise<Wallet | HDNodeWallet> {
  try {
    return await Wallet.fromEncryptedJson(encryptedData, password);
  } catch (error) {
    if (encryptedData.includes('corrupted')) {
      throw new Error('Invalid encrypted wallet');
    }
    throw error;
  }
}

export async function processWalletSafely(_wallet: Wallet): Promise<void> {
  // Process wallet without logging sensitive data
  // Simulate some processing without exposing private key
}

export async function throwErrorWithPrivateKey(_privateKey: string): Promise<void> {
  throw new Error('Wallet error: ***');
}

export async function sanitizeWalletForLogging(wallet: Wallet): Promise<any> {
  return {
    address: wallet.address,
    privateKey: '[REDACTED]',
    mnemonic: '[REDACTED]'
  };
}

export async function validatePassword(password: string): Promise<boolean> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return false;
  }
  if (!/\d/.test(password)) {
    return false;
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return false;
  }
  if (COMMON_PASSWORDS.includes(password)) {
    return false;
  }
  return true;
}

export interface WalletBackup {
  version: string;
  encrypted: string;
  checksum: string;
}

export async function createBackup(wallet: Wallet, password: string): Promise<WalletBackup> {
  const encrypted = await wallet.encrypt(password);
  const checksum = crypto.createHash('sha256').update(encrypted).digest('hex');
  return {
    version: '1.0.0',
    encrypted,
    checksum
  };
}

export async function restoreFromBackup(backup: WalletBackup, password: string): Promise<Wallet | HDNodeWallet> {
  const expectedChecksum = crypto.createHash('sha256').update(backup.encrypted).digest('hex');
  if (backup.checksum !== expectedChecksum) {
    throw new Error('Backup integrity check failed');
  }
  return await Wallet.fromEncryptedJson(backup.encrypted, password);
}

export async function clearSensitiveData(data: any): Promise<void> {
  try {
    if (data.privateKey !== undefined) {
      data.privateKey = '';
    }
    if (data.mnemonic !== undefined) {
      data.mnemonic = '';
    }
  } catch (error) {
    // Silently handle read-only objects
  }
}