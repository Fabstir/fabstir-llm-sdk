# Gasless (USDC-only) Delegate Sessions

Make agentic-coding sessions **gasless** like chat: the orchestrator delegate's one
on-chain tx — `createSessionForModelAsDelegate` — is submitted as a **sponsored
ERC-4337 v0.7 UserOperation** (bundler + ERC-7677 paymaster) instead of a self-funded
EOA tx. The delegate hot-EOA no longer needs ETH; only the payer's USDC moves. **No
audited Platformless contract changes** — the SimpleAccount delegate is an
already-audited `msg.sender` use case (V2 was designed for smart-wallet sub-accounts).

## How it works

The daemon's stable hot key (the same one `loadOrCreateDelegateKey` manages) becomes
the **owner** of a counterfactual **SimpleAccount v0.7**. That smart account is the
delegate. Settlement stays off-chain (the delegate never settles — the host settles on
WebSocket disconnect), so the delegate's ENTIRE on-chain surface is one sponsored
`createSessionForModelAsDelegate`.

## Deploying the SimpleAccount (paymaster-dependent)

How the SA gets deployed depends on whether your paymaster can sponsor a **deploying** UserOp:

- **Deploy-capable paymaster (e.g. Pimlico/Alchemy):** the first session deploys the SA in the SAME
  sponsored op (factory/factoryData) — fully gasless, no setup.
- **CDP (Coinbase) paymaster:** CDP **cannot trace/sponsor a deploying op** (`pm_getPaymasterStubData`
  → `-32000 "failed to trace calls"`), so the SA must be deployed out-of-band first; then every session
  op is non-deploying and sponsored normally. The daemon handles this automatically
  (`FABSTIR_GASLESS_AUTODEPLOY`, on by default): on first use, if the SA is undeployed and the **owner
  hot-EOA holds a little ETH** (~0.0002 ETH — a one-time fraction of a cent on Base Sepolia), it sends
  `SimpleAccountFactory.createAccount(owner, 0)` once. A 0-ETH owner is skipped with a clear log — fund
  it once or pre-deploy manually. After that single deploy, sessions are USDC-only.

## Environment variables

| Var | Required | Default | Notes |
|-----|----------|---------|-------|
| `FABSTIR_GASLESS` | to enable | _(off)_ | Set `=1` to engage. Off ⇒ legacy self-funded EOA delegate (unchanged). |
| `FABSTIR_ACCOUNT_FACTORY` | yes (gasless) | — | SimpleAccountFactory **bound to the v0.7 EntryPoint**. Also accepts `NEXT_PUBLIC_FABSTIR_ACCOUNT_FACTORY` (use whichever your chain config already sets). |
| `ENTRY_POINT_ADDRESS` | yes | — | Canonical v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032`. Resolved prefix-tolerantly — any of `ENTRY_POINT_ADDRESS` / `NEXT_PUBLIC_ENTRY_POINT_ADDRESS` / `BASE_ENTRY_POINT_ADDRESS` / `NEXT_PUBLIC_BASE_ENTRY_POINT_ADDRESS` (first present wins; none set ⇒ throws). No duplicate bare var needed if your config already uses the `NEXT_PUBLIC_` prefix. |
| `FABSTIR_BUNDLER_URL` | no | CDP base-sepolia | `https://api.developer.coinbase.com/rpc/v1/base-sepolia` (the endpoint chat uses). |
| `FABSTIR_PAYMASTER_URL` | no | = bundler URL | ERC-7677 paymaster service. |
| `FABSTIR_PAYMASTER_CONTEXT` | no | `{}` | JSON ERC-7677 `context`. **Required on Pimlico/Alchemy** for their policy id (e.g. `{"sponsorshipPolicyId":"sp_x"}` / Alchemy Gas-Manager policy). `{}` is CDP-default-policy-specific, NOT universal. |
| `FABSTIR_DELEGATE_KEY` | no | persisted `0600` file | The stable owner key. Rotating it changes the SA address (see re-auth). |
| `FABSTIR_GASLESS_AUTODEPLOY` | no | on | Pre-deploy the SA on first use when the owner is funded. Set `=0` to disable (e.g. you pre-deploy manually, or use a deploy-capable paymaster). |

