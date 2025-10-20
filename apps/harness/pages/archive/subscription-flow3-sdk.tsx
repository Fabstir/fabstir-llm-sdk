// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { useState, useEffect } from 'react';
import { createBaseAccountSDK } from "@base-org/account";
import { encodeFunctionData, parseUnits, createPublicClient, http, getAddress, formatUnits } from "viem";
import { FabstirSDKCore } from '@fabstir/sdk-core';
import type { IPaymentManager } from '@fabstir/sdk-core';

// Get configuration from environment variables
const CHAIN_HEX = "0x14a34";  // Base Sepolia
const CHAIN_ID_NUM = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '84532');
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!;
const USDC = process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN as `0x${string}`;

// Test accounts from environment
const TEST_USER_1_ADDRESS = process.env.NEXT_PUBLIC_TEST_USER_1_ADDRESS!;
const TEST_USER_2_ADDRESS = process.env.NEXT_PUBLIC_TEST_USER_2_ADDRESS!;
const TEST_HOST_1_ADDRESS = process.env.NEXT_PUBLIC_TEST_HOST_1_ADDRESS!;
const TEST_HOST_2_ADDRESS = process.env.NEXT_PUBLIC_TEST_HOST_2_ADDRESS!;

// Note: In production, private key should NEVER be in browser code
// This is only for testing purposes - use a secure method in production
const TEST_USER_1_PRIVATE_KEY = "0x2d5db36770a53811d9a11163a5e6577bb867e19552921bf40f74064308bea952";

// ERC20 ABIs  
const erc20BalanceOfAbi = [{
  type: "function",
  name: "balanceOf",
  stateMutability: "view",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ name: "", type: "uint256" }]
}] as const;

interface Balances {
  testUser1?: string;
  primary?: string;
  sub?: string;
  host1?: string;
  host2?: string;
}

// Create global publicClient for viem operations
const publicClient = createPublicClient({ 
  chain: { 
    id: CHAIN_ID_NUM, 
    name: "base-sepolia", 
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, 
    rpcUrls: { default: { http: [RPC_URL] } } 
  } as any, 
  transport: http() 
});

