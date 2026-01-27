# @fabstir/sdk-core

Browser-compatible SDK for the Fabstir P2P LLM marketplace.

## Features

- ✅ **Browser-ready**: Runs in modern browsers without polyfills
- ✅ **End-to-end encryption**: XChaCha20-Poly1305 with forward secrecy (enabled by default)
- ✅ **Contract interactions**: Direct blockchain communication via ethers.js
- ✅ **Wallet management**: Support for MetaMask and Coinbase Wallet
- ✅ **Multi-chain**: Base Sepolia (primary), opBNB Testnet (secondary)
- ✅ **S5 Storage**: Decentralized storage via S5.js with mobile-resilient connection handling
- ✅ **Session management**: Persistent conversation handling with streaming
- ✅ **Payment processing**: Multi-chain ETH, USDC, and FAB token support
- ✅ **RAG support**: Host-side vector storage and semantic search
- ✅ **TypeScript**: Full type safety and IntelliSense support
- ✅ **Mobile support**: Auto-reconnect, operation queuing, and sync status for mobile browsers

## Installation

```bash
pnpm add @fabstir/sdk-core
```

## Usage

### In React

```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';
import { ChainRegistry, ChainId } from '@fabstir/sdk-core/config';

const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
const sdk = new FabstirSDKCore({
  mode: 'production' as const,
  chainId: ChainId.BASE_SEPOLIA,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
  contractAddresses: {
    jobMarketplace: chain.contracts.jobMarketplace,
    nodeRegistry: chain.contracts.nodeRegistry,
    // ... other contracts from chain.contracts
  }
});

// Authenticate
await sdk.authenticate(privateKey);

// Start an encrypted session
const sessionManager = await sdk.getSessionManager();
const { sessionId } = await sessionManager.startSession({
  hostUrl: 'http://host-node:8080',
  jobId: 123n,
  modelName: 'llama-3',
  chainId: ChainId.BASE_SEPOLIA
});
```

### In Vue.js

```vue
<script setup>
import { FabstirSDKCore } from '@fabstir/sdk-core';
import { ref, onMounted } from 'vue';

const sdk = ref(null);

onMounted(async () => {
  sdk.value = new FabstirSDKCore({ /* config */ });
  await sdk.value.authenticate();
});
</script>
```

### In vanilla JavaScript

```html
<script type="module">
import { FabstirSDKCore } from 'https://unpkg.com/@fabstir/sdk-core/dist/browser.mjs';

const sdk = new FabstirSDKCore({ /* config */ });
</script>
```

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Bundle Size

- **Full SDK**: ~450KB minified
- **Core only**: ~200KB minified
- **With tree-shaking**: ~150KB for typical usage

## Available Managers (13)

- `AuthManager` - Wallet authentication and key management
- `PaymentManagerMultiChain` - Multi-chain ETH, USDC, and FAB token payments
- `SessionManager` - WebSocket sessions, encryption, streaming
- `HostManager` - Host registration, pricing, earnings
- `StorageManager` - S5.js decentralized encrypted storage
- `ClientManager` - Host discovery, job submission
- `ModelManager` - Model registry and governance
- `TreasuryManager` - Platform fee management
- `EncryptionManager` - End-to-end encryption and key exchange
- `VectorRAGManager` - Host-side vector database operations
- `DocumentManager` - Document chunking and embedding
- `SessionGroupManager` - Claude Projects-style session organization
- `PermissionManager` - Access control for groups and vector databases

## Host CLI

For running a host node, see the companion package:

- [`@fabstir/host-cli`](../host-cli) - CLI for host node operators

## License

Business Source License 1.1 (BUSL-1.1). See [LICENSE](../../LICENSE) for details.