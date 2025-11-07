# @fabstir/sdk-core-mock

Mock implementation of Fabstir SDK Core for UI development.

## What is this?

This package is a **drop-in replacement** for `@fabstir/sdk-core` that enables UI development without requiring:

- ✅ Blockchain connections (no RPC URLs, no gas fees)
- ✅ Smart contract deployments (no contract addresses)
- ✅ S5 storage infrastructure (uses localStorage)
- ✅ WebSocket nodes (simulated responses)
- ✅ Wallet authentication (auto-authenticates)

**Perfect for:**
- Building UI components in isolation
- Rapid prototyping and iteration
- Visual testing with Playwright/Puppeteer
- Demo environments and presentations
- E2E UI tests without blockchain dependency

## Installation

```bash
# From the monorepo root
pnpm install

# The mock SDK is already linked in the workspace
# No additional setup needed!
```

## Quick Start

### Basic Usage

```typescript
import { FabstirSDKCoreMock as FabstirSDKCore } from '@fabstir/sdk-core-mock';

// Initialize (no configuration needed!)
const sdk = new FabstirSDKCore({
  userAddress: '0x1234567890ABCDEF1234567890ABCDEF12345678' // Optional
});

// Authenticate (always succeeds)
await sdk.authenticate('any-password');

// Use managers just like the real SDK
const sessionGroupManager = sdk.getSessionGroupManager();
const groups = await sessionGroupManager.listSessionGroups();

console.log(`You have ${groups.length} session groups`);
// Output: "You have 5 session groups" (from fixtures)
```

### Session Groups (Projects)

```typescript
const sessionGroupManager = sdk.getSessionGroupManager();

// List all session groups
const groups = await sessionGroupManager.listSessionGroups();

// Create a new session group
const newGroup = await sessionGroupManager.createSessionGroup('My Project', {
  description: 'AI-powered research assistant',
  databases: ['research-papers', 'notes']
});

// Start a chat session in the group
const chatSession = await sessionGroupManager.startChatSession(
  newGroup.id,
  'What are the key findings in the latest AI research?'
);

// Add a message
await sessionGroupManager.addMessage(newGroup.id, chatSession.sessionId, {
  role: 'assistant',
  content: 'Based on your documents...',
  timestamp: Date.now()
});

// Share the group with someone
await sessionGroupManager.shareGroup(
  newGroup.id,
  '0xRecipientAddress',
  'reader' // or 'writer'
);
```

### Vector Databases

```typescript
const vectorRAGManager = sdk.getVectorRAGManager();

// List all vector databases
const databases = await vectorRAGManager.listDatabases();

// Create a new database
await vectorRAGManager.createSession('my-knowledge-base', {
  dimensions: 384,
  folderStructure: true
});

// Add vectors
await vectorRAGManager.addVector(
  'my-knowledge-base',
  'doc-001',
  [0.1, 0.2, 0.3, /* ... 384 dimensions */],
  {
    text: 'Machine learning is...',
    source: 'ml-guide.pdf',
    folderPath: '/ai/machine-learning'
  }
);

// Search vectors
const results = await vectorRAGManager.searchVectors(
  'my-knowledge-base',
  [0.1, 0.2, 0.3, /* query vector */],
  5, // top K
  0.7 // threshold
);

console.log(`Found ${results.length} relevant documents`);
```

### LLM Sessions

```typescript
const sessionManager = await sdk.getSessionManager();

// Start a session
const { sessionId } = await sessionManager.startSession({
  hostUrl: 'http://localhost:8080',
  jobId: 123n,
  modelName: 'llama-3',
  chainId: 84532
});

// Send a prompt with streaming
await sessionManager.sendPromptStreaming(
  sessionId,
  'Explain quantum computing',
  (chunk) => {
    console.log(chunk.content); // Word-by-word streaming
    if (chunk.done) {
      console.log('Response complete!');
    }
  }
);

// Search vectors in session context
const ragResults = await sessionManager.searchVectors(sessionId, [], 5);

// Ask with RAG context
const answer = await sessionManager.askWithContext(
  sessionId,
  'What is the main benefit of quantum computing?',
  3 // top K documents
);
```

### Host Discovery

```typescript
const hostManager = sdk.getHostManager();

// Get all active hosts
const hosts = await hostManager.getActiveHosts();

console.log(`Found ${hosts.length} active hosts`);

// Get host details
const hostInfo = await hostManager.getHostInfo(hosts[0].address);

console.log(`Host: ${hostInfo.metadata?.name}`);
console.log(`Models: ${hostInfo.supportedModels.join(', ')}`);
console.log(`Price: ${hostInfo.minPricePerTokenStable} per token`);
console.log(`Reputation: ${hostInfo.reputation}/100`);

// Find hosts for a specific model
const modelHosts = await hostManager.findHostsByModel('llama-3');
```

