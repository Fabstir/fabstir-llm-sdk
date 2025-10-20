// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

// src/types/index.ts
import { ethers } from 'ethers';

// Configuration interface for SDK initialization
export interface SDKConfig {
  rpcUrl?: string;  // Default to process.env.RPC_URL_BASE_SEPOLIA
  s5PortalUrl?: string;  // Default to process.env.S5_PORTAL_URL
  contractAddresses?: {
    jobMarketplace?: string;
    nodeRegistry?: string;
    fabToken?: string;
    usdcToken?: string;
  };
  smartWallet?: {
    enabled: boolean;
    paymasterUrl?: string;
    sponsorDeployment?: boolean;
  };
}

// Options for creating a session
export interface SessionOptions {
  hostAddress: string;
  paymentAmount: string;  // ETH amount as string (e.g., "0.001")
  pricePerToken: number;  // Price in gwei per token
  duration: number;       // Session duration in seconds
  proofInterval: number;  // Number of tokens between proof checkpoints
}

// Options for payments
export interface PaymentOptions {
  type: 'ETH' | 'USDC';
  amount: string;  // Amount as string to avoid precision issues
  recipient: string;  // Address of the recipient
}

// Result from authentication
export interface AuthResult {
  user: { address: string };
  signer: ethers.Signer;
  s5Seed: string;  // 12-word seed phrase for S5
}

// SDK-specific error interface
export interface SDKError extends Error {
  code: string;  // Error code for programmatic handling
  details?: any;  // Additional error context
}