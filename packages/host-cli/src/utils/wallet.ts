// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const WALLET_FILE_PATH = path.join(os.homedir(), '.fabstir', 'wallet.json');

export async function getWallet(privateKey?: string): Promise<ethers.Wallet> {
  // If private key is provided, use it directly
  if (privateKey) {
    return new ethers.Wallet(privateKey);
  }

  // Otherwise, load from wallet file
  if (!fs.existsSync(WALLET_FILE_PATH)) {
    throw new Error('No wallet file found. Please import a wallet first using "fabstir-host wallet import"');
  }

  const walletData = JSON.parse(fs.readFileSync(WALLET_FILE_PATH, 'utf-8'));
  return new ethers.Wallet(walletData.privateKey);
}