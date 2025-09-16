import { isAddress } from 'ethers';

export function isValidAddress(address: string): boolean {
  return isAddress(address);
}

export function isValidPrivateKey(privateKey: string): boolean {
  const cleanKey = privateKey.trim();
  const keyWithPrefix = cleanKey.startsWith('0x') ? cleanKey : `0x${cleanKey}`;
  return /^0x[a-fA-F0-9]{64}$/.test(keyWithPrefix);
}

export function isValidMnemonic(mnemonic: string): boolean {
  const words = mnemonic.trim().split(/\s+/);
  return words.length === 12 || words.length === 24;
}

export function isValidDerivationPath(path: string): boolean {
  return /^m(\/\d+'?)+$/.test(path);
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateWalletInput(input: {
  address?: string;
  privateKey?: string;
  mnemonic?: string;
}): ValidationResult {
  const errors: string[] = [];

  if (input.address && !isValidAddress(input.address)) {
    errors.push('Invalid address format');
  }

  if (input.privateKey && !isValidPrivateKey(input.privateKey)) {
    errors.push('Invalid private key format');
  }

  if (input.mnemonic && !isValidMnemonic(input.mnemonic)) {
    errors.push('Invalid mnemonic phrase');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}