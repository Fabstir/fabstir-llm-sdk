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
import { FabstirSDKCore, ChainRegistry, ChainId, JobMarketplaceWrapper, DelegatedSessionParams, createSubAccountSigner as sdkCreateSubAccountSigner } from "@fabstir/sdk-core";
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
import { DocumentManager, HostAdapter } from '@fabstir/sdk-core';

// Web search metadata type (Phase 8.1 - inline to avoid import resolution issues)
interface WebSearchMetadata {
  performed: boolean;
  queriesCount: number;
  provider: string | null;
}

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
const TEST_TREASURY_ADDRESS = process.env.NEXT_PUBLIC_TEST_TREASURY_ADDRESS!;
const TEST_TREASURY_PRIVATE_KEY =
  process.env.NEXT_PUBLIC_TEST_TREASURY_PRIVATE_KEY!;

// Session configuration
const SESSION_DEPOSIT_AMOUNT = "0.5"; // $0.5 USDC
const PRICE_PER_TOKEN = 2000; // 0.002 USDC per token
const PROOF_INTERVAL = 1000; // Checkpoint every 1000 tokens (production default)
const SESSION_DURATION = 86400; // 1 day

// Message type for chat
interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  tokens?: number;
  webSearchMetadata?: WebSearchMetadata; // Web search info (Phase 8.1)
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

  // RAG State
  const [documentManager, setDocumentManager] = useState<DocumentManager | null>(null);
  const [isRagEnabled, setIsRagEnabled] = useState(false);
  const [uploadedDocuments, setUploadedDocuments] = useState<Array<{
    id: string;
    name: string;
    chunks: number;
  }>>([]);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    stage: 'reading' | 'chunking' | 'embedding' | 'uploading';
    percent: number;
    message: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string>("");

  // Wallet State
  const [selectedChainId, setSelectedChainId] =
    useState<number>(DEFAULT_CHAIN_ID);
  const [eoaAddress, setEoaAddress] = useState<string>(""); // EOA controller address (for Base Account Kit)
  const [primaryAccount, setPrimaryAccount] = useState<string>("");
  const [subAccount, setSubAccount] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const [isUsingBaseAccount, setIsUsingBaseAccount] = useState(false);
  const [baseAccountSDK, setBaseAccountSDK] = useState<any>(null);
  const [subAccountSigner, setSubAccountSigner] = useState<any>(null); // For popup-free session creation
  const subAccountSignerRef = useRef<any>(null); // Ref for immediate access (avoids React state timing issues)

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

  // Pre-Funded Deposit State
  const [contractDeposit, setContractDeposit] = useState("0");
  const [depositToContract, setDepositToContract] = useState("5");
  const [isDepositMode, setIsDepositMode] = useState(true);

  // Delegation State (for popup-free session creation)
  const [isDelegateAuthorized, setIsDelegateAuthorized] = useState(false);
  const [isAuthorizingDelegate, setIsAuthorizingDelegate] = useState(false);
  const [delegationError, setDelegationError] = useState("");

  // UI State
  const [status, setStatus] = useState("Initializing...");
  const [error, setError] = useState<string>("");
  const [isRecovering, setIsRecovering] = useState(false);
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
    tokens?: number,
    webSearchMetadata?: WebSearchMetadata
  ) => {
    const message: ChatMessage = {
      role,
      content,
      timestamp: Date.now(),
      tokens,
      webSearchMetadata,
    };

    setMessages((prev) => [...prev, message]);

    if (tokens) {
      setTotalTokens((prev) => prev + tokens);
      setTotalCost((prev) => prev + (tokens * PRICE_PER_TOKEN) / 1000000); // Convert to USDC
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

      // Read contract deposit balance (for pre-funded deposit mode)
      if (paymentManager && isDepositMode) {
        const depositBalance = await readContractDepositBalance();
        setContractDeposit(depositBalance);
      }

      return newBalances;
    } catch (error) {
      console.error("Error reading balances:", error);
      return balances;
    }
  };

  // Helper: Read contract deposit balance for pre-funded mode
  const readContractDepositBalance = async (): Promise<string> => {
    try {
      if (!paymentManager) return "0";
      const contracts = getContractAddresses();
      const result = await (paymentManager as any).getDepositBalances(
        [contracts.USDC],
        selectedChainId
      );
      return result.tokens[contracts.USDC] || "0";
    } catch (error) {
      console.error("Error reading contract deposit balance:", error);
      return "0";
    }
  };

  // Helper: Check if sub-account is authorized as delegate for primary account
  // Accepts optional params for when called before state is set
  const checkDelegationStatus = async (primary?: string, sub?: string) => {
    try {
      const depositor = primary || primaryAccount;
      const delegate = sub || subAccount;

      if (!depositor || !delegate || !sdk) {
        console.log("[Delegation] Skipping check - missing accounts or SDK");
        return;
      }

      console.log("[Delegation] Checking authorization status...");
      console.log(`  Primary: ${depositor}`);
      console.log(`  Sub-account: ${delegate}`);

      // Get signer to create JobMarketplaceWrapper
      const signer = await sdk.getSigner();
      if (!signer) {
        console.log("[Delegation] No signer available");
        return;
      }

      const marketplace = new JobMarketplaceWrapper(selectedChainId, signer);
      const isAuthorized = await marketplace.isDelegateAuthorized(depositor, delegate);

      console.log(`[Delegation] Authorization status: ${isAuthorized}`);
      setIsDelegateAuthorized(isAuthorized);
      setDelegationError("");

      if (isAuthorized) {
        addMessage("system", "✅ Sub-account is authorized for popup-free session creation.");
      }
    } catch (error: any) {
      console.error("[Delegation] Error checking status:", error);
      setIsDelegateAuthorized(false);
      setDelegationError(error.message);
    }
  };

  // Helper: Authorize sub-account as delegate for popup-free session creation
  const authorizeDelegateForSubAccount = async () => {
    try {
      if (!primaryAccount || !subAccount || !sdk) {
        addMessage("system", "❌ Cannot authorize: wallet not connected");
        return;
      }

      setIsAuthorizingDelegate(true);
      setDelegationError("");
      addMessage("system", `🔐 Authorizing sub-account for popup-free transactions...`);

      // Get primary account signer (this will trigger a popup)
      const signer = await sdk.getSigner();
      if (!signer) {
        throw new Error("No signer available");
      }

      const marketplace = new JobMarketplaceWrapper(selectedChainId, signer);
      console.log(`[Delegation] Authorizing delegate: ${subAccount}`);

      const tx = await marketplace.authorizeDelegate(subAccount, true);
      addMessage("system", `⏳ Waiting for authorization confirmation...`);

      await tx.wait(3);
      console.log("[Delegation] Authorization confirmed");

      setIsDelegateAuthorized(true);
      addMessage("system", `✅ Sub-account authorized! Future sessions will be popup-free.`);
    } catch (error: any) {
      console.error("[Delegation] Authorization failed:", error);
      setDelegationError(error.message);
      addMessage("system", `❌ Authorization failed: ${error.message}`);
    } finally {
      setIsAuthorizingDelegate(false);
    }
  };

  // Helper: Deposit USDC to contract escrow (pre-funded mode)
  const depositToContractEscrow = async () => {
    try {
      console.log("[DepositToEscrow] Starting deposit...");
      if (!paymentManager || !primaryAccount) {
        addMessage("system", "❌ Cannot deposit: wallet not connected");
        return;
      }

      const contracts = getContractAddresses();
      const depositAmountUsdc = depositToContract;
      console.log("[DepositToEscrow] Amount:", depositAmountUsdc, "USDC to contract:", contracts.JOB_MARKETPLACE);

      // Check primary account has sufficient balance
      addMessage("system", `💰 Starting deposit of ${depositAmountUsdc} USDC to contract escrow...`);
      const readProvider = new ethers.JsonRpcProvider(RPC_URLS[selectedChainId as keyof typeof RPC_URLS]);
      const usdcReadContract = new ethers.Contract(
        contracts.USDC,
        ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)"],
        readProvider
      );

      const balance = await usdcReadContract.balanceOf(primaryAccount);
      const required = ethers.parseUnits(depositAmountUsdc, 6);
      console.log("[DepositToEscrow] Balance:", ethers.formatUnits(balance, 6), "Required:", depositAmountUsdc);
      if (balance < required) {
        addMessage("system", `❌ Insufficient USDC balance. Have: ${ethers.formatUnits(balance, 6)}, Need: ${depositAmountUsdc}`);
        return;
      }

      // Get signer for the PRIMARY account (smart wallet) - must match SDK's authenticated signer
      // CRITICAL: Use primaryAccount as the signer address, not the default first account
      const walletProvider = baseAccountSDK ? baseAccountSDK.getProvider() : (window as any).ethereum;
      const ethersProvider = new ethers.BrowserProvider(walletProvider);
      const signer = await ethersProvider.getSigner(primaryAccount);
      const signerAddress = await signer.getAddress();
      console.log("[DepositToEscrow] Got signer:", signerAddress);

      // Verify signer matches primaryAccount
      if (signerAddress.toLowerCase() !== primaryAccount!.toLowerCase()) {
        throw new Error(`Signer address mismatch! Expected ${primaryAccount}, got ${signerAddress}. Make sure the correct account is selected in your wallet.`);
      }

      // Check/request approval for JobMarketplace contract
      const currentAllowance = await usdcReadContract.allowance(primaryAccount, contracts.JOB_MARKETPLACE);
      console.log("[DepositToEscrow] Current allowance:", ethers.formatUnits(currentAllowance, 6));
      if (currentAllowance < required) {
        addMessage("system", `🔐 Requesting USDC approval for deposit...`);
        const usdcWithSigner = new ethers.Contract(
          contracts.USDC,
          ["function approve(address,uint256) returns (bool)"],
          signer
        );
        const approveTx = await usdcWithSigner.approve(contracts.JOB_MARKETPLACE, ethers.parseUnits("1000", 6));
        await approveTx.wait(3);
        addMessage("system", "✅ USDC approved for deposit");
      }

      // Call depositToken via PaymentManager
      addMessage("system", `📤 Depositing ${depositAmountUsdc} USDC to contract escrow...`);
      console.log("[DepositToEscrow] Calling paymentManager.depositToken...");
      const result = await (paymentManager as any).depositToken(
        contracts.USDC,
        depositAmountUsdc,
        selectedChainId
      );
      console.log("[DepositToEscrow] Result:", result);

      addMessage("system", `✅ Successfully deposited ${depositAmountUsdc} USDC to contract escrow! Tx: ${result.transactionHash}`);

      // Refresh balances
      await readAllBalances();
    } catch (error: any) {
      console.error("[DepositToEscrow] Error:", error);
      addMessage("system", `❌ Deposit failed: ${error.message || error}`);
    }
  };

  // Helper: Withdraw USDC from contract escrow (pre-funded mode)
  const withdrawFromContractEscrow = async () => {
    try {
      if (!paymentManager) {
        addMessage("system", "❌ Cannot withdraw: wallet not connected");
        return;
      }

      const contracts = getContractAddresses();
      const currentDeposit = await readContractDepositBalance();
      if (parseFloat(currentDeposit) <= 0) {
        addMessage("system", "❌ No funds to withdraw from contract escrow");
        return;
      }

      addMessage("system", `📥 Withdrawing ${currentDeposit} USDC from contract escrow...`);
      const result = await (paymentManager as any).withdrawToken(
        contracts.USDC,
        currentDeposit,
        selectedChainId
      );

      addMessage("system", `✅ Successfully withdrew ${currentDeposit} USDC from contract escrow! Tx: ${result.transactionHash}`);

      // Refresh balances
      await readAllBalances();
    } catch (error: any) {
      console.error("Error withdrawing from contract:", error);
      addMessage("system", `❌ Withdrawal failed: ${error.message || error}`);
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

      // Initialize DocumentManager for RAG
      const embeddingService = new HostAdapter({
        hostUrl: process.env.NEXT_PUBLIC_TEST_HOST_1_URL || 'http://localhost:8083',
        chainId: DEFAULT_CHAIN_ID,
      });
      const dm = new DocumentManager({ embeddingService });
      setDocumentManager(dm);

      // Mark as connected - wallet connection is successful
      setIsConnected(true);
      setStatus("Wallet connected. Ready to start chat session.");
      addMessage("system", "✅ Wallet connected successfully.");

      // Check delegation status for popup-free session creation
      await checkDelegationStatus();
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

        // Initialize DocumentManager for RAG
        const embeddingService = new HostAdapter({
          hostUrl: process.env.NEXT_PUBLIC_TEST_HOST_1_URL || 'http://localhost:8083',
          chainId: DEFAULT_CHAIN_ID,
        });
        const dm = new DocumentManager({ embeddingService });
        setDocumentManager(dm);

        setIsConnected(true);
        setStatus("Wallet connected. Ready to start chat session.");
        addMessage("system", "✅ Wallet connected successfully.");

        // Check delegation status for popup-free session creation
        await checkDelegationStatus();
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

    // Create and store sub-account signer for popup-free session creation from deposit
    // This signer uses wallet_sendCalls which can be auto-approved via spend permissions
    // Using SDK's version which has correct EIP-5792 format
    const subSigner = sdkCreateSubAccountSigner({
      provider: result.provider,
      subAccount: sub,
      primaryAccount: smartWallet,
      chainId: DEFAULT_CHAIN_ID,
    });
    setSubAccountSigner(subSigner);
    subAccountSignerRef.current = subSigner; // Store in ref for immediate access
    (window as any).__subAccountSigner = subSigner; // Also store globally for debugging
    console.log("[SubAccountSigner] Created and stored:", { subAccount: sub, primaryAccount: smartWallet });
    addMessage("system", `  Sub-account: ${sub.slice(0, 6)}...${sub.slice(-4)} (for popup-free sessions)`);

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
    // Note: Using primary account signer because ERC20 transferFrom uses msg.sender.
    // Deposits will show popup (correct - moving funds requires confirmation).
    // For truly popup-free sessions, the contract would need to support spend permissions.
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

    // Check delegation status using local variables (state may not be set yet)
    await checkDelegationStatus(smartWallet, sub);
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
  // CRITICAL: wallet_addSubAccount MUST be called each session to register CryptoKey
  // See: https://docs.base.org/base-account/improve-ux/sub-accounts
  async function ensureSubAccount(
    provider: any,
    universal: `0x${string}`
  ): Promise<`0x${string}`> {
    console.log("ensureSubAccount: Starting with primary account:", universal);

    try {
      // Check for existing sub-accounts first (informational only)
      console.log("ensureSubAccount: Checking for existing sub-accounts...");
      const resp = (await provider.request({
        method: "wallet_getSubAccounts",
        params: [
          {
            account: universal,
            domain: window.location.origin,
          },
        ],
      })) as { subAccounts?: Array<{ address: `0x${string}` }> };

      const hasExisting = resp?.subAccounts?.length > 0;
      if (hasExisting) {
        console.log("ensureSubAccount: Found existing sub-account, will re-register for this session");
      } else {
        console.log("ensureSubAccount: No existing sub-account found");
      }
    } catch (e) {
      console.log("ensureSubAccount: Could not check existing sub-accounts:", e);
    }

    try {
      // ALWAYS call wallet_addSubAccount to register CryptoKey for THIS session
      // Per Base docs: "wallet_addSubAccount needs to be called in each session"
      // "It will not trigger a new Sub Account creation if one already exists"
      console.log("ensureSubAccount: Calling wallet_addSubAccount (required each session for CryptoKey)...");
      addMessage("system", "🔐 Registering sub-account for this session...");

      const result = (await provider.request({
        method: "wallet_addSubAccount",
        params: [
          {
            account: { type: "create" },
          },
        ],
      })) as { address: `0x${string}` };

      console.log("ensureSubAccount: wallet_addSubAccount returned:", result);
      addMessage(
        "system",
        `✅ Sub-account ready: ${result.address.slice(0, 6)}...${result.address.slice(-4)}`
      );
      addMessage("system", "🔑 CryptoKey registered for popup-free transactions");
      return result.address;
    } catch (error) {
      console.error("ensureSubAccount: wallet_addSubAccount failed:", error);
      addMessage("system", `❌ Failed to register sub-account: ${error}`);
      addMessage(
        "system",
        `⚠️ WARNING: Using primary account instead (transaction popups will occur)`
      );
      return universal;
    }
  }

  // Helper: Create sub-account signer (DEPRECATED - now using SDK's version)
  // Keeping for reference but not used - SDK version has correct EIP-5792 format
  function _deprecatedCreateSubAccountSigner(
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

        // Use wallet_sendCalls format from Base documentation
        // https://docs.base.org/identity/smart-wallet/guides/sub-accounts
        const response = await provider.request({
          method: "wallet_sendCalls",
          params: [
            {
              version: "2.0",
              atomicRequired: true,
              chainId: CHAIN_HEX,
              from: subAccount as `0x${string}`,
              calls: calls,
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
        throw new Error("No active hosts available");
      }

      // Parse host metadata
      const parsedHosts = hosts.map((host: any) => ({
        address: host.address,
        endpoint: host.apiUrl || host.endpoint,
        models: host.supportedModels || [],
        pricePerToken: PRICE_PER_TOKEN,
      }));

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

      // Update DocumentManager to use the selected host's endpoint for embeddings
      console.log(`[RAG] Host endpoint: ${host.endpoint}, documentManager exists: ${!!documentManager}`);
      if (documentManager) {
        console.log(`[RAG] Updating DocumentManager with host endpoint: ${host.endpoint}`);
        const updatedEmbeddingService = new HostAdapter({
          hostUrl: host.endpoint,
          chainId: DEFAULT_CHAIN_ID,
        });
        const updatedDM = new DocumentManager({ embeddingService: updatedEmbeddingService });
        setDocumentManager(updatedDM);
        console.log(`[RAG] DocumentManager updated successfully`);
      } else {
        console.log(`[RAG] WARNING: DocumentManager not initialized yet, skipping update`);
      }

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

      // Check balance depending on payment mode
      if (isDepositMode) {
        // Pre-funded deposit mode: check contract escrow balance
        const depositBalance = await readContractDepositBalance();
        const sessionCost = parseFloat(SESSION_DEPOSIT_AMOUNT);
        addMessage("system", `💰 Contract escrow balance: ${depositBalance} USDC (using pre-funded deposit)`);
        if (parseFloat(depositBalance) < sessionCost) {
          throw new Error(
            `Insufficient contract deposit. Need ${SESSION_DEPOSIT_AMOUNT} USDC but only have ${depositBalance} USDC. Please deposit more USDC to the contract.`
          );
        }
      } else {
        // Direct payment mode: check primary account has sufficient funds
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
      }

      setStatus("Creating session...");

      // Validate host endpoint
      const hostEndpoint = host.endpoint;
      if (!hostEndpoint) {
        throw new Error(
          `Host ${host.address} does not have an API endpoint configured`
        );
      }

      // Get model-specific price from contract (USDC uses 6 decimals for pricePerToken)
      const modelIdForPrice = host.models[0].startsWith('0x') && host.models[0].length === 66
        ? host.models[0]
        : ethers.keccak256(ethers.toUtf8Bytes(host.models[0]));
      let modelPrice = PRICE_PER_TOKEN;
      try {
        const hm = hostManager || sdk?.getHostManager();
        if (hm) {
          const rawPrice = await hm.getModelPricing(host.address, modelIdForPrice, contracts.USDC);
          modelPrice = Number(rawPrice);
          console.log(`[Session] Model-specific price from contract: ${modelPrice}`);
        }
      } catch (e: any) {
        console.log(`[Session] Could not get model price, using default: ${e.message}`);
      }

      // Create session configuration with direct payment
      const sessionConfig = {
        depositAmount: SESSION_DEPOSIT_AMOUNT,
        pricePerToken: modelPrice,
        proofInterval: PROOF_INTERVAL,
        proofTimeoutWindow: 300, // AUDIT-F3: 5 minute timeout (60-3600 range)
        duration: SESSION_DURATION,
        paymentToken: contracts.USDC,
        useDeposit: isDepositMode, // true = use pre-funded deposit, false = direct payment
        chainId: selectedChainId, // REQUIRED for multi-chain
      };

      // Only need to approve if using direct payment (not deposit mode)
      if (!isDepositMode) {
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

        // Check current allowance - use high threshold to avoid running out mid-session
        const currentAllowance = await usdcContract.allowance(
          primaryAccount,
          contracts.JOB_MARKETPLACE
        );
        const minAllowanceThreshold = parseUnits("100", 6); // 100 USDC threshold

        console.log("[Allowance] Current allowance:", formatUnits(currentAllowance, 6), "USDC");
        console.log("[Allowance] Threshold:", formatUnits(minAllowanceThreshold, 6), "USDC");
        console.log("[Allowance] Primary account:", primaryAccount);
        console.log("[Allowance] JobMarketplace:", contracts.JOB_MARKETPLACE);

        if (currentAllowance < minAllowanceThreshold) {
          addMessage("system", `🔐 Requesting USDC approval (current: ${formatUnits(currentAllowance, 6)} USDC)...`);
          const approveTx = await usdcContract.approve(
            contracts.JOB_MARKETPLACE,
            parseUnits("1000", 6) // Approve 1000 USDC for multiple sessions
          );
          await approveTx.wait(3);
          addMessage("system", "✅ USDC approved for JobMarketplace (1000 USDC)");
        } else {
          addMessage("system", `✅ USDC already approved (${formatUnits(currentAllowance, 6)} USDC)`);
        }
      } else {
        addMessage("system", "💰 Using pre-funded contract deposit (no approval needed)");
      }

      // Start session - with Auto Spend Permissions, payment happens automatically without popups!
      addMessage(
        "system",
        isUsingBaseAccount && isDepositMode && subAccountSigner
          ? "🎉 Starting session via sub-account (popup-free!)"
          : isUsingBaseAccount
          ? "📝 Starting session with Base Account..."
          : "📝 Starting session..."
      );

      const fullSessionConfig = {
        ...sessionConfig,
        model: host.models[0],
        provider: host.address,
        hostAddress: host.address,
        endpoint: hostEndpoint,
        chainId: selectedChainId,
      };

      console.log("Starting session with config:", fullSessionConfig);

      let result: any;

      // Check if we can use delegated session creation (popup-free)
      const canUseDelegation = isDepositMode && isDelegateAuthorized && subAccount && subAccountSigner;

      if (canUseDelegation) {
        console.log("[Session] Using DELEGATED session creation (popup-free!)");
      } else {
        console.log("[Session] Using standard session creation (popup required)");
      }

      if (isDepositMode) {
        // Get model ID from host's registered model
        // If already a bytes32 (0x + 64 hex chars), use directly; otherwise hash it
        const modelName = host.models[0];
        const modelId = modelName.startsWith('0x') && modelName.length === 66
          ? modelName  // Already a bytes32 model ID
          : ethers.keccak256(ethers.toUtf8Bytes(modelName));
        console.log("[Session] Model:", modelName, "-> ID:", modelId);

        // Prepare parameters
        const depositValue = ethers.parseUnits(sessionConfig.depositAmount, 6); // USDC has 6 decimals

        if (canUseDelegation) {
          // POPUP-FREE PATH: Use sub-account to call delegated function
          addMessage("system", "🎉 Creating session via delegated call (popup-free!)...");

          const marketplace = new JobMarketplaceWrapper(selectedChainId, subAccountSigner);

          const delegatedParams: DelegatedSessionParams = {
            depositor: primaryAccount,
            host: host.address,
            paymentToken: contracts.USDC,
            deposit: sessionConfig.depositAmount,
            pricePerToken: sessionConfig.pricePerToken,
            duration: sessionConfig.duration,
            proofInterval: sessionConfig.proofInterval,
            proofTimeoutWindow: sessionConfig.proofTimeoutWindow || 300,
            modelId: modelId,
          };

          console.log("[Session] Calling createSessionFromDepositForModelAsDelegate:", {
            depositor: primaryAccount,
            modelId,
            host: host.address,
            deposit: depositValue.toString(),
          });

          const extractedSessionId = await marketplace.createSessionFromDepositForModelAsDelegate(delegatedParams);

          result = {
            sessionId: BigInt(extractedSessionId),
            jobId: BigInt(extractedSessionId),
            transactionHash: "delegated"
          };

          // Register the delegated session with SessionManager so chat works
          if (sm) {
            console.log("[Session] Registering delegated session with SessionManager...");
            await (sm as any).registerDelegatedSession({
              sessionId: BigInt(extractedSessionId),
              jobId: BigInt(extractedSessionId),
              hostUrl: host.endpoint,
              hostAddress: host.address,
              model: modelName,
              chainId: selectedChainId,
              depositAmount: sessionConfig.depositAmount,
              pricePerToken: sessionConfig.pricePerToken,
              proofInterval: sessionConfig.proofInterval,
              duration: sessionConfig.duration,
            });
          }

          addMessage("system", "🎉 Session created WITHOUT popup (delegated)!");
        } else {
          // STANDARD PATH: Primary account creates session (requires popup)
          addMessage("system", "Creating session from pre-funded deposit...");
          console.log("[Session] Deposit mode: Primary account will call createSessionFromDepositForModel");

          // Use SDK's signer (primary account) - this will show a popup
          const signer = await sdk!.getSigner();

          // Create JobMarketplace contract with primary account signer
          const jobMarketplaceABI = [
            "function createSessionFromDepositForModel(bytes32 modelId, address host, address paymentToken, uint256 deposit, uint256 pricePerToken, uint256 maxDuration, uint256 proofInterval, uint256 proofTimeoutWindow) returns (uint256)",
            "event SessionJobCreatedForModel(uint256 indexed sessionId, address indexed client, address indexed host, bytes32 modelId, uint256 deposit)",
            "event SessionCreatedByDepositor(uint256 indexed sessionId, address indexed depositor, address indexed host, uint256 depositUsed)"
          ];

          const jobMarketplace = new ethers.Contract(
            contracts.JOB_MARKETPLACE,
            jobMarketplaceABI,
            signer
          );

          console.log("[Session] Calling createSessionFromDepositForModel via primary account:", {
            modelId,
            host: host.address,
            paymentToken: contracts.USDC,
            deposit: depositValue.toString(),
            pricePerToken: sessionConfig.pricePerToken,
            duration: sessionConfig.duration,
            proofInterval: sessionConfig.proofInterval,
            proofTimeoutWindow: sessionConfig.proofTimeoutWindow
          });

          // Call contract via primary account (requires popup approval)
          const tx = await jobMarketplace.createSessionFromDepositForModel(
            modelId,
            host.address,
            contracts.USDC,
            depositValue,
            sessionConfig.pricePerToken,
            sessionConfig.duration,
            sessionConfig.proofInterval,
            sessionConfig.proofTimeoutWindow || 300
          );

          console.log("[Session] Transaction sent:", tx.hash);
          addMessage("system", "Waiting for confirmation...");

          const receipt = await tx.wait(3);
          console.log("[Session] Transaction confirmed:", receipt);

          // Extract session ID from events
          const sessionEvent = receipt.logs?.find((log: any) =>
            log.fragment?.name === 'SessionJobCreatedForModel' ||
            log.fragment?.name === 'SessionCreatedByDepositor'
          );
          const extractedSessionId = sessionEvent ? BigInt(sessionEvent.args[0]) : BigInt(1);

          result = {
            sessionId: extractedSessionId,
            jobId: extractedSessionId,
            transactionHash: tx.hash
          };

          addMessage("system", "✅ Session created (popup was required)");
        }
      } else {
        // NORMAL PATH: Use SDK's SessionManager (may show popup for primary account)
        console.log("[Session] Using SDK SessionManager (standard flow)");
        result = await sm.startSession(fullSessionConfig);
      }

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
      // Search RAG documents (always attempt if documentManager exists)
      let ragContext = "";
      if (documentManager) {
        console.log(`[RAG] Attempting RAG search...`);
        try {
          // Step 1: Embed the user's query text
          console.log("[RAG] Embedding query text...");
          const embeddingResult = await documentManager.embedText(userMessage, 'query');
          const queryVector = embeddingResult.embedding;
          console.log(`[RAG] Query embedded: ${queryVector.length} dimensions`);

          // Step 2: Search for similar vectors (will return empty if none uploaded)
          // @ts-ignore - searchVectors not yet in ISessionManager interface
          console.log(`[RAG] Searching session: ${currentSessionId.toString()}`);
          const searchResults = await sm.searchVectors(
            currentSessionId.toString(),
            queryVector,
            3, // topK - get top 3 most relevant chunks
            0.2 // threshold - lower to catch more matches
          );

          console.log(`[RAG] Found ${searchResults.length} relevant chunks`);
          console.log('[RAG] Search results (raw):', JSON.stringify(searchResults));

          if (searchResults.length > 0) {
            // System instruction for handling image descriptions and document context
            ragContext = "IMPORTANT: The following context contains information from uploaded documents. ";
            ragContext += "Sections marked [Image Description] contain AI-analyzed descriptions of uploaded images - ";
            ragContext += "use this information to answer questions about those images. ";
            ragContext += "Sections marked [Extracted Text] contain OCR text from images.\n\n";
            ragContext += "Relevant information from uploaded documents:\n\n";
            searchResults.forEach((result: any, idx: number) => {
              console.log(`[RAG] Result ${idx}:`, result);
              // Try different field names that might contain the text
              const text = result.text || result.content || result.metadata?.text || result.chunk || 'No text found';
              ragContext += `[Document ${idx + 1}] ${text}\n\n`;
            });
            ragContext += "---\n\n";
            console.log("[RAG] Context prepared:", ragContext.substring(0, 200) + "...");
          } else {
            console.log("[RAG] No relevant chunks found (no documents uploaded yet)");
          }
        } catch (ragError: any) {
          console.warn(`[RAG] Search failed: ${ragError.message}`);
          // Continue without RAG context
        }
      }

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

        // If we have RAG context, prepend it before the conversation history
        if (ragContext) {
          fullPrompt = `${ragContext}${harmonyHistory}\n<|start|>user<|message|>${userMessage}<|end|>`;
        } else {
          // Add current user message (node will add assistant prompt)
          fullPrompt = `${harmonyHistory}\n<|start|>user<|message|>${userMessage}<|end|>`;
        }
      } else {
        // First message - prepend RAG context if available, then send user message
        if (ragContext) {
          fullPrompt = `${ragContext}${userMessage}`;
        } else {
          fullPrompt = userMessage;
        }
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

      // Get web search metadata from session (Phase 8.1)
      let webSearchMeta: WebSearchMetadata | undefined;
      try {
        // getSession is on concrete class, not interface - cast to any
        const session = (sm as any).getSession?.(currentSessionId.toString());
        if (session?.webSearchMetadata) {
          webSearchMeta = session.webSearchMetadata;
          console.log("[WebSearch] Metadata captured:", webSearchMeta);
        }
      } catch (e) {
        // Session might not have getSession method in all cases
      }

      // Add assistant response with web search metadata
      addMessage("assistant", cleanedResponse, estimatedTokens, webSearchMeta);

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

  // Convert ChunkResult[] to Vector[] format for SessionManager.uploadVectors()
  // ChunkResult from managers/DocumentManager.ts has nested structure: { chunk: DocumentChunk, embedding: number[] }
  function convertChunksToVectors(chunks: any[]): any[] {
    return chunks.map((chunkResult) => ({
      id: chunkResult.chunk.id,
      vector: chunkResult.embedding, // 384-dimensional array
      metadata: {
        text: chunkResult.chunk.text,
        documentId: chunkResult.chunk.metadata.documentId,
        documentName: chunkResult.chunk.metadata.documentName,
        documentType: chunkResult.chunk.metadata.documentType,
        chunkIndex: chunkResult.chunk.metadata.index,
        startOffset: chunkResult.chunk.metadata.startOffset,
        endOffset: chunkResult.chunk.metadata.endOffset,
      },
    }));
  }

  // Handle document file upload for RAG
  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    console.log('[RAG DEBUG] handleFileUpload called');
    console.log('[RAG DEBUG] event:', event);
    console.log('[RAG DEBUG] files:', event.target.files);

    const file = event.target.files?.[0];
    console.log('[RAG DEBUG] file:', file);
    if (!file) {
      console.log('[RAG DEBUG] No file selected, returning early');
      return;
    }

    console.log('[RAG DEBUG] File selected, checking documentManager...');
    console.log('[RAG DEBUG] documentManager:', documentManager);

    // Validate DocumentManager is initialized
    if (!documentManager) {
      console.log('[RAG DEBUG] DocumentManager is null!');
      setUploadError("DocumentManager not initialized. Please enable RAG first.");
      addMessage("system", "❌ Error: DocumentManager not initialized");
      return;
    }

    console.log('[RAG DEBUG] DocumentManager OK, checking session...');
    console.log('[RAG DEBUG] DocumentManager hostUrl:', (documentManager as any).embeddingService?.hostUrl);
    console.log('[RAG DEBUG] sessionId:', sessionId);
    console.log('[RAG DEBUG] sessionManager:', sessionManager);

    // Validate active session exists
    if (!sessionId || !sessionManager) {
      console.log('[RAG DEBUG] Session validation failed!');
      setUploadError("No active session. Please start a chat session first.");
      addMessage("system", "❌ Error: No active session");
      return;
    }

    console.log('[RAG DEBUG] All validations passed, starting upload...');

    console.log('[RAG DEBUG] Setting isUploadingDocument to true...');
    setIsUploadingDocument(true);
    console.log('[RAG DEBUG] Clearing upload error...');
    setUploadError("");

    try {
      console.log('[RAG DEBUG] Entered try block');

      // Validate file type
      const ext = file.name.split(".").pop()?.toLowerCase();
      console.log('[RAG DEBUG] File extension:', ext);

      if (!["txt", "md", "html", "pdf", "png", "jpg", "jpeg", "webp", "gif"].includes(ext || "")) {
        throw new Error("Only .txt, .md, .html, .pdf, .png, .jpg, .webp, .gif files are supported");
      }

      // Validate file size (max 5 MB)
      console.log('[RAG DEBUG] File size:', file.size);
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("File size must be less than 5MB");
      }

      // Stage 1-3: Process document (extracting, chunking, embedding)
      console.log('[RAG DEBUG] Adding system message...');
      addMessage("system", `🔄 Processing document: ${file.name}...`);
      console.log('[RAG DEBUG] System message added, calling processDocument...');
      console.log('[RAG DEBUG] DocumentManager instance:', documentManager);
      console.log('[RAG DEBUG] File object:', file);

      const chunks = await documentManager.processDocument(file, {
        onProgress: (progress: any) => {
          console.log('[RAG DEBUG] processDocument progress callback:', progress);
          // Map DocumentManager progress stages to UI stages
          let stage: 'reading' | 'chunking' | 'embedding' | 'uploading' = 'reading';
          let stageEmoji = '📖';

          if (progress.stage === 'extracting') {
            stage = 'reading';
            stageEmoji = '📖';
          } else if (progress.stage === 'chunking') {
            stage = 'chunking';
            stageEmoji = '✂️';
          } else if (progress.stage === 'embedding') {
            stage = 'embedding';
            stageEmoji = '🔢';
          }

          console.log('[RAG DEBUG] Setting upload progress:', { stage, percent: progress.progress });
          setUploadProgress({
            stage,
            percent: progress.progress,
            message: `${stageEmoji} ${progress.stage}... ${progress.progress}%`,
          });
        },
      });

      console.log('[RAG DEBUG] processDocument completed, chunks:', chunks);
      console.log('[RAG DEBUG] Number of chunks:', chunks?.length);

      // Handle empty chunks (image with no text content)
      if (!chunks || chunks.length === 0) {
        console.log('[RAG DEBUG] No text content found in document');
        addMessage("system", `⚠️ No text found in ${file.name} - ensure host has Florence vision model loaded for image descriptions`);
        // Still add to uploaded list so user knows upload was attempted
        setUploadedDocuments([
          ...uploadedDocuments,
          {
            id: `doc-${Date.now()}`,
            name: file.name,
            chunks: 0,
          },
        ]);
        return;
      }

      // Stage 4: Upload vectors to host via SessionManager
      console.log('[RAG DEBUG] Starting vector upload stage...');
      setUploadProgress({
        stage: 'uploading',
        percent: 90,
        message: '📤 Uploading vectors to host... 90%',
      });

      console.log('[RAG DEBUG] Converting chunks to vectors...');
      const vectors = convertChunksToVectors(chunks);
      console.log('[RAG DEBUG] Converted vectors:', vectors);
      console.log('[RAG DEBUG] Number of vectors:', vectors?.length);

      console.log('[RAG DEBUG] Calling sessionManager.uploadVectors...');
      console.log('[RAG DEBUG] Session ID:', sessionId.toString());
      console.log('[RAG DEBUG] Vectors to upload:', vectors.length, 'vectors with', vectors[0]?.vector?.length, 'dimensions');
      // @ts-ignore - uploadVectors not yet in ISessionManager interface
      const uploadResult = await sessionManager.uploadVectors(sessionId.toString(), vectors);
      console.log('[RAG DEBUG] uploadVectors result:', uploadResult);
      console.log('[RAG DEBUG] Uploaded:', uploadResult?.uploaded, 'Rejected:', uploadResult?.rejected, 'Errors:', uploadResult?.errors);

      // Mark upload complete
      setUploadProgress({
        stage: 'uploading',
        percent: 100,
        message: '✅ Upload complete! 100%',
      });

      // Update uploaded documents list
      console.log('[RAG DEBUG] Updating uploaded documents list...');
      setUploadedDocuments([
        ...uploadedDocuments,
        {
          id: chunks[0]?.chunk.metadata.documentId || `doc-${Date.now()}`,
          name: file.name,
          chunks: chunks.length,
        },
      ]);

      console.log('[RAG DEBUG] Document upload completed successfully!');
      addMessage("system", `✅ Uploaded: ${file.name} (${chunks.length} chunks)`);
    } catch (error: any) {
      console.error("[RAG DEBUG] Document upload failed:", error);
      console.error("[RAG DEBUG] Error stack:", error.stack);
      console.error("[RAG DEBUG] Error message:", error.message);
      setUploadError(error.message);
      addMessage("system", `❌ Upload failed: ${error.message}`);
    } finally {
      setIsUploadingDocument(false);
      setUploadProgress(null);
      event.target.value = ""; // Reset file input
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

      // Generate a unique proof
      const timestamp = Date.now();
      const uniqueHash = ethers.keccak256(
        ethers.toUtf8Bytes(`job_${sessionId}_${timestamp}`)
      );

      // Create a structured 64-byte proof
      const proofData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes32"],
        [uniqueHash, ethers.id("mock_ezkl_padding")]
      );

      // Wait for token accumulation (ProofSystem enforces rate limits)
      console.log("Waiting 5 seconds for token accumulation...");
      addMessage("system", "⏳ Waiting for token accumulation...");
      await new Promise((resolve) => setTimeout(resolve, 5000));

      console.log("Submitting checkpoint:", {
        sessionId: sessionId.toString(),
        tokensToSubmit,
        proofDataLength: proofData.length,
      });

      const checkpointTx = await paymentManager.submitCheckpointAsHost(
        sessionId,
        tokensToSubmit,
        proofData,
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

      // Calculate expected payment distribution
      const tokensCost = (totalTokens * PRICE_PER_TOKEN) / 1000000; // Convert to USDC
      const hostPayment = tokensCost * 0.9; // 90% to host
      const treasuryPayment = tokensCost * 0.1; // 10% to treasury

      addMessage("system", `📊 Tokens used in session: ${totalTokens}`);
      addMessage("system", `💰 Expected payment distribution (when host completes):`);
      addMessage("system", `   Total cost: ${tokensCost.toFixed(6)} USDC (${totalTokens} tokens × $${PRICE_PER_TOKEN/1000000}/token)`);
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

  // Test checkpoint recovery (Phase 5.2 - Delta-Based Checkpointing)
  async function testRecovery() {
    const sm = sdk?.getSessionManager();
    const currentSessionId = (window as any).__currentSessionId || sessionId;

    if (!sm) {
      setError("Session manager not available");
      return;
    }

    if (!currentSessionId) {
      setError("No session ID to recover. Start a session first.");
      return;
    }

    setIsRecovering(true);
    setStatus("Attempting checkpoint recovery...");

    try {
      addMessage("system", `🔄 Testing recovery for session ${currentSessionId}...`);

      // Call the recovery method
      const recovered = await sm.recoverFromCheckpoints(currentSessionId);

      if (recovered.messages.length === 0) {
        addMessage("system", "ℹ️ No checkpoints found for this session.");
        addMessage("system", "   (Node may not have published checkpoints yet, or session is still active)");
      } else {
        addMessage("system", `✅ Recovered ${recovered.messages.length} messages from ${recovered.checkpoints.length} checkpoints`);
        addMessage("system", `📊 Total tokens recovered: ${recovered.tokenCount}`);

        // Display recovered messages
        addMessage("system", "📝 Recovered conversation:");
        recovered.messages.forEach((msg: { role: string; content: string }, i: number) => {
          const preview = msg.content.length > 100 ? msg.content.substring(0, 100) + "..." : msg.content;
          addMessage("system", `   [${msg.role}]: ${preview}`);
        });

        // Optionally restore the conversation
        addMessage("system", "💡 Tip: In production, these messages would be restored to the chat UI.");
      }

      setStatus("Recovery test complete");
    } catch (error: any) {
      console.error("Recovery failed:", error);
      const errorCode = error.message.split(":")[0];
      addMessage("system", `❌ Recovery failed: ${error.message}`);

      if (errorCode === "SESSION_NOT_FOUND") {
        addMessage("system", "   Session not found in local state. Start a new session first.");
      } else if (errorCode === "PROOF_HASH_MISMATCH") {
        addMessage("system", "   ⚠️ Checkpoint data doesn't match on-chain proofs!");
      } else if (errorCode === "DELTA_FETCH_FAILED") {
        addMessage("system", "   Could not fetch checkpoint delta from S5 storage.");
      }
    } finally {
      setIsRecovering(false);
    }
  }

  // Test blockchain-based recovery (Phase 9.6 - Decentralized Recovery)
  async function testBlockchainRecovery() {
    const sm = sdk?.getSessionManager();
    const currentJobId = (window as any).__currentJobId || jobId;

    if (!sm) {
      setError("Session manager not available");
      return;
    }

    if (!currentJobId) {
      setError("No job ID to recover. Start a session first.");
      return;
    }

    setIsRecovering(true);
    setStatus("Attempting blockchain-based recovery...");

    try {
      addMessage("system", `🔗 Testing blockchain recovery for job ${currentJobId.toString()}...`);
      addMessage("system", "   (Querying ProofSubmitted events from blockchain...)");

      // Call the blockchain-based recovery method (no HTTP API needed)
      const recovered = await sm.recoverFromBlockchainEvents(currentJobId);

      if (recovered.messages.length === 0) {
        addMessage("system", "ℹ️ No recoverable checkpoints found on-chain.");
        addMessage("system", "   (Node may not have submitted proofs with deltaCID yet)");
        addMessage("system", `   Checkpoints found: ${recovered.checkpoints.length} (may be pre-upgrade without deltaCID)`);
      } else {
        addMessage("system", `✅ Recovered ${recovered.messages.length} messages from ${recovered.checkpoints.length} on-chain checkpoints`);
        addMessage("system", `📊 Total tokens recovered: ${recovered.tokenCount}`);

        // Display recovered messages
        addMessage("system", "📝 Recovered conversation:");
        recovered.messages.forEach((msg: { role: string; content: string }, i: number) => {
          const preview = msg.content.length > 100 ? msg.content.substring(0, 100) + "..." : msg.content;
          addMessage("system", `   [${msg.role}]: ${preview}`);
        });

        // Show blockchain checkpoint info
        addMessage("system", "🔗 Blockchain checkpoints:");
        recovered.checkpoints.forEach((cp: any, i: number) => {
          addMessage("system", `   #${i}: block ${cp.blockNumber}, tokens: ${cp.tokensClaimed.toString()}`);
        });
      }

      setStatus("Blockchain recovery test complete");
    } catch (error: any) {
      console.error("Blockchain recovery failed:", error);
      addMessage("system", `❌ Blockchain recovery failed: ${error.message}`);

      if (error.message.includes("DELTA_FETCH_FAILED")) {
        addMessage("system", "   Could not fetch delta from S5 storage.");
      } else if (error.message.includes("DECRYPTION_FAILED")) {
        addMessage("system", "   Failed to decrypt checkpoint delta.");
      }
    } finally {
      setIsRecovering(false);
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
      <h1 className="text-2xl font-bold mb-4">Chat Context RAG Demo</h1>

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

      {/* Payment Mode Toggle */}
      {isConnected && primaryAccount && (
        <div className="bg-gray-100 p-4 rounded-lg mb-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">⚙️ Payment Mode</h3>
            <button
              onClick={() => setIsDepositMode(!isDepositMode)}
              className={`px-4 py-2 rounded font-medium ${
                isDepositMode
                  ? "bg-purple-500 text-white hover:bg-purple-600"
                  : "bg-gray-400 text-white hover:bg-gray-500"
              }`}
            >
              {isDepositMode ? "Pre-Funded Deposit" : "Direct Payment"}
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            {isDepositMode
              ? "Sessions use USDC pre-deposited to contract escrow (AUDIT-F5: createSessionFromDepositForModel)"
              : "Sessions transfer USDC directly from primary account (createSessionJobWithToken)"
            }
          </p>
        </div>
      )}

      {/* Contract Escrow Deposit Section (Pre-Funded Mode) */}
      {isConnected && primaryAccount && isDepositMode && (
        <div className="bg-purple-50 p-4 rounded-lg mb-4 border-2 border-purple-300">
          <h3 className="font-semibold mb-2">🏦 Contract Escrow</h3>
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-gray-600">Deposit Balance:</span>
              <span className="font-mono font-bold text-purple-700 ml-2">{contractDeposit} USDC</span>
            </div>
            <div className="text-sm text-gray-600">
              ~{Math.floor(parseFloat(contractDeposit) / parseFloat(SESSION_DEPOSIT_AMOUNT))} sessions available
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              value={depositToContract}
              onChange={(e) => setDepositToContract(e.target.value)}
              placeholder="Amount (USDC)"
              className="px-3 py-2 border rounded w-32"
              disabled={isLoading}
              min="0.5"
              step="0.5"
            />
            <button
              onClick={depositToContractEscrow}
              disabled={isLoading || !depositToContract}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-300"
            >
              Deposit to Escrow
            </button>
            <button
              onClick={withdrawFromContractEscrow}
              disabled={isLoading || parseFloat(contractDeposit) <= 0}
              className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-300"
            >
              Withdraw All
            </button>
          </div>

          {/* Delegation Authorization for Popup-Free Sessions */}
          {subAccount && !isDelegateAuthorized && (
            <div className="mt-3 p-3 bg-yellow-50 rounded-lg border border-yellow-300">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-yellow-800 font-medium">🔓 Enable Popup-Free Sessions</span>
                  <p className="text-xs text-yellow-700 mt-1">Authorize sub-account once for seamless transactions</p>
                </div>
                <button
                  onClick={authorizeDelegateForSubAccount}
                  disabled={isAuthorizingDelegate}
                  className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-300"
                >
                  {isAuthorizingDelegate ? "Authorizing..." : "Authorize (One-Time)"}
                </button>
              </div>
              {delegationError && (
                <p className="text-xs text-red-600 mt-1">{delegationError}</p>
              )}
            </div>
          )}
          {subAccount && isDelegateAuthorized && (
            <div className="mt-3 p-2 bg-green-50 rounded border border-green-300">
              <span className="text-green-700 text-sm">✅ Popup-free sessions enabled</span>
            </div>
          )}
        </div>
      )}

      {/* Deposit Section (Direct Payment Mode) */}
      {isConnected && primaryAccount && !isDepositMode && (
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
                {/* Web Search Indicator (Phase 8.1) */}
                {msg.webSearchMetadata?.performed && (
                  <span className="text-xs text-purple-500 ml-2" title={`Web search via ${msg.webSearchMetadata.provider || 'unknown'}`}>
                    🔍 {msg.webSearchMetadata.provider || 'web'} ({msg.webSearchMetadata.queriesCount} {msg.webSearchMetadata.queriesCount === 1 ? 'query' : 'queries'})
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

      {/* Web Search Triggers Info (Phase 8.1) */}
      {sessionId && (
        <div className="bg-purple-50 p-3 rounded-lg mb-4 border border-purple-200">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔍</span>
            <span className="font-semibold text-purple-900 text-sm">Web Search Auto-Detection</span>
          </div>
          <p className="text-xs text-purple-700 mb-2">
            The SDK automatically enables web search when your prompt contains triggers like:
          </p>
          <div className="flex flex-wrap gap-1 mb-2">
            {['search for', 'latest', 'current', 'today', 'recent', 'news', '2025', '2026', 'look up', 'find online'].map((trigger) => (
              <span key={trigger} className="px-2 py-0.5 bg-purple-200 text-purple-800 rounded text-xs">
                {trigger}
              </span>
            ))}
          </div>
          <div className="text-xs text-purple-600">
            <strong>Try:</strong>{' '}
            <button
              onClick={() => setInputMessage('Search for the latest AI news')}
              className="text-purple-800 underline hover:text-purple-900"
              disabled={isLoading}
            >
              "Search for the latest AI news"
            </button>
            {' | '}
            <button
              onClick={() => setInputMessage('What is the current weather in Tokyo?')}
              className="text-purple-800 underline hover:text-purple-900"
              disabled={isLoading}
            >
              "What is the current weather in Tokyo?"
            </button>
          </div>
        </div>
      )}

      {/* RAG Document Upload Section */}
      {sessionId && documentManager && (
        <div className="bg-purple-50 p-4 rounded-lg mb-4 border border-purple-200">
          <h3 className="font-semibold mb-3 text-purple-900">📚 RAG Document Upload</h3>

          {/* File Upload Input */}
          <div className="flex gap-2 items-center mb-3">
            <input
              type="file"
              accept=".txt,.md,.html,.pdf,.png,.jpg,.jpeg,.webp,.gif"
              onChange={handleFileUpload}
              disabled={isUploadingDocument || !sessionId}
              className="px-3 py-2 border rounded text-sm disabled:bg-gray-100"
            />
            <span className="text-xs text-gray-600">
              Supported: .txt, .md, .html, .pdf, .png, .jpg, .webp, .gif (max 5MB)
            </span>
          </div>

          {/* Upload Progress */}
          {uploadProgress && (
            <div className="mb-3 p-3 bg-white rounded border">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">{uploadProgress.message}</span>
                <span className="text-sm font-bold text-blue-600">{uploadProgress.percent}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Upload Error */}
          {uploadError && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {uploadError}
            </div>
          )}

          {/* Uploaded Documents List */}
          {uploadedDocuments.length > 0 && (
            <div className="mt-3">
              <h4 className="text-sm font-semibold mb-2 text-gray-700">Uploaded Documents:</h4>
              <div className="space-y-1">
                {uploadedDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex justify-between items-center p-2 bg-white rounded border text-sm"
                  >
                    <span className="font-medium">{doc.name}</span>
                    <span className="text-gray-500">{doc.chunks} chunks</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-600 mt-3">
            💡 Tip: Upload documents to enhance LLM responses with relevant context
          </p>
        </div>
      )}

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
            <button
              onClick={testRecovery}
              disabled={isLoading || isRecovering}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-300"
              title="Test checkpoint recovery (Phase 5.2)"
            >
              {isRecovering ? "Recovering..." : "Test Recovery"}
            </button>
            <button
              onClick={testBlockchainRecovery}
              disabled={isLoading || isRecovering}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
              title="Test blockchain-based recovery (Phase 9.6 - decentralized)"
            >
              {isRecovering ? "Recovering..." : "Test Blockchain Recovery"}
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
