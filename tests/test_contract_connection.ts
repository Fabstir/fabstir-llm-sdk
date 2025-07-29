// tests/test_contract_connection.ts
import { describe, it, expect, beforeAll } from "@jest/globals";
import { FabstirSDK } from "../src";
import { ethers } from "ethers";

describe("Contract Connection and Loading", () => {
  let sdk: FabstirSDK;

  beforeAll(async () => {
    sdk = new FabstirSDK({ network: "base-sepolia" });
    const provider = new ethers.providers.JsonRpcProvider(
      "http://localhost:8545"
    );
    await sdk.connect(provider);
  });

  it("should load JobMarketplace contract", async () => {
    const jobMarketplace = await sdk.contracts.getJobMarketplace();
    expect(jobMarketplace.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(jobMarketplace.interface).toBeDefined();
  });

  it("should load PaymentEscrow contract", async () => {
    const paymentEscrow = await sdk.contracts.getPaymentEscrow();
    expect(paymentEscrow.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it("should load NodeRegistry contract", async () => {
    const nodeRegistry = await sdk.contracts.getNodeRegistry();
    expect(nodeRegistry.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it("should verify contract deployment on correct network", async () => {
    const deployedCode = await sdk.provider.getCode(
      sdk.contracts.jobMarketplaceAddress
    );
    expect(deployedCode).not.toBe("0x");
    expect(deployedCode.length).toBeGreaterThan(10);
  });

  it("should get contract version", async () => {
    const version = await sdk.contracts.getContractVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
