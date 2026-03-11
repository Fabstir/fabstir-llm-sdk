// Copyright (c) 2025 Fabstir — BUSL-1.1
import type { X402PaymentRequirement, X402PaymentPayload, X402PaymentResponse, X402Authorization } from './types';

const TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
  ],
};

function generateBytes32Nonce(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return '0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Browser-compatible x402 payment client. Uses globalThis.crypto and btoa only. */
export class X402Client {
  private readonly signer: any;
  private readonly usdcAddress: string;
  private readonly chainId: number;

  constructor(signer: any, usdcAddress: string, chainId: number) {
    this.signer = signer;
    this.usdcAddress = usdcAddress;
    this.chainId = chainId;
  }

  isPaymentRequired(response: { status: number }): boolean {
    return response.status === 402;
  }

  async createPayment(requirement: X402PaymentRequirement): Promise<string> {
    const address = await this.signer.getAddress();
    const authorization: X402Authorization = {
      from: address,
      to: requirement.payTo,
      value: requirement.maxAmountRequired,
      validAfter: '0',
      validBefore: String(Math.floor(Date.now() / 1000) + requirement.maxTimeoutSeconds),
      nonce: generateBytes32Nonce(),
    };
    const domain = {
      name: 'USD Coin', version: '2',
      chainId: this.chainId, verifyingContract: this.usdcAddress,
    };
    const signature = await this.signer.signTypedData(domain, TYPES, authorization);
    const payload: X402PaymentPayload = {
      x402Version: 1, scheme: 'exact', network: requirement.network,
      payload: { signature, authorization },
    };
    return btoa(JSON.stringify(payload));
  }

  handleResponse(response: {
    headers: { get(name: string): string | null };
  }): X402PaymentResponse | null {
    const header = response.headers.get('X-PAYMENT-RESPONSE');
    if (!header) return null;
    return JSON.parse(header) as X402PaymentResponse;
  }
}
