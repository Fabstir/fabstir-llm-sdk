# @fabstir/sdk-core

Browser-compatible SDK for the Fabstir P2P LLM marketplace.

## Features

- ✅ **Browser-ready**: Runs in modern browsers without polyfills
- ✅ **Contract interactions**: Direct blockchain communication via ethers.js
- ✅ **Wallet management**: Support for MetaMask and Coinbase Wallet
- ✅ **S5 Storage**: Decentralized storage via S5.js
- ✅ **Session management**: Persistent conversation handling
- ✅ **Payment processing**: ETH and USDC payment support
- ✅ **TypeScript**: Full type safety and IntelliSense support

## Installation

```bash
npm install @fabstir/sdk-core
# or
pnpm add @fabstir/sdk-core
# or
yarn add @fabstir/sdk-core
```

## Usage

### In React

```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';

const sdk = new FabstirSDKCore({
  contractAddresses: {
    jobMarketplace: '0x...',
    nodeRegistry: '0x...',
    fabToken: '0x...',
    usdcToken: '0x...'
  },
  rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/YOUR_KEY'
});

// Authenticate with MetaMask
await sdk.authenticate();

// Use SDK features
const paymentManager = sdk.getPaymentManager();
await paymentManager.createJob({
  model: 'llama-2-7b',
  prompt: 'Hello, world!',
  paymentMethod: 'USDC'
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

## Available Managers

- `AuthManager` - Wallet authentication and key management
- `PaymentManager` - ETH and USDC payment processing
- `StorageManager` - S5.js decentralized storage
- `SessionManager` - Conversation session handling
- `HostManager` - Node registration and management
- `SmartWalletManager` - Smart wallet interactions
- `TreasuryManager` - Treasury operations

## Server Features

For P2P networking and proof generation, use the companion package:

```bash
npm install @fabstir/sdk-node
```

See [@fabstir/sdk-node](../sdk-node) for server-side documentation.

## License

MIT