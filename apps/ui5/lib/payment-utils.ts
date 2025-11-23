/**
 * Payment Utilities for UI5 Real AI Integration
 *
 * Handles USDC deposit and approval for blockchain-based AI chat sessions.
 * Based on working implementation in apps/harness/pages/chat-context-rag-demo.tsx
 */

import { ethers, type Signer } from 'ethers';
import { parseUnits, formatUnits } from 'viem';

/**
 * Check USDC balance of an address
 */
export async function checkUSDCBalance(
  address: string,
  signer: Signer
): Promise<string> {
  const usdcAddress = process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!;

  const usdcContract = new ethers.Contract(
    usdcAddress,
    ['function balanceOf(address) view returns (uint256)'],
    signer
  );

  const balance = await usdcContract.balanceOf(address);
  return formatUnits(balance, 6); // USDC has 6 decimals
}

/**
 * Deposit USDC to user wallet from test faucet
 *
 * NOTE: This uses TEST_USER_1 as a faucet for testnet only.
 * In production, users would transfer USDC from their own sources.
 */
export async function depositUSDC(
  amount: string,
  recipientAddress: string,
  chainId: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    // Get RPC URL based on chain
    const rpcUrl = chainId === 84532
      ? process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA
      : process.env.NEXT_PUBLIC_RPC_URL_OPBNB_TESTNET;

    if (!rpcUrl) {
      throw new Error(`No RPC URL configured for chain ${chainId}`);
    }

    // Create provider and faucet wallet
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const faucetPrivateKey = process.env.NEXT_PUBLIC_TEST_USER_1_PRIVATE_KEY!;
    const faucetWallet = new ethers.Wallet(faucetPrivateKey, provider);

    // Get USDC contract
    const usdcAddress = process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!;
    const usdcContract = new ethers.Contract(
      usdcAddress,
      [
        'function transfer(address to, uint256 amount) returns (bool)',
        'function balanceOf(address) view returns (uint256)',
      ],
      faucetWallet
    );

    // Check faucet has enough balance
    const faucetBalance = await usdcContract.balanceOf(faucetWallet.address);
    const amountWei = parseUnits(amount, 6);

    if (faucetBalance < amountWei) {
      throw new Error(
        `Faucet insufficient balance. Has ${formatUnits(faucetBalance, 6)} USDC, need ${amount} USDC`
      );
    }

    // Transfer USDC to recipient
    console.debug(`[Payment] Transferring ${amount} USDC from faucet to ${recipientAddress}`);
    const tx = await usdcContract.transfer(recipientAddress, amountWei);

    console.debug(`[Payment] Transaction sent: ${tx.hash}`);
    console.debug(`[Payment] Waiting for 3 confirmations...`);

    await tx.wait(3); // Wait for 3 confirmations

    console.debug(`[Payment] ✅ Deposit complete`);

    return {
      success: true,
      txHash: tx.hash,
    };
  } catch (error: any) {
    console.error('[Payment] Deposit failed:', error);
    return {
      success: false,
      error: error.message || 'Deposit failed',
    };
  }
}

/**
 * Approve USDC for JobMarketplace contract
 *
 * This allows the JobMarketplace to spend USDC on behalf of the user
 * when creating AI chat sessions.
 */
export async function approveUSDC(
  amount: string,
  signer: Signer
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const usdcAddress = process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!;
    const jobMarketplaceAddress = process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE!;
    const userAddress = await signer.getAddress();

    const usdcContract = new ethers.Contract(
      usdcAddress,
      [
        'function approve(address spender, uint256 amount) returns (bool)',
        'function allowance(address owner, address spender) view returns (uint256)',
      ],
      signer
    );

    // Check current allowance
    console.debug(`[Payment] Checking current USDC allowance...`);
    const currentAllowance = await usdcContract.allowance(
      userAddress,
      jobMarketplaceAddress
    );

    const requiredAmount = parseUnits(amount, 6);

    console.debug(`[Payment] Current allowance: ${formatUnits(currentAllowance, 6)} USDC`);
    console.debug(`[Payment] Required: ${amount} USDC`);

    if (currentAllowance >= requiredAmount) {
      console.debug(`[Payment] ✅ Already approved (sufficient allowance)`);
      return {
        success: true,
      };
    }

    // Approve USDC (approve large amount for multiple sessions)
    console.debug(`[Payment] Approving ${amount} USDC for JobMarketplace...`);
    const tx = await usdcContract.approve(
      jobMarketplaceAddress,
      requiredAmount
    );

    console.debug(`[Payment] Approval transaction sent: ${tx.hash}`);
    console.debug(`[Payment] Waiting for 3 confirmations...`);

    await tx.wait(3);

    console.debug(`[Payment] ✅ USDC approved`);

    return {
      success: true,
      txHash: tx.hash,
    };
  } catch (error: any) {
    console.error('[Payment] Approval failed:', error);
    return {
      success: false,
      error: error.message || 'Approval failed',
    };
  }
}

/**
 * Get current USDC allowance for JobMarketplace
 */
export async function getUSDCAllowance(
  signer: Signer
): Promise<string> {
  const usdcAddress = process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!;
  const jobMarketplaceAddress = process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE!;
  const userAddress = await signer.getAddress();

  const usdcContract = new ethers.Contract(
    usdcAddress,
    ['function allowance(address owner, address spender) view returns (uint256)'],
    signer
  );

  const allowance = await usdcContract.allowance(userAddress, jobMarketplaceAddress);
  return formatUnits(allowance, 6);
}

/**
 * Estimate cost for an AI chat session
 *
 * @param estimatedTokens - Estimated number of tokens for the conversation
 * @param pricePerToken - Price per token in smallest unit (e.g., 2000 = 0.002 USDC)
 */
export function estimateSessionCost(
  estimatedTokens: number,
  pricePerToken: number
): string {
  // Price is in smallest unit (e.g., 2000 = 0.002 USDC per token)
  const costPerToken = pricePerToken / 1000000; // Convert to USDC
  const totalCost = estimatedTokens * costPerToken;
  return totalCost.toFixed(4); // Return formatted string
}

/**
 * Format USDC amount for display
 */
export function formatUSDC(amount: string | bigint): string {
  if (typeof amount === 'string') {
    const num = parseFloat(amount);
    return num.toFixed(2);
  }
  return formatUnits(amount, 6);
}
