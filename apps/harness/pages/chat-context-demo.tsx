/**
 * Chat Context Demo - Demonstrates conversation context preservation with Fabstir LLM SDK
 *
 * This harness page shows how to:
 * - Maintain conversation history across multiple prompts
 * - Send full context with each request
 * - Store conversations in S5 for persistence
 * - Track token usage and costs
 * - Handle session lifecycle with USDC payments
 */

import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { parseUnits, formatUnits, getAddress, createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { createBaseAccountSDK } from "@base-org/account";
import { FabstirSDKCore } from '@fabstir/sdk-core';
import { cacheSeed, hasCachedSeed } from '../../../packages/sdk-core/src/utils/s5-seed-derivation';
import type {
  PaymentManager,
  SessionManager,
  StorageManager,
  HostManager,
  TreasuryManager
} from '@fabstir/sdk-core';

// Environment variables (from .env.local)
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!;
const CHAIN_HEX = "0x14a34";  // Base Sepolia
const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID!;
const CHAIN_ID_NUM = parseInt(CHAIN_ID, 16);
const JOB_MARKETPLACE = process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE!;
const USDC = process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!;
// Note: User's private key should NEVER be exposed in frontend code
// Users will connect via wallet (Base Account Kit or MetaMask)
const TEST_HOST_1_ADDRESS = process.env.NEXT_PUBLIC_TEST_HOST_1_ADDRESS!;
const TEST_HOST_1_PRIVATE_KEY = process.env.NEXT_PUBLIC_TEST_HOST_1_PRIVATE_KEY!;
const TEST_HOST_2_ADDRESS = process.env.NEXT_PUBLIC_TEST_HOST_2_ADDRESS!;
const TEST_HOST_2_PRIVATE_KEY = process.env.NEXT_PUBLIC_TEST_HOST_2_PRIVATE_KEY!;
const TEST_TREASURY_ADDRESS = process.env.NEXT_PUBLIC_TEST_TREASURY_ADDRESS!;
const TEST_TREASURY_PRIVATE_KEY = process.env.NEXT_PUBLIC_TEST_TREASURY_PRIVATE_KEY!;
const TEST_HOST_1_URL = process.env.NEXT_PUBLIC_TEST_HOST_1_URL || 'http://localhost:8080';

// Constants
const SESSION_DEPOSIT_AMOUNT = "2"; // $2 USDC deposit
const PRICE_PER_TOKEN = 200; // 200 units per token
const PROOF_INTERVAL = 100; // Checkpoint every 100 tokens
const SESSION_DURATION = 3600; // 1 hour session

// Message type for chat
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokens?: number;
}

