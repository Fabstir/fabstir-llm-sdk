// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Chat Context Demo - Production-Ready Conversational UI with Base Account Kit
 *
 * This demonstrates:
 * - Base Account Kit with Auto Spend Permissions (gasless transactions)
 * - Multi-chain support (Base Sepolia, opBNB Testnet)
 * - Direct USDC payments from primary account via spend permissions
 * - Conversation context preservation across multiple prompts
 * - Session management with automated payment settlement
 * - S5 storage for conversation persistence
 *
 * Key Features:
 * 1. User deposits USDC to Primary Account (Base smart account) ONCE
 * 2. User starts new session - sub-account automatically spends USDC directly from primary account
 * 3. Transactions execute without popups (after initial spend permission approval)
 * 4. Multiple chat sessions without popups until primary account runs out of funds
 */

import React, { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import { parseUnits, formatUnits } from "viem";
import { FabstirSDKCore, ChainRegistry, ChainId } from "@fabstir/sdk-core";
import {
  cacheSeed,
  hasCachedSeed,
} from "@fabstir/sdk-core";
import {
  createSDK,
  connectWallet as connectBaseWallet,
  getAccountInfo,
} from "../lib/base-account";
import type { IPaymentManager,
  ISessionManager,
  IStorageManager,
  IHostManager,
  ITreasuryManager,
 } from '@fabstir/sdk-core';

// Environment configuration
const DEFAULT_CHAIN_ID = ChainId.BASE_SEPOLIA;
const RPC_URLS = {
  [ChainId.BASE_SEPOLIA]: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
  [ChainId.OPBNB_TESTNET]:
    process.env.NEXT_PUBLIC_RPC_URL_OPBNB_TESTNET ||
    "https://opbnb-testnet-rpc.bnbchain.org",
};
const CHAIN_HEX = "0x14a34"; // Base Sepolia

// Test accounts from environment
const TEST_USER_1_ADDRESS = process.env.NEXT_PUBLIC_TEST_USER_1_ADDRESS!;
const TEST_USER_1_PRIVATE_KEY = process.env.NEXT_PUBLIC_TEST_USER_1_PRIVATE_KEY!;
const TEST_HOST_1_ADDRESS = process.env.NEXT_PUBLIC_TEST_HOST_1_ADDRESS!;
const TEST_HOST_1_PRIVATE_KEY =
  process.env.NEXT_PUBLIC_TEST_HOST_1_PRIVATE_KEY!;
const TEST_HOST_2_ADDRESS = process.env.NEXT_PUBLIC_TEST_HOST_2_ADDRESS!;
const TEST_HOST_2_PRIVATE_KEY =
  process.env.NEXT_PUBLIC_TEST_HOST_2_PRIVATE_KEY!;
// TEST_HOST_4 - P2P connected host for testing new contracts
const TEST_HOST_4_ADDRESS = process.env.NEXT_PUBLIC_TEST_HOST_4_ADDRESS || '0x048afA7126A3B684832886b78e7cC1Dd4019557E';
const TEST_HOST_4_URL = process.env.NEXT_PUBLIC_TEST_HOST_4_URL || 'https://hostl.fabstir.net:8443';
const TEST_TREASURY_ADDRESS = process.env.NEXT_PUBLIC_TEST_TREASURY_ADDRESS!;
const TEST_TREASURY_PRIVATE_KEY =
  process.env.NEXT_PUBLIC_TEST_TREASURY_PRIVATE_KEY!;

// Session configuration
const SESSION_DEPOSIT_AMOUNT = "2"; // $2 USDC
const DEFAULT_PRICE_PER_TOKEN = 5000; // With PRICE_PRECISION=1000: $5 per million tokens
const PROOF_INTERVAL = 1000; // Checkpoint every 1000 tokens (production default)
const SESSION_DURATION = 86400; // 1 day

// Message type for chat
interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  tokens?: number;
}

// Extend Window interface for Ethereum provider

