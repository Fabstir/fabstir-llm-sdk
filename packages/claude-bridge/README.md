# @fabstir/claude-bridge

> **Note (2026-05-20):** The Anthropic-compatible `/v1/messages` surface will fold into the
> same local **`@fabstir/orchestrator`** daemon that now hosts the OpenAI-compatible surface
> (see `@fabstir/openai-bridge`'s deprecation note). The orchestrator daemon already provides
> decentralized host selection and **USDC delegate-pays** (a generated hot EOA spending the
> user's on-chain-capped allowance — no host pinning, no raw-key custody).
>
> The full `/v1/messages` port into the daemon is a follow-up; **no code change in this phase**.
> Until then, this bridge continues to work as before. When the port lands, migration will mirror
> the openai-bridge path (`FABSTIR_PAYER` / `FABSTIR_DELEGATE_KEY` env vars, loopback default).

See `docs/development/IMPLEMENTATION-AGENTIC-CODING-DEPIN-API.md` (§13 Out of Scope) for context.