// Extend Window interface for Ethereum provider
declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function ChatContextDemo() {
  // SDK State
  const [sdk, setSdk] = useState<FabstirSDKCore | null>(null);
  const [sessionManager, setSessionManager] = useState<SessionManager | null>(null);
  const [paymentManager, setPaymentManager] = useState<PaymentManager | null>(null);
  const [storageManager, setStorageManager] = useState<StorageManager | null>(null);
  const [hostManager, setHostManager] = useState<HostManager | null>(null);

  // Wallet State
  const [primaryAccount, setPrimaryAccount] = useState<string>("");
  const [subAccount, setSubAccount] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);

  // Session State
  const [sessionId, setSessionId] = useState<bigint | null>(null);
  // Note: In session-based model, we use sessionId for everything. No separate jobId needed.
  const [activeHost, setActiveHost] = useState<any>(null);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [totalTokens, setTotalTokens] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [lastCheckpointTokens, setLastCheckpointTokens] = useState(0);

  // UI State
  const [status, setStatus] = useState("Initializing...");
  const [error, setError] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialize SDK on mount
  useEffect(() => {
    initializeSDK();
  }, []);

  // Helper: Add message to chat
  const addMessage = (role: ChatMessage['role'], content: string, tokens?: number) => {
    const message: ChatMessage = {
      role,
      content,
      timestamp: Date.now(),
      tokens
    };

    setMessages(prev => [...prev, message]);

    if (tokens) {
      setTotalTokens(prev => prev + tokens);
      setTotalCost(prev => prev + (tokens * PRICE_PER_TOKEN / 1000000)); // Convert to USDC
    }
  };

  // Helper: Create viem public client for balance reading
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC_URL)
  });

  // Helper: Read USDC balance for an address
  const readUSDCBalance = async (address: string): Promise<bigint> => {
    const erc20BalanceOfAbi = [
      {
        inputs: [{ name: 'account', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function'
      }
    ] as const;

    try {
      const balance = await publicClient.readContract({
        address: USDC as `0x${string}`,
        abi: erc20BalanceOfAbi,
        functionName: 'balanceOf',
        args: [address as `0x${string}`]
      });
      return balance;
    } catch (error) {
      console.error(`Failed to read balance for ${address}:`, error);
      return 0n;
    }
  };

  // Helper: Read all relevant balances
  const readAllBalances = async () => {
    const selectedHostAddr = activeHost?.address || (window as any).__selectedHostAddress;

    const balances = {
      user: primaryAccount ? await readUSDCBalance(primaryAccount) : 0n,
      subAccount: subAccount ? await readUSDCBalance(subAccount) : 0n,
      host: selectedHostAddr ? await readUSDCBalance(selectedHostAddr) : 0n,
      treasury: TEST_TREASURY_ADDRESS ? await readUSDCBalance(TEST_TREASURY_ADDRESS) : 0n
    };

    return balances;
  };

  // Helper: Build context from message history
  const buildContext = (): string => {
    // Only include previous messages, not the current one being sent
    const previousMessages = messages.filter(m => m.role !== 'system');
    if (previousMessages.length === 0) return '';

    return previousMessages
      .map(m => {
        // For assistant messages, make sure we're not including repetitive content
        let content = m.content;

        // Limit length and clean up any repetitive patterns that slipped through
        if (m.role === 'assistant' && content.includes('\n') && content.includes('A:')) {
          // If it looks like a repetitive response, just take the first line
          content = content.split('\n')[0].trim();
        }

        // Also limit overall length
        content = content.substring(0, 200);

        return `${m.role === 'user' ? 'User' : 'Assistant'}: ${content}`;
      })
      .join('\n');
  };

  // Initialize SDK
  async function initializeSDK() {
    try {
      setStatus("Initializing SDK...");

      const sdkConfig = {
        chainId: CHAIN_ID_NUM,
        rpcUrl: RPC_URL,
        contractAddresses: {
          jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE!,
          nodeRegistry: process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY!,
          proofSystem: process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM!,
          hostEarnings: process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS!,
          fabToken: process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN!,
          usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!,
          modelRegistry: process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY!
        },
        s5Config: {
          portalUrl: process.env.NEXT_PUBLIC_S5_PORTAL_URL,
          seedPhrase: process.env.NEXT_PUBLIC_S5_SEED_PHRASE
        },
        mode: 'production' as const
      };

      const newSdk = new FabstirSDKCore(sdkConfig);
      setSdk(newSdk);

      setStatus("SDK initialized. Click 'Connect Wallet' to start.");
      addMessage('system', 'Chat system initialized. Connect your wallet to begin.');

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

    setIsLoading(true);
    setStatus("Connecting wallet...");

    try {
      // Try to use Base Account Kit first
      const provider = await initializeBaseAccountKit();

      if (provider) {
        // Use Base Account Kit for gasless transactions
        await connectWithBaseAccount(provider);
      } else {
        // Fallback to regular wallet provider (MetaMask, etc.)
        await connectWithWalletProvider();
      }

      // Get managers
      const pm = sdk.getPaymentManager();
      const sm = sdk.getSessionManager();
      const hm = sdk.getHostManager();
      const stm = sdk.getStorageManager();

      setPaymentManager(pm);
      setSessionManager(sm);
      setHostManager(hm);
      setStorageManager(stm);

      // Mark as connected - wallet connection is successful
      setIsConnected(true);
      setStatus("Wallet connected. Ready to start chat session.");
      addMessage('system', '✅ Wallet connected successfully.');

    } catch (error: any) {
      console.error("Wallet connection failed:", error);
      setError(`Failed to connect wallet: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  // Initialize Base Account Kit
  async function initializeBaseAccountKit() {
    try {
      const bas = createBaseAccountSDK({
        appName: "Chat Context Demo",
        appChainIds: [CHAIN_ID_NUM],
        subAccounts: {
          unstable_enableAutoSpendPermissions: true
        }
      });

      return bas.getProvider();
    } catch (error) {
      console.warn("Base Account Kit not available, using fallback");
      return null;
    }
  }

  // Connect with Base Account Kit
  async function connectWithBaseAccount(provider: any) {
    // Connect to Base Account
    const accounts = await provider.request({
      method: "eth_requestAccounts",
      params: []
    }) as `0x${string}`[];

    const primary = accounts[0]!;
    setPrimaryAccount(primary);

    // Get or create sub-account
    const sub = await ensureSubAccount(provider, primary);
    setSubAccount(sub);

    // Pre-cache seed for sub-account to avoid popup
    const subAccountLower = sub.toLowerCase();
    if (!hasCachedSeed(subAccountLower)) {
      const testSeed = 'yield organic score bishop free juice atop village video element unless sneak care rock update';
      cacheSeed(subAccountLower, testSeed);
      addMessage('system', 'Pre-cached S5 seed for sub-account to avoid popup');
    }

    // Create custom signer for sub-account with primary account
    const subAccountSigner = createSubAccountSigner(provider, sub, primary);

    // Authenticate SDK with sub-account signer FIRST
    await sdk!.authenticate('signer', { signer: subAccountSigner as any });

    addMessage('system', `Connected with Base Account Kit. Sub-account: ${sub.slice(0, 6)}...${sub.slice(-4)}`);
    addMessage('system', '✅ SDK authenticated with sub-account signer (no S5 popup!)');
    addMessage('system', '🎉 Transactions will use sub-account auto-spend (no popups!)');

    // Check if Base Account primary needs funding from MetaMask
    const ethersProvider = new ethers.JsonRpcProvider(RPC_URL);
    const usdcContract = new ethers.Contract(USDC, [
      "function balanceOf(address) view returns (uint256)"
    ], ethersProvider);

    const primaryBalance = await usdcContract.balanceOf(primary);
    console.log(`Base Account primary balance: $${formatUnits(primaryBalance, 6)}`);

    if (primaryBalance < parseUnits("2", 6)) {
      // Primary account needs funding from MetaMask
      const needed = parseUnits("2", 6) - primaryBalance;
      console.log(`Base Account primary needs $${formatUnits(needed, 6)} more USDC`);

      try {
        await fundPrimaryAccountFromUserWallet(primary, needed);
      } catch (error: any) {
        console.log('Unable to auto-fund Base Account primary:', error.message);
        // Connection successful but needs manual funding
        addMessage('system', '⚠️ Base Account needs funding to start sessions');
      }
    } else {
      addMessage('system', `✅ Base Account has sufficient USDC balance: $${formatUnits(primaryBalance, 6)}`);
    }
  }

  // Connect with wallet provider (MetaMask or other wallet)
  async function connectWithWalletProvider() {
    if (!window.ethereum) {
      setError("No wallet provider found. Please install MetaMask or use Base Account Kit.");
      return;
    }

    try {
      // Request account access
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const userAddress = accounts[0];

      // Create a provider and signer from the wallet
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // Authenticate SDK with the signer
      await sdk!.authenticate('signer', { signer });
      setPrimaryAccount(userAddress);
      setSubAccount(userAddress); // In this mode, primary and sub are the same

      addMessage('system', `Connected with wallet: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`);
    } catch (error: any) {
      setError(`Failed to connect wallet: ${error.message}`);
    }
  }

  // Helper: Get or create sub-account
  async function ensureSubAccount(provider: any, universal: `0x${string}`): Promise<`0x${string}`> {
    console.log("ensureSubAccount: Starting with primary account:", universal);

    try {
      console.log("ensureSubAccount: Calling wallet_getSubAccounts...");
      const resp = await provider.request({
        method: "wallet_getSubAccounts",
        params: [{
          account: universal,
          domain: window.location.origin
        }]
      }) as { subAccounts?: Array<{ address: `0x${string}` }> };

      console.log("ensureSubAccount: Response from wallet_getSubAccounts:", resp);

      if (resp?.subAccounts?.length) {
        const subAccount = resp.subAccounts[0]!.address;
        addMessage('system', `Using existing sub-account: ${subAccount}`);
        console.log("ensureSubAccount: Returning existing sub-account:", subAccount);
        return subAccount;
      }

      console.log("ensureSubAccount: No existing sub-accounts found");
    } catch (e) {
      console.error("ensureSubAccount: Error getting sub-accounts:", e);
      addMessage('system', `Error checking for existing sub-accounts: ${e}`);
    }

    try {
      console.log("ensureSubAccount: Creating new sub-account...");
      const created = await provider.request({
        method: "wallet_addSubAccount",
        params: [{
          account: universal,
          spender: {
            address: JOB_MARKETPLACE as `0x${string}`,
            token: USDC,
            allowance: parseUnits('1000', 6)
          }
        }]
      }) as { address: `0x${string}` };

      console.log("ensureSubAccount: Created sub-account:", created);
      addMessage('system', `Created new sub-account: ${created.address}`);
      return created.address;
    } catch (error) {
      console.error("ensureSubAccount: Failed to create sub-account:", error);
      addMessage('system', `Failed to create sub-account: ${error}`);
      // Fallback to using primary account if sub-account creation fails
      addMessage('system', `WARNING: Using primary account instead of sub-account (popups may occur)`);
      console.log("ensureSubAccount: Falling back to primary account:", universal);
      return universal;
    }
  }

  // Helper: Fund Base Account Kit primary account from user's actual wallet
  async function fundPrimaryAccountFromUserWallet(primaryAccount: string, amountNeeded: bigint) {
    // Request user to approve USDC transfer from their wallet
    addMessage('system', `💳 Base Account needs $${formatUnits(amountNeeded, 6)} USDC`);
    addMessage('system', `📍 Please approve the transfer in your wallet`);

    try {
      // Get the wallet provider (MetaMask or other)
      const walletProvider = window.ethereum;
      if (!walletProvider) {
        throw new Error('No wallet provider found. Please install MetaMask or another wallet.');
      }

      // Request accounts
      const accounts = await walletProvider.request({ method: 'eth_requestAccounts' });
      const userWalletAddress = accounts[0];

      // Create provider and signer
      const ethersProvider = new ethers.BrowserProvider(walletProvider);
      const signer = await ethersProvider.getSigner(userWalletAddress);

      // Create USDC contract instance with user's signer
      const usdcContract = new ethers.Contract(USDC, [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function balanceOf(address) view returns (uint256)"
      ], signer);

      // Check user's wallet balance
      const userBalance = await usdcContract.balanceOf(userWalletAddress);
      console.log(`User wallet balance: $${formatUnits(userBalance, 6)}`);

      if (userBalance < amountNeeded) {
        throw new Error(`Insufficient USDC in wallet. Need $${formatUnits(amountNeeded, 6)}, have $${formatUnits(userBalance, 6)}`);
      }

      // Request transfer - this will trigger wallet popup
      console.log(`Requesting transfer of $${formatUnits(amountNeeded, 6)} from ${userWalletAddress} to Base Account ${primaryAccount}`);
      const tx = await usdcContract.transfer(primaryAccount, amountNeeded);

      addMessage('system', `⏳ Transaction submitted. Waiting for confirmation...`);
      const receipt = await tx.wait(3);
      console.log(`Transfer confirmed in block ${receipt.blockNumber}`);

      const newBalance = await usdcContract.balanceOf(primaryAccount);
      addMessage('system', `✅ Base Account funded with $${formatUnits(amountNeeded, 6)} USDC`);
      addMessage('system', `💰 New balance: $${formatUnits(newBalance, 6)} USDC`);

      return newBalance;
    } catch (error: any) {
      if (error.code === 4001 || error.message?.includes('rejected')) {
        addMessage('system', `❌ Transaction rejected by user`);
        throw new Error('Transaction rejected by user');
      }
      throw error;
    }
  }

  // Helper: Create sub-account signer (EXACT copy from working test)
  function createSubAccountSigner(provider: any, subAccount: string, primaryAccount: string) {
    return {
      provider: new ethers.BrowserProvider(provider),

      async getAddress(): Promise<string> {
        console.log(`[SubAccountSigner] getAddress() called, returning: ${subAccount}`);
        return subAccount;
      },

      async signTransaction(tx: ethers.TransactionRequest): Promise<string> {
        throw new Error("signTransaction not supported - use sendTransaction");
      },

      async signMessage(message: string | Uint8Array): Promise<string> {
        // Check if this is for S5 seed generation
        const messageStr = typeof message === 'string' ? message : ethers.toUtf8String(message);
        if (messageStr.includes('Generate S5 seed')) {
          // If we have a cached seed, return a deterministic mock signature
          // This avoids the popup since the SDK will use the cached seed anyway
          const subAccountLower = subAccount.toLowerCase();
          if (hasCachedSeed(subAccountLower)) {
            console.log('[S5 Seed] Returning mock signature - seed is already cached');
            // Return a deterministic "signature" that will be ignored since we have cache
            return '0x' + '0'.repeat(130); // Valid signature format
          }
        }

        // For other messages or if no cache, use the primary account
        // This is used for S5 seed generation
        const signature = await provider.request({
          method: "personal_sign",
          params: [
            typeof message === 'string' ? message : ethers.hexlify(message),
            primaryAccount
          ]
        });
        return signature;
      },

      async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
        // Use wallet_sendCalls with sub-account as from address
        const calls = [{
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: tx.value ? `0x${BigInt(tx.value).toString(16)}` : undefined
        }];

        console.log('Sending transaction via wallet_sendCalls:', {
          from: subAccount,
          to: tx.to,
          data: tx.data?.slice(0, 10) + '...' // Log function selector
        });

        const response = await provider.request({
          method: "wallet_sendCalls",
          params: [{
            version: "2.0.0",
            chainId: CHAIN_HEX,
            from: subAccount as `0x${string}`,
            calls: calls,
            capabilities: {
              atomic: { required: true }
            }
          }]
        });

        const bundleId = typeof response === 'string' ? response : (response as any).id;
        console.log('Bundle ID:', bundleId);

        // Wait for the bundle to be confirmed and get the real transaction hash
        let realTxHash: string | undefined;
        for (let i = 0; i < 30; i++) {
          try {
            const res = await provider.request({
              method: "wallet_getCallsStatus",
              params: [bundleId]
            }) as { status: number | string, receipts?: any[] };

            const ok =
              (typeof res.status === "number" && res.status >= 200 && res.status < 300) ||
              (typeof res.status === "string" && (res.status === "CONFIRMED" || res.status.startsWith("2")));

            if (ok && res.receipts?.[0]?.transactionHash) {
              realTxHash = res.receipts[0].transactionHash;
              console.log('Transaction confirmed with hash:', realTxHash);
              break;
            }
          } catch (err) {
            // Continue polling
          }
          await new Promise(r => setTimeout(r, 1000));
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
            chainId: CHAIN_ID_NUM,
            wait: async () => {
              const receipt = await ethersProvider.getTransactionReceipt(realTxHash);
              return receipt || { status: 1, hash: realTxHash } as any;
            }
          } as any;
        }

        return txResponse;
      }
    };
  }

  // Start chat session
  async function startSession() {
    if (!sessionManager || !hostManager) {
      setError("Managers not initialized");
      return;
    }

    // Check if wallet is connected
    if (!isConnected || !sdk) {
      setError("Wallet not connected. Please connect wallet first.");
      addMessage('system', '⚠️ Wallet not connected. Please click "Connect Wallet" first.');
      return;
    }

    // Clear previous session messages but keep system messages about wallet connection
    setMessages(prev => prev.filter(m =>
      m.role === 'system' && (
        m.content.includes('Connected with') ||
        m.content.includes('SDK authenticated') ||
        m.content.includes('Transactions will use')
      )
    ));

    // Reset session-specific state
    setTotalTokens(0);
    setLastCheckpointTokens(0);

    setIsLoading(true);
    setStatus("Starting session...");

    try {
      // Discover active hosts
      const hosts = await (hostManager as any).discoverAllActiveHostsWithModels();

      if (hosts.length === 0) {
        throw new Error("No active hosts available");
      }

      // Randomly select a host from available hosts
      const randomIndex = Math.floor(Math.random() * hosts.length);
      const host = hosts[randomIndex];
      console.log(`Randomly selected host ${randomIndex + 1} of ${hosts.length}: ${host.address}`);

      setActiveHost(host);
      // Store selected host address for later use
      (window as any).__selectedHostAddress = host.address;

      // Display which host we're connecting to
      addMessage('system', `🎲 Randomly selected host ${randomIndex + 1} of ${hosts.length}`);
      addMessage('system', `📡 Connecting to host: ${host.address.slice(0, 6)}...${host.address.slice(-4)}`);
      if (host.models && host.models.length > 0) {
        addMessage('system', `🤖 Using model: ${host.models[0]}`);
      }

      // Check sub-account balance and fund if needed
      const subAccountBalance = subAccount ? await readUSDCBalance(subAccount) : 0n;
      const minSessionCost = parseUnits("1.0", 6); // Minimum needed to run a session ($1)
      // Only transfer what's needed for this session, not the full $2
      // In ideal world with spend permissions, we wouldn't transfer at all
      const transferAmount = minSessionCost; // Transfer only $1.00 per session

      // Determine the session configuration based on balance
      let sessionConfig: any;

      if (subAccountBalance >= minSessionCost) {
        console.log(`Sub-account has sufficient balance ($${formatUnits(subAccountBalance, 6)}) for session`);
        addMessage('system', `💰 Using existing sub-account balance: $${formatUnits(subAccountBalance, 6)} - Running gasless!`);

        // Show how many more sessions can be run with current balance
        const sessionsRemaining = Math.floor(Number(subAccountBalance) / Number(minSessionCost));
        if (sessionsRemaining > 1) {
          addMessage('system', `📊 Can run ${sessionsRemaining} more sessions with current balance`);
        }

        // Use only what's needed for the session (minimum $0.20)
        // This prevents unnecessary large deposits in sub-account
        const depositToUse = minSessionCost;

        // Create session configuration
        // The SDK expects string for depositAmount, numbers for the rest
        sessionConfig = {
          depositAmount: "1.0",  // Will be parsed as 1.0 USDC in SessionJobManager
          pricePerToken: PRICE_PER_TOKEN,  // number, not BigInt
          proofInterval: PROOF_INTERVAL,    // number, not BigInt
          duration: SESSION_DURATION        // number, not BigInt
        };
      } else {
        console.log(`Sub-account balance ($${formatUnits(subAccountBalance, 6)}) too low for session`);
        addMessage('system', `⚠️ Sub-account balance too low ($${formatUnits(subAccountBalance, 6)})`);

        // Check primary account balance
        const ethersProvider = new ethers.BrowserProvider((window as any).__basProvider || window.ethereum);
        const usdcContract = new ethers.Contract(USDC, [
          "function balanceOf(address) view returns (uint256)",
          "function transfer(address to, uint256 amount) returns (bool)"
        ], ethersProvider);

        const primaryBalance = await usdcContract.balanceOf(primaryAccount);
        console.log(`Primary account balance: $${formatUnits(primaryBalance, 6)}`);

        if (primaryBalance >= transferAmount) {
          // Primary has funds - transfer minimum needed to sub-account
          // NOTE: This is a workaround because the SDK doesn't understand Base Account Kit's auto-spend
          // Ideally, sub-account would spend directly from primary using spend permissions
          addMessage('system', `💰 Primary account has $${formatUnits(primaryBalance, 6)} USDC`);
          addMessage('system', `💳 Transferring $${formatUnits(transferAmount, 6)} from primary to sub-account for this session...`);

          try {
            // Don't use SDK signer here - we need to use the wallet directly
            // The signer is for the sub-account, but we need to transfer from primary
            // In Base Account Kit, the sub-account can initiate transfers from primary via spend permissions
            // But for now, let's use a direct transfer approach

            // Request user to transfer funds from their wallet
            addMessage('system', `💳 Requesting $${formatUnits(transferAmount, 6)} USDC transfer to sub-account...`);
            addMessage('system', `📍 Please approve the transaction in your wallet`);
            addMessage('system', `💡 Note: With proper spend permissions, this transfer wouldn't be needed`);

            // Get the connected wallet signer (this will trigger wallet popup)
            const walletProvider = (window as any).__basProvider || window.ethereum;
            if (!walletProvider) {
              throw new Error('No wallet provider found');
            }

            // Request accounts if needed
            const accounts = await walletProvider.request({ method: 'eth_requestAccounts' });
            const userAccount = accounts[0];

            // Create a new provider and signer for the user's primary account
            const walletEthersProvider = new ethers.BrowserProvider(walletProvider);
            const userSigner = await walletEthersProvider.getSigner(userAccount);
            const usdcWithUserSigner = new ethers.Contract(USDC, [
              "function transfer(address to, uint256 amount) returns (bool)",
              "function balanceOf(address) view returns (uint256)"
            ], userSigner);

            // Request transfer from user's wallet to sub-account
            // This will trigger MetaMask/wallet popup for user approval
            console.log(`Requesting transfer of $${formatUnits(transferAmount, 6)} from ${userAccount} to ${subAccount}`);

            try {
              const tx = await usdcWithUserSigner.transfer(subAccount, transferAmount);
              addMessage('system', `⏳ Transaction submitted. Waiting for confirmation...`);

              const receipt = await tx.wait(3); // Wait for 3 confirmations
              console.log(`Transfer confirmed in block ${receipt.blockNumber}`);

              // Wait a bit for chain state to update
              await new Promise(resolve => setTimeout(resolve, 2000));

              // Verify the balance
              const newSubBalance = await usdcContract.balanceOf(subAccount);
              console.log(`Sub-account new balance: $${formatUnits(newSubBalance, 6)}`);

              if (newSubBalance < minSessionCost) {
                throw new Error(`Transfer confirmed but insufficient balance. Got $${formatUnits(newSubBalance, 6)}`);
              }

              addMessage('system', `✅ Sub-account funded! Balance: $${formatUnits(newSubBalance, 6)}`);
            } catch (error: any) {
              if (error.code === 4001 || error.message?.includes('rejected')) {
                throw new Error('Transaction rejected by user');
              }
              throw error;
            }

            // Now we can use the minimum session amount
            sessionConfig = {
              depositAmount: "1.0",  // Will be parsed as 1.0 USDC in SessionJobManager
              pricePerToken: PRICE_PER_TOKEN,  // number, not BigInt
              proofInterval: PROOF_INTERVAL,    // number, not BigInt
              duration: SESSION_DURATION        // number, not BigInt
            };
          } catch (error: any) {
            console.error('Failed to fund sub-account:', error);
            addMessage('system', `❌ Failed to fund sub-account: ${error.message}`);
            throw error;
          }
        } else {
          // Not enough balance in primary account
          addMessage('system', `❌ Insufficient USDC in primary account`);
          addMessage('system', `💡 You need at least $${formatUnits(transferAmount, 6)} USDC in your Base Account (${primaryAccount.slice(0, 6)}...${primaryAccount.slice(-4)})`);
          addMessage('system', `💡 Current balance: $${formatUnits(primaryBalance, 6)} USDC`);
          throw new Error(`Insufficient USDC balance. Need $${formatUnits(transferAmount, 6)}, have $${formatUnits(primaryBalance, 6)}`);
        }
      }

      // Each host must have its own API URL - no fallbacks
      const hostEndpoint = host.apiUrl || host.endpoint;
      if (!hostEndpoint) {
        throw new Error(`Host ${host.address} does not have an API endpoint configured. Cannot proceed with this host.`);
      }

      // Log the final session config for debugging
      console.log('Starting session with config:', {
        model: host.supportedModels?.[0] || "gpt-3.5-turbo",
        host: host.address,
        endpoint: hostEndpoint,
        depositAmount: sessionConfig.depositAmount,
        pricePerToken: sessionConfig.pricePerToken,
        proofInterval: sessionConfig.proofInterval,
        duration: sessionConfig.duration
      });

      // Start session with the configuration determined above
      const result = await sessionManager.startSession(
        host.supportedModels?.[0] || "gpt-3.5-turbo",
        host.address,
        sessionConfig,
        hostEndpoint
      );

      setSessionId(result.sessionId);
      // Session started - sessionId is what we use for all operations
      setLastCheckpointTokens(0); // Reset checkpoint tracking for new session

      const hostLabel = host.address.toLowerCase() === TEST_HOST_1_ADDRESS.toLowerCase() ? "Host 1" :
                        host.address.toLowerCase() === TEST_HOST_2_ADDRESS.toLowerCase() ? "Host 2" :
                        "Unknown Host";

      setStatus(`Session active with ${hostLabel}. You can start chatting!`);
      addMessage('system', `✅ Session started with ${hostLabel} (${host.address.slice(0, 6)}...${host.address.slice(-4)}). Session ID: ${result.sessionId}`);

    } catch (error: any) {
      console.error("Failed to start session:", error);
      setError(`Failed to start session: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  // Send message to LLM
  async function sendMessage() {
    if (!sessionManager || !sessionId || !inputMessage.trim()) {
      return;
    }

    const userMessage = inputMessage.trim();
    setInputMessage("");
    setIsLoading(true);

    // Add user message to chat
    addMessage('user', userMessage);

    try {
      // Build prompt with full context
      const context = buildContext();
      let fullPrompt: string;

      if (context) {
        // Add a clearer instruction format for the model
        fullPrompt = `${context}\nUser: ${userMessage}\nAssistant:`;
      } else {
        fullPrompt = `User: ${userMessage}\nAssistant:`;
      }

      console.log("=== CONTEXT BEING SENT TO MODEL ===");
      console.log(fullPrompt);
      console.log("=== END CONTEXT ===");

      // Send to LLM
      setStatus("Sending message...");
      const response = await sessionManager.sendPrompt(sessionId, fullPrompt);

      // Clean up the response to remove any repetitive patterns
      console.log("Raw response from LLM:", response);
      let cleanedResponse = response;

      // Handle the specific repetitive pattern from this model
      // The model returns: "\n\nA: 1 + 1 = 2\n\nA: 1 + 1 = 2\n\nA: ..."

      // First, check if response contains "A:" pattern
      if (response.includes("A:")) {
        // Split by "A:" and take the first non-empty answer
        const parts = response.split(/A:\s*/);
        console.log("Parts after splitting by 'A:':", parts);

        // Find the first meaningful answer (not just punctuation)
        for (let i = 1; i < parts.length; i++) {  // Start from 1 to skip anything before first "A:"
          const cleaned = parts[i].trim();
          if (cleaned && cleaned.length > 1) {  // Must be more than just punctuation
            // Extract just the answer before any newline
            const answer = cleaned.split('\n')[0].trim();
            if (answer && answer.length > 1) {
              cleanedResponse = answer;
              console.log("Extracted answer:", cleanedResponse);
              break;
            }
          }
        }
      }

      // Final cleanup - remove any remaining "A:" prefix
      cleanedResponse = cleanedResponse.replace(/^A:\s*/, '').trim();
      console.log("Final cleaned response:", cleanedResponse);

      // Estimate tokens (rough estimate: 1 token per 4 characters)
      const estimatedTokens = Math.ceil((fullPrompt.length + cleanedResponse.length) / 4);

      // Add assistant response
      addMessage('assistant', cleanedResponse, estimatedTokens);

      // Store conversation in S5 if storage manager is available
      if (storageManager && storageManager.isInitialized()) {
        await storeConversation();
      }

      setStatus("Session active");

      // Submit checkpoint periodically (every 5 messages)
      if (messages.length % 10 === 0) {
        await submitCheckpoint();
      }

    } catch (error: any) {
      console.error("Failed to send message:", error);
      addMessage('system', `Error: ${error.message}`);
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
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp
        })),
        metadata: {
          totalTokens,
          totalCost,
          model: activeHost?.supportedModels?.[0] || "unknown",
          provider: activeHost?.address || "unknown"
        }
      });
    } catch (error) {
      console.warn("Failed to store conversation:", error);
    }
  }

  // Submit checkpoint proof (for payment)
  async function submitCheckpoint(forceSubmit: boolean = false) {
    if (!paymentManager || !sessionId) {
      console.error("Cannot submit checkpoint: missing paymentManager or sessionId");
      return;
    }

    // Calculate tokens to submit
    let tokensToSubmit = totalTokens - lastCheckpointTokens;

    // Contract requires minimum tokens (appears to be around 100 based on the config)
    const MIN_CHECKPOINT_TOKENS = 100;

    // Skip if we don't have enough tokens (unless forced for final submission)
    if (tokensToSubmit < MIN_CHECKPOINT_TOKENS && !forceSubmit) {
      console.log(`Skipping checkpoint: only ${tokensToSubmit} tokens (minimum ${MIN_CHECKPOINT_TOKENS} required)`);
      return;
    }

    // For final submission, ensure at least minimum tokens
    // This ensures host gets paid even for short sessions
    if (forceSubmit && tokensToSubmit < MIN_CHECKPOINT_TOKENS) {
      console.log(`Adjusting tokens from ${tokensToSubmit} to minimum ${MIN_CHECKPOINT_TOKENS} for payment`);
      tokensToSubmit = MIN_CHECKPOINT_TOKENS;
    }

    try {
      setStatus("Submitting checkpoint...");

      // Create host signer for proof submission
      const hostProvider = new ethers.JsonRpcProvider(RPC_URL);

      // Determine which host's private key to use based on the selected host
      const selectedHostAddress = activeHost?.address || (window as any).__selectedHostAddress;
      let hostPrivateKey: string;

      if (selectedHostAddress?.toLowerCase() === TEST_HOST_1_ADDRESS.toLowerCase()) {
        hostPrivateKey = TEST_HOST_1_PRIVATE_KEY;
        console.log(`Using TEST_HOST_1 private key for checkpoint submission`);
      } else if (selectedHostAddress?.toLowerCase() === TEST_HOST_2_ADDRESS.toLowerCase()) {
        hostPrivateKey = TEST_HOST_2_PRIVATE_KEY;
        console.log(`Using TEST_HOST_2 private key for checkpoint submission`);
      } else {
        throw new Error(`Unknown host address for checkpoint submission: ${selectedHostAddress}`);
      }

      const hostSigner = new ethers.Wallet(hostPrivateKey, hostProvider);
      console.log(`Using host signer: ${await hostSigner.getAddress()}`);

      // Generate a unique proof each time to prevent replay attack
      const timestamp = Date.now();
      const uniqueHash = ethers.keccak256(ethers.toUtf8Bytes(`job_${sessionId}_${timestamp}`));

      // Create a structured 64-byte proof (minimum required)
      const proofData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes32"],
        [uniqueHash, ethers.id("mock_ezkl_padding")]
      );

      // tokensToSubmit already calculated at the beginning of the function

      // REQUIRED: Wait for token accumulation (ProofSystem enforces 10 tokens/sec generation rate)
      // With 100 tokens claimed and 2x burst allowance, we need at least 5 seconds
      console.log("Waiting 5 seconds for token accumulation (required by ProofSystem rate limits)...");
      addMessage('system', "⏳ Waiting 5 seconds for token accumulation (ProofSystem rate limit)...");
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Use PaymentManager's submitCheckpointAsHost method with sessionId
      // In session model, sessionId identifies the entire conversation
      console.log("Submitting checkpoint with parameters:", {
        sessionId: sessionId.toString(),
        tokensToSubmit,
        proofDataLength: proofData.length,
        proofDataHex: proofData,
        hostSignerAddress: await hostSigner.getAddress()
      });

      let checkpointTx;
      try {
        checkpointTx = await paymentManager.submitCheckpointAsHost(
          sessionId,
          tokensToSubmit,
          proofData,
          hostSigner
        );
      } catch (submitError: any) {
        console.error("ERROR submitting checkpoint:", submitError);
        console.error("Error details:", {
          message: submitError.message,
          code: submitError.code,
          data: submitError.data,
          transaction: submitError.transaction
        });
        throw submitError;
      }

      console.log("Checkpoint submitted:", checkpointTx);
      setStatus("Session active");
      addMessage('system', `✅ Checkpoint submitted for ${tokensToSubmit} tokens. TX: ${checkpointTx.slice(0, 10)}...`);

      // Note: The checkpoint transaction waits for 3 confirmations, but blockchain state
      // may take additional time to be fully indexed for reading
      console.log("Checkpoint transaction confirmed. State will update shortly...");

      // Optional: Check if the update is visible yet (may show 0 initially due to indexing delay)
      try {
        // Small delay to allow initial indexing
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log(`DEBUG: About to call getJobStatus with sessionId:`, sessionId, typeof sessionId);
        const sessionDetails = await paymentManager.getJobStatus(sessionId);
        console.log(`DEBUG: Full session details returned:`, sessionDetails);
        // As explained by contracts developer:
        // For session jobs, the contract uses tokensUsed to track consumed tokens
        console.log(`Session tokensUsed (immediate check):`, sessionDetails?.tokensUsed || 0);

        if (!sessionDetails?.tokensUsed || sessionDetails.tokensUsed === 0 || sessionDetails.tokensUsed === 0n) {
          console.error("❌ ERROR: tokensUsed is 0 after checkpoint! This indicates a bug in PaymentManager.");
          console.error("The contract should have recorded tokens. Check PaymentManager.getJobStatus implementation.");
          addMessage('system', "❌ ERROR: Checkpoint submission failed - tokensUsed is 0!");
        } else {
          console.log(`✅ Checkpoint confirmed: ${sessionDetails.tokensUsed} tokens recorded`);
          addMessage('system', `✅ Checkpoint confirmed: ${sessionDetails.tokensUsed} tokens recorded`);
        }
      } catch (e) {
        console.warn("Could not read session details to verify proof acceptance:", e);
      }

      // Update last checkpoint tokens to avoid duplicate submissions
      setLastCheckpointTokens(totalTokens);

    } catch (error) {
      console.warn("Checkpoint submission failed:", error);
    }
  }

  // End session and complete payment
  async function endSession() {
    if (!sessionManager || !sessionId) {
      return;
    }

    setIsLoading(true);
    setStatus("Ending session...");

    try {
      // Step 1: Submit final checkpoint if there are unsubmitted tokens OR if we haven't submitted any checkpoint yet
      const unsubmittedTokens = totalTokens - lastCheckpointTokens;
      const MIN_CHECKPOINT_TOKENS = 100;

      // Always submit at least one checkpoint to ensure payment
      if (unsubmittedTokens > 0 || lastCheckpointTokens === 0) {
        const actualTokens = unsubmittedTokens > 0 ? unsubmittedTokens : totalTokens;
        const tokensToSubmit = Math.max(actualTokens, MIN_CHECKPOINT_TOKENS);

        console.log(`Submitting final checkpoint for ${tokensToSubmit} tokens (actual: ${actualTokens})`);
        setStatus("Submitting final checkpoint...");
        addMessage('system', `📤 Submitting checkpoint for ${tokensToSubmit} tokens to ensure payment...`);

        // Force checkpoint submission (will use minimum if needed)
        await submitCheckpoint(true);

        // Wait a bit for checkpoint to be processed
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Step 2: Read balances before completion
      setStatus("Reading balances before completion...");
      const balancesBefore = await readAllBalances();
      console.log("Balances before completion:", {
        user: formatUnits(balancesBefore.user, 6),
        subAccount: formatUnits(balancesBefore.subAccount, 6),
        host: formatUnits(balancesBefore.host, 6),
        treasury: formatUnits(balancesBefore.treasury, 6)
      });

      // Step 3: Complete the session
      setStatus("Completing session and distributing payments...");
      const finalProof = "0x" + "00".repeat(32);
      // Use the actual token count, but ensure at least minimum
      const completionTokens = Math.max(totalTokens, MIN_CHECKPOINT_TOKENS);
      console.log(`Completing session with:`, {
        sessionId: sessionId.toString(),
        tokens: completionTokens,
        actualTokens: totalTokens,
        finalProof: finalProof.slice(0, 10) + "..."
      });
      const txHash = await sessionManager.completeSession(
        sessionId,
        completionTokens,
        finalProof
      );
      console.log("Session completion TX:", txHash);

      // Verify session was marked as completed
      try {
        const sessionDetails = await paymentManager.getJobStatus(sessionId);
        console.log("Session status after completion:", sessionDetails);
      } catch (e) {
        console.warn("Could not read session status after completion:", e);
      }

      // Step 4: Wait for transaction confirmation
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Step 4.5: Withdraw host earnings from HostEarnings contract
      setStatus("Withdrawing host earnings...");
      try {
        // Create host's SDK instance with signer authentication
        const hostProvider = new ethers.JsonRpcProvider(RPC_URL);
        const selectedHostAddr = activeHost?.address || (window as any).__selectedHostAddress || TEST_HOST_1_ADDRESS;
        let hostPrivateKey: string;

        if (selectedHostAddr.toLowerCase() === TEST_HOST_1_ADDRESS.toLowerCase()) {
          hostPrivateKey = TEST_HOST_1_PRIVATE_KEY;
        } else if (selectedHostAddr.toLowerCase() === TEST_HOST_2_ADDRESS.toLowerCase()) {
          hostPrivateKey = TEST_HOST_2_PRIVATE_KEY;
        } else {
          throw new Error(`Unknown host address for withdrawal: ${selectedHostAddr}`);
        }

        const hostWallet = new ethers.Wallet(hostPrivateKey, hostProvider);
        console.log(`Host withdrawing earnings with wallet: ${await hostWallet.getAddress()}`);

        // Create a new SDK instance for the host
        const hostSdk = new FabstirSDKCore({
          walletAddress: await hostWallet.getAddress(),
          contractAddresses: {
            jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE!,
            nodeRegistry: process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY!,
            proofSystem: process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM!,
            hostEarnings: process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS!,
            fabToken: process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN!,
            usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!,
            modelRegistry: process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY!
          },
          s5Config: {
            seedPhrase: process.env.NEXT_PUBLIC_S5_SEED_PHRASE!
          }
        });

        // Authenticate host SDK with the signer method
        await hostSdk.authenticate('signer', { signer: hostWallet });

        // Get HostManager and withdraw earnings
        const hostManager = hostSdk.getHostManager();
        const withdrawTx = await hostManager.withdrawEarnings(process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!);
        console.log(`✅ Host withdrew earnings - TX: ${withdrawTx}`);
        addMessage('system', `✅ Host withdrew earnings - TX: ${withdrawTx}`);

        // Wait for withdrawal to be confirmed
        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (error: any) {
        console.error(`Host withdrawal failed: ${error.message}`);
        addMessage('system', `⚠️ Host withdrawal: ${error.message}`);
        if (error.message.includes('No earnings')) {
          console.error("No earnings to withdraw - checkpoint proof may have been rejected");
        }
      }

      // Step 4.6: Withdraw treasury fees
      setStatus("Withdrawing treasury fees...");
      try {
        // Treasury withdraws their fees using their own SDK instance
        const treasuryProvider = new ethers.JsonRpcProvider(RPC_URL);
        const treasuryWallet = new ethers.Wallet(TEST_TREASURY_PRIVATE_KEY, treasuryProvider);
        console.log(`Treasury withdrawing fees with wallet: ${await treasuryWallet.getAddress()}`);

        const treasurySdk = new FabstirSDKCore({
          walletAddress: await treasuryWallet.getAddress(),
          contractAddresses: {
            jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE!,
            nodeRegistry: process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY!,
            proofSystem: process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM!,
            hostEarnings: process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS!,
            fabToken: process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN!,
            usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!,
            modelRegistry: process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY!
          },
          s5Config: {
            seedPhrase: process.env.NEXT_PUBLIC_S5_SEED_PHRASE!
          }
        });

        // Authenticate treasury SDK with the signer method
        await treasurySdk.authenticate('signer', { signer: treasuryWallet });

        // Get TreasuryManager and withdraw fees
        const treasuryManager = treasurySdk.getTreasuryManager();
        const treasuryWithdrawTx = await treasuryManager.withdrawFees();
        console.log(`✅ Treasury withdrew fees - TX: ${treasuryWithdrawTx}`);
        addMessage('system', `✅ Treasury withdrew fees - TX: ${treasuryWithdrawTx}`);

        // Wait for withdrawal to be confirmed
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error: any) {
        console.error(`Treasury withdrawal failed: ${error.message}`);
        addMessage('system', `⚠️ Treasury withdrawal: ${error.message}`);
        if (error.message.includes('Only authorized')) {
          console.error("Note: Only authorized treasury account can withdraw fees");
        }
      }

      // Step 5: Read balances after completion and withdrawals
      setStatus("Reading balances after completion and withdrawal...");
      const balancesAfter = await readAllBalances();
      console.log("Balances after completion:", {
        user: formatUnits(balancesAfter.user, 6),
        subAccount: formatUnits(balancesAfter.subAccount, 6),
        host: formatUnits(balancesAfter.host, 6),
        treasury: formatUnits(balancesAfter.treasury, 6)
      });

      // Step 6: Calculate payment distribution
      const payments = {
        hostPayment: balancesAfter.host - balancesBefore.host,
        treasuryFee: balancesAfter.treasury - balancesBefore.treasury,
        subAccountChange: balancesAfter.subAccount - balancesBefore.subAccount,
        userRefund: balancesAfter.user - balancesBefore.user
      };

      // Step 7: Display payment results
      setStatus("Session ended. Payments distributed.");

      let paymentSummary = `💰 Payment Distribution:\n`;

      if (payments.hostPayment > 0n) {
        paymentSummary += `✅ Host received: $${formatUnits(payments.hostPayment, 6)} (90% of work done)\n`;
      } else {
        paymentSummary += `❌ No payment to host (check if checkpoint was submitted)\n`;
      }

      if (payments.treasuryFee > 0n) {
        paymentSummary += `✅ Treasury fee: $${formatUnits(payments.treasuryFee, 6)} (10% platform fee)\n`;
      } else {
        paymentSummary += `❌ No treasury fee collected\n`;
      }

      if (payments.subAccountChange !== 0n) {
        const changeAmount = formatUnits(payments.subAccountChange > 0n ? payments.subAccountChange : -payments.subAccountChange, 6);
        if (payments.subAccountChange > 0n) {
          paymentSummary += `💵 Sub-account refund: $${changeAmount}\n`;
          paymentSummary += `   💡 Deposit Model: This refund stays in sub-account\n`;
          paymentSummary += `   💡 Next session will use this balance (no new deposit needed!)\n`;
          const sessionsRemaining = Math.floor(Number(payments.subAccountChange) / 200000); // $0.20 per session
          if (sessionsRemaining > 0) {
            paymentSummary += `   💡 User can run ${sessionsRemaining} more sessions without depositing\n`;
          }
        } else {
          paymentSummary += `💵 Sub-account paid: $${changeAmount}\n`;
        }
      }

      addMessage('system', `Session completed. Total tokens: ${totalTokens}, Total cost: $${totalCost.toFixed(4)} USDC`);
      addMessage('system', paymentSummary);

      // Clear session state
      setSessionId(null);
      // Session ended
      setActiveHost(null);
      setLastCheckpointTokens(0);
      // Clear the stored host address
      delete (window as any).__selectedHostAddress;

    } catch (error: any) {
      console.error("Failed to end session:", error);
      setError(`Failed to end session: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  // Clear conversation
  function clearConversation() {
    setMessages([]);
    setTotalTokens(0);
    setTotalCost(0);
    addMessage('system', 'Conversation cleared. Session remains active.');
  }

  // Render UI
  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Chat Context Demo</h1>

      {/* Status Bar */}
      <div className="bg-gray-100 p-3 rounded mb-4">
        <div className="flex justify-between items-center">
          <div>
            <span className="font-semibold">Status:</span> {status}
          </div>
          <div className="text-sm text-gray-600">
            <span>Tokens: {totalTokens}</span>
            <span style={{ marginLeft: '20px' }}>Cost: ${totalCost.toFixed(4)}</span>
          </div>
        </div>
        {sessionId && (
          <div className="text-xs text-gray-500 mt-1">
            <div>Session ID: {sessionId.toString()}</div>
            {activeHost && (
              <div className="text-xs text-green-600 font-semibold mt-1">
                Connected to Host: {activeHost.address.slice(0, 6)}...{activeHost.address.slice(-4)}
                {activeHost.address.toLowerCase() === TEST_HOST_1_ADDRESS.toLowerCase() && " (Host 1)"}
                {activeHost.address.toLowerCase() === TEST_HOST_2_ADDRESS.toLowerCase() && " (Host 2)"}
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

      {/* Chat Messages */}
      <div className="bg-white border rounded-lg h-96 overflow-y-auto mb-8 p-4">
        {messages.length === 0 ? (
          <div className="text-gray-400 text-center mt-8">
            No messages yet. Connect wallet and start a session to begin chatting.
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`${
                  msg.role === 'user'
                    ? 'text-blue-600'
                    : msg.role === 'assistant'
                    ? 'text-green-600'
                    : 'text-gray-500 italic'
                }`}
              >
                <span className="font-semibold">
                  {msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System'}:
                </span>{' '}
                {msg.content}
                {msg.tokens && (
                  <span className="text-xs text-gray-400 ml-2">
                    {' '}({msg.tokens} tokens)
                  </span>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Spacer */}
      <div style={{ height: '20px' }}></div>

      {/* Input Area */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && !isLoading && sendMessage()}
          placeholder="Type your message..."
          disabled={!sessionId || isLoading}
          className="flex-1 px-4 py-3 border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          style={{ minWidth: '500px' }}
        />
        <button
          onClick={sendMessage}
          disabled={!sessionId || isLoading || !inputMessage.trim()}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Sending...' : 'Send'}
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
        <h3 className="font-semibold mb-2">How this works:</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Connect wallet to authenticate with the SDK</li>
          <li>Start a session to create an LLM job with USDC deposit</li>
          <li>Send messages - full conversation context is included with each prompt</li>
          <li>Responses accumulate tokens which are tracked for payment</li>
          <li>Conversation is stored in S5 for persistence</li>
          <li>End session to complete payment distribution to host and treasury</li>
        </ul>
      </div>
    </div>
  );
}