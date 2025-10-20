// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

// Define only the minimal types needed for tests
export interface SessionParams {
  hostAddress: string;
  depositAmount: string; // in wei
  pricePerToken: string; // in wei
  maxDuration: number; // in seconds
}

export interface SessionJob {
  jobId: number;
  status: 'Active' | 'Completed' | 'TimedOut' | 'Abandoned';
  depositAmount: string;
  hostAddress: string;
}

export interface SessionStatus {
  status: string;
  provenTokens: number;
  depositAmount: string;
}

export type TxReceipt = {
  transactionHash: string;
  blockNumber: number;
  gasUsed: string;
}