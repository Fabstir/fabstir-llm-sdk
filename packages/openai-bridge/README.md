# @fabstir/openai-bridge — DEPRECATED

> **This package is deprecated.** Its OpenAI-compatible surface has been folded into
> **`@fabstir/orchestrator`**, run as a local daemon. The orchestrator daemon is at
> full parity (chat completions, streaming, tool calls, `/v1/models`, `/v1/images/generations`,
> `/v1/responses`) and adds two things the bridge could not do correctly on a DePIN marketplace:
>
> 1. **No host pinning** — decentralized host selection per the user's settings (the bridge
>    pinned a single host by address).
> 2. **No raw-key custody** — payment via **USDC delegate-pays**: a generated hot EOA spends
>    from the user's on-chain-capped USDC allowance, instead of embedding the consumer's raw
>    private key.

## Migration

**Before** (deprecated bridge — pinned host, raw key):

```bash
fabstir-openai-bridge --private-key 0x<consumer-key> --host 0x<pinned-host>
# OpenCode / Cursor → OPENAI_BASE_URL=http://localhost:3457/v1
```

**After** (orchestrator daemon — decentralized selection, delegate-pays USDC):

```bash
# Delegate hot EOA is generated & persisted at ~/.fabstir/delegate.key (mode 0600),
# or supplied via FABSTIR_DELEGATE_KEY. FABSTIR_PAYER is the bridge sub-account whose
# bounded USDC allowance funds sessions (an account distinct from the chat primary).
FABSTIR_PAYER=0x<bridge-sub-account> \
FABSTIR_DELEGATE_KEY=0x<optional-hot-eoa-key> \
FABSTIR_OPENAI_PORT=3457 \
  fabstir-orchestrator
# OpenCode / Cursor → OPENAI_BASE_URL=http://127.0.0.1:3457/v1 (unchanged port)
```

The user authorizes the delegate and sets a USDC allowance (the hard on-chain cap). Until then,
`/v1/*` returns `402` with an authorize URL. The daemon binds `127.0.0.1` by default;
`FABSTIR_BIND=0.0.0.0` requires `FABSTIR_BIND_CONFIRM=1`. The delegate control plane
(`GET /v1/delegate/status`, `POST /v1/delegate/payer`) drives the UI handshake.

See `docs/development/IMPLEMENTATION-AGENTIC-CODING-DEPIN-API.md` for the full design.