export default function ChatContextDemo() {
  // SDK State
  const [sdk, setSdk] = useState<FabstirSDKCore | null>(null);
  const [sessionManager, setSessionManager] = useState<ISessionManager | null>(
    null
  );
  const [paymentManager, setPaymentManager] = useState<IPaymentManager | null>(
    null
  );
  const [storageManager, setStorageManager] = useState<IStorageManager | null>(
    null
  );
  const [hostManager, setHostManager] = useState<IHostManager | null>(null);
  const [treasuryManager, setTreasuryManager] =
    useState<ITreasuryManager | null>(null);

  // Wallet State
  const [selectedChainId, setSelectedChainId] =
    useState<number>(DEFAULT_CHAIN_ID);
  const [eoaAddress, setEoaAddress] = useState<string>(""); // EOA controller address (for Base Account Kit)
  const [primaryAccount, setPrimaryAccount] = useState<string>("");
  const [subAccount, setSubAccount] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const [isUsingBaseAccount, setIsUsingBaseAccount] = useState(false);
  const [baseAccountSDK, setBaseAccountSDK] = useState<any>(null);

  // Session State
  const [sessionId, setSessionId] = useState<bigint | null>(null);
  const [jobId, setJobId] = useState<bigint | null>(null);
  const [activeHost, setActiveHost] = useState<any>(null);
  const activeHostRef = useRef<any>(null);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [totalTokens, setTotalTokens] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [lastCheckpointTokens, setLastCheckpointTokens] = useState(0);

  // Balance State
  const [balances, setBalances] = useState({
    eoaWallet: "0",
    smartWallet: "0",
    subAccount: "0",
    hostAccumulated: "0",
    treasuryAccumulated: "0",
    host1: "0",
    host2: "0",
    treasury: "0",
  });
  const [depositAmount, setDepositAmount] = useState("10"); // Default $10 USDC

  // UI State
  const [status, setStatus] = useState("Initializing...");
  const [error, setError] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialize SDK when chain changes
  useEffect(() => {
    initializeSDK();
  }, [selectedChainId]);

  // Refresh balances when connected or when managers are available
  useEffect(() => {
    if (isConnected && sdk) {
      readAllBalances();

      // Auto-refresh balances every 10 seconds
      const interval = setInterval(() => {
        readAllBalances();
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [isConnected, sdk, hostManager, treasuryManager, activeHost]);

  // Helper: Add message to chat
  const addMessage = (
    role: ChatMessage["role"],
    content: string,
    tokens?: number
  ) => {
    const message: ChatMessage = {
      role,
      content,
      timestamp: Date.now(),
      tokens,
    };

    setMessages((prev) => [...prev, message]);

    if (tokens) {
      setTotalTokens((prev) => prev + tokens);
      const PRICE_PRECISION = 1000;
      const pricePerToken = activeHostRef.current?.pricePerToken || DEFAULT_PRICE_PER_TOKEN;
      // Cost = (tokens * pricePerToken) / PRICE_PRECISION / 1_000_000
      const cost = (tokens * pricePerToken) / PRICE_PRECISION / 1000000;
      console.log('Cost calculation:', { tokens, pricePerToken, cost, activeHost: activeHostRef.current });
      setTotalCost((prev) => prev + cost); // Convert to USDC
    }
  };

  // Helper: Get contract addresses for current chain
  function getContractAddresses() {
    const chain = ChainRegistry.getChain(selectedChainId);
    return {
      USDC: chain.contracts.usdcToken as `0x${string}`,
      JOB_MARKETPLACE: chain.contracts.jobMarketplace,
      NODE_REGISTRY: chain.contracts.nodeRegistry,
      PROOF_SYSTEM: chain.contracts.proofSystem,
      HOST_EARNINGS: chain.contracts.hostEarnings,
      FAB_TOKEN: chain.contracts.fabToken,
    };
  }

  // Helper: Read USDC balance for an address
  const readUSDCBalance = async (address: string): Promise<bigint> => {
    try {
      const contracts = getContractAddresses();
      const provider =
        sdk?.getProvider() ||
        new ethers.JsonRpcProvider(
          RPC_URLS[selectedChainId as keyof typeof RPC_URLS]
        );
      const usdcContract = new ethers.Contract(
        contracts.USDC,
        ["function balanceOf(address) view returns (uint256)"],
        provider
      );
      const balance = await usdcContract.balanceOf(address);
      return balance;
    } catch (error) {
      console.error(`Failed to read balance for ${address}:`, error);
      return 0n;
    }
  };

  // Helper: Read all relevant balances and update state
  const readAllBalances = async () => {
    try {
      const contracts = getContractAddresses();
      // Always use JsonRpcProvider for reading balances (Base Account Kit provider doesn't work well with ethers.Contract)
      const provider = new ethers.JsonRpcProvider(
        RPC_URLS[selectedChainId as keyof typeof RPC_URLS]
      );

      const usdcContract = new ethers.Contract(
        contracts.USDC,
        ["function balanceOf(address) view returns (uint256)"],
        provider
      );

      const newBalances = { ...balances };

      // Read EOA balance (if using Base Account Kit)
      if (eoaAddress && baseAccountSDK) {
        try {
          const eoaBalance = await usdcContract.balanceOf(eoaAddress);
          newBalances.eoaWallet = ethers.formatUnits(eoaBalance, 6);
        } catch (e) {
          console.log("Error reading EOA balance:", e);
        }
      }

      // Read primary smart wallet balance
      if (primaryAccount) {
        console.log("Reading balance for primary account:", primaryAccount);
        const smartBalance = await usdcContract.balanceOf(primaryAccount);
        console.log("Primary account balance (raw):", smartBalance.toString());
        newBalances.smartWallet = ethers.formatUnits(smartBalance, 6);
        console.log("Primary account balance (formatted):", newBalances.smartWallet);
      }

      // Read sub-account balance
      if (subAccount && subAccount !== primaryAccount) {
        const subBalance = await usdcContract.balanceOf(subAccount);
        newBalances.subAccount = ethers.formatUnits(subBalance, 6);
      }

      // Read host accumulated earnings (if host selected)
      const selectedHostAddr =
        activeHost?.address || (window as any).__selectedHostAddress;
      if (selectedHostAddr && hostManager) {
        try {
          const contracts = getContractAddresses();
          const hostEarnings = await hostManager.getHostEarnings(
            selectedHostAddr,
            contracts.USDC
          );
          newBalances.hostAccumulated = ethers.formatUnits(hostEarnings, 6);
        } catch (e) {
          console.log("Error reading host accumulated:", e);
        }
      }

      // Read treasury accumulated earnings


      // TODO: Update to use multi-chain getTreasuryBalance(tokenAddress) API


      /*


      if (treasuryManager) {


        try {


          const treasuryEarnings = await treasuryManager.getTreasuryBalance(usdcAddress);


          newBalances.treasuryAccumulated = ethers.formatUnits(treasuryEarnings, 6);


        } catch (e) {
          console.log("Error reading treasury accumulated:", e);
        }
      }
      */

      // Read host wallet balances
      if (TEST_HOST_1_ADDRESS) {
        const host1Balance = await usdcContract.balanceOf(TEST_HOST_1_ADDRESS);
        newBalances.host1 = ethers.formatUnits(host1Balance, 6);
      }
      if (TEST_HOST_2_ADDRESS) {
        const host2Balance = await usdcContract.balanceOf(TEST_HOST_2_ADDRESS);
        newBalances.host2 = ethers.formatUnits(host2Balance, 6);
      }

      // Read treasury wallet balance
      if (TEST_TREASURY_ADDRESS) {
        const treasuryBalance = await usdcContract.balanceOf(
          TEST_TREASURY_ADDRESS
        );
        newBalances.treasury = ethers.formatUnits(treasuryBalance, 6);
      }

      setBalances(newBalances);
      return newBalances;
    } catch (error) {
      console.error("Error reading balances:", error);
      return balances;
    }
  };

  // Helper: Build context from message history
  const buildContext = (): string => {
    // Only include previous messages, not the current one being sent
    const previousMessages = messages.filter((m) => m.role !== "system");
    if (previousMessages.length === 0) return "";

    return previousMessages
      .map((m) => {
        // For assistant messages, make sure we're not including repetitive content
        let content = m.content;

        // Limit length and clean up any repetitive patterns
        if (
          m.role === "assistant" &&
          content.includes("\n") &&
          content.includes("A:")
        ) {
          content = content.split("\n")[0].trim();
        }

        // Also limit overall length
        content = content.substring(0, 200);

        // Return raw content without "User:/Assistant:" formatting
        // The node will apply the correct chat template (e.g., Harmony format)
        return content;
      })
      .join("\n");
  };

  // Initialize SDK
  async function initializeSDK() {
    try {
      setStatus("Initializing SDK...");

      const chain = ChainRegistry.getChain(selectedChainId);
      console.log("[SDK Init] Chain config:", chain);

      const sdkConfig = {
        mode: "production" as const,
        chainId: selectedChainId,
        rpcUrl: RPC_URLS[selectedChainId as keyof typeof RPC_URLS],
        contractAddresses: {
          jobMarketplace: chain.contracts.jobMarketplace,
          nodeRegistry: chain.contracts.nodeRegistry,
          proofSystem: chain.contracts.proofSystem,
          hostEarnings: chain.contracts.hostEarnings,
          fabToken: chain.contracts.fabToken,
          usdcToken: chain.contracts.usdcToken,
          modelRegistry: chain.contracts.modelRegistry,
        },
        s5Config: {
          portalUrl: process.env.NEXT_PUBLIC_S5_PORTAL_URL,
          seedPhrase: process.env.NEXT_PUBLIC_S5_SEED_PHRASE,
          masterToken: process.env.NEXT_PUBLIC_S5_MASTER_TOKEN, // For test harness portal registration
        },
      };

      const newSdk = new FabstirSDKCore(sdkConfig);
      setSdk(newSdk);

      setStatus(
        `SDK initialized for ${chain.name}. Click 'Connect Wallet' to start.`
      );
      addMessage(
        "system",
        `Chat system initialized for ${chain.name}. Connect your wallet to begin.`
      );
    } catch (error: any) {
      console.error("SDK initialization failed:", error);
      setError(`Failed to initialize SDK: ${error.message}`);
    }
  }

  // Connect wallet and authenticate
  async function connectWallet() {
    if (!sdk) {
      setError("SDK not initialized");
      return;
    }

    try {
      // CRITICAL: Call Base Account SDK IMMEDIATELY without any state updates
      // This ensures the popup opens within the user interaction context
      const bas = createSDK();
      const accounts = await connectBaseWallet(); // This MUST be called synchronously

      // Now that popup is done, we can do state updates
      setIsLoading(true);
      setStatus("Connecting wallet...");
      setBaseAccountSDK(bas);
      addMessage("system", "🔐 Base Account Kit connected");

      const result = { provider: bas.getProvider(), accounts };

      // Use Base Account Kit for gasless transactions
      await connectWithBaseAccount(result);

      // Get managers
      const pm = sdk.getPaymentManager();
      const sm = sdk.getSessionManager();
      const hm = sdk.getHostManager();
      const stm = sdk.getStorageManager();
      const tm = sdk.getTreasuryManager();

      setPaymentManager(pm);
      setSessionManager(sm);
      setHostManager(hm);
      setStorageManager(stm);
      setTreasuryManager(tm);

      // Mark as connected - wallet connection is successful
      setIsConnected(true);
      setStatus("Wallet connected. Ready to start chat session.");
      addMessage("system", "✅ Wallet connected successfully.");
    } catch (error: any) {
      console.error("Wallet connection failed:", error);
      setError(`Failed to connect wallet: ${error.message}`);

      // Fallback to regular wallet provider (MetaMask, etc.)
      try {
        setIsLoading(true);
        await connectWithWalletProvider();

        // Get managers for fallback connection
        const pm = sdk.getPaymentManager();
        const sm = sdk.getSessionManager();
        const hm = sdk.getHostManager();
        const stm = sdk.getStorageManager();
        const tm = sdk.getTreasuryManager();

        setPaymentManager(pm);
        setSessionManager(sm);
        setHostManager(hm);
        setStorageManager(stm);
        setTreasuryManager(tm);

        setIsConnected(true);
        setStatus("Wallet connected. Ready to start chat session.");
        addMessage("system", "✅ Wallet connected successfully.");
      } catch (fallbackError: any) {
        console.error("Fallback connection failed:", fallbackError);
        setError(`Failed to connect wallet: ${fallbackError.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  }

  // Connect with Base Account Kit
  async function connectWithBaseAccount(result: {
    provider: any;
    accounts: string[];
  }) {
    // Use accounts from initialization (no second call to connectBaseWallet)
    const accounts = result.accounts;

    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts returned from Base Account Kit");
    }

    const walletAddress = accounts[0]!;
    const accountInfo = await getAccountInfo(walletAddress);
    const smartWallet = accountInfo.smartAccount || walletAddress;

    // Store both EOA and smart wallet addresses
    setEoaAddress(walletAddress); // The passkey-controlled EOA
    setPrimaryAccount(smartWallet); // The smart contract wallet

    // Get or create sub-account with Auto Spend Permissions
    // This may trigger a popup for user approval
    addMessage(
      "system",
      "🔍 Checking for sub-account with Auto Spend Permissions..."
    );
    const sub = await ensureSubAccount(
      result.provider,
      smartWallet as `0x${string}`
    );
    setSubAccount(sub);

    // Pre-cache seed for smartWallet (primary) to avoid S5 popup
    // Note: SDK uses signer.getAddress() which returns smartWallet, not sub-account
    const smartWalletLower = smartWallet.toLowerCase();
    if (!hasCachedSeed(smartWalletLower)) {
      const testSeed =
        "yield organic score bishop free juice atop village video element unless sneak care rock update";
      cacheSeed(smartWalletLower, testSeed);
      console.log("[S5 Seed] Pre-cached test seed for smartWallet (primary)");
      addMessage("system", "💾 Pre-cached S5 seed (no popup)");
    }

    // Use the Base Account Kit provider with the SDK
    const baseProvider = result.provider;

    // Create a signer from the Base Account Kit provider using the primary smart wallet
    const baseSigner = await new ethers.BrowserProvider(baseProvider).getSigner(
      smartWallet
    );

    // Authenticate SDK with the Base Account Kit signer
    await sdk!.authenticate("signer", {
      signer: baseSigner,
    });

    addMessage("system", `✅ Connected with Base Account Kit`);
    addMessage(
      "system",
      `  EOA (Controller): ${walletAddress.slice(0, 6)}...${walletAddress.slice(
        -4
      )}`
    );
    addMessage(
      "system",
      `  Smart Wallet: ${smartWallet.slice(0, 6)}...${smartWallet.slice(-4)}`
    );
    addMessage("system", "🎉 SDK authenticated with Base Account Kit!");
    setIsUsingBaseAccount(true);
  }

  // Connect with wallet provider (MetaMask or other wallet)
  async function connectWithWalletProvider() {
    if (!window.ethereum) {
      setError(
        "No wallet provider found. Please install MetaMask or use Base Account Kit."
      );
      return;
    }

    try {
      // Request account access
      const accounts = await window.ethereum!.request!({
        method: "eth_requestAccounts",
      });
      const userAddress = accounts[0];

      // Create a provider and signer from the wallet
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();

      // Authenticate SDK with the signer
      await sdk!.authenticate("signer", { signer });
      setPrimaryAccount(userAddress);
      setSubAccount(userAddress); // In this mode, primary and sub are the same

      addMessage(
        "system",
        `✅ Connected with wallet: ${userAddress.slice(
          0,
          6
        )}...${userAddress.slice(-4)}`
      );
    } catch (error: any) {
      setError(`Failed to connect wallet: ${error.message}`);
    }
  }

  // Deposit USDC to primary smart wallet from TEST_USER_1 faucet
  async function depositUSDC() {
    if (!primaryAccount || !sdk) {
      setError("Wallet not connected");
      return;
    }

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Invalid deposit amount");
      return;
    }

    setIsLoading(true);
    setStatus("Depositing USDC...");

    try {
      const contracts = getContractAddresses();
      const amountWei = parseUnits(depositAmount, 6);

      // Use TEST_USER_1 as faucet to fund the primary smart wallet
      const provider = new ethers.JsonRpcProvider(
        RPC_URLS[selectedChainId as keyof typeof RPC_URLS]
      );
      const faucetWallet = new ethers.Wallet(TEST_USER_1_PRIVATE_KEY, provider);

      const usdcContract = new ethers.Contract(
        contracts.USDC,
        [
          "function transfer(address to, uint256 amount) returns (bool)",
          "function balanceOf(address) view returns (uint256)",
        ],
        faucetWallet
      );

      // Check faucet has enough USDC
      const faucetBalance = await usdcContract.balanceOf(TEST_USER_1_ADDRESS);

      if (faucetBalance < amountWei) {
        throw new Error(
          `Test faucet insufficient USDC. Has ${formatUnits(
            faucetBalance,
            6
          )} USDC, need ${depositAmount} USDC`
        );
      }

      console.log("Depositing to primary account:", primaryAccount);
      addMessage(
        "system",
        `💸 Transferring ${depositAmount} USDC from faucet to ${primaryAccount.slice(0, 10)}...${primaryAccount.slice(-8)}`
      );

      // Transfer USDC from faucet to primary account
      const tx = await usdcContract.transfer(primaryAccount, amountWei);
      console.log("Transfer TX:", tx.hash);
      console.log("Transfer to address:", primaryAccount);
      addMessage("system", `⏳ Waiting for transaction confirmation...`);

      await tx.wait(3); // Wait for 3 confirmations

      addMessage(
        "system",
        `✅ Successfully deposited ${depositAmount} USDC to primary account!`
      );
      setStatus("Deposit complete");

      // Refresh balances
      await readAllBalances();
    } catch (error: any) {
      console.error("Deposit failed:", error);
      setError(`Deposit failed: ${error.message}`);
      addMessage("system", `❌ Deposit failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  // Helper: Get or create sub-account with Auto Spend Permissions
  async function ensureSubAccount(
    provider: any,
    universal: `0x${string}`
  ): Promise<`0x${string}`> {
    console.log("ensureSubAccount: Starting with primary account:", universal);
    const contracts = getContractAddresses();

    try {
      // 1) Look up existing sub-accounts for THIS origin
      console.log("ensureSubAccount: Calling wallet_getSubAccounts...");
      const resp = (await provider.request({
        method: "wallet_getSubAccounts",
        params: [
          {
            account: universal,
            domain: window.location.origin, // e.g. "http://localhost:3000"
          },
        ],
      })) as { subAccounts?: Array<{ address: `0x${string}` }> };

      console.log(
        "ensureSubAccount: Response from wallet_getSubAccounts:",
        resp
      );

      if (resp?.subAccounts?.length) {
        const subAccount = resp.subAccounts[0]!.address;
        addMessage(
          "system",
          `✅ Using existing sub-account: ${subAccount.slice(
            0,
            6
          )}...${subAccount.slice(-4)}`
        );
        addMessage(
          "system",
          "🎉 Auto Spend Permissions already configured - no popups for transactions!"
        );
        console.log(
          "ensureSubAccount: Returning existing sub-account:",
          subAccount
        );
        return subAccount;
      }

      console.log("ensureSubAccount: No existing sub-accounts found");
    } catch (e) {
      console.error("ensureSubAccount: Error getting sub-accounts:", e);
      addMessage("system", `⚠️ Error checking for existing sub-accounts: ${e}`);
    }

    try {
      // 2) Create a sub-account (SPEC-CORRECT: no spender object here)
      console.log("ensureSubAccount: Creating new sub-account...");
      addMessage("system", "🔐 Creating sub-account...");
      addMessage(
        "system",
        "📝 Spend permission will be requested on first transaction"
      );

      const created = (await provider.request({
        method: "wallet_addSubAccount",
        params: [
          {
            account: { type: "create" }, // <-- CORRECT: no spender, no allowance here
          },
        ],
      })) as { address: `0x${string}` };

      console.log("ensureSubAccount: Created sub-account:", created);
      addMessage(
        "system",
        `✅ Sub-account created: ${created.address.slice(
          0,
          6
        )}...${created.address.slice(-4)}`
      );
      addMessage(
        "system",
        "🎉 Auto Spend Permissions will activate on first transaction!"
      );
      return created.address;
    } catch (error) {
      console.error("ensureSubAccount: Failed to create sub-account:", error);
      addMessage("system", `❌ Failed to create sub-account: ${error}`);
      // Fallback to using primary account if sub-account creation fails
      addMessage(
        "system",
        `⚠️ WARNING: Using primary account instead (transaction popups will occur)`
      );
      console.log(
        "ensureSubAccount: Falling back to primary account:",
        universal
      );
      return universal;
    }
  }

  // Helper: Create sub-account signer (EXACT copy from working test)
  function createSubAccountSigner(
    provider: any,
    subAccount: string,
    primaryAccount: string
  ) {
    const ethersProvider = new ethers.BrowserProvider(provider);

    // Create a wrapper that properly exposes both signer and provider methods
    const signer = {
      // Expose the provider properly for contract calls
      provider: ethersProvider,

      // Also provide getProvider method for compatibility
      getProvider(): ethers.BrowserProvider {
        return ethersProvider;
      },

      async getAddress(): Promise<string> {
        console.log(
          `[SubAccountSigner] getAddress() called, returning: ${subAccount}`
        );
        return subAccount;
      },

      async signTransaction(tx: ethers.TransactionRequest): Promise<string> {
        throw new Error("signTransaction not supported - use sendTransaction");
      },

      async signMessage(message: string | Uint8Array): Promise<string> {
        // Check if this is for S5 seed generation
        const messageStr =
          typeof message === "string" ? message : ethers.toUtf8String(message);
        if (messageStr.includes("Generate S5 seed")) {
          // If we have a cached seed, return a deterministic mock signature
          const subAccountLower = subAccount.toLowerCase();
          if (hasCachedSeed(subAccountLower)) {
            console.log(
              "[S5 Seed] Returning mock signature - seed is already cached"
            );
            return "0x" + "0".repeat(130); // Valid signature format
          }
        }

        // For other messages or if no cache, use the primary account
        const signature = await provider.request({
          method: "personal_sign",
          params: [
            typeof message === "string" ? message : ethers.hexlify(message),
            primaryAccount,
          ],
        });
        return signature;
      },

      async sendTransaction(
        tx: ethers.TransactionRequest
      ): Promise<ethers.TransactionResponse> {
        // Use wallet_sendCalls with sub-account as from address
        const calls = [
          {
            to: tx.to as `0x${string}`,
            data: tx.data as `0x${string}`,
            value: tx.value ? `0x${BigInt(tx.value).toString(16)}` : undefined,
          },
        ];

        console.log("Sending transaction via wallet_sendCalls:", {
          from: subAccount,
          to: tx.to,
          data: tx.data?.slice(0, 10) + "...",
        });

        const response = await provider.request({
          method: "wallet_sendCalls",
          params: [
            {
              version: "2.0.0",
              chainId: CHAIN_HEX,
              from: subAccount as `0x${string}`,
              calls: calls,
              capabilities: {
                atomic: { required: true },
              },
            },
          ],
        });

        const bundleId =
          typeof response === "string" ? response : (response as any).id;
        console.log("Bundle ID:", bundleId);

        // Wait for the bundle to be confirmed and get the real transaction hash
        let realTxHash: string | undefined;
        for (let i = 0; i < 30; i++) {
          try {
            const res = (await provider.request({
              method: "wallet_getCallsStatus",
              params: [bundleId],
            })) as { status: number | string; receipts?: any[] };

            const ok =
              (typeof res.status === "number" &&
                res.status >= 200 &&
                res.status < 300) ||
              (typeof res.status === "string" &&
                (res.status === "CONFIRMED" || res.status.startsWith("2")));

            if (ok && res.receipts?.[0]?.transactionHash) {
              realTxHash = res.receipts[0].transactionHash;
              console.log("Transaction confirmed with hash:", realTxHash);
              break;
            }
          } catch (err) {
            // Continue polling
          }
          await new Promise((r) => setTimeout(r, 1000));
        }

        if (!realTxHash) {
          throw new Error("Transaction failed to confirm");
        }

        // Return a proper transaction response with the real hash
        const ethersProvider = new ethers.BrowserProvider(provider);
        const txResponse = await ethersProvider.getTransaction(realTxHash);

        if (!txResponse) {
          // If we can't get the transaction, create a minimal response
          return {
            hash: realTxHash,
            from: subAccount,
            to: tx.to,
            data: tx.data,
            value: tx.value || 0n,
            nonce: 0,
            gasLimit: 0n,
            gasPrice: 0n,
            chainId: selectedChainId,
            wait: async () => {
              const receipt = await ethersProvider.getTransactionReceipt(
                realTxHash
              );
              return receipt || ({ status: 1, hash: realTxHash } as any);
            },
          } as any;
        }

        return txResponse;
      },
    };

    return signer;
  }

  // Start chat session
  async function startSession() {
    const sm = sdk?.getSessionManager();
    const hm = sdk?.getHostManager();
    const pm = sdk?.getPaymentManager();

    if (!sm || !hm || !pm) {
      setError("Managers not initialized");
      return;
    }

    // Check if wallet is connected
    if (!isConnected || !sdk) {
      setError("Wallet not connected. Please connect wallet first.");
      addMessage(
        "system",
        '⚠️ Wallet not connected. Please click "Connect Wallet" first.'
      );
      return;
    }

    // Clear previous session messages but keep system messages about wallet connection
    setMessages((prev) =>
      prev.filter(
        (m) =>
          m.role === "system" &&
          (m.content.includes("Connected with") ||
            m.content.includes("SDK authenticated") ||
            m.content.includes("Auto Spend") ||
            m.content.includes("Primary account funded"))
      )
    );

    // Reset session-specific state
    setTotalTokens(0);
    setLastCheckpointTokens(0);

    // Close any existing session before creating a new one
    if (sessionId) {
      try {
        addMessage("system", `Closing existing session ${sessionId}...`);
        await sm.endSession(sessionId);
      } catch (err) {
        console.log(
          "Error closing previous session (may be already closed):",
          err
        );
      }
      setSessionId(null);
      setJobId(null);
    }

    setIsLoading(true);
    setStatus("Discovering hosts...");

    try {
      const contracts = getContractAddresses();

      // Discover hosts using HostManager
      addMessage("system", "🔍 Discovering active hosts...");
      let hosts: any[] = [];

      try {
        hosts = await (hm as any).discoverAllActiveHostsWithModels();
        console.log("Found hosts:", hosts);
      } catch (sdkError: any) {
        console.log("SDK host discovery failed, error:", sdkError.message);
        throw new Error("Unable to discover hosts");
      }

      if (hosts.length === 0) {
        // Fallback to TEST_HOST_4 (P2P connected host) for testing new contracts
        console.log("No hosts discovered from contract, using TEST_HOST_4 fallback");
        addMessage("system", "⚠️ No registered hosts found, using TEST_HOST_4 fallback...");
        hosts = [{
          address: TEST_HOST_4_ADDRESS,
          apiUrl: TEST_HOST_4_URL,
          endpoint: TEST_HOST_4_URL,
          supportedModels: ['CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf'],
          models: ['CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf'],
          isActive: true,
          minPricePerTokenStable: 50000n, // $50/million tokens with PRICE_PRECISION=1000
          metadata: { costPerToken: 50000 }
        }];
      }

      // Parse host metadata
      const parsedHosts = hosts.map((host: any) => {
        const pricePerToken = Number(host.minPricePerTokenStable || host.metadata?.costPerToken || DEFAULT_PRICE_PER_TOKEN);
        console.log('Host pricing data:', {
          address: host.address,
          minPricePerTokenStable: host.minPricePerTokenStable,
          metadataCostPerToken: host.metadata?.costPerToken,
          finalPricePerToken: pricePerToken
        });
        return {
          address: host.address,
          endpoint: host.apiUrl || host.endpoint,
          models: host.supportedModels || [],
          pricePerToken,
        };
      });

      // Filter hosts that support models
      const modelSupported = parsedHosts.filter(
        (h: any) => h.models && h.models.length > 0
      );
      if (modelSupported.length === 0) {
        throw new Error("No active hosts found supporting required models");
      }

      // Randomly select a host
      const randomIndex = Math.floor(Math.random() * modelSupported.length);
      const host = modelSupported[randomIndex];
      console.log(
        `Randomly selected host ${randomIndex + 1} of ${
          modelSupported.length
        }: ${host.address}`
      );

      setActiveHost(host);
      activeHostRef.current = host;
      // Store selected host address for later use
      (window as any).__selectedHostAddress = host.address;

      // Display which host we're connecting to
      addMessage(
        "system",
        `🎲 Randomly selected host ${randomIndex + 1} of ${
          modelSupported.length
        }`
      );
      addMessage(
        "system",
        `📡 Host: ${host.address.slice(0, 6)}...${host.address.slice(-4)}`
      );
      addMessage("system", `🤖 Model: ${host.models[0]}`);
      addMessage("system", `🌐 Endpoint: ${host.endpoint}`);

      setStatus("Checking USDC balance...");

      // Check primary account has sufficient funds
      const accountToCheck = primaryAccount;
      const accountBalance = await readUSDCBalance(accountToCheck);
      const sessionCost = parseUnits(SESSION_DEPOSIT_AMOUNT, 6);

      addMessage(
        "system",
        `💰 Primary account balance: ${formatUnits(accountBalance, 6)} USDC`
      );

      if (accountBalance < sessionCost) {
        throw new Error(
          `Insufficient USDC. Need ${SESSION_DEPOSIT_AMOUNT} USDC but only have ${formatUnits(
            accountBalance,
            6
          )} USDC. Please transfer USDC to your primary account.`
        );
      }

      setStatus("Creating session...");

      // Validate host endpoint
      const hostEndpoint = host.endpoint;
      if (!hostEndpoint) {
        throw new Error(
          `Host ${host.address} does not have an API endpoint configured`
        );
      }

      // Create session configuration with direct payment
      const sessionConfig = {
        depositAmount: SESSION_DEPOSIT_AMOUNT,
        pricePerToken: Number(host.pricePerToken || DEFAULT_PRICE_PER_TOKEN),
        proofInterval: PROOF_INTERVAL,
        proofTimeoutWindow: 300, // AUDIT-F3: 5 minute timeout (60-3600 range)
        duration: SESSION_DURATION,
        paymentToken: contracts.USDC,
        useDeposit: false, // Use direct payment with Auto Spend Permissions
        chainId: selectedChainId, // REQUIRED for multi-chain
      };

      // Approve USDC for JobMarketplace contract
      addMessage("system", "💰 Approving USDC for payment...");
      const provider = baseAccountSDK
        ? baseAccountSDK.getProvider()
        : window.ethereum;
      const ethersProvider = new ethers.BrowserProvider(provider);
      const signer = await ethersProvider.getSigner();

      const usdcContract = new ethers.Contract(
        contracts.USDC,
        [
          "function approve(address spender, uint256 amount) returns (bool)",
          "function allowance(address owner, address spender) view returns (uint256)",
        ],
        signer
      );

      // Check current allowance
      const currentAllowance = await usdcContract.allowance(
        primaryAccount,
        contracts.JOB_MARKETPLACE
      );
      const depositAmountWei = parseUnits(SESSION_DEPOSIT_AMOUNT, 6);

      if (currentAllowance < depositAmountWei) {
        addMessage("system", "🔐 Requesting USDC approval (popup may appear)...");
        const approveTx = await usdcContract.approve(
          contracts.JOB_MARKETPLACE,
          parseUnits("1000", 6) // Approve 1000 USDC for multiple sessions
        );
        await approveTx.wait(3);
        addMessage("system", "✅ USDC approved for JobMarketplace");
      } else {
        addMessage("system", "✅ USDC already approved");
      }

      // Start session - with Auto Spend Permissions, payment happens automatically without popups!
      addMessage(
        "system",
        isUsingBaseAccount
          ? "🎉 Starting session with Auto Spend Permissions"
          : "📝 Starting session..."
      );

      // DIAGNOSTIC: Query node's available models
      try {
        const nodeModelsUrl = `${hostEndpoint.replace('/ws', '')}/v1/models?chain_id=${selectedChainId}`;
        console.log("📊 Querying node models:", nodeModelsUrl);
        const modelsResponse = await fetch(nodeModelsUrl);
        const modelsData = await modelsResponse.json();
        console.log("📊 Node reports available models:", modelsData);

        if (modelsData.models && modelsData.models.length > 0) {
          addMessage("system", `📊 Node has ${modelsData.models.length} model(s) available:`);
          modelsData.models.forEach((m: any, idx: number) => {
            console.log(`  Model ${idx + 1}:`, m);
            addMessage("system", `  ${idx + 1}. ID: ${m.id?.substring(0, 16)}... | Name: ${m.name || m.huggingface_repo}`);
          });
        }
      } catch (err: any) {
        console.warn("Could not query node models:", err.message);
        addMessage("system", `⚠️ Could not query node models: ${err.message}`);
      }

      const fullSessionConfig = {
        ...sessionConfig,
        model: host.models[0],
        provider: host.address,
        hostAddress: host.address,
        endpoint: hostEndpoint,
        chainId: selectedChainId,
      };

      console.log("Starting session with config:", fullSessionConfig);
      console.log("📝 Model hash we're using:", host.models[0]);
      console.log("📝 This will be converted to short name by SessionManager");

      const result = await sm.startSession(fullSessionConfig);

      // Store session IDs immediately and in window object
      const newSessionId = result.sessionId;
      const newJobId = result.jobId;
      setSessionId(newSessionId);
      setJobId(newJobId);
      (window as any).__currentSessionId = newSessionId;
      (window as any).__currentJobId = newJobId;

      addMessage("system", `✅ Session created - ID: ${newSessionId}`);
      if (newJobId) {
        addMessage("system", `  Job ID: ${newJobId}`);
      }
      addMessage(
        "system",
        isUsingBaseAccount
          ? "🎉 Payment processed via Auto Spend Permission - no popup!"
          : "✅ Session payment completed"
      );

      // Wait for WebSocket connection
      setStatus("Establishing WebSocket connection...");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      setStatus("Session active. You can start chatting!");
      addMessage("system", "✅ Ready to chat! Send a message to begin.");
    } catch (error: any) {
      console.error("Failed to start session:", error);
      setError(`Failed to start session: ${error.message}`);
      addMessage("system", `❌ Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  // Send message to LLM
  async function sendMessage() {
    const sm = sdk?.getSessionManager();

    // Use window object to avoid React state async issues
    const currentSessionId = (window as any).__currentSessionId || sessionId;

    if (!sm || !currentSessionId || !inputMessage.trim()) {
      return;
    }

    const userMessage = inputMessage.trim();
    setInputMessage("");
    setIsLoading(true);

    // Add user message to chat
    addMessage("user", userMessage);

    try {
      // Build conversation context - hosts are STATELESS, client maintains conversation state
      // For GPT-OSS-20B, node expects Harmony format multi-turn conversation
      // Format: <|start|>user<|message|>...<|end|><|start|>assistant<|channel|>final<|message|>...<|end|>

      // Get previous exchanges (filter out system messages about wallet/session)
      const previousExchanges = messages.filter(m => m.role !== 'system');

      // Build Harmony format conversation history
      let fullPrompt = '';

      if (previousExchanges.length > 0) {
        // Include previous conversation in Harmony format
        const harmonyHistory = previousExchanges
          .map(m => {
            if (m.role === 'user') {
              return `<|start|>user<|message|>${m.content}<|end|>`;
            } else {
              // Assistant messages use 'final' channel
              return `<|start|>assistant<|channel|>final<|message|>${m.content}<|end|>`;
            }
          })
          .join('\n');

        // Add current user message (node will add assistant prompt)
        fullPrompt = `${harmonyHistory}\n<|start|>user<|message|>${userMessage}<|end|>`;
      } else {
        // First message - just send user message, node adds system prompt
        fullPrompt = userMessage;
      }

      console.log("=== RAW PROMPT BEING SENT TO NODE ===");
      console.log(fullPrompt);
      console.log("=== END RAW PROMPT ===");

      // Send to LLM
      setStatus("Sending message...");
      const response = await sm.sendPromptStreaming(
        currentSessionId,
        fullPrompt
      );

      // Clean up the response to remove any repetitive patterns
      console.log("Raw response from LLM:", response);
      console.log("📊 Response details:");
      console.log("  Length:", response.length);
      console.log("  First 100 chars:", response.substring(0, 100));
      console.log("  Char codes (first 20):", Array.from(response.substring(0, 20)).map((c, i) => `${i}: ${c} (${c.charCodeAt(0)})`));

      // Check if response is mostly dots/ellipses (garbage output indicator)
      const dotsCount = (response.match(/\./g) || []).length;
      const ellipsisCount = (response.match(/…/g) || []).length;
      const totalDots = dotsCount + ellipsisCount;
      const garbageRatio = totalDots / Math.max(1, response.length);
      console.log("  Dots/Ellipsis count:", totalDots, "out of", response.length, "chars");
      console.log("  Garbage ratio:", (garbageRatio * 100).toFixed(2) + "%");

      if (garbageRatio > 0.3) {
        console.warn("⚠️ HIGH GARBAGE RATIO DETECTED - Response may be corrupted!");
        addMessage("system", "⚠️ Warning: Response appears to contain mostly dots/ellipses - possible model output issue");
      }

      let cleanedResponse = response;

      // Handle repetitive pattern from model
      if (response.includes("A:")) {
        const parts = response.split(/A:\s*/);
        for (let i = 1; i < parts.length; i++) {
          const cleaned = parts[i].trim();
          if (cleaned && cleaned.length > 1) {
            const answer = cleaned.split("\n")[0].trim();
            if (answer && answer.length > 1) {
              cleanedResponse = answer;
              break;
            }
          }
        }
      }

      // Final cleanup - remove any remaining "A:" prefix
      cleanedResponse = cleanedResponse.replace(/^A:\s*/, "").trim();

      // Estimate tokens (rough estimate: 1 token per 4 characters)
      const estimatedTokens = Math.ceil(
        (fullPrompt.length + cleanedResponse.length) / 4
      );

      // Add assistant response
      addMessage("assistant", cleanedResponse, estimatedTokens);

      // Store conversation in S5 if storage manager is available
      if (storageManager && storageManager.isInitialized()) {
        await storeConversation();
      }

      setStatus("Session active");

      // Note: Checkpoints are submitted automatically by the node via WebSocket
      // No manual checkpoint submission needed in session job model
    } catch (error: any) {
      console.error("Failed to send message:", error);
      addMessage("system", `❌ Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  // Store conversation in S5
  async function storeConversation() {
    if (!storageManager || !sessionId) return;

    try {
      await storageManager.storeConversation({
        id: sessionId.toString(),
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })),
        metadata: {
          totalTokens,
          totalCost,
          model: activeHost?.models?.[0] || "unknown",
          provider: activeHost?.address || "unknown",
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch (error) {
      console.warn("Failed to store conversation:", error);
    }
  }

  // Submit checkpoint proof (for payment)
  async function submitCheckpoint(forceSubmit: boolean = false) {
    if (!paymentManager || !sessionId) {
      console.error(
        "Cannot submit checkpoint: missing paymentManager or sessionId"
      );
      return;
    }

    // Calculate tokens to submit
    let tokensToSubmit = totalTokens - lastCheckpointTokens;

    // Contract requires minimum tokens
    const MIN_CHECKPOINT_TOKENS = 100;

    // Skip if we don't have enough tokens (unless forced for final submission)
    if (tokensToSubmit < MIN_CHECKPOINT_TOKENS && !forceSubmit) {
      console.log(
        `Skipping checkpoint: only ${tokensToSubmit} tokens (minimum ${MIN_CHECKPOINT_TOKENS} required)`
      );
      return;
    }

    // For final submission, ensure at least minimum tokens
    if (forceSubmit && tokensToSubmit < MIN_CHECKPOINT_TOKENS) {
      console.log(
        `Adjusting tokens from ${tokensToSubmit} to minimum ${MIN_CHECKPOINT_TOKENS} for payment`
      );
      tokensToSubmit = MIN_CHECKPOINT_TOKENS;
    }

    try {
      setStatus("Submitting checkpoint...");

      // Create host signer for proof submission
      const hostProvider = new ethers.JsonRpcProvider(
        RPC_URLS[selectedChainId as keyof typeof RPC_URLS]
      );

      // Determine which host's private key to use based on the selected host
      const selectedHostAddress =
        activeHost?.address || (window as any).__selectedHostAddress;
      if (!selectedHostAddress) {
        throw new Error("No host selected for checkpoint submission");
      }

      let hostPrivateKey: string;

      if (
        selectedHostAddress.toLowerCase() === TEST_HOST_1_ADDRESS.toLowerCase()
      ) {
        hostPrivateKey = TEST_HOST_1_PRIVATE_KEY;
      } else if (
        selectedHostAddress.toLowerCase() === TEST_HOST_2_ADDRESS.toLowerCase()
      ) {
        hostPrivateKey = TEST_HOST_2_PRIVATE_KEY;
      } else {
        throw new Error(
          `Unknown host address for checkpoint submission: ${selectedHostAddress}`
        );
      }

      const hostSigner = new ethers.Wallet(hostPrivateKey, hostProvider);
      console.log(`Using host signer: ${await hostSigner.getAddress()}`);

      // February 2026: Generate proofHash and proofCID (signature no longer needed)
      const timestamp = Date.now();
      const proofHash = ethers.keccak256(
        ethers.toUtf8Bytes(`proof_${sessionId}_${timestamp}_${tokensToSubmit}`)
      );
      // Mock proofCID for test harness - in production this would be an S5 CID
      const proofCID = `mock-proof-cid-${sessionId}-${timestamp}`;

      // Wait for token accumulation (ProofSystem enforces rate limits)
      console.log("Waiting 5 seconds for token accumulation...");
      addMessage("system", "⏳ Waiting for token accumulation...");
      await new Promise((resolve) => setTimeout(resolve, 5000));

      console.log("Submitting checkpoint:", {
        sessionId: sessionId.toString(),
        tokensToSubmit,
        proofHash,
        proofCID,
      });

      // Feb 2026: No signature parameter - auth via msg.sender == session.host
      const checkpointTx = await paymentManager.submitCheckpointAsHost(
        sessionId,
        tokensToSubmit,
        proofHash,
        proofCID,
        hostSigner
      );

      console.log("Checkpoint submitted:", checkpointTx);
      setStatus("Session active");
      addMessage(
        "system",
        `✅ Checkpoint submitted for ${tokensToSubmit} tokens`
      );

      // Update last checkpoint tokens
      setLastCheckpointTokens(totalTokens);
    } catch (error) {
      console.warn("Checkpoint submission failed:", error);
      addMessage("system", `⚠️ Checkpoint submission failed: ${error}`);
    }
  }

  // End session and complete payment
  async function endSession() {
    const sm = sdk?.getSessionManager();
    const pm = sdk?.getPaymentManager();

    // Use window object for session ID
    const currentSessionId = (window as any).__currentSessionId || sessionId;

    if (!sm || !currentSessionId) {
      return;
    }

    setIsLoading(true);
    setStatus("Ending session...");

    try {
      // Step 1: Store conversation to S5 before ending
      if (storageManager && messages.length > 0) {
        try {
          await storeConversation();
          addMessage("system", "💾 Conversation stored to S5");
        } catch (e) {
          console.warn("Failed to store conversation:", e);
        }
      }

      // Step 2: Read balances before ending
      setStatus("Reading balances before ending...");
      const balancesBefore = await readAllBalances();
      console.log("Balances before ending:", balancesBefore);
      addMessage("system", `Host accumulated before: ${balancesBefore.hostAccumulated || '0'} USDC`);
      addMessage("system", `Treasury accumulated before: ${balancesBefore.treasuryAccumulated || '0'} USDC`);

      // Step 3: End the session (close WebSocket)
      setStatus("Closing WebSocket connection...");
      await sm.endSession(currentSessionId);

      addMessage("system", "✅ Session ended successfully");
      addMessage("system", "🔐 WebSocket disconnected");
      addMessage("system", "⏳ Host will detect disconnect and complete contract to claim earnings");

      // Calculate expected payment distribution (with PRICE_PRECISION=1000)
      const PRICE_PRECISION = 1000;
      const pricePerToken = activeHostRef.current?.pricePerToken || DEFAULT_PRICE_PER_TOKEN;
      const tokensCost = (totalTokens * pricePerToken) / PRICE_PRECISION / 1000000; // Convert to USDC
      const hostPayment = tokensCost * 0.9; // 90% to host
      const treasuryPayment = tokensCost * 0.1; // 10% to treasury
      const pricePerMillion = pricePerToken / PRICE_PRECISION;

      addMessage("system", `📊 Tokens used in session: ${totalTokens}`);
      addMessage("system", `💰 Expected payment distribution (when host completes):`);
      addMessage("system", `   Total cost: ${tokensCost.toFixed(6)} USDC (${totalTokens} tokens @ $${pricePerMillion}/million)`);
      addMessage("system", `   Host will receive: ${hostPayment.toFixed(6)} USDC (90%)`);
      addMessage("system", `   Treasury will receive: ${treasuryPayment.toFixed(6)} USDC (10%)`);

      addMessage("system", "ℹ️  Note: Balances won't update until host calls completeSessionJob");

      // Step 4: Simulate host completing the session (in production, host does this)
      setStatus("Simulating host completion...");
      addMessage("system", "🔧 Simulating host calling completeSession (for demo purposes)...");

      try {
        const finalProof = "0x" + "00".repeat(32); // Dummy proof
        const hostProvider = new ethers.JsonRpcProvider(
          RPC_URLS[selectedChainId as keyof typeof RPC_URLS]
        );
        const selectedHostAddr =
          activeHost?.address || (window as any).__selectedHostAddress;

        if (!selectedHostAddr) {
          throw new Error("No host selected for completion");
        }

        let hostPrivateKey: string;
        if (selectedHostAddr.toLowerCase() === TEST_HOST_1_ADDRESS.toLowerCase()) {
          hostPrivateKey = TEST_HOST_1_PRIVATE_KEY;
        } else if (selectedHostAddr.toLowerCase() === TEST_HOST_2_ADDRESS.toLowerCase()) {
          hostPrivateKey = TEST_HOST_2_PRIVATE_KEY;
        } else {
          throw new Error(`Unknown host address: ${selectedHostAddr}`);
        }

        const hostWallet = new ethers.Wallet(hostPrivateKey, hostProvider);
        const chain = ChainRegistry.getChain(selectedChainId);
        const hostSdk = new FabstirSDKCore({
          mode: 'production' as const,
          chainId: selectedChainId,
          rpcUrl: RPC_URLS[selectedChainId as keyof typeof RPC_URLS],
          contractAddresses: {
            jobMarketplace: chain.contracts.jobMarketplace,
            nodeRegistry: chain.contracts.nodeRegistry,
            proofSystem: chain.contracts.proofSystem,
            hostEarnings: chain.contracts.hostEarnings,
            fabToken: chain.contracts.fabToken,
            usdcToken: chain.contracts.usdcToken,
            modelRegistry: chain.contracts.modelRegistry,
          },
          s5Config: {
            seedPhrase: process.env.NEXT_PUBLIC_S5_SEED_PHRASE!,
          },
        });

        await hostSdk.authenticate("signer", { signer: hostWallet });
        const hostSm = hostSdk.getSessionManager();

        // Use actual token count - node handles padding if needed
        addMessage("system", `📊 Completing with ${totalTokens} actual tokens`);

        const completionTx = await hostSm.completeSession(
          currentSessionId,
          totalTokens,
          finalProof
        );
        console.log(`✅ Host completed session - TX: ${completionTx}`);
        addMessage("system", `✅ Host completed session on blockchain`);

        // Wait for confirmation
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch (error: any) {
        console.error(`Host completion failed: ${error.message}`);
        addMessage("system", `⚠️ Host completion failed: ${error.message}`);
      }

      // Step 5: Read balances after completion
      setStatus("Reading final balances...");
      const balancesAfter = await readAllBalances();
      console.log("Balances after session end:", balancesAfter);

      // Step 6: Display final results
      setStatus("Session ended successfully");

      addMessage("system", "✅ Session ended successfully");
      addMessage("system", "💰 Your final balance:");
      addMessage("system", `  Smart Wallet: ${balancesAfter.smartWallet} USDC`);

      // Clear session state
      setSessionId(null);
      setJobId(null);
      setActiveHost(null);
      activeHostRef.current = null;
      setLastCheckpointTokens(0);
      delete (window as any).__selectedHostAddress;
      delete (window as any).__currentSessionId;
      delete (window as any).__currentJobId;
    } catch (error: any) {
      console.error("Failed to end session:", error);
      setError(`Failed to end session: ${error.message}`);
      addMessage("system", `❌ Error ending session: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  // Clear conversation
  function clearConversation() {
    setMessages([]);
    setTotalTokens(0);
    setTotalCost(0);
    addMessage("system", "Conversation cleared. Session remains active.");
  }

  // Render UI
  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Chat Context Demo</h1>

      {/* Chain Selector */}
      <div className="mb-4 p-3 bg-gray-100 rounded">
        <label className="font-semibold mr-2">Chain:</label>
        <select
          value={selectedChainId}
          onChange={(e) => setSelectedChainId(Number(e.target.value))}
          className="px-3 py-1 border rounded"
          disabled={isConnected}
        >
          <option value={ChainId.BASE_SEPOLIA}>Base Sepolia</option>
          <option value={ChainId.OPBNB_TESTNET}>opBNB Testnet</option>
        </select>
        {isConnected && (
          <span className="ml-2 text-sm text-gray-600">
            (disconnect to change chain)
          </span>
        )}
      </div>

      {/* Status Bar */}
      <div className="bg-gray-100 p-3 rounded mb-4">
        <div className="flex justify-between items-center">
          <div>
            <span className="font-semibold">Status:</span> {status}
          </div>
          <div className="text-sm text-gray-600">
            <span>Tokens: {totalTokens}</span>
            <span style={{ marginLeft: "20px" }}>
              Cost: ${totalCost.toFixed(4)}
            </span>
          </div>
        </div>
        {sessionId !== null && (
          <div className="text-xs text-gray-500 mt-1">
            <div>Session ID: {sessionId.toString()}</div>
            {activeHost && (
              <div className="text-xs text-green-600 font-semibold mt-1">
                Connected to Host: {activeHost.address.slice(0, 6)}...
                {activeHost.address.slice(-4)}
                {activeHost.address.toLowerCase() ===
                  TEST_HOST_1_ADDRESS.toLowerCase() && " (Host 1)"}
                {activeHost.address.toLowerCase() ===
                  TEST_HOST_2_ADDRESS.toLowerCase() && " (Host 2)"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Deposit Section */}
      {isConnected && primaryAccount && (
        <div className="bg-blue-50 p-4 rounded-lg mb-4">
          <h3 className="font-semibold mb-2">💰 Deposit USDC</h3>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="Amount (USDC)"
              className="px-3 py-2 border rounded w-32"
              disabled={isLoading}
            />
            <button
              onClick={depositUSDC}
              disabled={isLoading || !depositAmount}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300"
            >
              {isLoading ? "Depositing..." : "Deposit to Primary Account"}
            </button>
            <button
              onClick={readAllBalances}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
            >
              Refresh Balances
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Request USDC from test faucet to your primary smart account
          </p>
        </div>
      )}

      {/* User Accounts Section */}
      {isConnected && primaryAccount && (
        <div className="bg-white border rounded-lg p-4 mb-4">
          <h3 className="font-semibold mb-3">👤 User Accounts</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ color: '#6b7280', marginRight: '20px' }}>
                Primary Smart Wallet: {primaryAccount.slice(0, 10)}...{primaryAccount.slice(-8)}
              </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                {balances.smartWallet} USDC
              </span>
            </div>
            {subAccount && subAccount !== primaryAccount && (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ color: '#6b7280', marginRight: '20px' }}>
                  Sub-Account: {subAccount.slice(0, 10)}...{subAccount.slice(-8)}
                </span>
                <span style={{ fontFamily: 'monospace' }}>{balances.subAccount} USDC</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Host Earnings Section */}
      {isConnected && (activeHost || (window as any).__selectedHostAddress) && (
        <div className="bg-white border rounded-lg p-4 mb-4">
          <h3 className="font-semibold mb-3">🖥️ Host Earnings</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Accumulated (Contract):</span>
              <span className="font-mono text-orange-600">
                {balances.hostAccumulated} USDC
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Host 1 Wallet:</span>
              <span className="font-mono">{balances.host1} USDC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Host 2 Wallet:</span>
              <span className="font-mono">{balances.host2} USDC</span>
            </div>
          </div>
        </div>
      )}

      {/* Treasury Section */}
      {isConnected && (
        <div className="bg-white border rounded-lg p-4 mb-4">
          <h3 className="font-semibold mb-3">🏦 Treasury</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Accumulated (Contract):</span>
              <span className="font-mono text-purple-600">
                {balances.treasuryAccumulated} USDC
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Treasury Wallet:</span>
              <span className="font-mono">{balances.treasury} USDC</span>
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div className="bg-white border rounded-lg h-96 overflow-y-auto mb-8 p-4">
        {messages.length === 0 ? (
          <div className="text-gray-400 text-center mt-8">
            No messages yet. Connect wallet and start a session to begin
            chatting.
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`${
                  msg.role === "user"
                    ? "text-blue-600"
                    : msg.role === "assistant"
                    ? "text-green-600"
                    : "text-gray-500 italic"
                }`}
              >
                <span className="font-semibold">
                  {msg.role === "user"
                    ? "User"
                    : msg.role === "assistant"
                    ? "Assistant"
                    : "System"}
                  :
                </span>{" "}
                {msg.content}
                {msg.tokens && (
                  <span className="text-xs text-gray-400 ml-2">
                    {" "}
                    ({msg.tokens} tokens)
                  </span>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && !isLoading && sendMessage()}
          placeholder="Type your message..."
          disabled={!sessionId || isLoading}
          className="flex-1 px-4 py-3 border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          style={{ minWidth: "500px" }}
        />
        <button
          onClick={sendMessage}
          disabled={!sessionId || isLoading || !inputMessage.trim()}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isLoading ? "Sending..." : "Send"}
        </button>
      </div>

      {/* Control Buttons */}
      <div className="flex gap-2">
        {!isConnected ? (
          <button
            onClick={connectWallet}
            disabled={isLoading || !sdk}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300"
          >
            Connect Wallet
          </button>
        ) : !sessionId ? (
          <button
            onClick={startSession}
            disabled={isLoading}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300"
          >
            Start Session
          </button>
        ) : (
          <>
            <button
              onClick={clearConversation}
              disabled={isLoading}
              className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-300"
            >
              Clear Chat
            </button>
            <button
              onClick={endSession}
              disabled={isLoading}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-300"
            >
              End Session
            </button>
          </>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm">
        <h3 className="font-semibold mb-2">
          🎯 How Base Account Kit Auto Spend Permissions Work:
        </h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>
            <strong>First Time:</strong> Connect wallet → Approve spend
            permission once ($1000 USDC allowance)
          </li>
          <li>
            <strong>Subsequent Sessions:</strong> Just click "Start Session" -
            NO transaction popups!
          </li>
          <li>
            Sub-account automatically spends USDC from primary account via spend
            permissions
          </li>
          <li>
            All transactions are gasless (sponsored by Coinbase on Base Sepolia)
          </li>
          <li>
            Multiple chat sessions without any popups until primary account runs
            out of USDC
          </li>
          <li>
            Conversation context is preserved across multiple prompts within a
            session
          </li>
          <li>
            Payments are automatically distributed to host (90%) and treasury
            (10%) when session ends
          </li>
        </ul>
      </div>
    </div>
  );
}
