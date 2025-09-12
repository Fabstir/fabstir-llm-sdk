import { useState } from "react";
import { createBaseAccountSDK } from "@base-org/account";
import { encodeFunctionData, parseUnits } from "viem";

const CHAIN_HEX = "0x14a34"; // Base Sepolia chain ID (84532 in hex)
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const; // Base Sepolia USDC
const JOB_MARKETPLACE = "0xD937c594682Fe74E6e3d06239719805C04BE804A" as const; // JobMarketplace contract

const erc20ApproveAbi = [{
  type: "function",
  name: "approve",
  stateMutability: "nonpayable",
  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }]
}] as const;

const createSessionJobAbi = [{
  type: "function",
  name: "createSessionJobWithToken",
  stateMutability: "nonpayable",
  inputs: [
    { name: "host", type: "address" },
    { name: "token", type: "address" },
    { name: "deposit", type: "uint256" },
    { name: "pricePerToken", type: "uint256" },
    { name: "duration", type: "uint256" },
    { name: "proofInterval", type: "uint256" }
  ],
  outputs: [{ name: "", type: "uint256" }]
}] as const;

export default function Run() {
  const [log, setLog] = useState("ready");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      setLog("initializing…");
      console.log("Starting wallet connection...");

      // 1) init Base Account SDK (Smart Wallet, wallet-led flow)
      const bas = createBaseAccountSDK({
        appName: "Fabstir Harness",
        appChainIds: [84532], // Base Sepolia chain ID
      });
      const provider = bas.getProvider();
      console.log("Provider initialized:", provider);
      
      // Expose provider for keep-alive in tests
      (window as any).__basProvider = provider;

      // 2) connect accounts; pick Sub-account (2nd entry if present)
      setLog("requesting accounts...");
      const accounts = await provider.request({ method: "eth_requestAccounts", params: [] }) as string[];
      const from = accounts[1] ?? accounts[0]; // Sub-account preferred
      setLog(`connected: ${from.slice(0, 10)}...`);

      // 3) optional: check capabilities for this chain
      // Commented out for now as it's causing parameter errors
      // await provider.request({ 
      //   method: "wallet_getCapabilities", 
      //   params: [{ account: from, chainIds: [CHAIN_HEX] }] 
      // });

      // 4) Simple USDC transfer for testing wallet connection
      const transferAmount = parseUnits("0.1", 6); // 0.1 USDC
      
      // Transfer USDC to TEST_HOST_1_ADDRESS as a simple test
      const transferData = encodeFunctionData({
        abi: [{
          type: "function",
          name: "transfer",
          stateMutability: "nonpayable",
          inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
          outputs: [{ name: "", type: "bool" }]
        }],
        functionName: "transfer",
        args: ["0x4594f755f593b517bb3194f4dec20c48a3f04504" as `0x${string}`, transferAmount] // TEST_HOST_1_ADDRESS (lowercase)
      });

      const calls = [
        { to: USDC, data: transferData as `0x${string}` }
      ];

      // 5) send wallet-led batch via EIP-5792 v2 from the Sub-account
      const result = await provider.request({
        method: "wallet_sendCalls",
        params: [{
          version: "2.0.0",
          chainId: CHAIN_HEX,
          from,
          calls,
          capabilities: { atomic: { required: true } } // v2 shape
        }]
      });
      
      console.log("wallet_sendCalls result:", result);
      
      // The result might be a string ID directly or an object with an id property
      const id = typeof result === 'string' ? result : (result as any).id;
      
      if (!id) {
        throw new Error("No transaction ID returned from wallet_sendCalls");
      }

      setLog(`submitted: ${id} — polling…`);

      // 6) poll for completion
      for (let i = 0; i < 60; i++) { // Max 60 attempts (~ 1 minute)
        const status = await provider.request({
          method: "wallet_getCallsStatus",
          params: [id]  // Pass id directly as string
        }) as { status: string | number; receipts?: Array<{ transactionHash?: string }> };

        // Check if status is CONFIRMED (200-series code) - handle both string and numeric
        if (
          status.status === "CONFIRMED" ||
          (typeof status.status === 'string' && status.status.startsWith("2")) ||
          (typeof status.status === 'number' && status.status >= 200 && status.status < 300)
        ) {
          const txHash = status.receipts?.[0]?.transactionHash ?? "no hash";
          setLog(`done: 200 - tx: ${txHash}\nGasless execution complete`);
          console.log("✅ Gasless execution complete!");
          setRunning(false);
          break;
        } else if (status.status === "FAILED") {
          setLog(`failed: ${status.status}`);
          break;
        }
        
        await new Promise(r => setTimeout(r, 1200));
      }
    } catch (error: any) {
      setLog(`Error: ${error.message}`);
      console.error(error);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <main style={{ padding: 24 }}>
        <h1>Fabstir Harness - Real Gas Sponsorship</h1>
        <p>Base Sepolia - Coinbase Smart Wallet - EIP-5792 v2</p>
        <button id="start" onClick={run} disabled={running}>
          {running ? "Running..." : "Run sponsored batch"}
        </button>
        <pre>{log}</pre>
      </main>
    </>
  );
}