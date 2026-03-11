// Copyright (c) 2025 Fabstir — BUSL-1.1

/** What the server demands in a 402 response */
export interface X402PaymentRequirement {
  scheme: 'exact';
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
}

/** Full 402 response body */
export interface X402PaymentRequired {
  x402Version: 1;
  accepts: X402PaymentRequirement[];
  error: string;
}

/** EIP-3009 transferWithAuthorization fields */
export interface X402Authorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

/** Client's signed payment sent in X-PAYMENT header */
export interface X402PaymentPayload {
  x402Version: 1;
  scheme: 'exact';
  network: string;
  payload: {
    signature: string;
    authorization: X402Authorization;
  };
}

/** Server's settlement result */
export interface X402PaymentResponse {
  success: boolean;
  transaction?: string;
  network: string;
  payer?: string;
  errorReason?: string;
  sessionToken?: string;  // V2 session token for reuse
}

/** Server-side pricing configuration */
export interface X402PricingConfig {
  orchestratePrice: string;
  payTo: string;
  asset: string;
  network: string;
  maxTimeoutSeconds: number;
}

/** Client-side budget configuration */
export interface X402BudgetConfig {
  maxX402Spend: string;
}