### Payments

```typescript
const paymentManager = sdk.getPaymentManager();

// Check balances
const usdcBalance = await paymentManager.getTokenBalance(
  '0xUSDC_ADDRESS',
  sdk.getUserAddress()
);

const ethBalance = await paymentManager.getEthBalance(sdk.getUserAddress());

console.log(`USDC: ${usdcBalance}`); // Returns bigint
console.log(`ETH: ${ethBalance}`);

// Deposit USDC
await paymentManager.depositUSDC(
  '0xUSDC_ADDRESS',
  '100000000', // 100 USDC (6 decimals)
  84532 // chainId
);

// Withdraw
await paymentManager.withdrawUSDC(
  '0xUSDC_ADDRESS',
  '50000000', // 50 USDC
  84532
);
```

## Key Features

### 1. Realistic Fixtures

The mock SDK comes pre-loaded with realistic test data:

- **5 Session Groups** (Engineering, Research, Design, ML, Personal)
- **8 Vector Databases** (API docs, design specs, research papers, etc.)
- **Multiple Chat Sessions** with message history
- **2 Mock Hosts** with different pricing and models

### 2. Simulated Delays

All async operations include realistic delays to simulate network latency:

- `100-200ms`: Simple reads (get status, check balance)
- `300-500ms`: Searches and queries
- `600-800ms`: Writes and transactions
- `1000ms+`: Complex operations (create job, start session)

This helps you:
- Test loading states in your UI
- Verify that spinners/skeletons appear correctly
- Ensure proper async state management

### 3. localStorage Persistence

All data persists across page refreshes using localStorage:

```typescript
// Data survives page refresh
await sessionGroupManager.createSessionGroup('My Project');

// Refresh page...

// Data is still there!
const groups = await sessionGroupManager.listSessionGroups();
// ✅ Includes "My Project"
```

### 4. Clear and Reset Utilities

```typescript
// Clear all mock data
sdk.clearAllData();

// Reset to initial state (fresh fixtures)
await sdk.reset();
```

## Transitioning to Real SDK

When your UI is ready, swap to the real SDK with **one line change**:

```typescript
// BEFORE (Mock SDK)
import { FabstirSDKCoreMock as FabstirSDKCore } from '@fabstir/sdk-core-mock';

// AFTER (Real SDK)
import { FabstirSDKCore } from '@fabstir/sdk-core';

// Everything else stays the same! ✅
const sdk = new FabstirSDKCore({
  chainId: 84532,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
  contractAddresses: {
    jobMarketplace: '0x...',
    nodeRegistry: '0x...',
    // ... etc
  }
});
```

The real SDK requires:
- Environment variables for RPC URLs and contract addresses
- Wallet provider (MetaMask, Coinbase Wallet, etc.)
- Actual authentication (wallet signature)

But the **API is identical**, so your UI code doesn't change.

## Tips for UI Development

### 1. Use Console Logs

All mock operations log to console with `[Mock]` prefix:

```
[Mock] Initialized vector databases with mock data
[Mock] Created session group: My Project
[Mock] Added 5 vectors to knowledge-base
[Mock] Found 3 vectors (threshold: 0.7)
```

This helps you verify operations are working during development.

### 2. Combine with Playwright MCP

For visual feedback during development:

```typescript
// In your UI component
const sdk = new FabstirSDKCoreMock();
await sdk.authenticate('password');

const groups = await sdk.getSessionGroupManager().listSessionGroups();
// Render groups in UI

// Then use Playwright MCP to take screenshot
// Verify UI looks correct visually
```

### 3. Test Edge Cases

Modify fixtures to test edge cases:

```typescript
// Test empty state
sdk.clearAllData();
const groups = await sessionGroupManager.listSessionGroups();
// Should show "No session groups yet" UI

// Test with data
await sdk.reset(); // Load fixtures
const groupsWithData = await sessionGroupManager.listSessionGroups();
// Should show 5 groups
```

### 4. Simulate Errors

Mock managers throw errors for invalid operations:

```typescript
try {
  await vectorRAGManager.getDatabaseMetadata('non-existent-db');
} catch (error) {
  // ✅ Error: [Mock] Database not found: non-existent-db
  // Test your error handling UI
}
```

## Available Managers

### SessionGroupManager

Manages session groups (projects) with chat history:

