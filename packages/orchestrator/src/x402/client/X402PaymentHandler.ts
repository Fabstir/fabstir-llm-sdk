// x402 client-side payment handler: creates EIP-3009 signed payments for 402 responses
import crypto from 'crypto';
import type {
  X402PaymentRequired,
  X402PaymentRequirement,
  X402Authorization,
  X402PaymentPayload,
} from '../types';

export class X402PaymentHandler {
  private readonly signer: any;
  private readonly usdcAddress: string;
  private readonly chainId: number;

  constructor(signer: any, usdcAddress: string, chainId: number) {
    this.signer = signer;
    this.usdcAddress = usdcAddress;
    this.chainId = chainId;
  }

  /** Check if an HTTP response requires x402 payment */
  isPaymentRequired(response: { status: number }): boolean {
    return response.status === 402;
  }

  /** Parse the 402 response body into structured requirements */
  async parseRequirements(
    response: { json(): Promise<any> },
  ): Promise<X402PaymentRequired> {
    return (await response.json()) as X402PaymentRequired;
  }

  /** Create a base64-encoded X-PAYMENT header for the given requirement */
  async createPaymentHeader(
    requirement: X402PaymentRequirement,
  ): Promise<string> {
    const address = await this.signer.getAddress();

    const authorization: X402Authorization = {
      from: address,
      to: requirement.payTo,
      value: requirement.maxAmountRequired,
      validAfter: '0',
      validBefore: String(
        Math.floor(Date.now() / 1000) + requirement.maxTimeoutSeconds,
      ),
      nonce: '0x' + crypto.randomUUID().replace(/-/g, ''),
    };

    const domain = {
      name: 'USD Coin',
      version: '2',
      chainId: this.chainId,
      verifyingContract: this.usdcAddress,
    };

    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };

    const signature: string = await this.signer.signTypedData(
      domain,
      types,
      authorization,
    );

    const payload: X402PaymentPayload = {
      x402Version: 1,
      scheme: 'exact',
      network: requirement.network,
      payload: { signature, authorization },
    };

    return btoa(JSON.stringify(payload));
  }
}
