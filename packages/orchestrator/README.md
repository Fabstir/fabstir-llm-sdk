# @fabstir/orchestrator

Multi-agent orchestration and an OpenAI-compatible delegate daemon for the Platformless AI (Fabstir) P2P LLM
marketplace. Sessions run on decentralised GPU hosts, are paid in USDC on chain and settle with proofs.

Licence: BUSL-1.1 (see `LICENSE` and `NOTICE`). Not yet published to npm — install from the release tarballs.

## Install (tarballs)

The orchestrator depends on `@fabstir/sdk-core`, which is also distributed as a tarball. Put both tarballs in your
project and point the dependency at the sdk-core one:

```jsonc
// package.json
{
  "dependencies": {
    "@fabstir/sdk-core": "file:./fabstir-sdk-core-1.39.10.tgz",
    "@fabstir/orchestrator": "file:./fabstir-orchestrator-0.8.0.tgz"
  },
  "pnpm": { "overrides": { "@fabstir/sdk-core": "file:./fabstir-sdk-core-1.39.10.tgz" } }
}
```

then `pnpm install` (pnpm is required: the packed orchestrator names the exact sdk-core version, which only the
override can resolve while sdk-core is not on a registry). Node 18+.

The CLI is `fabstir-orchestrator` (`pnpm exec fabstir-orchestrator …`), or run it directly:
`node node_modules/@fabstir/orchestrator/dist/cli/orchestrate.js …` (in an unpacked folder: `node dist/cli/orchestrate.js …`).

## The delegate daemon (OpenAI-compatible)

With `FABSTIR_PAYER` set and no goal argument, the CLI runs a local OpenAI-compatible server. It holds a
**delegate** key; the **payer** account authorises that delegate on chain with a capped USDC allowance, so the daemon
can spend at most the allowance and can never move the payer's other funds.

| Route | Purpose |
|---|---|
| `GET /v1/models` | the models the daemon can serve |
| `POST /v1/chat/completions` | chat (streaming, tool calls) |
| `POST /v1/responses` | the Responses API |
| `POST /v1/images/generations` | image generation |
| `GET /v1/delegate/status`, `POST /v1/delegate/payer` | control plane: delegate address, payer, authorisation, allowance |

Until the delegate is authorised with allowance remaining, the inference routes answer `402` with
`FABSTIR_AUTHORIZE_URL`. The control plane has **no authentication**: keep the daemon on loopback.

### First run

1. Start the daemon (`FABSTIR_PAYER`, `FABSTIR_PAYMENT_TOKEN` and a model set). It prints its delegate address, and
   `GET /v1/delegate/status` returns it with the authorisation state.
2. Give the delegate gas: Base Sepolia ETH on that address — or run `FABSTIR_GASLESS=1` (sponsored ERC-4337, USDC
   only), which needs the SimpleAccount factory and EntryPoint addresses (below) and prints a different address to
   authorise.
3. From the payer account, authorise the delegate with a USDC cap: the page at your `FABSTIR_AUTHORIZE_URL`, or the
   SDK's `paymentManager.createDelegateAuthorization({ delegate, allowanceCap })` (approve + `authorizeDelegate`).
4. `/v1/delegate/status` now shows `authorized: true` and the remaining allowance; `/v1/*` stops answering `402`.

### Configuration

