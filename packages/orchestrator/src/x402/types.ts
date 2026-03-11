// Re-export x402 types from sdk-core (main entry point — subpaths not supported)
export type {
  X402PaymentRequirement, X402PaymentRequired, X402Authorization,
  X402PaymentPayload, X402PaymentResponse, X402PricingConfig, X402BudgetConfig,
} from '@fabstir/sdk-core';
