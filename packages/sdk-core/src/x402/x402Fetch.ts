// Copyright (c) 2025 Fabstir — BUSL-1.1

import type { X402PaymentRequired, X402PaymentRequirement } from './types';

/** Minimal interface for the x402 payment client */
export interface X402FetchClient {
  createPayment(requirement: X402PaymentRequirement): Promise<string>;
}

/** Minimal interface for budget tracking */
export interface X402FetchBudgetTracker {
  checkBudget(amount: string): void;
  recordSpend(amount: string): void;
}

/**
 * Fetch wrapper with automatic x402 payment handling.
 * On 402, signs a payment and retries once with X-PAYMENT header.
 */
export async function x402Fetch(
  url: string,
  options: RequestInit,
  x402Client?: X402FetchClient,
  budgetTracker?: X402FetchBudgetTracker,
): Promise<Response> {
  const response = await fetch(url, options);

  if (response.status !== 402) {
    return response;
  }

  if (!x402Client) {
    throw new Error('x402 payment required but no client configured');
  }

  const body: X402PaymentRequired = await response.json();
  const requirement = body.accepts[0];

  budgetTracker?.checkBudget(requirement.maxAmountRequired);

  const paymentHeader = await x402Client.createPayment(requirement);

  const retryHeaders: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    'X-PAYMENT': paymentHeader,
  };

  const retryResponse = await fetch(url, { ...options, headers: retryHeaders });

  if (retryResponse.status === 402) {
    throw new Error('x402 payment rejected after retry');
  }

  budgetTracker?.recordSpend(requirement.maxAmountRequired);

  return retryResponse;
}
