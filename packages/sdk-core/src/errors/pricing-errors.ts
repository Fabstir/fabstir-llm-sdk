/**
 * Pricing validation error types
 */

/**
 * Error thrown when pricing validation fails
 * Used for host-controlled pricing validation (100-100,000 range)
 */
export class PricingValidationError extends Error {
  constructor(message: string, public price?: bigint) {
    super(message);
    this.name = 'PricingValidationError';
  }
}