The factory is the only new contract address — **never hardcode it; it lives in
`.env.test`** (owner-managed). No fallbacks: a missing factory throws.

## ⚠️ Re-authorization required when enabling

Enabling gasless switches the delegate from the hot EOA to the **SimpleAccount (SA)
address**. The payer's prior on-chain authorization + USDC approval were for the EOA and
**do NOT carry over**. On enable, the daemon loudly logs the SA address. The payer MUST:

1. `authorizeDelegate(SA_ADDRESS, true)` on JobMarketplace.
2. USDC `approve` the marketplace for the SA (the allowance keys by address; the address
   is deterministic and works even before the SA is deployed).

The SA address is deterministic from `(factory, owner, salt=0)`. The salt is fixed at `0`
for a stable identity; rotating/regenerating the **owner key** (or changing the factory)
changes the SA address ⇒ re-authorize.

## Paymaster sponsorship policy

Allow-list exactly **one contract + one selector**:
`JobMarketplace.createSessionForModelAsDelegate`. That single entry covers BOTH the
deploying first op and every steady-state op (policy keys on the target contract, not the
factory). Size the **per-op and per-user/global spend caps high enough to absorb the
one-time SA deployment** — the deploying op is more expensive, and a too-tight cap rejects
it (`DELEGATE_SPONSORSHIP_DENIED`).

## Base L2 caveat — `preVerificationGas`

Base folds the L1 data-availability fee into `preVerificationGas`, which is hashed RAW and
cannot be bumped after signing. The SDK applies a **~25% buffer** (`×125/100`) to the
estimate so the op is not rejected as underpriced if the L1/L2 fee ratio rises between
estimate and submit.

## UI / integrator note

Tell users to **authorize + USDC-approve the smart-account address** the daemon logs — NOT
the hot EOA. Everything else (session creation, billing, disconnect-settle) is identical to
the legacy delegate path; the AASigner is a drop-in signer, so no SDK auth-method changed.

## Troubleshooting

**`pm_getPaymasterStubData` → `-32000 "Internal error: failed to trace calls"`.**
CDP can't trace/sponsor a **deploying** op (factory/factoryData). The SDK sends non-zero placeholder
gas (`sdk-core ≥ 1.25.1`) so the stub can simulate, but for a deploying op CDP still fails — the real
fix is to **pre-deploy the SA** (auto-deploy on first use, or manual `createAccount`) so session ops are
non-deploying. See "Deploying the SimpleAccount" above. Also confirm `FABSTIR_ACCOUNT_FACTORY` is bound
to the v0.7 EntryPoint and the sponsorship caps fit the op.

**`bundler estimate missing paymasterPostOpGasLimit`.** Fixed in `sdk-core ≥ 1.25.2`. The paymaster gas
limits (`paymasterVerificationGasLimit` / `paymasterPostOpGasLimit`) come from the **paymaster RPC**
(`pm_getPaymaster*`), not the bundler's `eth_estimateUserOperationGas` — CDP omits them there, and a
sponsoring paymaster may return `0x0` (no postOp). The SDK now sources them from the paymaster and
tolerates missing/zero instead of throwing.

**Session hangs with no error.** Bundler/paymaster JSON-RPC calls now have a 30s timeout (`sdk-core ≥
1.25.1`); a hung CDP call fails fast with `BUNDLER_RPC_TIMEOUT`, and a paymaster decline surfaces as
`DELEGATE_SPONSORSHIP_DENIED` carrying the upstream reason. If the daemon still appears to hang, check
that the OpenAI/session layer forwards the thrown error to the client.

## Verifying

Unit + mocked-integration suites run offline. The real proof is the gated 0-ETH E2E
(`packages/orchestrator/test/e2e/gasless-delegate-dryrun.test.ts`): a delegate holding 0
ETH lands a sponsored session and only the payer's USDC decreases. Run once on Base Sepolia
with live infra: `RUN_GASLESS_E2E=1 pnpm exec vitest run test/e2e/gasless-delegate-dryrun.test.ts`.
