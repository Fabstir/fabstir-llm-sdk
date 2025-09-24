Here’s a clear, copy-ready plan to stand up a **minimal browser harness** (one button, one call) that imports your SDK, uses **Sub-accounts** + **Auto Spend Permissions**, and runs **hands-free E2E** on **Base Sepolia** through the wallet-led **EIP-5792** path (so Coinbase’s testnet sponsorship applies).

# 1) Monorepo layout (Yarn workspaces)

```
/fabstir
  /packages/sdk               # your TS/JS SDK (exports BaseAccountWallet, etc.)
  /apps/harness               # tiny Next.js app that imports the SDK
  package.json                # "workspaces": ["packages/*","apps/*"]
```

**apps/harness/package.json**

```json
{
  "name": "harness",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@base-org/account": "^2.1.0",
    "next": "14.x",
    "react": "18.x",
    "react-dom": "18.x",
    "viem": "^2.x",
    "your-sdk": "workspace:*"
  },
  "devDependencies": {
    "@playwright/test": "^1.47.0",
    "@coinbase/onchaintestkit": "^0.3.0"
  }
}
```

# 2) Minimal harness page (one button, one call)

Goal: initialize Base Account SDK, **connect**, ensure a **Sub-account** exists, then send a **single batched call** via `wallet_sendCalls` (EIP-5792 v2). We’ll do a tiny USDC approve (harmless) followed by a no-op you provide from your SDK. (Base docs: batch with `wallet_sendCalls`; Sub-accounts + Auto Spend are supported and can skip prompts after first grant. ([Base Documentation][1]))

**apps/harness/pages/run.tsx**

```tsx
import { useState } from "react";
import { createBaseAccountSDK, base } from "@base-org/account";
import { numberToHex, encodeFunctionData, parseUnits } from "viem";
import { useYourSdk } from "your-sdk"; // thin wrapper around your BaseAccountWallet manager

// Base Sepolia chain id (84532 -> 0x14a34)
const CHAIN_HEX = numberToHex(base.constants.CHAIN_IDS.base_sepolia);

// USDC on Base Sepolia (official Circle list)
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

// minimal approve ABI
const erc20ApproveAbi = [{
  type: "function",
  name: "approve",
  stateMutability: "nonpayable",
  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }]
}] as const;

export default function Run() {
  const [log, setLog] = useState<string>("ready");
  const sdk = useYourSdk(); // optional: helper that can build a "business" call

  async function run() {
    setLog("initializing…");

    // 1) Init Base Account SDK (wallet-led flow)
    const bas = createBaseAccountSDK({
      appName: "Fabstir Harness",
      appChainIds: [base.constants.CHAIN_IDS.base_sepolia],
      // Sub-accounts have Auto Spend enabled by default in >=2.1.0
    });

    const provider = bas.getProvider();

    // 2) Connect and ensure a Sub-account exists for this origin
    // First, connect universal account
    const [universal] = await provider.request({ method: "eth_requestAccounts", params: [] }) as string[];

    // Try fetch a sub-account for this dapp origin; create if absent
    const resp = await provider.request({
      method: "wallet_getSubAccounts",
      params: [{ account: universal, domain: window.location.origin }]
    }) as { subAccounts?: Array<{ address: `0x${string}` }> };

    const sub = resp?.subAccounts?.[0]?.address ?? (await provider.request({
      method: "wallet_addSubAccount",
      params: [{ account: { type: "create" } }]
    }) as { address: `0x${string}` }).address;

    // 3) Build a tiny batch: USDC approve + your SDK’s “business” call(s)
    const approveData = encodeFunctionData({
      abi: erc20ApproveAbi,
      functionName: "approve",
      args: ["0x0000000000000000000000000000000000000001", parseUnits("1", 6)]
    });

    const businessCalls = await sdk.buildBusinessCalls?.() ?? []; // optional
    const calls = [
      { to: USDC, data: approveData as `0x${string}` },
      ...businessCalls
    ];

    // 4) Send wallet-led batch via EIP-5792 v2
    const result = await provider.request({
      method: "wallet_sendCalls",
      params: [{
        version: "2.0.0",
        chainId: CHAIN_HEX,
        from: sub,                       // IMPORTANT: use the Sub-account
        calls,
        capabilities: { atomic: { required: true } }
      }]
    }) as { id: string };

    setLog(`submitted: ${result.id} — polling…`);

    // 5) Poll for completion (wallet_getCallsStatus)
    // EIP-5792: wallet_getCallsStatus returns numeric status when finalized
    for (;;) {
      const status = await provider.request({
        method: "wallet_getCallsStatus",
        params: [{ id: result.id }]
      }) as { status: number; receipts?: Array<{ transactionHash?: string }> };

      if (status.status >= 200) {
        setLog(`done: ${status.status} ${status.receipts?.[0]?.transactionHash ?? ""}`);
        break;
      }
      await new Promise(r => setTimeout(r, 1200));
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Fabstir Harness</h1>
      <p>This triggers a wallet-led EIP-5792 batch from a Sub-account on Base Sepolia.</p>
      <button id="start" onClick={run}>Run sponsored batch</button>
      <pre>{log}</pre>
    </main>
  );
}
```

