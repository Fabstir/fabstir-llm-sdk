# Agent Coding Bridges: OpenCode & Claude Code → Fabstir Hosts

> **⚠️ `@fabstir/openai-bridge` is DEPRECATED (2026-05).** Its OpenAI surface has been folded into the **`@fabstir/orchestrator` local daemon** (v0.6.2), which is now the recommended path for OpenAI-compatible coding agents. The daemon is at full parity (chat + streaming + tools, `/v1/models`, `/v1/images/generations`, `/v1/responses`) and fixes the two things the bridge got wrong for a DePIN marketplace: **no host pinning** (decentralized host selection) and **no raw-key custody** (USDC **delegate-pays** — a hot EOA spending a user's on-chain-capped allowance). See **§4a Running the orchestrator OpenAI daemon (recommended)** below. The legacy `--private-key --host` bridge CLIs (§3, §4) still work but are frozen; `claude-bridge`'s `/v1/messages` port into the daemon is a follow-up.

This guide explains how to use **`@fabstir/openai-bridge`** and **`@fabstir/claude-bridge`** to point local coding agents (OpenCode, Claude Code, Cursor, Continue, Aider, etc.) at Fabstir host nodes so they consume Fabstir-hosted models for agentic coding work.

The packages live in:

- `packages/orchestrator/` — **(recommended)** local daemon serving the OpenAI surface with decentralized host selection + USDC delegate-pays
- `packages/openai-bridge/` — *(deprecated)* CLI exposing OpenAI Chat Completions, Images, and Responses APIs
- `packages/claude-bridge/` — exposes the Anthropic Messages API

All translate the agent's HTTP calls into Fabstir SDK session calls, which route through the **encrypted WebSocket** transport to a host node. They are **not** thin reverse proxies in front of `/v1/inference` on the host — they go through the full marketplace flow (SDK → session start → deposit → on-chain job → encrypted WS). Implications are spelled out in §Prerequisites and §Troubleshooting.

---

## 1. Architecture

```
                  ┌──────────────────────┐
   OpenCode  ───► │ openai-bridge :3457  │
   Cursor    ───► │ POST /v1/chat/...    │ ──► Fabstir SDK
   Continue  ───► │ POST /v1/images/...  │    (SessionManager)
   Aider     ───► │ POST /v1/responses   │         │
                  └──────────────────────┘         │
                                                   ├──► On-chain session
   Claude    ───► ┌──────────────────────┐         │    (NodeRegistry,
   Code      ───► │ claude-bridge :3456  │ ──► SDK │     JobMarketplace,
                  │ POST /v1/messages    │         │     PaymentEscrow)
                  └──────────────────────┘         │
                                                   ▼
                                       ┌──────────────────────┐
                                       │ Host node            │
                                       │ (encrypted WebSocket)│
                                       └──────────────────────┘
```

Each bridge:

1. Boots a `FabstirSDKCore` instance with a **user** private key (the consumer's key, not the host operator's).
2. On first request, creates a paid session via `SessionManager.startSession({ paymentMethod: 'deposit', encryption: true, ... })` — this deposits ETH, creates an on-chain job, discovers a matching host (or pins to `--host`), and opens an E2E-encrypted WebSocket.
3. Converts each incoming OpenAI/Anthropic request into a single **ChatML-style** prompt (`<|im_start|>{role}…<|im_end|>` framing), with a custom `observation` role for tool results, and sends it through the session via `sendPromptStreaming`.
4. Parses the bridge's **custom XML-ish tool-call format** out of the stream and re-emits as proper `tool_calls` (OpenAI) or `tool_use` content blocks (Anthropic). The exact format the model is told to emit is:
   ```
   <tool_call>ToolName<arg_key>param</arg_key><arg_value>value</arg_value></tool_call>
   ```
   (multiple `<arg_key>`/`<arg_value>` pairs allowed). This is **not** the Hermes/JSON convention — both bridges inject explicit format instructions into the system prompt so the model produces this shape; the streaming parser then converts it back to JSON-shaped tool calls for the client.
5. Strips `<think>...</think>` reasoning out of the visible content if (and only if) the response *starts with* `<think>` after optional whitespace. The streaming stripper buffers up to 8000 characters; if `</think>` doesn't appear by then, it gives up and emits the buffer raw. Reasoning that appears mid-response is **not** stripped — but Qwen/GLM models typically place it at the start.
6. Reuses the same session across requests; on `SESSION_NOT_FOUND` / `SESSION_NOT_ACTIVE` errors it auto-resets and retries once. **openai-bridge** also has a circuit breaker that opens for 60s after persistent failures and a 5s cooldown after a reset to avoid hammering a dying host; **claude-bridge** has the single-retry auto-recovery but no circuit breaker.

---

## 2. Prerequisites

You need **four** things lined up before either bridge will produce tokens.

### 2.1 A funded user wallet (not your host operator key)

- An Ethereum private key the bridge will use as the consumer.
- Funded on Base Sepolia with enough ETH to cover `--deposit` (default `0.0002 ETH`).
- For local testing, `TEST_USER_1_PRIVATE_KEY` in `.env.test` is the canonical choice.
- **Don't reuse `TEST_HOST_1_PRIVATE_KEY` here** — that's the host operator; sessions need a separate consumer account.

### 2.2 A host registered for the model you intend to use

The bridge calls `startSession({ modelId: <your-model-string> })`. The marketplace will only match you with a host that has (a) staked into `NodeRegistry`, (b) registered for that exact `modelId`, and (c) the model is approved on-chain in `ModelRegistry`. If any of those is missing, session creation fails.

Confirm with:

```bash
# What model(s) is TEST_HOST_1 registered for?
# Check NodeRegistry on the chain explorer, or:
grep -r "approvedModels\|modelId" packages/host-cli/  # for the host CLI commands
```

> The model string must be the **exact canonical form** that hashes to the on-chain modelId — `{repo}:{file}` separated by a colon, case-sensitive. If you computed a hash locally and saw `isModelApproved → false`, double-check that the repo and filename match what's actually registered (capitalisation, the exact quant suffix like `Q8_0.gguf`). The string Platformless AI uses successfully is the source of truth; copy that.

### 2.3 Contract addresses & RPC

The bridge reads `.env.test` by default (override with `--env-file <path>`). It uses `ChainRegistry.getChain(ChainId.BASE_SEPOLIA)` for contract addresses, so they come from the codebase, not from your environment — keep the SDK package up to date and **never hardcode addresses**, per project policy.

RPC URL precedence: `--rpc-url` flag → `OPENAI_BRIDGE_RPC_URL` / `CLAUDE_BRIDGE_RPC_URL` → `ChainRegistry` default.

### 2.4 Build artifacts

The bridges run from `dist/`. Build once at the workspace root, or per-package:

```bash
# Workspace root — builds everything
pnpm install
pnpm -r build

# Or per-package
cd packages/sdk-core && pnpm build && cd -
cd packages/openai-bridge && pnpm build && cd -
cd packages/claude-bridge && pnpm build && cd -
```

If you change `sdk-core`, rebuild it **and** the bridges, since the bridges import the compiled output.

---

## 3. Running `claude-bridge`

### CLI

```bash
# From the workspace root
node ./packages/claude-bridge/bin/claude-bridge \
  --private-key "$TEST_USER_1_PRIVATE_KEY" \
  --model "unsloth/Qwen3.6-35B-A3B-GGUF:Qwen3.6-35B-A3B-Q8_0.gguf" \
  --port 3456

# Or, since the root package.json exposes a script:
pnpm claude-bridge -- \
  --private-key "$TEST_USER_1_PRIVATE_KEY" \
  --model "unsloth/Qwen3.6-35B-A3B-GGUF:Qwen3.6-35B-A3B-Q8_0.gguf"
```

### Flags

| Flag | Env var | Default | Notes |
|---|---|---|---|
| `--port` | `CLAUDE_BRIDGE_PORT` | `3456` | HTTP listen port |
| `--private-key` | `CLAUDE_BRIDGE_PRIVATE_KEY` | — | **Required**. Consumer wallet, not the host. |
| `--model` | `CLAUDE_BRIDGE_MODEL` | — | **Required**. Model string in `{repo}:{file}` form, or the modelId hash. |
| `--host` | `CLAUDE_BRIDGE_HOST` | auto | Pin to a specific host's Ethereum address. Omit to let `SessionManager` discover one. The host's WebSocket URL still comes from `NodeRegistry`. |
| `--chain-id` | `CLAUDE_BRIDGE_CHAIN_ID` | `84532` | Currently only Base Sepolia is functional — contract addresses are pulled from `ChainRegistry.getChain(BASE_SEPOLIA)` regardless of this value. opBNB / other chains not yet plumbed through `session-bridge.ts`. |
| `--deposit` | `CLAUDE_BRIDGE_DEPOSIT` | `0.0002` | ETH the bridge deposits to fund the session. |
| `--rpc-url` | `CLAUDE_BRIDGE_RPC_URL` | from `ChainRegistry` | Override RPC endpoint. |
| `--env-file` | — | `.env.test` | Path to dotenv file to load before reading env vars. |
| `--api-key` | `CLAUDE_BRIDGE_API_KEY` | — | If set, requires `x-api-key: <value>` on every request to `/v1/messages`. |
| (env only) | `CLAUDE_BRIDGE_LOCALHOST_OVERRIDE` | — | Rewrite `localhost`/`127.0.0.1` in discovered host URLs to this value. Use `host.docker.internal` when running inside Docker; use the Windows LAN IP when running in WSL2 against a host on Windows. No CLI flag — env-var only. |

> `claude-bridge`'s CLI also accepts `--host-url <url>`, but the flag is currently a **no-op** (declared in `index.ts` but not threaded into the session config). Omit it; pin by Ethereum address with `--host` instead.

### Endpoints

| Path | Method | Purpose |
|---|---|---|
| `/v1/messages` | POST | Anthropic Messages API — streaming and non-streaming, tools, system, vision |
| `/health` | GET | Liveness probe (`{"status":"ok"}`) |
| `/v1/messages` | OPTIONS | CORS preflight |

Auth header: **`x-api-key`** (not `Authorization`), matching Anthropic's spec. If you don't pass `--api-key`, the bridge does not check auth — fine for localhost, bad if you expose it on a LAN/VPN.

---

## 4. Running `openai-bridge`

### CLI

```bash
node ./packages/openai-bridge/bin/openai-bridge \
  --private-key "$TEST_USER_1_PRIVATE_KEY" \
  --model "unsloth/Qwen3.6-35B-A3B-GGUF:Qwen3.6-35B-A3B-Q8_0.gguf" \
  --port 3457
```

(There is no root-level `pnpm openai-bridge` script yet — only `pnpm claude-bridge`. Add one to `package.json` if you use it often.)

### Flags

Same shape as claude-bridge, with `OPENAI_BRIDGE_*` env vars instead of `CLAUDE_BRIDGE_*`. Note that `--chain-id` has the same Base-Sepolia-only caveat (contracts hardcoded in `session-bridge.ts`). One extra option:

| Flag | Env var | Notes |
|---|---|---|
| `--localhost-override` | `OPENAI_BRIDGE_LOCALHOST_OVERRIDE` | If set, rewrites `localhost` / `127.0.0.1` in **discovered host URLs** to this value. Use `host.docker.internal` when the bridge runs inside Docker but the host node is on the Docker host. claude-bridge has the env-var equivalent but no CLI flag. |

### Endpoints

| Path | Method | Purpose |
|---|---|---|
| `/v1/chat/completions` | POST | OpenAI Chat Completions — streaming + non-streaming, tools, vision (`image_url`) |
| `/v1/images/generations` | POST | DALL-E-style image gen; returns `b64_json` |
| `/v1/responses` | POST | OpenAI Responses API |
| `/v1/models` | GET | Returns the single configured model: `{ object:"list", data:[{ id: <--model>, object:"model" }]}` |
| `/health` | GET | Liveness probe |

Auth header: **`Authorization: Bearer <key>`** when `--api-key` is set; otherwise unauthenticated.

> The `model` field the client sends in the request body is **echoed** in the response/SSE deltas but is **not** used to route. The bridge always uses the model specified at startup (`--model`). This means OpenCode's `models` map can use any friendly name — the bridge will route everything to its single configured Fabstir model.

---

## 4a. Running the orchestrator OpenAI daemon (recommended)

`@fabstir/orchestrator` (v0.6.2+) serves the same OpenAI surface as `openai-bridge`, but with **decentralized host selection** (no `--host` pinning) and **USDC delegate-pays** instead of an embedded raw private key. This is the recommended replacement for `openai-bridge`.

### How delegate-pays differs from the legacy bridge

- A generated **hot EOA** (the "delegate", persisted at `~/.fabstir/delegate.key`, mode `0600`) signs sessions. It never holds funds.
- The user authorizes that delegate against a **payer** account and sets a **bounded USDC allowance** (the hard on-chain cap). The daemon can spend only up to that allowance; a looping agent physically cannot overspend.
- **The payer MUST be an account distinct from the chat primary** — use the existing Coinbase **sub-account**. ERC-20 allowance is shared across a payer's delegates, so reusing the chat primary would let the coding agent drain chat's allowance.
- The daemon (delegate) **never settles** the on-chain job; the **host settles on WebSocket disconnect**.

### CLI

```bash
FABSTIR_PAYER=0x<bridge-sub-account> \      # required → enters delegate mode
FABSTIR_DELEGATE_KEY=0x<hot-eoa-key> \      # optional; else generated & persisted at ~/.fabstir/delegate.key (0600)
FABSTIR_OPENAI_PORT=3457 \                  # default 3457 (drop-in with openai-bridge / OpenCode baseURL)
FABSTIR_PRIVATE_KEY=... FABSTIR_RPC_URL=... FABSTIR_FAST_MODEL=... FABSTIR_DEEP_MODEL=... \
  fabstir-orchestrator
```

### Env vars (delegate daemon)

| Env var | Default | Notes |
|---|---|---|
| `FABSTIR_PAYER` | — | **Required** for delegate mode (the OpenAI daemon starts only when set). The bridge sub-account, distinct from the chat primary. |
| `FABSTIR_DELEGATE_KEY` | auto-generated | Hot-EOA private key; if unset, one is generated and persisted at `~/.fabstir/delegate.key` (`0600`). Only the **address** is ever logged. |
| `FABSTIR_OPENAI_PORT` | `3457` | OpenAI surface port. |
| `FABSTIR_BIND` | `127.0.0.1` | Loopback by default. `0.0.0.0` requires `FABSTIR_BIND_CONFIRM=1`. |
| `FABSTIR_AUTHORIZE_URL` | — | URL returned in the `402` gate so the UI can authorize the delegate. |
| `FABSTIR_SESSION_DEPOSIT` | `0.001` | Per-session USDC deposit. |
| `FABSTIR_RPC_URL` | chain default | Base-Sepolia RPC. |
| `FABSTIR_FAST_MODEL` / `FABSTIR_DEEP_MODEL` | — | Model strings (`{repo}:{file}`) the daemon can serve. |

#### Chain env (required)

Contract addresses come from `ChainRegistry`, which reads the standard env vars — the daemon needs these set (the SDK reads `CONTRACT_*` and falls back to `NEXT_PUBLIC_*`):

```
RPC_URL_BASE_SEPOLIA           # (or FABSTIR_RPC_URL / NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA)
CONTRACT_JOB_MARKETPLACE
CONTRACT_NODE_REGISTRY
CONTRACT_PROOF_SYSTEM
CONTRACT_HOST_EARNINGS
CONTRACT_USDC_TOKEN
CONTRACT_MODEL_REGISTRY
```

#### S5 / VectorRAG are NOT required for the daemon

The delegate/coding-agent daemon proxies `/v1/chat/completions` (+ images/responses) and does **not** need S5 conversation persistence or VectorRAG. It runs with **`skipS5`** enabled automatically (sdk-core 1.21.2+): no S5 portal registration, no VectorRAG/SessionGroup/Transcode init, conversation storage degrades to a no-op proxy. End-to-end session encryption still works (the key derives from the wallet seed, no S5 network). So you do **not** need S5 portal creds for the daemon. (`SKIP_S5_STORAGE=true` is also honored as an env override on the SDK.)

### Endpoints

Same `/v1/chat/completions`, `/v1/images/generations`, `/v1/responses`, `/v1/models` as §4. Plus a **delegate control plane** (loopback) and **authorize-gating**:

| Path | Method | Purpose |
|---|---|---|
| `GET /v1/delegate/status` | GET | `{ delegateAddress, payer, authorized, allowanceRemaining, chainId }` — `allowanceRemaining` is a raw USDC base-units **string**. |
| `POST /v1/delegate/payer` | POST | Set/confirm the payer (`{ payer }`). |

Until the delegate is authorized **and** has remaining allowance, the inference routes (`/v1/chat/completions`, `/v1/images/generations`, `/v1/responses`) return **`402`** with the authorize URL. `/v1/models` and the control plane are not gated. Point the agent at `http://127.0.0.1:3457/v1` exactly as with the bridge.

> See `docs/SDK_API.md` → **Delegate-Pays Authorization** for the SDK calls (`authenticateAsDelegate`, `createDelegateAuthorization`, `getDelegateAuthorization`, `revokeDelegate`) the UI uses to drive the authorize/revoke handshake.

---

## 5. Wiring Claude Code → `claude-bridge`

Claude Code respects `ANTHROPIC_BASE_URL` for the API root:

```bash
export ANTHROPIC_BASE_URL="http://localhost:3456"

# Use whichever your Claude Code version honours for the x-api-key header:
export ANTHROPIC_API_KEY="<your --api-key value>"        # standard
# export ANTHROPIC_AUTH_TOKEN="<your --api-key value>"   # accepted by some builds

# Model name is decorative for routing but Claude Code still requires one:
export ANTHROPIC_MODEL="claude-3-5-sonnet-20241022"     # any string works; bridge ignores it
claude  # launches Claude Code against the bridge
```

If your `--api-key` flag isn't set, you can pass any non-empty value for the env var — the bridge won't check it.

If the bridge runs on the Windows host but Claude Code runs in WSL2, replace `localhost` with the Windows LAN IP or:

```bash
export ANTHROPIC_BASE_URL="http://$(awk '/nameserver/ {print $2}' /etc/resolv.conf):3456"
```

The bridge listens on `0.0.0.0`, so cross-host connections work as long as the firewall allows it.

---

## 6. Wiring OpenCode → `openai-bridge`

OpenCode reads its config from `~/.config/opencode/opencode.json` (global) or `opencode.json` in the current project. Use the OpenAI-compatible provider (the OpenCode config schema evolves between versions — adjust field names if your build differs):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "fabstir": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Fabstir Local",
      "options": {
        "baseURL": "http://localhost:3457/v1",
        "apiKey":  "<your --api-key value or any non-empty string>"
      },
      "models": {
        "qwen-coder": {
          "name": "Qwen 3.6 35B-A3B (Fabstir host)",
          "tools": true,
          "reasoning": true
        }
      }
    }
  },
  "model": "fabstir/qwen-coder"
}
```

Then:

```bash
opencode    # picks up the config and routes through the bridge
```

The `models` key in the OpenCode config is a friendly label. The bridge ignores `body.model` for routing — whatever model you launched the bridge with (`--model`) is what gets used. So the name above can be `qwen-coder`, `gpt-4o`, or anything you like.

If OpenCode complains about model discovery, hit `GET /v1/models` against the bridge manually to confirm it returns the model name the config expects.

---

## 7. Wiring other OpenAI-compatible clients

Anything that takes `OPENAI_BASE_URL` + `OPENAI_API_KEY` works against the openai-bridge:

| Client | Setting |
|---|---|
| **Cursor** | Settings → Models → Override OpenAI Base URL: `http://localhost:3457/v1` |
| **Continue** (VS Code) | `~/.continue/config.json` → `models[].apiBase: "http://localhost:3457/v1"` |
| **Aider** | `aider --openai-api-base http://localhost:3457/v1 --openai-api-key <key>` |
| **LiteLLM** | `model_list: - model_name: fabstir/* litellm_params: {api_base: "http://localhost:3457/v1", custom_llm_provider: openai}` |
| **LangChain JS** | `new ChatOpenAI({ configuration: { baseURL: "http://localhost:3457/v1" } })` |
| **Raw curl** | `curl http://localhost:3457/v1/chat/completions -H 'content-type: application/json' -d '{...}'` |

