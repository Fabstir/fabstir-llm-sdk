import { ethers } from 'ethers';
import * as path from 'path';
import { config } from 'dotenv';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

export interface TestWallet {
  address: string;
  privateKey: string;
  wallet: ethers.Wallet;
}

/**
 * Get test host wallet from environment
 */
export async function getTestHostWallet(provider: ethers.Provider): Promise<TestWallet> {
  const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('TEST_HOST_1_PRIVATE_KEY not found in environment');
  }

  const wallet = new ethers.Wallet(privateKey, provider);

  return {
    address: wallet.address,
    privateKey,
    wallet
  };
}

/**
 * Get test user wallet from environment
 */
export async function getTestUserWallet(provider: ethers.Provider): Promise<TestWallet> {
  const privateKey = process.env.TEST_USER_1_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('TEST_USER_1_PRIVATE_KEY not found in environment');
  }

  const wallet = new ethers.Wallet(privateKey, provider);

  return {
    address: wallet.address,
    privateKey,
    wallet
  };
}

/**
 * Check wallet balance
 */
export async function checkBalance(
  wallet: ethers.Wallet,
  minEthRequired: bigint = ethers.parseEther('0.01')
): Promise<{ eth: bigint; hasMinimum: boolean }> {
  const balance = await wallet.provider!.getBalance(wallet.address);

  return {
    eth: balance,
    hasMinimum: balance >= minEthRequired
  };
}

/**
 * Wait for transaction with logging
 */
export async function waitForTx(
  tx: ethers.TransactionResponse,
  confirmations = 1,
  label = 'Transaction'
): Promise<ethers.TransactionReceipt | null> {
  console.log(`${label}: Waiting for tx ${tx.hash}...`);
  const receipt = await tx.wait(confirmations);

  if (receipt?.status === 1) {
    console.log(`${label}: Success! Gas used: ${receipt.gasUsed.toString()}`);
  } else {
    console.log(`${label}: Failed!`);
  }

  return receipt;
}