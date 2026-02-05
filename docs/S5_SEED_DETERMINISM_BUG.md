# Critical Bug: S5 Seed Not Deterministic - Data Loss After Browser Clear

## Summary

The S5 seed derived from wallet signatures is **NOT deterministic**. When a user clears browser data and reconnects the same wallet, a completely different S5 seed is generated. This creates a new S5 identity that cannot access previously encrypted session groups, causing **complete data loss**.

---

## Problem Description

### Expected Behavior

```
Same Wallet Address → Same Signature → Same S5 Seed → Same S5 Identity → Access to all stored data
```

### Actual Behavior

```
Same Wallet Address → Different Signature → Different S5 Seed → New S5 Identity → No access to old data
```

### Evidence from Console Logs

**First session (before clearing browser data):**
```
[S5Debug] Generated seed mnemonic: power nose look ...
[Enhanced S5.js] ✅ Initialization complete: {
  "hasSeed": true,
  "hasAuthToken": true,
  "hasFileSystem": true
}
[Enhanced S5.js] Found 1 session groups
```

**After clearing browser data and reconnecting same wallet:**
```
[S5Debug] Generated seed mnemonic: teen junior hill ...   ← DIFFERENT SEED!
[Enhanced S5.js] ✅ Initialization complete: {
  "hasSeed": true,
  "hasAuthToken": true,
  "hasFileSystem": true
}
[Enhanced S5.js] Found 0 session groups   ← DATA LOST!
```

The wallet address is the same, but the S5 seed changed from `power nose look...` to `teen junior hill...`.

---

## Root Cause Analysis

### How S5 Seed is Currently Generated

The SDK's `getOrGenerateS5Seed()` function:

1. Requests a signature from the wallet for a deterministic message
2. Derives a seed from that signature using a hash function
3. Uses the seed to create encryption keys for S5 storage

### Why It's Not Deterministic

The problem is that **wallet signatures are not guaranteed to be deterministic**:

1. **EIP-191 personal_sign signatures** can vary based on:
   - Nonce/timestamp included by wallet
   - Different signing algorithms (recoverable vs non-recoverable)
   - Wallet implementation details

2. **Passkey/CryptoKey signatures** (Base Account Kit):
   - CryptoKey sessions expire and get regenerated
   - Different CryptoKey = different signature = different S5 seed

3. **EIP-712 typed signatures** can vary based on:
   - Chain ID (if included)
   - Contract address (if included)
   - Timestamp/nonce fields

### The Core Issue

The signature-to-seed derivation assumes: `sign(constant_message) → constant_signature`

But in practice: `sign(constant_message) → variable_signature` (depends on wallet state, session, etc.)

---

## Impact

| Scenario | Result |
|----------|--------|
| User clears browser cookies/cache | **All S5 data inaccessible** |
| User switches to new device | **All S5 data inaccessible** |
| CryptoKey session expires | Potential data access issues |
| Browser update clears storage | **All S5 data inaccessible** |

This is **critical** because users expect their data to persist as long as they control their wallet.

---

## Recommended Solutions

### Option 1: Deterministic Signature Scheme (Preferred)

Use a signing scheme that guarantees deterministic output:

```javascript
// Use deterministic ECDSA (RFC 6979) with a fixed message
async function getDeterministicS5Seed(signer) {
  // Message MUST be constant and not include any variable data
  const message = "S5 Storage Key Derivation v1";

  // Request signature - must use deterministic signing
  const signature = await signer.signMessage(message);

  // Derive seed from signature
  return deriveS5Seed(signature);
}
```

**Problem**: Most wallets don't guarantee deterministic signatures.

### Option 2: Store S5 Seed Encrypted On-Chain (Most Robust)

Store the S5 seed encrypted with a key derived from wallet address:

```javascript
// On first initialization
async function initializeS5Seed(signer, contractAddress) {
  const address = await signer.getAddress();

  // Check if seed exists on-chain
  const storedEncryptedSeed = await contract.getUserS5Seed(address);

  if (storedEncryptedSeed) {
    // Decrypt using wallet signature
    const decryptionKey = await getDecryptionKey(signer);
    return decrypt(storedEncryptedSeed, decryptionKey);
  }

  // Generate new seed and store encrypted on-chain
  const newSeed = generateRandomS5Seed();
  const encryptionKey = await getEncryptionKey(signer);
  const encryptedSeed = encrypt(newSeed, encryptionKey);
  await contract.storeUserS5Seed(encryptedSeed);
  return newSeed;
}
```

### Option 3: BIP-32 Derivation from Private Key (If Available)

If the SDK has access to the wallet's private key (test wallet mode):

```javascript
// Derive S5 seed deterministically from private key
function deriveS5SeedFromPrivateKey(privateKey) {
  // Use BIP-32 style derivation
  // m/purpose'/coin_type'/account'/change/address_index
  // m/88888'/0'/0'/0/0 (88888 = custom purpose for S5)
  return hdkey.derive("m/88888'/0'/0'/0/0").privateKey;
}
```

### Option 4: Store Seed in Decentralized Identity (DID)

Use a DID document to store the S5 seed:

```javascript
// Store S5 seed reference in DID document
// DID is recoverable from wallet address
const did = `did:pkh:eip155:${chainId}:${address}`;
```

---

## Temporary UI Workaround

Until SDK fix is available, the UI could:

1. Warn users before any action that clears local storage
2. Provide "Export S5 seed" functionality for backup
3. Provide "Import S5 seed" functionality for recovery

```typescript
// UI could expose seed backup/restore
export function exportS5Seed(): string {
  const seed = localStorage.getItem('s5-seed');
  return seed; // User saves this securely
}

export function importS5Seed(seed: string): void {
  localStorage.setItem('s5-seed', seed);
  // Re-initialize S5 with imported seed
}
```

---

## Testing to Confirm Issue

1. Connect wallet (any type)
2. Create a session group
3. Note the S5 seed mnemonic from console logs
4. Clear all browser data (cookies, localStorage, etc.)
5. Reconnect the same wallet
6. Note the S5 seed mnemonic - **it will be different**
7. Check session groups - **they will be empty**

---

## SDK Version

This was observed with:
- `@fabstir/sdk-core` v1.11.2
- Network persistence verification (`waitForNetwork=true`) is working correctly
- Data IS persisted to the network, but new identity cannot decrypt it

---

## Priority

**Critical** - This is a data integrity issue that violates user expectations. Users expect their data to be accessible as long as they control their wallet private key.

---

## Questions?

Please reach out if you need:
- Full console log output
- Screen recordings
- Access to test environment
- Any clarification

---

## Related Issues

- [S5 WebSocket Reconnection Bug](./S5_WEBSOCKET_RECONNECTION_BUG.md) - Separate issue about WebSocket connection management