---

## 8. Multi-host & multi-model setups

Each bridge instance is bound to **one** model + **one** consumer wallet. To support multiple models concurrently, run multiple bridge processes on different ports:

```bash
# Bridge A: Qwen for coding
node ./packages/openai-bridge/bin/openai-bridge --port 3457 \
  --model "<qwen-string>" \
  --private-key "$TEST_USER_1_PRIVATE_KEY"

# Bridge B: a smaller fast model for autocomplete
node ./packages/openai-bridge/bin/openai-bridge --port 3458 \
  --model "<other-string>" \
  --private-key "$TEST_USER_1_PRIVATE_KEY"
```

(If you publish the package and install globally, `fabstir-openai-bridge` works as the bin name — but the repo currently doesn't ship a global install path.)

Then configure two providers in OpenCode (`fabstir-coder`, `fabstir-autocomplete`) each pointing at its own port.

For host pinning (skip the host-selection step), pass `--host <eth-address>`. The bridge still queries `NodeRegistry` for that host's registered WebSocket URL — there is no flag to bypass NodeRegistry entirely. Useful when you operate multiple hosts and want a specific one.

---

## 9. What works, what doesn't

### 9.1 Supported

- **Streaming and non-streaming** — full SSE for both protocols.
- **Tool calling** — the bridges inject a `# Tools` section into the system prompt that lists tools and instructs the model to emit `<tool_call>Name<arg_key>k</arg_key><arg_value>v</arg_value></tool_call>` (per-arg XML tags). The streaming parser handles partial-tag boundaries safely, coerces values to bool/number/JSON, and surfaces results as `tool_calls` (OpenAI) or `tool_use` content blocks (Anthropic). This is what makes agentic coding actually work.
- **Vision** — both bridges accept image inputs and forward to the host as `opts.images: [{ data: <base64>, format }]`. openai-bridge additionally fetches `http(s)://` image URLs and converts them to base64 in-flight; claude-bridge requires base64 directly in the Anthropic `image.source.data` field.
- **Reasoning models** — `<think>...</think>` blocks at the *start* of a response are stripped (Qwen 3 thinking, GLM-4 reasoning) with a streaming-safe state machine. Mid-response thinking is **not** stripped; thinking content longer than 8000 buffered characters bypasses the stripper.
- **Multi-turn** — conversation history is built into a single ChatML-ish prompt; tool results become `<|im_start|>observation\n…<|im_end|>` blocks (custom non-standard ChatML role).
- **Prompt caching system-blocks (Anthropic)** — Claude Code sends `system` as an array of content blocks for caching; claude-bridge flattens them correctly.
- **Image generation** — openai-bridge `/v1/images/generations` returns base64-encoded images (`b64_json`). Useful for design-aware coding flows.
- **OpenAI Responses API** — openai-bridge `/v1/responses` implements the newer Responses endpoint (text-only — does not extract images from `input[].content`; use `/v1/chat/completions` for vision).
- **Auto-recovery** — both bridges retry once on `SESSION_NOT_FOUND` / `SESSION_NOT_ACTIVE`. openai-bridge additionally treats decryption / AEAD errors as recoverable and trips a 60s circuit breaker after two consecutive recovery failures. claude-bridge has no circuit breaker.

### 9.2 Known limits

- **One model per bridge process.** No model multiplexing in a single process; spawn multiple bridges.
- **No streaming `stop` / `top_p` passthrough.** The node API doesn't expose them; the bridge currently drops them silently.
- **Model name from the client is decorative.** Routing is fixed at bridge startup via `--model`.
- **No bridge-level `/v1/models` discovery** beyond the single configured model. Clients that expect to enumerate many models will see one entry.
- **Deposit is per-bridge-session.** When the session is reset, a new session is started — usually within the existing on-chain job, but worth knowing if you're watching gas.
- **Vision tokens are tracked separately** in `tokenUsage.vlmTokens` but the bridge currently surfaces only `llmTokens` as `output_tokens` / `completion_tokens`.
- **`input_tokens` / `prompt_tokens` is `Math.ceil(promptChars / 4)`** — a bridge-local estimate, not from the host. The on-chain accounting uses the host's authoritative count. Don't rely on the bridge's input-token report for billing.
- **`--chain-id` is partially decorative** — see §3 flag table. The bridge passes `chainId` to the SDK but always loads Base Sepolia contracts. Other chains will fail at session start.
- **Tool-call history is reconstructed inconsistently with the emit format.** Both converters render *prior* assistant tool calls in the prompt in a shape that differs from what they tell the model to emit:
  - **openai-bridge** wraps the JSON args in a single `<arg_key>arguments</arg_key><arg_value>{json}</arg_value>` pair instead of unpacking each arg into its own tag. responses-handler has a `normalizeToolArgs` unwrapper specifically because the model sometimes echoes that shape back.
  - **claude-bridge** is worse — it `JSON.stringify({name, arguments})`s the prior `tool_use` block as plain text inside the assistant message, with no `<tool_call>` tag at all. The model sees its past tool calls in one format and is asked to emit a different one. This can degrade multi-turn agentic flows where the model mis-formats follow-up tool calls.

---

## 10. Troubleshooting

### 10.1 `Model not approved` / `No matching host` / session start fails immediately

Symptom: bridge logs `Initializing SDK…` then the first request errors with `Model not approved`, `No matching host`, or session creation hangs.

Cause: One of:
- The `--model` string you passed doesn't hash to an approved modelId in `ModelRegistry`. Usually a casing / filename mismatch — `Qwen3.6-35B-A3B-Q8_0.gguf` ≠ `qwen3.6-35b-a3b-q8_0.gguf`.
- No staked host in `NodeRegistry` is currently advertising that model.
- The wallet supplied by `--private-key` is the **host operator** key rather than a separate consumer wallet, so the marketplace refuses to start a job (the host can't sell to itself).

Fix:
1. Copy the model string from a place that already works (e.g. the Platformless AI UI's configured value). The bridge hashes the string with the same algorithm as the contracts, so an exact match is enough — no manual hashing needed.
2. Confirm host registration on-chain — e.g. via the block explorer, or run `fabstir-host info` / `fabstir-host models` from the host machine.
3. Use `TEST_USER_1_PRIVATE_KEY` (or another funded consumer wallet), not `TEST_HOST_1_PRIVATE_KEY`.

### 10.2 Bridge can't reach the host (WSL2 / Docker)

Symptom: session start succeeds on-chain but the WebSocket connection to the host times out.

Causes & fixes:

- **Bridge runs in Docker, host is on Docker host machine.** The discovered host URL is `http://localhost:8082` (because that's what TEST_HOST_1 registered in `NodeRegistry`), but `localhost` inside the container is the container itself.
  - openai-bridge: pass `--localhost-override host.docker.internal` or set `OPENAI_BRIDGE_LOCALHOST_OVERRIDE=host.docker.internal`.
  - claude-bridge: set `CLAUDE_BRIDGE_LOCALHOST_OVERRIDE=host.docker.internal` (no CLI flag exists).
- **Bridge runs in WSL2, host is on Windows.** From WSL2, `localhost` does not reach the Windows host. Either enable WSL2 mirrored networking (Windows 11 22H2+), or use the localhost-override env var / flag with the Windows LAN IP (e.g. `OPENAI_BRIDGE_LOCALHOST_OVERRIDE=192.168.1.42`). To find the IP: `cat /etc/resolv.conf | awk '/nameserver/ {print $2}'` or `ip route | awk '/^default/ {print $3}'`.
- **Windows Firewall.** Allow inbound on the host node port (default `8082`) for the WSL vEthernet adapter.
- **Long-term fix:** re-register the host in `NodeRegistry` with a URL that's reachable from where the bridge actually runs (LAN IP, not `localhost`). Then no override is needed.

### 10.3 Circuit breaker open (openai-bridge only)

Log: `Circuit breaker OPEN after N failures. Will block requests for 60s.`

What it means: two consecutive session-recovery attempts failed. The bridge rejects incoming requests with HTTP 503 for 60 seconds, then half-opens to retry one. There is also a 5-second post-reset cooldown that fails fast with a clear error. Usually triggered by:
- Host node restarted while you were mid-session (encryption keys lost).
- Persistent network outage to the host.
- Deposit depleted mid-stream.

Action: wait 60s, then re-issue the request. If failures persist, check host logs and your deposit balance.

**claude-bridge does not currently have a circuit breaker** — it retries once on `SESSION_NOT_FOUND` / `SESSION_NOT_ACTIVE` and then surfaces the error. If you see the same error twice in a row, restart the bridge.

### 10.4 Decryption failures during streaming

Log: `Decryption failed` or `aead` errors.

Usually means the host's session keys are stale (host restarted) or your SDK and host have version-mismatched encryption logic.

- **openai-bridge** treats this as a recoverable session error and auto-resets once.
- **claude-bridge** only auto-recovers from explicit `SESSION_NOT_FOUND` / `SESSION_NOT_ACTIVE` codes — decryption failures will propagate as-is. Restart the bridge to force `startSession` from scratch.

### 10.5 OpenCode says "model not found"

OpenCode validates the model name against its provider config. The bridge's `/v1/models` returns only the model you launched it with. Either:
- Use that exact model id in your OpenCode `models` map, **or**
- Add an alias in OpenCode's `models` block — OpenCode allows arbitrary names; the value is just metadata.

### 10.6 Empty / truncated responses

The Anthropic streaming handler enforces a per-turn output cap of `max(1000, max_tokens * 4)` characters as a safety net (`packages/claude-bridge/src/handler.ts:195`). If your client sends a low `max_tokens`, you'll hit it. Pass a larger value (Claude Code defaults to 8192).

### 10.7 `SESSION_NOT_FOUND` immediately on first request

Almost always one of:
- Consumer wallet has zero ETH on Base Sepolia. Fund it.
- `--deposit` is below the minimum (currently `0.0002 ETH`); use the default.
- `--rpc-url` points at a different network than where the contracts are deployed. The bridge always uses Base Sepolia contracts, so the RPC must be a Base Sepolia endpoint.

---

## 11. Verifying end-to-end without an agent

Quickest smoke test once the bridge is running:

```bash
# claude-bridge — Anthropic shape
curl -sN http://localhost:3456/v1/messages \
  -H 'content-type: application/json' \
  -H 'x-api-key: anything-if-no-api-key-flag' \
  -d '{
    "model": "claude-3-5-sonnet",
    "max_tokens": 100,
    "stream": false,
    "messages": [{"role":"user","content":"Reply with exactly: ok"}]
  }' | jq

# openai-bridge — OpenAI shape
curl -sN http://localhost:3457/v1/chat/completions \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer anything-if-no-api-key-flag' \
  -d '{
    "model": "qwen-coder",
    "stream": false,
    "messages": [{"role":"user","content":"Reply with exactly: ok"}]
  }' | jq
```

If you get back JSON with `content` / `choices[0].message.content`, you're done — wire your agent next.

For streaming smoke tests, drop `"stream": false` and watch the SSE events fly past.

---

## 12. Operational notes

- **Logs**: each bridge logs every request line, session lifecycle, recoverable errors, and circuit-breaker state to stdout. Capture to a file if running unattended.
- **`BRIDGE_DEBUG=1` for prompt inspection**: setting `BRIDGE_DEBUG=1` in the bridge's environment enables verbose logging of the rendered ChatML prompt (first 2000 chars) and the tool list on every chat-completions / messages request. Use it to verify what the local model actually sees — e.g. confirming the full Claude Code / OpenCode system prompt arrives intact. claude-bridge logs with the `[DEBUG]` prefix (`handler.ts:20`); openai-bridge uses `[openai-bridge:DEBUG]` (`openai-handler.ts:12`) so you can disambiguate when both bridges run in the same terminal. Only `/v1/chat/completions` and `/v1/messages` are instrumented — the Responses and image-generation paths are not.
- **Process management**: run under `pm2`, `systemd`, or `tmux`. On SIGINT/SIGTERM both bridges attempt `endSession()` cleanly.
- **Multiple consumers**: each consumer needs their own wallet + their own bridge instance, or share a single bridge if the trust model permits (anyone who can hit `localhost:3456` can spend your deposit).
- **Cost accounting**: the bridge config exposes `pricePerToken: 5000` as a default but **the SDK overrides this with the on-chain per-model price** (see `SessionManager.startSession` ≈ line 363, `hostManager.getModelPricing`). The bridge value is effectively a placeholder — the host's configured model price is what's charged. If the host has no price for the chosen model, session creation fails with a clear pricing error. Output token usage is surfaced per-response in the `usage` field; for authoritative on-chain spend, inspect `JobMarketplace` events for your job id.

---

## 13. File map (for code spelunking)

```
packages/claude-bridge/
├── bin/claude-bridge                 # CLI entry
├── src/
│   ├── index.ts                      # Commander setup, env loading, SDK boot
│   ├── server.ts                     # HTTP routes: /v1/messages, /health
│   ├── handler.ts                    # Anthropic streaming + non-streaming
│   ├── converter.ts                  # messages[] + system + tools → ChatML prompt
│   ├── sse.ts                        # Anthropic SSE event builders
│   ├── tool-parser.ts                # Streaming parser for <tool_call>Name<arg_key>k</arg_key><arg_value>v</arg_value></tool_call>
│   ├── session-bridge.ts             # SDK wiring, request queue, single-retry recovery
│   ├── config.ts                     # CLI + env var loading + defaults
│   └── types.ts                      # AnthropicRequest / AnthropicTool shapes
└── tests/                            # vitest unit + integration tests

packages/openai-bridge/
├── bin/openai-bridge                 # CLI entry
├── src/
│   ├── index.ts                      # Commander setup
│   ├── server.ts                     # HTTP routes incl. /v1/{chat/completions,images/generations,responses,models}
│   ├── openai-handler.ts             # Chat Completions handler
│   ├── responses-handler.ts          # Responses API handler
│   ├── image-handler.ts              # Images Generation handler
│   ├── openai-converter.ts           # OpenAI messages → ChatML
│   ├── openai-sse.ts                 # OpenAI SSE event builders
│   ├── tool-parser.ts                # Same custom-XML tool-call parser as claude-bridge
│   ├── think-stripper.ts             # <think>...</think> stripper
│   ├── session-bridge.ts             # SDK wiring + circuit breaker + localhost-override CLI flag
│   ├── config.ts                     # Defaults: PORT=3457, DEPOSIT=0.0002
│   └── types.ts                      # OpenAIChatRequest etc.
└── tests/                            # vitest unit + integration tests
```

---

## 14. Quick-start checklist

```text
[ ] pnpm install && pnpm -r build
[ ] TEST_USER_1 wallet funded with ≥ 0.0002 ETH on Base Sepolia
[ ] Confirm host registered for your chosen model (NodeRegistry)
[ ] Confirm model approved (ModelRegistry)
[ ] Launch bridge:
    node ./packages/openai-bridge/bin/openai-bridge \
      --private-key "$TEST_USER_1_PRIVATE_KEY" \
      --model "<approved-model-string>" \
      --api-key "local-dev-$(openssl rand -hex 8)"
[ ] curl smoke test (§11) returns content
[ ] Configure OpenCode / Claude Code per §5–§6
[ ] Run your first agentic task; watch bridge logs for tool_calls + token usage
```

---

## 15. References

- **Orchestrator daemon + delegate-pays (recommended):** `docs/development/IMPLEMENTATION-AGENTIC-CODING-DEPIN-API.md`, `packages/orchestrator/README.md`
- **Delegate-pays SDK API:** `docs/SDK_API.md` → "Delegate-Pays Authorization" (`authenticateAsDelegate`, `createDelegateAuthorization`, `getDelegateAuthorization`, `revokeDelegate`)
- Implementation history: `docs/archive/IMPLEMENTATION-OPENAI-BRIDGE.md`, `docs/node-reference/archive/development/IMPLEMENTATION-CLAUDE-BRIDGE.md`
- SDK overview: `docs/SDK_API.md` (search "openai-bridge")
- Node API (the protocol behind the encrypted WebSocket): `docs/node-reference/API.md`, `docs/node-reference/WEBSOCKET_API_SDK_GUIDE.md`
- Encryption details: `docs/ENCRYPTION_GUIDE.md`, `docs/development/NODE_ENCRYPTION_GUIDE.md`, `docs/ENCRYPTION_FAQ.md`
- Host CLI (for model registration): `packages/host-cli/docs/API_REFERENCE.md`
- Contract reference: `docs/compute-contracts-reference/API_REFERENCE.md` (JobMarketplace + ModelRegistry + NodeRegistry + PaymentEscrow are all covered here), with ABIs under `docs/compute-contracts-reference/client-abis/`
