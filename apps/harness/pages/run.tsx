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
      await provider.request({ method: "wallet_getCapabilities", params: [[CHAIN_HEX]] });

      // 4) batch calls (approve USDC + create session job)
      const depositAmount = parseUnits("2", 6); // 2 USDC
      const pricePerToken = parseUnits("0.002", 6); // 0.002 USDC per token
      
      const approveData = encodeFunctionData({
        abi: erc20ApproveAbi, 
        functionName: "approve",
        args: [JOB_MARKETPLACE, depositAmount]
      });

      const createSessionData = encodeFunctionData({
        abi: createSessionJobAbi,
        functionName: "createSessionJobWithToken",
        args: [
          "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7", // host address
          USDC,
          depositAmount,
          pricePerToken,
          BigInt(86400), // 24 hour duration
          BigInt(100) // proof interval
        ]
      });

      const calls = [
        { to: USDC, data: approveData as `0x${string}` },
        { to: JOB_MARKETPLACE, data: createSessionData as `0x${string}` }
      ];

      // 5) send wallet-led batch via EIP-5792 v2 from the Sub-account
      const { id } = await provider.request({
        method: "wallet_sendCalls",
        params: [{
          version: "2.0.0",
          chainId: CHAIN_HEX,
          from,
          calls,
          capabilities: { atomic: { required: true } } // v2 shape
        }]
      }) as { id: string };

      setLog(`submitted: ${id} — polling…`);

      // 6) poll for completion
      for (let i = 0; i < 60; i++) { // Max 60 attempts (~ 1 minute)
        const status = await provider.request({
          method: "wallet_getCallsStatus",
          params: [{ id }]  // Pass as object
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