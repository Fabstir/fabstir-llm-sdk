// tests/test_payment_flow.ts
import { describe, it, expect, beforeAll } from "vitest";
import { FabstirSDK, PaymentStatus } from "../src";
import { ethers } from "ethers";

describe("Payment and Settlement Flow", () => {
  let sdk: FabstirSDK;
  let completedJobId: number;

  beforeAll(async () => {
    sdk = new FabstirSDK({ network: "base-sepolia" });
    const provider = new ethers.providers.JsonRpcProvider(
      "http://localhost:8545"
    );
    await sdk.connect(provider);

    completedJobId = 1;
  });

  it("should get payment details for completed job", async () => {
    const payment = await sdk.getPaymentDetails(completedJobId);

    expect(payment.amount).toBeGreaterThan(0);
    expect(payment.token).toBeDefined();
    expect(payment.status).toBe(PaymentStatus.ESCROWED);
    expect(payment.recipient).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it("should calculate actual cost based on tokens used", async () => {
    const actualCost = await sdk.calculateActualCost(completedJobId);

    expect(actualCost.totalCost).toBeGreaterThan(0);
    expect(actualCost.tokensUsed).toBeGreaterThan(0);
    expect(actualCost.pricePerToken).toBeGreaterThan(0);
    expect(actualCost.breakdown).toBeDefined();
    expect(actualCost.breakdown.hostPayment).toBe(actualCost.totalCost * 0.85);
    expect(actualCost.breakdown.treasuryFee).toBe(actualCost.totalCost * 0.1);
    expect(actualCost.breakdown.stakerReward).toBe(actualCost.totalCost * 0.05);
  });

  it("should approve and release payment", async () => {
    const tx = await sdk.approveJobPayment(completedJobId);
    expect(tx.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);

    const receipt = await tx.wait();
    expect(receipt.status).toBe(1);

    const paymentStatus = await sdk.getPaymentStatus(completedJobId);
    expect(paymentStatus).toBe(PaymentStatus.RELEASED);
  });

  it("should get payment transaction history", async () => {
    const history = await sdk.getPaymentHistory(completedJobId);

    expect(history.length).toBeGreaterThan(0);
    expect(history[0].event).toBe("PaymentEscrowed");
    expect(history[history.length - 1].event).toBe("PaymentReleased");
  });

  it("should handle refunds for cancelled jobs", async () => {
    const cancelledJobId = 2;

    const refundTx = await sdk.requestRefund(cancelledJobId);
    const receipt = await refundTx.wait();

    expect(receipt.status).toBe(1);

    const refundStatus = await sdk.getPaymentStatus(cancelledJobId);
    expect(refundStatus).toBe(PaymentStatus.REFUNDED);
  });

  it("should emit payment events", async () => {
    const events: any[] = [];

    const unsubscribe = sdk.onPaymentEvent((event) => {
      events.push(event);
    });

    // Trigger a payment
    await sdk.approveJobPayment(3);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === "PaymentReleased")).toBe(true);

    unsubscribe();
  });
});