export default function SubscriptionFlowSDK() {
  const [status, setStatus] = useState("Ready to start");
  const [currentStep, setCurrentStep] = useState(0);
  const [primaryAddr, setPrimaryAddr] = useState<string>("");
  const [subAddr, setSubAddr] = useState<string>("");
  const [balances, setBalances] = useState<Balances>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  
  // SDK instances
  const [sdk, setSdk] = useState<FabstirSDKCore | null>(null);
  const [paymentManager, setPaymentManager] = useState<IPaymentManager | null>(null);

  // Initialize FabstirSDKCore on mount
  useEffect(() => {
    const initSDK = async () => {
      try {
        const sdkInstance = new FabstirSDKCore({
          mode: 'production',
          chainId: CHAIN_ID_NUM,
          rpcUrl: RPC_URL,
          contractAddresses: {
            jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE,
            nodeRegistry: process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY,
            proofSystem: process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM,
            hostEarnings: process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS,
            fabToken: process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN,
            usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN
          },
          s5Config: {
            portalUrl: process.env.NEXT_PUBLIC_S5_PORTAL_URL,
            seedPhrase: process.env.NEXT_PUBLIC_S5_SEED_PHRASE
          }
        });

        setSdk(sdkInstance);
        console.log("FabstirSDKCore initialized");
      } catch (err) {
        console.error("Failed to initialize SDK:", err);
      }
    };

    initSDK();
  }, []);

  // Initialize Base Account SDK on mount (if not already connected)
  useEffect(() => {
    const loadBaseAccountSDK = async () => {
      if (typeof window !== "undefined") {
        // Check if already connected via /run page
        if ((window as any).__basProvider) {
          console.log("✅ Base Account SDK already connected from /run page");
          return;
        }
        
        // Otherwise initialize a new connection
        try {
          const bas = createBaseAccountSDK({
            appName: "Subscription Flow Test (SDK Version)",
            appChainIds: [CHAIN_ID_NUM],
            // Auto spend permissions are enabled by default
            subAccounts: {
              unstable_enableAutoSpendPermissions: true
            }
          });
          const provider = bas.getProvider();
          (window as any).__basProvider = provider;
          console.log("✅ Base Account SDK loaded successfully");
        } catch (error) {
          console.warn("Base Account SDK could not be loaded:", error);
        }
      }
    };
    loadBaseAccountSDK();
  }, []);

  // Helper: Get or create sub-account with auto spend permissions
  async function ensureSubAccount(provider: any, universal: `0x${string}`): Promise<`0x${string}`> {
    try {
      // First check for existing sub-accounts
      const resp = await provider.request({
        method: "wallet_getSubAccounts",
        params: [{ 
          account: universal, 
          domain: window.location.origin 
        }]
      }) as { subAccounts?: Array<{ address: `0x${string}` }> };

      if (resp?.subAccounts?.length) {
        console.log("Using existing sub-account:", resp.subAccounts[0]!.address);
        return resp.subAccounts[0]!.address;
      }
    } catch (e) {
      console.log("No existing sub-accounts found, creating new one");
    }

    try {
      // Create sub-account - auto spend permissions are enabled by default
      const created = await provider.request({
        method: "wallet_addSubAccount",
        params: [{ 
          account: { 
            type: "create"
          }, 
          domain: window.location.origin
        }]
      }) as { address: `0x${string}` };

      console.log("Created new sub-account with auto spend permissions:", created.address);
      return created.address;
    } catch (err) {
      console.error("Failed to create sub-account:", err);
      throw new Error("Failed to create sub-account");
    }
  }

  // Helper: Read all USDC balances
  async function readAllBalances(primary?: string, sub?: string) {
    const addresses: `0x${string}`[] = [
      getAddress(TEST_USER_1_ADDRESS),
      ...(primary ? [getAddress(primary)] : []),
      ...(sub ? [getAddress(sub)] : []),
      getAddress(TEST_HOST_1_ADDRESS),
      getAddress(TEST_HOST_2_ADDRESS)
    ].filter(Boolean) as `0x${string}`[];

    const results = await Promise.all(
      addresses.map(addr => 
        publicClient.readContract({ 
          address: USDC, 
          abi: erc20BalanceOfAbi, 
          functionName: "balanceOf", 
          args: [getAddress(addr)] 
        }) as Promise<bigint>
      )
    );

    const newBalances: Balances = {
      testUser1: formatUnits(results[0], 6),
    };

    let idx = 1;
    if (primary) newBalances.primary = formatUnits(results[idx++], 6);
    if (sub) newBalances.sub = formatUnits(results[idx++], 6);
    newBalances.host1 = formatUnits(results[idx++], 6);
    newBalances.host2 = formatUnits(results[idx], 6);

    setBalances(newBalances);
  }

  // Step 1: Fund primary account from TEST_USER_1 ($2 USDC) using SDK
  async function fundPrimaryAccount() {
    setLoading(true);
    setError("");
    setStatus("Connecting to Base Account SDK...");

    try {
      // Get Base Account SDK provider
      const provider = (window as any).__basProvider;
      if (!provider) {
        throw new Error("Base Account SDK not initialized. Please go to /run page first to connect your wallet with passkeys, then return here.");
      }

      // Connect to get primary account address (Base Account SDK smart wallet)
      const accounts = await provider.request({ 
        method: "eth_requestAccounts", 
        params: [] 
      }) as `0x${string}`[];
      const primary = accounts[0]!;
      setPrimaryAddr(primary);
      console.log("Connected to Base Account SDK smart wallet:", primary);

      // Now use FabstirSDKCore to send USDC from TEST_USER_1 to the smart wallet
      if (!sdk) throw new Error("FabstirSDKCore not initialized");

      setStatus("Authenticating with TEST_USER_1...");
      console.log("Authenticating SDK with TEST_USER_1 private key...");
      
      try {
        console.log("About to call sdk.authenticate...");
        await sdk.authenticate('privatekey', { privateKey: TEST_USER_1_PRIVATE_KEY });
        console.log("SDK authenticated successfully - no error thrown");
      } catch (authError: any) {
        console.error("Authentication error caught:", {
          message: authError.message,
          code: authError.code,
          stack: authError.stack,
          fullError: authError
        });
        throw authError;
      }
      
      console.log("Authentication complete, moving forward...");
      
      // Get PaymentManager for USDC transfer
      console.log("Getting PaymentManager...");
      const pm = sdk.getPaymentManager();
      if (!pm) {
        throw new Error("PaymentManager not available after authentication");
      }
      setPaymentManager(pm);
      console.log("PaymentManager obtained");

      setStatus("Sending $2 USDC from TEST_USER_1 to smart wallet...");
      
      // Use PaymentManager to transfer USDC
      const amount = BigInt(2 * 10**6); // $2 USDC (6 decimals)
      console.log("Calling sendToken with:", { 
        tokenAddress: USDC, 
        to: primary, 
        amount: amount.toString() 
      });
      
      let tx;
      try {
        tx = await pm.sendToken(
          USDC,
          primary,
          amount
        );
        console.log("Transfer transaction result:", tx);
      } catch (sendError: any) {
        console.error("SendToken error details:", {
          error: sendError,
          message: sendError.message,
          code: sendError.code,
          stack: sendError.stack
        });
        throw new Error(`Failed to send USDC: ${sendError.message || sendError}`);
      }

      setStatus("Waiting for transaction confirmation...");

      // Wait for transaction to be mined
      await new Promise(r => setTimeout(r, 5000));

      setStatus("✅ Step 1 complete: $2 USDC funded to smart wallet");
      setCurrentStep(1);
      
      // Wait for blockchain state to update
      await new Promise(r => setTimeout(r, 2000));
      await readAllBalances(primary);

    } catch (err: any) {
      console.error("Step 1 error:", err);
      setError("Step 1 failed: " + err.message);
      setStatus("❌ Step 1 failed");
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Create sub-account with auto spend permissions
  async function createSubAccountWithPermissions() {
    setLoading(true);
    setError("");
    setStatus("Creating sub-account with auto spend permissions...");

    try {
      const provider = (window as any).__basProvider;
      if (!provider) {
        throw new Error("Base Account SDK not initialized");
      }

      // Create or get sub-account - it will automatically have spend permissions
      const sub = await ensureSubAccount(provider, primaryAddr as `0x${string}`);
      setSubAddr(sub);

      // The sub-account now has auto spend permissions by default
      // No explicit approve call needed!
      
      setStatus("✅ Step 2 complete: Sub-account created with auto spend permissions");
      setCurrentStep(2);
      
      await new Promise(r => setTimeout(r, 2000));
      await readAllBalances(primaryAddr, sub);

    } catch (err: any) {
      setError("Step 2 failed: " + err.message);
      setStatus("❌ Step 2 failed");
    } finally {
      setLoading(false);
    }
  }

  // Step 3: Transfer $0.80 from sub-account to HOST_1
  async function payHost1() {
    setLoading(true);
    setError("");
    setStatus("Processing payment to HOST_1...");

    try {
      const provider = (window as any).__basProvider;
      if (!provider) throw new Error("Base Account SDK not initialized");
      if (!subAddr) throw new Error("Sub-account not initialized");

      // Use Base Account SDK to send from sub-account
      // The sub-account has auto spend permissions, so it will automatically
      // pull funds from the primary account if needed
      const txData = encodeFunctionData({
        abi: [{
          type: "function",
          name: "transfer",
          stateMutability: "nonpayable",
          inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
          outputs: [{ name: "", type: "bool" }]
        }],
        functionName: "transfer",
        args: [TEST_HOST_1_ADDRESS as `0x${string}`, parseUnits("0.8", 6)]
      });

      const txHash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: subAddr as `0x${string}`,
          to: USDC,
          data: txData,
          value: "0x0",
          chainId: CHAIN_HEX
        }]
      });

      setStatus("Waiting for transaction confirmation...");
      console.log("Payment to HOST_1 tx:", txHash);
      
      // Wait for transaction to be mined
      await new Promise(r => setTimeout(r, 5000));

      setStatus("✅ Step 3 complete: $0.80 paid to HOST_1 from sub-account");
      setCurrentStep(3);
      await new Promise(r => setTimeout(r, 2000));
      await readAllBalances(primaryAddr, subAddr);

    } catch (err: any) {
      setError("Step 3 failed: " + err.message);
      setStatus("❌ Step 3 failed");
    } finally {
      setLoading(false);
    }
  }

  // Step 4: Transfer $1.20 from sub-account to HOST_2
  async function payHost2() {
    setLoading(true);
    setError("");
    setStatus("Processing payment to HOST_2...");

    try {
      const provider = (window as any).__basProvider;
      if (!provider) throw new Error("Base Account SDK not initialized");
      if (!subAddr) throw new Error("Sub-account not initialized");

      // Use Base Account SDK to send from sub-account
      const txData = encodeFunctionData({
        abi: [{
          type: "function",
          name: "transfer",
          stateMutability: "nonpayable",
          inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
          outputs: [{ name: "", type: "bool" }]
        }],
        functionName: "transfer",
        args: [TEST_HOST_2_ADDRESS as `0x${string}`, parseUnits("1.2", 6)]
      });

      const txHash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: subAddr as `0x${string}`,
          to: USDC,
          data: txData,
          value: "0x0",
          chainId: CHAIN_HEX
        }]
      });

      setStatus("Waiting for transaction confirmation...");
      console.log("Payment to HOST_2 tx:", txHash);
      
      // Wait for transaction to be mined
      await new Promise(r => setTimeout(r, 5000));

      setStatus("✅ Step 4 complete: $1.20 paid to HOST_2 from sub-account");
      setCurrentStep(4);
      await new Promise(r => setTimeout(r, 2000));
      await readAllBalances(primaryAddr, subAddr);

    } catch (err: any) {
      setError("Step 4 failed: " + err.message);
      setStatus("❌ Step 4 failed");
    } finally {
      setLoading(false);
    }
  }

  // Run all steps
  async function runFullFlow() {
    try {
      // Reset to start
      setCurrentStep(0);
      setError("");
      
      // Step 1: Fund primary account
      await fundPrimaryAccount();
      await new Promise(r => setTimeout(r, 1000));
      
      // Step 2: Create sub-account with auto spend permissions
      await createSubAccountWithPermissions();
      await new Promise(r => setTimeout(r, 1000));
      
      // Step 3: Pay HOST_1
      await payHost1();
      await new Promise(r => setTimeout(r, 1000));
      
      // Step 4: Pay HOST_2
      await payHost2();
      
      setStatus("✅ All steps completed successfully!");
    } catch (err: any) {
      setError("Flow failed: " + err.message);
      setStatus("❌ Flow failed at step " + (currentStep + 1));
    }
  }

  // Clean up SDK on unmount
  useEffect(() => {
    return () => {
      if (sdk) {
        // SDK cleanup if needed
        console.log("Cleaning up SDK");
      }
    };
  }, [sdk]);

  // Refresh balances on mount
  useEffect(() => {
    readAllBalances();
  }, []);

  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>USDC Subscription Flow Test (SDK Version)</h1>
      
      <div style={{ marginBottom: "2rem", padding: "1rem", backgroundColor: "#f0f0f0", borderRadius: "8px" }}>
        <h3>Status: {status}</h3>
        {error && <p style={{ color: "red" }}>Error: {error}</p>}
        <p>Current Step: {currentStep}/4</p>
        {!primaryAddr && (
          <p style={{ fontSize: "0.9em", color: "#666", marginTop: "0.5rem" }}>
            <strong>Note:</strong> If you haven't connected your wallet yet, please visit{" "}
            <a href="/run" style={{ color: "#007bff" }}>/run</a> page first to connect with passkeys, then return here.
          </p>
        )}
      </div>

      <div style={{ marginBottom: "2rem" }}>
        <h3>Account Balances (USDC)</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ padding: "0.5rem", border: "1px solid #ddd" }}>TEST_USER_1:</td>
              <td style={{ padding: "0.5rem", border: "1px solid #ddd" }}>${balances.testUser1 || "0"}</td>
            </tr>
            {primaryAddr && (
              <tr>
                <td style={{ padding: "0.5rem", border: "1px solid #ddd" }}>Primary (Smart Wallet):</td>
                <td style={{ padding: "0.5rem", border: "1px solid #ddd" }}>${balances.primary || "0"}</td>
              </tr>
            )}
            {subAddr && (
              <tr>
                <td style={{ padding: "0.5rem", border: "1px solid #ddd" }}>Sub-account:</td>
                <td style={{ padding: "0.5rem", border: "1px solid #ddd" }}>${balances.sub || "0"}</td>
              </tr>
            )}
            <tr>
              <td style={{ padding: "0.5rem", border: "1px solid #ddd" }}>HOST_1:</td>
              <td style={{ padding: "0.5rem", border: "1px solid #ddd" }}>${balances.host1 || "0"}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.5rem", border: "1px solid #ddd" }}>HOST_2:</td>
              <td style={{ padding: "0.5rem", border: "1px solid #ddd" }}>${balances.host2 || "0"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginBottom: "2rem" }}>
        <h3>Test Flow Steps</h3>
        
        <div style={{ marginBottom: "1rem" }}>
          <button 
            onClick={fundPrimaryAccount} 
            disabled={loading || currentStep > 0}
            style={{ 
              padding: "0.5rem 1rem", 
              marginRight: "1rem",
              backgroundColor: currentStep > 0 ? "#90EE90" : "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loading || currentStep > 0 ? "not-allowed" : "pointer"
            }}
          >
            Step 1: Fund Smart Wallet ($2 USDC)
          </button>
          <span>{currentStep > 0 ? "✅" : ""}</span>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <button 
            onClick={createSubAccountWithPermissions} 
            disabled={loading || currentStep !== 1}
            style={{ 
              padding: "0.5rem 1rem", 
              marginRight: "1rem",
              backgroundColor: currentStep > 1 ? "#90EE90" : currentStep === 1 ? "#007bff" : "#ccc",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loading || currentStep !== 1 ? "not-allowed" : "pointer"
            }}
          >
            Step 2: Create Sub-account (with auto spend)
          </button>
          <span>{currentStep > 1 ? "✅" : ""}</span>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <button 
            onClick={payHost1} 
            disabled={loading || currentStep !== 2}
            style={{ 
              padding: "0.5rem 1rem", 
              marginRight: "1rem",
              backgroundColor: currentStep > 2 ? "#90EE90" : currentStep === 2 ? "#007bff" : "#ccc",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loading || currentStep !== 2 ? "not-allowed" : "pointer"
            }}
          >
            Step 3: Pay HOST_1 ($0.80)
          </button>
          <span>{currentStep > 2 ? "✅" : ""}</span>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <button 
            onClick={payHost2} 
            disabled={loading || currentStep !== 3}
            style={{ 
              padding: "0.5rem 1rem", 
              marginRight: "1rem",
              backgroundColor: currentStep > 3 ? "#90EE90" : currentStep === 3 ? "#007bff" : "#ccc",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loading || currentStep !== 3 ? "not-allowed" : "pointer"
            }}
          >
            Step 4: Pay HOST_2 ($1.20)
          </button>
          <span>{currentStep > 3 ? "✅" : ""}</span>
        </div>
      </div>

      <div style={{ marginTop: "2rem", paddingTop: "2rem", borderTop: "1px solid #ddd" }}>
        <button 
          onClick={runFullFlow} 
          disabled={loading}
          style={{ 
            padding: "1rem 2rem", 
            backgroundColor: "#28a745",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "1.1rem"
          }}
        >
          {loading ? "Processing..." : "Run Full Flow"}
        </button>
      </div>

      <div style={{ marginTop: "2rem", padding: "1rem", backgroundColor: "#f9f9f9", borderRadius: "8px" }}>
        <h4>Flow Details:</h4>
        <ol>
          <li>Connect to Base Account SDK to get smart wallet address</li>
          <li>Use FabstirSDKCore to send $2 USDC from TEST_USER_1 to smart wallet</li>
          <li>Create sub-account with auto spend permissions (no approval needed)</li>
          <li>Send $0.80 USDC from sub-account to HOST_1 (auto-pulls from smart wallet)</li>
          <li>Send $1.20 USDC from sub-account to HOST_2 (auto-pulls from smart wallet)</li>
        </ol>
        <p><strong>Total spent:</strong> $2.00 USDC (all from smart wallet via sub-account)</p>
        <p><strong>Key feature:</strong> No MetaMask popups for steps 3-4 due to auto spend permissions!</p>
      </div>
    </div>
  );
}