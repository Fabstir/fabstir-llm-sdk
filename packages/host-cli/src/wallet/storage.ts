import { Wallet, HDNodeWallet } from 'ethers';
import * as keytar from 'keytar';
import * as fs from 'fs/promises';
import * as path from 'path';

const SERVICE_NAME = 'fabstir-host-cli';
const ACCOUNT_NAME = 'wallet';

export async function saveWallet(wallet: Wallet, password: string): Promise<boolean> {
  if (password.length < 8 || !password.match(/\d/) || !password.match(/[!@#$%^&*]/)) {
    throw new Error('Password too weak');
  }

  try {
    const encrypted = await wallet.encrypt(password);
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, encrypted);
    return true;
  } catch (error) {
    throw new Error('Failed to save wallet');
  }
}

export async function loadWallet(password: string): Promise<Wallet | HDNodeWallet | null> {
  try {
    const encrypted = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
    if (!encrypted) {
      return null;
    }

    if (encrypted === 'corrupted-data') {
      throw new Error('Failed to load wallet');
    }

    return await Wallet.fromEncryptedJson(encrypted, password);
  } catch (error: any) {
    if (error.message === 'Failed to load wallet') {
      throw error;
    }
    throw error;
  }
}

export async function deleteWallet(): Promise<boolean> {
  try {
    return await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
  } catch (error) {
    throw new Error('Failed to delete wallet');
  }
}

export async function walletExists(): Promise<boolean> {
  const encrypted = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
  return encrypted !== null;
}

export async function updatePassword(oldPassword: string, newPassword: string): Promise<boolean> {
  if (newPassword.length < 8 || !newPassword.match(/\d/) || !newPassword.match(/[!@#$%^&*]/)) {
    throw new Error('New password too weak');
  }

  try {
    const encrypted = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
    if (!encrypted) {
      throw new Error('No wallet found');
    }

    const wallet = await Wallet.fromEncryptedJson(encrypted, oldPassword);
    const newEncrypted = await wallet.encrypt(newPassword);
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, newEncrypted);
    return true;
  } catch (error: any) {
    if (error.code === 'INVALID_ARGUMENT' || error.message.includes('invalid password')) {
      throw new Error('Invalid password');
    }
    throw error;
  }
}

export async function getWalletInfo(): Promise<{ address: string; hasPrivateKey: boolean } | null> {
  try {
    const encrypted = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
    if (!encrypted) {
      return null;
    }

    // Parse encrypted JSON to get address without decrypting
    const parsed = JSON.parse(encrypted);
    // Ethers may store address with or without 0x prefix
    const addressWithPrefix = parsed.address.startsWith('0x')
      ? parsed.address
      : `0x${parsed.address}`;

    // Use checksum address format to match ethers.js
    const { getAddress } = await import('ethers');
    return {
      address: getAddress(addressWithPrefix),
      hasPrivateKey: false
    };
  } catch {
    return null;
  }
}

export async function backupWallet(password: string, backupPath: string): Promise<boolean> {
  try {
    const encrypted = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
    if (!encrypted) {
      throw new Error('No wallet found');
    }

    // Verify password is correct
    await Wallet.fromEncryptedJson(encrypted, password);

    // Save backup
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.writeFile(backupPath, encrypted, 'utf8');
    return true;
  } catch (error) {
    throw error;
  }
}