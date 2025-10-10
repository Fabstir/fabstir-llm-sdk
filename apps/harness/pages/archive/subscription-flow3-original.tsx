import { useState, useEffect } from 'react';
import { createBaseAccountSDK } from "@base-org/account";
import { encodeFunctionData, parseUnits, createPublicClient, http, getAddress, formatUnits } from "viem";
import { ethers } from 'ethers';

// Chain configuration
const CHAIN_HEX = "0x14a34";  // Base Sepolia
const CHAIN_ID_NUM = 84532;
const RPC_URL = "https://base-sepolia.g.alchemy.com/v2/1pZoccdtgU8CMyxXzE3l_ghnBBaJABMR";

// Contract addresses
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

// Test accounts from .env.test
const TEST_USER_1_ADDRESS = "0x8D642988E3e7b6DB15b6058461d5563835b04bF6";
const TEST_USER_1_PRIVATE_KEY = "0x2d5db36770a53811d9a11163a5e6577bb867e19552921bf40f74064308bea952"; // Replace with actual key
const TEST_HOST_1_ADDRESS = "0x4594F755F593B517Bb3194F4DeC20C48a3f04504";
const TEST_HOST_2_ADDRESS = "0x20f2A5FCDf271A5E6b04383C2915Ea980a50948c";

// ERC20 ABIs
const erc20TransferAbi = [{
  type: "function",
  name: "transfer",
  stateMutability: "nonpayable",
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }]
}] as const;

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