| Variable | Meaning | Default |
|---|---|---|
| `FABSTIR_PAYER` | payer address; with no goal argument it selects daemon mode (with a goal, the payer funds the orchestration) | — |
| `FABSTIR_PAYMENT_TOKEN` | USDC address — **required** in daemon mode (delegated sessions are USDC only) | — |
| `FABSTIR_DELEGATE_KEY` | delegate private key (not persisted) | `~/.fabstir/delegate.key`, created on first run |
| `FABSTIR_GASLESS` | `1` = sponsored ERC-4337 delegate (USDC only, no ETH) | off (the delegate EOA needs ETH for gas) |
| `FABSTIR_ACCOUNT_FACTORY`, `ENTRY_POINT_ADDRESS` | SimpleAccount factory and EntryPoint, required with `FABSTIR_GASLESS=1` (`NEXT_PUBLIC_…` names are accepted too) | — |
| `FABSTIR_BUNDLER_URL`, `FABSTIR_PAYMASTER_URL` | gasless bundler / paymaster | the CDP Base Sepolia endpoint |
| `FABSTIR_FAST_MODEL`, `FABSTIR_DEEP_MODEL` | model ids (`repo:file`); each must have a host. The deep one (else the fast one) is the default for `/v1/responses` and images | — |
| `FABSTIR_HOST` | **pin every session to one host address** (0.8.0) | AUTO selection |
| `FABSTIR_OPENAI_PORT` | daemon port | `3457` |
| `FABSTIR_BIND` | bind address; `0.0.0.0` also needs `FABSTIR_BIND_CONFIRM=1` | `127.0.0.1` |
| `FABSTIR_SESSION_DEPOSIT` | USDC per session | `0.001` |
| `FABSTIR_MAX_TOTAL_DEPOSIT` | USDC committed across open sessions | `0.01` |
| `FABSTIR_MAX_SESSIONS` | concurrent sessions | `3` |
| `FABSTIR_CHAIN_ID`, `FABSTIR_RPC_URL` | chain (84532 Base Sepolia) and RPC | `84532`, the chain's RPC |
| `FABSTIR_AUTHORIZE_URL` | the URL a `402` points to | — |
| `FABSTIR_PROOF_GRACE_MS` | wait for the host's proof before settling | `30000` |

Contract addresses come from the SDK's chain registry. Without `FABSTIR_PAYER` the CLI is self-funded from
`FABSTIR_PRIVATE_KEY` (orchestration / A2A, below).

### Choosing the host

- **Pinned** — `FABSTIR_HOST=0x…`. The daemon refuses to start unless it is an address. Each session reads the host's
  endpoint from the on-chain registry and checks that `GET /v1/health` answers **before** anything is funded; an
  inactive host, a host that does not serve the model, a host without an endpoint, or one that does not answer is
  refused with no session opened. It needs sdk-core ≥ 1.39.10: on an older sdk-core the daemon refuses to start.
- **AUTO** (unset) — the SDK picks a host for the model, and skips any whose endpoint does not answer within 3 s,
  before funding (sdk-core 1.39.10).
- "Answers" means `GET /v1/health` returns a 2xx with a status, as nodes ≥ 8.39.0 do; an older node reads as not
  answering.

## Running an agent in an NVIDIA OpenShell sandbox

[OpenShell](https://github.com/NVIDIA/OpenShell) lets a sandboxed agent reach a model provider only through a provider
profile. Run the daemon **outside** the sandbox, then print a profile that matches this release's routes:

```bash
fabstir-orchestrator openshell-profile --port 23457 > fabstir-openai.yaml
```

| Flag | Meaning | Default |
|---|---|---|
| `--port N` | the port the sandbox gateway reaches the daemon on — the **published host port** if the daemon runs in a container | `FABSTIR_OPENAI_PORT` (3457) |
| `--host H` | the daemon's host as the sandbox sees it | `host.openshell.internal` |
| `--binary PATH` | a program allowed to call the daemon (repeatable) | `/usr/local/bin/opencode`, `/usr/bin/curl` |
| `--images` | also allow `POST /v1/images/generations` | off |

The profile allows `GET /v1/models`, `POST /v1/chat/completions` and `POST /v1/responses`, and always denies
`/v1/delegate/**`, so an agent can never reach the control plane. It needs no key or network.

The sandbox holds no secret, but anything that can reach the daemon can spend the allowance, so publish the daemon's
port as narrowly as the sandboxes allow. If the daemon runs in a container, bind `0.0.0.0` inside it
(`FABSTIR_BIND=0.0.0.0`, `FABSTIR_BIND_CONFIRM=1`) and publish:

- **Docker Desktop**: on loopback, `-p 127.0.0.1:23457:3457` — sandboxes reach it through Desktop's host networking;
- **native Docker (Linux)**: on the bridge gateway, `-p 172.17.0.1:23457:3457`
  (`docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}'`) — sandbox containers reach
  `host.openshell.internal` through it, and a loopback-only port is unreachable to them;
- never on `0.0.0.0` of a machine on a shared network.

Pass the **published** port to `openshell-profile --port`; the daemon's own port inside the container (3457) is not
what the sandbox dials.

## Orchestration and A2A

Without `FABSTIR_PAYER` the CLI orchestrates a goal (`fabstir-orchestrator "your goal"`) or, with no goal, serves the
A2A protocol on `FABSTIR_A2A_PORT` (3100). See `docs/PLATFORMLESS_AI_ORCHESTRATOR_SUMMARY.md` in the SDK repository.