- `createSessionGroup(name, options)` - Create new group
- `listSessionGroups()` - Get all groups
- `getSessionGroup(groupId)` - Get single group
- `deleteSessionGroup(groupId)` - Delete group
- `updateSessionGroup(groupId, updates)` - Update group
- `linkDatabase(groupId, dbName)` - Link vector DB to group
- `unlinkDatabase(groupId, dbName)` - Unlink vector DB
- `startChatSession(groupId, initialMessage)` - Start new chat
- `getChatSession(groupId, sessionId)` - Get chat session
- `listChatSessions(groupId, options)` - List all chats
- `addMessage(groupId, sessionId, message)` - Add message
- `deleteChatSession(groupId, sessionId)` - Delete chat
- `shareGroup(groupId, userAddress, role)` - Share with permissions
- `unshareGroup(groupId, userAddress)` - Revoke access
- `listSharedGroups()` - Get groups shared with you

### SessionManager

Manages LLM chat sessions:

- `startSession(config)` - Start LLM session
- `endSession(sessionId)` - End session
- `sendPrompt(sessionId, prompt)` - Send prompt (full response)
- `sendPromptStreaming(sessionId, prompt, onChunk)` - Streaming response
- `uploadVectors(sessionId, vectors, replace)` - Upload RAG vectors
- `searchVectors(sessionId, queryVector, k, threshold)` - Search vectors
- `askWithContext(sessionId, question, topK)` - RAG-enhanced query
- `getSession(sessionId)` - Get session info
- `listActiveSessions()` - List all active sessions

### VectorRAGManager

Manages vector databases with folders:

- `createSession(dbName, options)` - Create vector database
- `listDatabases()` - List all databases
- `getDatabaseMetadata(dbName)` - Get DB info
- `updateDatabaseMetadata(dbName, updates)` - Update DB
- `deleteDatabase(dbName)` - Delete database
- `addVector(dbName, id, vector, metadata)` - Add single vector
- `addVectors(dbName, vectors)` - Bulk add vectors
- `getVectors(dbName, vectorIds)` - Get vectors by ID
- `deleteVector(dbName, vectorId)` - Delete vector
- `searchVectors(dbName, queryVector, k, threshold)` - Search
- `listFolders(dbName)` - List virtual folders
- `getFolderStatistics(dbName, folderPath)` - Folder stats
- `moveToFolder(dbName, vectorId, targetFolder)` - Move vector
- `searchInFolder(dbName, folderPath, queryVector, k, threshold)` - Folder search
- `moveFolderContents(dbName, sourceFolder, targetFolder)` - Move folder

### HostManager

Manages host discovery and registration:

- `getActiveHosts()` - List all active hosts
- `getHostInfo(address)` - Get host details
- `getHostStatus(address)` - Get host status
- `findHostsByModel(model)` - Find hosts supporting model
- `getHostModels(address)` - Get models for host
- `getPricing(hostAddress)` - Get host pricing
- `getHostEarnings(hostAddress, tokenAddress)` - Get earnings
- `getReputation(address)` - Get reputation score

### PaymentManager

Manages deposits, withdrawals, and balances:

- `getTokenBalance(tokenAddress, address)` - Get token balance
- `getEthBalance(address)` - Get ETH balance
- `depositUSDC(tokenAddress, amount, chainId)` - Deposit USDC
- `depositNative(tokenAddress, amount, chainId)` - Deposit ETH/BNB
- `withdrawUSDC(tokenAddress, amount, chainId)` - Withdraw USDC
- `withdrawNative(tokenAddress, amount, chainId)` - Withdraw ETH/BNB
- `approveToken(tokenAddress, spenderAddress, amount)` - Approve spending
- `checkAllowance(tokenAddress, ownerAddress, spenderAddress)` - Check allowance

## Architecture

```
@fabstir/sdk-core-mock/
├── src/
│   ├── FabstirSDKCore.mock.ts       # Main SDK class
│   ├── managers/
│   │   ├── SessionGroupManager.mock.ts
│   │   ├── SessionManager.mock.ts
│   │   ├── VectorRAGManager.mock.ts
│   │   ├── HostManager.mock.ts
│   │   └── PaymentManager.mock.ts
│   ├── storage/
│   │   └── MockStorage.ts           # localStorage wrapper
│   ├── fixtures/
│   │   └── mockData.ts              # Realistic test data
│   └── types/
│       └── index.ts                 # Re-exports from @fabstir/sdk-core
└── README.md                        # This file
```

## License

BUSL-1.1 (Business Source License 1.1)

Copyright (c) 2025 Fabstir

---

**Ready to build stunning UIs without blockchain complexity!** 🚀

For questions or issues, check the main SDK documentation at `/workspace/docs/SDK_API.md`.