**Why this works**

* `wallet_sendCalls` is the EIP-5792 Wallet Call API (v2) for batched, atomic execution; Base Account docs show this pattern. ([Base Documentation][1])
* Sub-accounts + **Auto Spend Permissions** reduce/skip prompts after the first consent, which is ideal for CI. ([Base Documentation][2])
* Base Sepolia chain id: **84532** (hex **0x14a34**). ([chainlist.org][3], [chainid.network][4])
* USDC (Base Sepolia) address is **0x036CbD…f3dCF7e**. ([Circle Developers][5])

# 3) First-run “bootstrap” during development

For the **very first** run on a fresh wallet:

1. Click **Run sponsored batch** once.
2. You’ll see a wallet UX to **create/connect**; during the first Sub-account transaction, the wallet will offer **ongoing spend permissions**—accept them for USDC and your test spenders to avoid future prompts. (Auto Spend is on by default for Sub-accounts in ≥2.1.0.) ([Base Documentation][2])
   After that, your test runs will be hands-free.

# 4) Playwright E2E (hands-free), with passkeys automated

Use **Playwright** + **OnchainTestKit** to drive the Coinbase Wallet modal and keep everything no-click.

**apps/harness/playwright.config.ts**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3000",
    headless: true
  },
  webServer: {
    command: "yarn build && yarn start",
    port: 3000,
    reuseExistingServer: !process.env.CI
  }
});
```

**apps/harness/tests/harness.spec.ts**

```ts
import { test, expect } from "@playwright/test";
import { OnchainTestKit } from "@coinbase/onchaintestkit";

test.beforeEach(async ({ context }) => {
  // 1) Set up WebAuthn Virtual Authenticator so passkey prompts are auto-approved
  const cdp = await context.newCDPSession(await context.newPage());
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    protocol: "u2f",
    transport: "usb",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true
  });
});

test("sponsored batch via Sub-account on Base Sepolia", async ({ page, context }) => {
  // 2) Spin up OnchainTestKit to automate wallet modal flows
  const kit = await OnchainTestKit.init({
    page,
    wallets: { coinbase: {} } // defaults are fine; connects when modal appears
  });

  await page.goto("/run");

  // 3) Prime user-gesture once (Chrome popup policy)
  await page.locator("#start").click();

  // (OnchainTestKit handles the wallet connect + confirmations automatically.)

  // 4) Wait for the harness to print completion
  await expect(page.locator("pre")).toContainText("done: 200", { timeout: 120_000 });

  // (Optional) You can read and assert balances via viem in-page or through RPC.
  await kit.destroy();
});
```

* **OnchainTestKit** automates Coinbase/MetaMask wallet connect + transaction approvals—ideal for repeatable E2E. ([Base Documentation][6], [onchaintestkit.xyz][7])
* **WebAuthn Virtual Authenticator** removes passkey OS prompts in CI. ([corbado.com][8], [DEV Community][9])

# 5) SDK integration points (keep UI dumb)

In your SDK, accept an **EIP-1193 provider** and hide all wallet logic behind a manager, e.g.:

```ts
// packages/sdk/src/managers/BaseAccountWallet.ts
export class BaseAccountWallet {
  constructor(private provider: any, private chainIdHex: `0x${string}`) {}

