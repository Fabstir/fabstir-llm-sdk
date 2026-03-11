// On-chain settlement for x402 EIP-3009 transferWithAuthorization
import { ethers } from 'ethers';
import { TRANSFER_WITH_AUTHORIZATION_ABI } from './usdc-transfer-auth-abi';
import type { X402PaymentPayload, X402PaymentResponse } from '../types';

export class X402PaymentValidator {
  private contract: ethers.Contract;

  constructor(signer: any, usdcAddress: string) {
    this.contract = new ethers.Contract(
      usdcAddress,
      TRANSFER_WITH_AUTHORIZATION_ABI,
      signer,
    );
  }

  async validate(payload: X402PaymentPayload): Promise<X402PaymentResponse> {
    const { authorization, signature } = payload.payload;
    const { v, r, s } = ethers.Signature.from(signature);
    try {
      const tx = await this.contract.transferWithAuthorization(
        authorization.from,
        authorization.to,
        authorization.value,
        authorization.validAfter,
        authorization.validBefore,
        authorization.nonce,
        v,
        r,
        s,
      );
      const receipt = await tx.wait(3);
      return {
        success: true,
        transaction: receipt.hash,
        network: payload.network,
        payer: authorization.from,
      };
    } catch (err: any) {
      return {
        success: false,
        network: payload.network,
        errorReason: err.message,
      };
    }
  }
}
