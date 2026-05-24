// Delegate control plane (Spec §8) — the bridge↔UI handshake on loopback:
//   GET  /v1/delegate/status → { delegateAddress, payer|null, authorized,
//                                allowanceRemaining (raw USDC base-units STRING), chainId }
//   POST /v1/delegate/payer  { payer } → sets the payer when not given by flag.
// Mounted only on the loopback daemon (bind enforced in 5.3); no extra auth.
import { ethers } from 'ethers';
import type { FabstirSDKCore } from '@fabstir/sdk-core';

export interface ControlPlaneDeps {
  sdk: Pick<FabstirSDKCore, 'getPaymentManager'>;
  delegateAddress: string;
  chainId: number;
  initialPayer?: string | null;
}

export class DelegateControlPlane {
  private payer: string | null;

  constructor(private readonly deps: ControlPlaneDeps) {
    this.payer = deps.initialPayer ?? null;
  }

  getPayer(): string | null {
    return this.payer;
  }

  async handleStatus(_req: any, res: any): Promise<void> {
    let authorized = false;
    let allowanceRemaining = '0';
    if (this.payer) {
      const status = await (this.deps.sdk.getPaymentManager() as any).getDelegateAuthorization({
        payer: this.payer,
        delegate: this.deps.delegateAddress,
      });
      authorized = !!status.authorized;
      // bigint → string base units; UI formats with token decimals (never a JS number).
      allowanceRemaining = (status.remaining ?? 0n).toString();
    }
    res.status(200).json({
      delegateAddress: this.deps.delegateAddress,
      payer: this.payer,
      authorized,
      allowanceRemaining,
      chainId: this.deps.chainId,
    });
  }

  async handlePayer(req: any, res: any): Promise<void> {
    const payer = req.body?.payer;
    if (!payer || !ethers.isAddress(payer)) {
      res.status(400).json({ error: { message: 'Invalid payer address', type: 'invalid_request_error' } });
      return;
    }
    this.payer = payer;
    await this.handleStatus(req, res);
  }

  /** Mount the control-plane routes onto an express app (loopback daemon only). */
  mount(app: { get: Function; post: Function }): void {
    app.get('/v1/delegate/status', (q: any, s: any) => this.handleStatus(q, s));
    app.post('/v1/delegate/payer', (q: any, s: any) => this.handlePayer(q, s));
  }
}
