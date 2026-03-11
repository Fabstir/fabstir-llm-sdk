// Express middleware: x402 HTTP Payment Protocol gate
import type { RequestHandler, Request, Response, NextFunction } from 'express';
import type {
  X402PricingConfig,
  X402PaymentPayload,
  X402PaymentRequired,
  X402PaymentRequirement,
} from '../types';
import type { NonceRegistry } from './NonceRegistry';

/** Base64-decode and JSON-parse an X-PAYMENT header into X402PaymentPayload */
export function decodeX402Payment(header: string): X402PaymentPayload {
  const json = atob(header);
  return JSON.parse(json) as X402PaymentPayload;
}

/** Validate payload fields against server config. Throws on invalid. */
export function validatePayloadFields(
  payload: X402PaymentPayload,
  config: X402PricingConfig,
): void {
  if (payload.scheme !== 'exact') {
    throw new Error(`Unsupported scheme: ${payload.scheme}`);
  }
  if (payload.network !== config.network) {
    throw new Error(
      `Invalid network: expected ${config.network}, got ${payload.network}`,
    );
  }
  const value = BigInt(payload.payload.authorization.value);
  const required = BigInt(config.orchestratePrice);
  if (value < required) {
    throw new Error(
      `Insufficient payment: need ${required}, got ${value}`,
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const validBefore = Number(payload.payload.authorization.validBefore);
  if (validBefore <= now) {
    throw new Error('Payment expired: validBefore is in the past');
  }
}

function buildPaymentRequired(
  config: X402PricingConfig,
  error: string,
): X402PaymentRequired {
  const requirement: X402PaymentRequirement = {
    scheme: 'exact',
    network: config.network,
    maxAmountRequired: config.orchestratePrice,
    resource: '/v1/orchestrate',
    description: 'Orchestration fee',
    payTo: config.payTo,
    asset: config.asset,
    maxTimeoutSeconds: config.maxTimeoutSeconds,
  };
  return { x402Version: 1, accepts: [requirement], error };
}

function reply402(res: Response, config: X402PricingConfig, error: string): void {
  res.status(402).json(buildPaymentRequired(config, error));
}

/** Express middleware that enforces x402 payment via X-PAYMENT header */
export function x402PaymentGate(config: X402PricingConfig, nonceRegistry?: NonceRegistry): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers['x-payment'] as string | undefined;
    if (!header) {
      reply402(res, config, 'Missing X-PAYMENT header');
      return;
    }
    let payload: X402PaymentPayload;
    try {
      payload = decodeX402Payment(header);
    } catch {
      reply402(res, config, 'Malformed X-PAYMENT header: invalid base64 or JSON');
      return;
    }
    try {
      validatePayloadFields(payload, config);
    } catch (err: any) {
      reply402(res, config, err.message);
      return;
    }
    if (nonceRegistry && !nonceRegistry.checkAndRecord(payload.payload.authorization.nonce)) {
      reply402(res, config, 'Nonce already used (replay detected)');
      return;
    }
    (req as any).x402Payment = payload;
    next();
  };
}
