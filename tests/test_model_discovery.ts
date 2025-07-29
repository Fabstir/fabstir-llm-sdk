// tests/test_model_discovery.ts
import { describe, it, expect, beforeAll } from "vitest";
import { FabstirSDK, Model, ModelFilter } from "../src";
import { ethers } from "ethers";

describe("Model Discovery and Selection", () => {
  let sdk: FabstirSDK;

  beforeAll(async () => {
    sdk = new FabstirSDK({ network: "base-sepolia" });
    const provider = new ethers.providers.JsonRpcProvider(
      "http://localhost:8545"
    );
    await sdk.connect(provider);
  });

  it("should list all available models", async () => {
    const models = await sdk.listModels();

    expect(models.length).toBeGreaterThan(0);
    expect(models[0].id).toBeDefined();
    expect(models[0].name).toBeDefined();
    expect(models[0].parameters).toBeDefined();
    expect(models[0].pricePerToken).toBeGreaterThan(0);
  });

  it("should filter models by size", async () => {
    const filter: ModelFilter = {
      maxParameters: 13_000_000_000, // 13B
      minParameters: 7_000_000_000, // 7B
    };

    const models = await sdk.listModels(filter);
    models.forEach((model) => {
      expect(model.parameters).toBeGreaterThanOrEqual(7_000_000_000);
      expect(model.parameters).toBeLessThanOrEqual(13_000_000_000);
    });
  });

  it("should get model details by ID", async () => {
    const model = await sdk.getModel("llama2-7b");

    expect(model.id).toBe("llama2-7b");
    expect(model.name).toContain("LLaMA");
    expect(model.contextLength).toBe(4096);
    expect(model.capabilities).toContain("text-generation");
  });

  it("should find cheapest model for requirements", async () => {
    const requirements = {
      minContextLength: 2048,
      capabilities: ["text-generation"],
      maxPrice: ethers.utils.parseUnits("0.0001", 6), // $0.0001 per token
    };

    const model = await sdk.findCheapestModel(requirements);
    expect(model).toBeDefined();
    expect(model.pricePerToken).toBeLessThanOrEqual(requirements.maxPrice);
  });

  it("should get model availability across nodes", async () => {
    const availability = await sdk.getModelAvailability("llama2-7b");

    expect(availability.totalNodes).toBeGreaterThan(0);
    expect(availability.onlineNodes).toBeGreaterThan(0);
    expect(availability.averageLatency).toBeGreaterThan(0);
    expect(availability.lowestPrice).toBeGreaterThan(0);
  });
});
