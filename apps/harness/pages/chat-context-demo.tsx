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
import { parseUnits, formatUnits, getAddress } from 'viem';
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
const TEST_USER_1_ADDRESS = process.env.NEXT_PUBLIC_TEST_USER_1_ADDRESS!;
const TEST_USER_1_PRIVATE_KEY = process.env.NEXT_PUBLIC_TEST_USER_1_PRIVATE_KEY!;
const TEST_HOST_1_ADDRESS = process.env.NEXT_PUBLIC_TEST_HOST_1_ADDRESS!;
const TEST_HOST_1_PRIVATE_KEY = process.env.NEXT_PUBLIC_TEST_HOST_1_PRIVATE_KEY!;
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
  const [jobId, setJobId] = useState<bigint | null>(null);
  const [activeHost, setActiveHost] = useState<any>(null);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [totalTokens, setTotalTokens] = useState(0);
  const [totalCost, setTotalCost] = useState(0);

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
        // Fallback to direct private key
        await connectWithPrivateKey();
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

      setIsConnected(true);
      setStatus("Wallet connected. Ready to start chat session.");
      addMessage('system', 'Wallet connected successfully. Click "Start Session" to begin chatting.');

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

    // Fund sub-account if needed
    await fundSubAccountIfNeeded(sub);

    // Pre-cache seed for sub-account to avoid popup
    const subAccountLower = sub.toLowerCase();
    if (!hasCachedSeed(subAccountLower)) {
      const testSeed = 'yield organic score bishop free juice atop village video element unless sneak care rock update';
      cacheSeed(subAccountLower, testSeed);
      addMessage('system', 'Pre-cached S5 seed for sub-account to avoid popup');
    }

    // Create custom signer for sub-account with primary account
    const subAccountSigner = createSubAccountSigner(provider, sub, primary);

    // Authenticate SDK with sub-account signer
    await sdk!.authenticate('signer', { signer: subAccountSigner as any });

    addMessage('system', `Connected with Base Account Kit. Sub-account: ${sub.slice(0, 6)}...${sub.slice(-4)}`);
    addMessage('system', '✅ SDK authenticated with sub-account signer (no S5 popup!)');
    addMessage('system', '🎉 Transactions will use sub-account auto-spend (no popups!)');
  }

  // Connect with private key (fallback)
  async function connectWithPrivateKey() {
    await sdk!.authenticate('privatekey', { privateKey: TEST_USER_1_PRIVATE_KEY });
    setPrimaryAccount(TEST_USER_1_ADDRESS);
    setSubAccount(TEST_USER_1_ADDRESS);

    addMessage('system', `Connected with test account: ${TEST_USER_1_ADDRESS.slice(0, 6)}...${TEST_USER_1_ADDRESS.slice(-4)}`);
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

  // Helper: Fund sub-account if balance is low
  async function fundSubAccountIfNeeded(account: string) {
    const ethersProvider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(TEST_USER_1_PRIVATE_KEY, ethersProvider);

    const usdcContract = new ethers.Contract(USDC, [
      "function transfer(address to, uint256 amount) returns (bool)",
      "function balanceOf(address) view returns (uint256)"
    ], wallet);

    const balance = await usdcContract.balanceOf(account);
    const balanceFormatted = formatUnits(balance, 6);

    const minRequired = parseUnits("2", 6); // Need $2 for deposit

    if (BigInt(balance.toString()) < BigInt(minRequired.toString())) {
      const needed = BigInt(minRequired.toString()) - BigInt(balance.toString());
      const tx = await usdcContract.transfer(account, needed);
      await tx.wait(3);

      addMessage('system', `Funded account with ${formatUnits(needed, 6)} USDC`);
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

    setIsLoading(true);
    setStatus("Starting session...");

    try {
      // Discover active hosts
      const hosts = await (hostManager as any).discoverAllActiveHostsWithModels();

      if (hosts.length === 0) {
        throw new Error("No active hosts available");
      }

      const host = hosts[0];
      setActiveHost(host);

      // Create session configuration
      const sessionConfig = {
        depositAmount: parseUnits(SESSION_DEPOSIT_AMOUNT, 6),
        pricePerToken: BigInt(PRICE_PER_TOKEN),
        proofInterval: BigInt(PROOF_INTERVAL),
        duration: BigInt(SESSION_DURATION)
      };

      // Start session
      const result = await sessionManager.startSession(
        host.supportedModels?.[0] || "gpt-3.5-turbo",
        host.address,
        sessionConfig,
        host.apiUrl || TEST_HOST_1_URL
      );

      setSessionId(result.sessionId);
      setJobId(result.jobId);

      setStatus("Session active. You can start chatting!");
      addMessage('system', `Session started with host ${host.address.slice(0, 6)}...${host.address.slice(-4)}. Session ID: ${result.sessionId}`);

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
  async function submitCheckpoint() {
    if (!sessionManager || !sessionId) return;

    try {
      setStatus("Submitting checkpoint...");

      // Wait for token accumulation (rate limiting)
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Create host signer for proof submission
      const hostProvider = new ethers.JsonRpcProvider(RPC_URL);
      const hostSigner = new ethers.Wallet(TEST_HOST_1_PRIVATE_KEY, hostProvider);

      // Submit checkpoint with tokens used
      const proofData = "0x" + "00".repeat(64); // 64-byte proof
      const tokensToSubmit = Math.min(totalTokens, PROOF_INTERVAL);

      const checkpointTx = await sessionManager.submitCheckpointProofAsHost(
        sessionId,
        tokensToSubmit,
        proofData,
        hostSigner
      );

      console.log("Checkpoint submitted:", checkpointTx);
      setStatus("Session active");

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
      // Complete the session
      const finalProof = "0x" + "00".repeat(32);
      const txHash = await sessionManager.completeSession(
        sessionId,
        totalTokens,
        finalProof
      );

      setStatus("Session ended. Payments distributed.");
      addMessage('system', `Session completed. Total tokens: ${totalTokens}, Total cost: $${totalCost.toFixed(4)} USDC`);

      // Clear session state
      setSessionId(null);
      setJobId(null);
      setActiveHost(null);

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
            Session ID: {sessionId.toString()}
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