export default function SubscriptionFlow() {
  const [status, setStatus] = useState("Ready to start");
  const [currentStep, setCurrentStep] = useState(0);
  const [primaryAddr, setPrimaryAddr] = useState<string>("");
  const [subAddr, setSubAddr] = useState<string>("");
  const [balances, setBalances] = useState<Balances>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

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
      // Create sub-account - auto spend permissions are enabled by default in SDK 2.1.0+
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
      throw new Error("Failed to create sub-account. Make sure you're using SDK version 2.0.2-canary.20250822164845 or later");
    }
  }

  // Helper: Read all USDC balances
  async function readAllBalances(primaryAddress?: string, subAddress?: string) {
    const client = createPublicClient({ 
      chain: { 
        id: CHAIN_ID_NUM, 
        name: "base-sepolia", 
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, 
        rpcUrls: { default: { http: [RPC_URL] } } 
      } as any, 
      transport: http() 
    });

    const primary = primaryAddress || primaryAddr;
    const sub = subAddress || subAddr;

    const addresses = [
      TEST_USER_1_ADDRESS,
      primary,
      sub,
      TEST_HOST_1_ADDRESS,
      TEST_HOST_2_ADDRESS
    ].filter(Boolean) as `0x${string}`[];

    const results = await Promise.all(
      addresses.map(addr => 
        client.readContract({ 
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

  // Step 1: Fund primary account from TEST_USER_1 ($2 USDC)
  async function fundPrimaryAccount() {
    setLoading(true);
    setError("");
    setStatus("Funding primary account from TEST_USER_1...");

    try {
      // Initialize Base Account SDK with auto spend permissions enabled (default)
      const bas = createBaseAccountSDK({
        appName: "Subscription Flow Test",
        appChainIds: [CHAIN_ID_NUM],
        // Auto spend permissions are enabled by default in SDK 2.1.0+
        // But we can be explicit:
        subAccounts: {
          unstable_enableAutoSpendPermissions: true
        }
      });
      const provider = bas.getProvider();
      (window as any).__basProvider = provider;

      // Connect to get primary account address
      const accounts = await provider.request({ 
        method: "eth_requestAccounts", 
        params: [] 
      }) as `0x${string}`[];
      const primary = accounts[0]!;
      setPrimaryAddr(primary);
      console.log("Connected to primary account:", primary);

      // Send USDC from TEST_USER_1 to primary account
      const ethersProvider = new ethers.JsonRpcProvider(RPC_URL);
      const wallet = new ethers.Wallet(TEST_USER_1_PRIVATE_KEY, ethersProvider);
      
      const usdcContract = new ethers.Contract(USDC, [
        "function transfer(address to, uint256 amount) returns (bool)"
      ], wallet);

      const amount = parseUnits("2", 6); // $2 USDC
      setStatus("Sending $2 USDC from TEST_USER_1 to primary account...");
      
      const tx = await usdcContract.transfer(primary, amount);
      setStatus("Waiting for transaction confirmation...");
      await tx.wait();

      setStatus("✅ Step 1 complete: $2 USDC funded to primary account");
      setCurrentStep(1);
      
      // Wait for blockchain state to update
      await new Promise(r => setTimeout(r, 2000));
      await readAllBalances(primary);

    } catch (err: any) {
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
      if (!provider) throw new Error("Base Account SDK not initialized");

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

  // Step 3: Transfer $0.80 from sub-account (will auto-pull from primary)
  async function payHost1() {
    setLoading(true);
    setError("");
    setStatus("Processing payment to HOST_1...");

    try {
      const provider = (window as any).__basProvider;
      if (!provider) throw new Error("Base Account SDK not initialized");
      if (!subAddr) throw new Error("Sub-account not initialized");

      const amount = parseUnits("0.8", 6); // $0.80 USDC
      
      // Use regular transfer from sub-account
      // Auto spend permissions will automatically pull from primary account
      const transferData = encodeFunctionData({
        abi: erc20TransferAbi,
        functionName: "transfer",
        args: [TEST_HOST_1_ADDRESS as `0x${string}`, amount]
      });

      setStatus("Sending $0.80 USDC to HOST_1 (should be no popup with auto spend)...");
      
      // Send from sub-account - will auto-pull from primary
      const response = await provider.request({
        method: "wallet_sendCalls",
        params: [{
          version: "2.0.0",
          chainId: CHAIN_HEX,
          from: subAddr as `0x${string}`,  // Sub-account initiates
          calls: [{ 
            to: USDC, 
            data: transferData as `0x${string}` 
          }],
          capabilities: { 
            atomic: { required: true }
          }
        }]
      });

      console.log("wallet_sendCalls response:", response);
      const id = typeof response === 'string' ? response : (response as any).id;
      
      if (!id) {
        throw new Error("No transaction ID returned from wallet_sendCalls");
      }

      console.log("Transaction initiated with ID:", id);

      // Wait for confirmation
      setStatus("Waiting for payment confirmation...");
      let confirmed = false;
      for (let i = 0; i < 30; i++) {
        try {
          // Try string format directly (works with current SDK)
          const res = await provider.request({
            method: "wallet_getCallsStatus",
            params: [id]
          }) as { status: number | string };

          const ok = 
            (typeof res.status === "number" && res.status >= 200 && res.status < 300) ||
            (typeof res.status === "string" && (res.status === "CONFIRMED" || res.status.startsWith("2")));

          if (ok) {
            confirmed = true;
            break;
          }
        } catch (err) {
          console.log("Status check attempt", i, "failed:", err);
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      if (!confirmed) throw new Error("Transaction timeout");

      setStatus("✅ Step 3 complete: $0.80 paid to HOST_1");
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

  // Step 4: Transfer $1.20 from sub-account (will auto-pull from primary)
  async function payHost2() {
    setLoading(true);
    setError("");
    setStatus("Processing payment to HOST_2...");

    try {
      const provider = (window as any).__basProvider;
      if (!provider) throw new Error("Base Account SDK not initialized");
      if (!subAddr) throw new Error("Sub-account not initialized");

      const amount = parseUnits("1.2", 6); // $1.20 USDC
      
      // Use regular transfer from sub-account
      const transferData = encodeFunctionData({
        abi: erc20TransferAbi,
        functionName: "transfer",
        args: [TEST_HOST_2_ADDRESS as `0x${string}`, amount]
      });

      setStatus("Sending $1.20 USDC to HOST_2 (should be no popup with auto spend)...");
      
      const response = await provider.request({
        method: "wallet_sendCalls",
        params: [{
          version: "2.0.0",
          chainId: CHAIN_HEX,
          from: subAddr as `0x${string}`,
          calls: [{ 
            to: USDC, 
            data: transferData as `0x${string}` 
          }],
          capabilities: { 
            atomic: { required: true }
          }
        }]
      });

      console.log("wallet_sendCalls response:", response);
      const id = typeof response === 'string' ? response : (response as any).id;
      
      if (!id) {
        throw new Error("No transaction ID returned from wallet_sendCalls");
      }

      console.log("Transaction initiated with ID:", id);

      // Wait for confirmation
      setStatus("Waiting for payment confirmation...");
      let confirmed = false;
      for (let i = 0; i < 30; i++) {
        try {
          // Try string format directly (works with current SDK)
          const res = await provider.request({
            method: "wallet_getCallsStatus",
            params: [id]
          }) as { status: number | string };

          const ok = 
            (typeof res.status === "number" && res.status >= 200 && res.status < 300) ||
            (typeof res.status === "string" && (res.status === "CONFIRMED" || res.status.startsWith("2")));

          if (ok) {
            confirmed = true;
            break;
          }
        } catch (err) {
          console.log("Status check attempt", i, "failed:", err);
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      if (!confirmed) throw new Error("Transaction timeout");

      setStatus("✅ Step 4 complete: $1.20 paid to HOST_2");
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

  // Load initial balances
  useEffect(() => {
    readAllBalances();
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <h1>USDC Subscription Flow Test</h1>
      <p>Complete flow: $2 subscription → Sub-account with auto spend → Two job payments</p>

      <div style={{ marginTop: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <button 
            id="run-full-flow"
            onClick={runFullFlow} 
            disabled={loading}
            style={{
              padding: "12px 24px",
              fontSize: 16,
              backgroundColor: loading ? "#666" : "#28a745",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: loading ? "wait" : "pointer"
            }}
          >
            Run Full Flow
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button 
            id="step1-button"
            onClick={fundPrimaryAccount} 
            disabled={loading || currentStep > 0}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              backgroundColor: currentStep > 0 ? "#28a745" : loading ? "#666" : "#007bff",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: loading || currentStep > 0 ? "not-allowed" : "pointer"
            }}
          >
            {currentStep > 0 ? "✓" : ""} Step 1: Fund $2
          </button>

          <button 
            id="step2-button"
            onClick={createSubAccountWithPermissions} 
            disabled={loading || currentStep < 1 || currentStep > 1}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              backgroundColor: currentStep > 1 ? "#28a745" : loading || currentStep < 1 ? "#666" : "#007bff",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: loading || currentStep !== 1 ? "not-allowed" : "pointer"
            }}
          >
            {currentStep > 1 ? "✓" : ""} Step 2: Create Sub-Account
          </button>

          <button 
            id="step3-button"
            onClick={payHost1} 
            disabled={loading || currentStep < 2 || currentStep > 2}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              backgroundColor: currentStep > 2 ? "#28a745" : loading || currentStep < 2 ? "#666" : "#007bff",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: loading || currentStep !== 2 ? "not-allowed" : "pointer"
            }}
          >
            {currentStep > 2 ? "✓" : ""} Step 3: Pay $0.80
          </button>

          <button 
            id="step4-button"
            onClick={payHost2} 
            disabled={loading || currentStep < 3 || currentStep > 3}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              backgroundColor: currentStep > 3 ? "#28a745" : loading || currentStep < 3 ? "#666" : "#007bff",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: loading || currentStep !== 3 ? "not-allowed" : "pointer"
            }}
          >
            {currentStep > 3 ? "✓" : ""} Step 4: Pay $1.20
          </button>
        </div>
      </div>

      <div id="status" style={{ 
        marginTop: 16, 
        padding: 12, 
        backgroundColor: error ? "#f8d7da" : "#e9ecef", 
        borderRadius: 4,
        fontFamily: "monospace"
      }}>
        {status}
      </div>

      {error && (
        <div style={{ 
          marginTop: 12, 
          padding: 12, 
          backgroundColor: "#f8d7da", 
          borderRadius: 4,
          color: "#721c24"
        }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <h3>Account Information</h3>
        {primaryAddr && (
          <div style={{ fontFamily: "monospace", fontSize: 14 }}>
            <div>Primary Account: {primaryAddr.slice(0, 10)}...{primaryAddr.slice(-8)}</div>
            {subAddr && <div>Sub-account: {subAddr.slice(0, 10)}...{subAddr.slice(-8)}</div>}
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>USDC Balances</h3>
          <button 
            onClick={() => readAllBalances(primaryAddr, subAddr)}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              backgroundColor: "#6c757d",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: "pointer"
            }}
          >
            Refresh Balances
          </button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "monospace" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #dee2e6" }}>
              <th style={{ padding: 8, textAlign: "left" }}>Account</th>
              <th style={{ padding: 8, textAlign: "right" }}>Balance</th>
              <th style={{ padding: 8, textAlign: "left" }}>Address</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #dee2e6" }}>
              <td style={{ padding: 8 }}>TEST_USER_1</td>
              <td style={{ padding: 8, textAlign: "right" }}>${balances.testUser1 || "—"}</td>
              <td style={{ padding: 8, fontSize: 12 }}>{TEST_USER_1_ADDRESS.slice(0, 10)}...</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #dee2e6", backgroundColor: primaryAddr ? "#e7f3ff" : "transparent" }}>
              <td style={{ padding: 8 }}>Primary Account</td>
              <td style={{ padding: 8, textAlign: "right" }}>${balances.primary || "—"}</td>
              <td style={{ padding: 8, fontSize: 12 }}>{primaryAddr ? `${primaryAddr.slice(0, 10)}...` : "Not connected"}</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #dee2e6", backgroundColor: subAddr ? "#e7f3ff" : "transparent" }}>
              <td style={{ padding: 8 }}>Sub-account</td>
              <td style={{ padding: 8, textAlign: "right" }}>${balances.sub || "—"}</td>
              <td style={{ padding: 8, fontSize: 12 }}>{subAddr ? `${subAddr.slice(0, 10)}...` : "Not created"}</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #dee2e6" }}>
              <td style={{ padding: 8 }}>HOST_1</td>
              <td style={{ padding: 8, textAlign: "right" }}>${balances.host1 || "—"}</td>
              <td style={{ padding: 8, fontSize: 12 }}>{TEST_HOST_1_ADDRESS.slice(0, 10)}...</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #dee2e6" }}>
              <td style={{ padding: 8 }}>HOST_2</td>
              <td style={{ padding: 8, textAlign: "right" }}>${balances.host2 || "—"}</td>
              <td style={{ padding: 8, fontSize: 12 }}>{TEST_HOST_2_ADDRESS.slice(0, 10)}...</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24, padding: 16, backgroundColor: "#f8f9fa", borderRadius: 4 }}>
        <h4>Flow Steps:</h4>
        <ol style={{ paddingLeft: 20 }}>
          <li style={{ color: currentStep >= 1 ? "#28a745" : "inherit" }}>
            Fund $2 USDC from TEST_USER_1 to Primary Account
          </li>
          <li style={{ color: currentStep >= 2 ? "#28a745" : "inherit" }}>
            Create Sub-account with auto spend permissions (enabled by default)
          </li>
          <li style={{ color: currentStep >= 3 ? "#28a745" : "inherit" }}>
            Sub-account pays $0.80 to HOST_1 (auto-pulls from Primary, no popup)
          </li>
          <li style={{ color: currentStep >= 4 ? "#28a745" : "inherit" }}>
            Sub-account pays $1.20 to HOST_2 (auto-pulls from Primary, no popup)
          </li>
        </ol>
        <div style={{ marginTop: 12, fontSize: 14, color: "#6c757d" }}>
          Total: $2.00 subscription fully consumed via auto spend permissions
        </div>
      </div>

      <div style={{ marginTop: 24, padding: 16, backgroundColor: "#fff3cd", borderRadius: 4 }}>
        <h4>⚠️ Important Notes:</h4>
        <ul style={{ paddingLeft: 20 }}>
          <li>Make sure you're using Base Account SDK version 2.0.2-canary.20250822164845 or later</li>
          <li>Auto spend permissions are enabled by default with Sub Accounts</li>
          <li>No ERC20 approve calls are needed - sub-accounts can directly spend from parent</li>
          <li>If popups still appear, check SDK version and ensure auto spend permissions are enabled</li>
        </ul>
      </div>
    </main>
  );
}