  async sendSponsoredCalls(from: `0x${string}`, calls: Array<{to:`0x${string}`;data:`0x${string}`;value?:`0x${string}`;}>) {
    return this.provider.request({
      method: "wallet_sendCalls",
      params: [{
        version: "2.0.0",
        chainId: this.chainIdHex,
        from,
        calls,
        capabilities: { atomic: { required: true } }
      }]
    }) as Promise<{ id: string }>;
  }

  async pollStatus(id: string) {
    return this.provider.request({ method: "wallet_getCallsStatus", params: [{ id }] });
  }
}
```

The **harness** just passes `bas.getProvider()` into your SDK (so the UI dev can’t blame the SDK when the harness proves it works).

# 6) Reliability tips for long tests (3–4 min)

* **One SPA route, one tab**: avoid hard reloads or cross-origin navigations so you don’t lose wallet context.
* **Keep-alive ping** every \~60–90s during long off-chain sections:

  ```ts
  await provider.request({ method: "wallet_getCapabilities", params: [[CHAIN_HEX]] });
  ```

  (Safe, chain-scoped capability check.) ([eip5792.xyz][10])
* **Assertions**:

  * `status === 200` from `wallet_getCallsStatus`. (Base docs show v2 usage.) ([Base Documentation][1])
  * Optional: verify EOA ETH stayed 0 (no-ETH UX on Sepolia via wallet-led path).
* **Limits & safety**: keep Auto Spend scopes tight (token = USDC Sepolia, spenders = your test contracts, daily cap + TTL). ([Base Documentation][2])

# 7) When you later go mainnet / USDC-as-gas

This harness stays the same; you’ll add a **paymaster** capability/URL (CDP or any ERC-7677 provider) to cover fees and, optionally, **ERC-20 gas**. (Base docs include paymaster capability in the `wallet_sendCalls` request.) ([Base Documentation][1])

---

## Quick checklist

* [ ] Workspaces wired; harness depends on `your-sdk`.
* [ ] Harness page created with **one button** that calls `wallet_sendCalls` v2 from a **Sub-account**. ([Base Documentation][1])
* [ ] Sub-account creation and **Auto Spend** bootstrapped on first run. ([Base Documentation][2])
* [ ] Playwright + **OnchainTestKit** + **WebAuthn** virtual key added for **no-hands** E2E. ([Base Documentation][6], [corbado.com][8])
* [ ] USDC Sepolia address confirmed (for harmless approve). ([Circle Developers][5])
* [ ] ChainId = **84532** (hex **0x14a34**). ([chainlist.org][3])

[1]: https://docs.base.org/base-account/improve-ux/batch-transactions "Batch Transactions - Base Documentation"
[2]: https://docs.base.org/base-account/improve-ux/sub-accounts "Use Sub Accounts - Base Documentation"
[3]: https://chainlist.org/chain/84532?utm_source=chatgpt.com "Base Sepolia Testnet RPC and Chain settings"
[4]: https://chainid.network/chain/84532/?utm_source=chatgpt.com "Base Sepolia Testnet"
[5]: https://developers.circle.com/stablecoins/usdc-contract-addresses "USDC Contract Addresses"
[6]: https://docs.base.org/onchainkit/guides/testing-with-onchaintestkit "Testing with OnchainTestKit - Base Documentation"
[7]: https://onchaintestkit.xyz/?utm_source=chatgpt.com "OnchainTestKit Documentation: OnchainTestKit Overview"
[8]: https://www.corbado.com/blog/passkeys-e2e-playwright-testing-webauthn-virtual-authenticator?utm_source=chatgpt.com "Passkeys E2E Playwright Testing via WebAuthn Virtual ..."
[9]: https://dev.to/corbado/webauthn-e2e-testing-playwright-selenium-puppeteer-54?utm_source=chatgpt.com "WebAuthn E2E Testing: Playwright, Selenium, Puppeteer"
[10]: https://www.eip5792.xyz/getting-started?utm_source=chatgpt.com "Getting Started - EIP-5792"
