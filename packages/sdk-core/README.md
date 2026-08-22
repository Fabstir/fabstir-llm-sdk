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

## Authentication: `'aa-signer'` Mode (ERC-4337 Smart Accounts)

For users whose Smart Account holds funds but whose EOA holds no ETH (e.g. email-only sign-in via Biconomy MEE, ZeroDev, Pimlico), `'aa-signer'` mode routes all on-chain transactions through a caller-supplied `sendUserOp` callback. This keeps the SDK bundler-agnostic — the EOA private key is used internally for off-chain signing only (`signMessage`, `signTypedData`, encrypted session init), never to broadcast transactions.

```ts
import { FabstirSDKCore, type SendUserOpFn } from '@fabstir/sdk-core';

const sendUserOp: SendUserOpFn = async ({ to, data, value }) => {
  // Build + submit UserOp via your AA stack (Biconomy / ZeroDev / Pimlico / etc.)
  const { transactionHash } = await myBundler.sendUserOp({ to, data, value: value ?? 0n });
  return { transactionHash };  // sdk-core fetches the receipt itself
};

const sdk = new FabstirSDKCore({ /* ...config */ });
await sdk.authenticate('aa-signer', {
  smartAccountAddress: '0xSA...',
  eoaPrivateKey:        '0xEOA_KEY...',
  sendUserOp,
  rpcUrl:               'https://...',
  chainId:              84532,
});
```

### Asymmetric Address Surface

`sdk.getAddress()` returns the **Smart Account address** — the chain-side identity used as `msg.sender` for every contract call. `sdk.getSigner()` returns the internal EOA `ethers.Wallet` for off-chain signing; `sdk.getSigner().getAddress()` returns the EOA address. Do **NOT** call `sendTransaction` on `sdk.getSigner()` — the EOA holds no ETH and the call will revert at the RPC layer.

### TransactionResponse `tx.from` Semantics

When SDK methods that return a `TransactionResponse` (e.g. `pm.depositNative`, `pm.sendEth`) resolve, the returned object's `from` field is the **Smart Account address**, matching the `msg.sender` of the inner contract call — **not** the bundler relayer EOA that broadcast the on-chain tx. Callers comparing `tx.from` against on-chain data (e.g. `eth_getTransactionByHash(tx.hash).from`) will see a mismatch, because that field reflects the relayer. Use `tx.hash` for transaction identity, and prefer the SDK's parsed return values (e.g. `{ sessionId, jobId }` from `sm.startSession`) for state lookups.

### Chain Switching

`sdk.switchChain()` is **not supported** in `'aa-signer'` mode in 1.19.0 — invoking it would re-bind managers with stale chain config. As a workaround, call `disconnect()` then re-`authenticate('aa-signer', { ...newChainOptions })`. Native chain-switching support is planned for v1.20.0.

### ethers v6 Dependency

This mode relies on `ethers.AbstractSigner` and `ethers.ContractTransactionResponse` semantics specific to ethers v6.x. `sdk-core` declares `"ethers": "^6.9.0"` as a peer dependency. If a future ethers minor version (e.g. 6.20+) changes `ContractTransactionResponse` polling internals, the synthetic-response path may need a corresponding update — track via integration tests.

AA-signer integration spec provided by the fabstir-v2 team.

## Moderation Publish Gate (M3 — ships disabled)

At publish time the SDK evaluates a transcode job's `ModerationReport` and computes whether the job is publishable: only `verdict: "PASS"` or `"PASS_RATED"` allows; `BLOCK_ILLEGAL`, `BLOCK_UNRESOLVED`, a missing report (default hold), or anything failing strict validation refuses.

> ⚠️ **This gate is NOT a security control.** M3 reports are **unsigned** (`signature: null`): an unsigned `{"verdict":"PASS"}` is trivially forgeable by anyone who can inject a report, so `checkModerationVerdict` is exactly what its name says — a plain verdict check with **zero cryptographic binding**. Signature verification arrives with M5 report signing; the report types already carry the M5 fields (`signature`, `scoreFileCid`, `scoreDigest`, `hostAddress`) so verification slots in without a schema change.

**Enforcement ships dark.** The `moderationGate` config option defaults to `false`. While disabled, the gate is still **evaluated and logged on every publish call** — only the refusal is inert (`refusePublish` is the single field enforcement may act on). It enables only at the documented go-live (`docs/node-reference/CONTRACT-MODERATION-SERVICE.md` Appendix A), together with the node's `MODERATION_ENFORCE`.

```typescript
import { evaluateModerationGate, type ModerationFetchOutcome } from '@fabstir/sdk-core';

const outcome: ModerationFetchOutcome = { kind: 'report-body', body: reportFromNode };
const { result, refusePublish } = evaluateModerationGate(outcome, {
  enabled: sdkConfig.moderationGate ?? false,
  jobId,
});
// result.allowed === true → surface result.rating / result.descriptors on the storefront
// refusePublish === true only when the gate is enabled AND the verdict refuses
```

How the SDK fetches a job's report from the node is still open (OQ-M3-1) — implement `ModerationReportFetcher` when the transport is pinned; transport failures must throw, never synthesise a report.

## License

Business Source License 1.1 (BUSL-1.1). See [LICENSE](../../LICENSE) for details.