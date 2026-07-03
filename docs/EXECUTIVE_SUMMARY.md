# Platformless AI — Executive Summary

*Last updated: July 2026*

## What it is

**Platformless AI is a marketplace for AI compute with no platform in the middle.** Users buy AI
services — chat, document-grounded answers, image generation, video transcoding, and AI video
generation — directly from independent GPU operators ("hosts"), the way BitTorrent connects peers
rather than the way an app store intermediates them. Coordination that a platform would normally
provide is done by smart contracts on Base (an Ethereum L2): hosts register and stake on-chain,
prices are published on-chain, payment is escrowed per session in USDC, and work is settled
automatically against cryptographic proof. No company sits between the user's money and the host's
GPU; no company can read the content either way.

## Why it's different

Three properties, each verifiable rather than promised:

1. **Payment without custody.** Every job runs in an on-chain session: the user escrows the exact
   cost up front (a stablecoin deposit), the host proves its work, and the contract splits payment
   automatically — 90% to the host, 10% protocol fee — refunding the remainder. Failed jobs refund
   in full. Nobody holds user funds; the contract does.

2. **Privacy without trust.** All traffic between user and host is end-to-end encrypted
   (XChaCha20-Poly1305 with per-session keys). Media is stored encrypted on decentralized storage
   (S5); decryption keys travel only inside the encrypted channel, delivered as "capability" links
   private to the paying user. Hosts run pinned, hash-identified workloads — clients send typed
   parameters, never executable code.

3. **Provenance without paperwork.** Every AI-generated video carries a cryptographic birth
   certificate: a commitment binding the exact inputs (prompt, seed, parameters, and the byte-exact
   input images), an attestation of the environment that produced it, and a proof anchored on-chain
   at settlement. The user's client re-verifies all of it independently. As AI-content disclosure
   requirements tighten across film, advertising, and news, "this clip, from these inputs, by this
   host, paid for in this transaction" is checkable by anyone — not asserted by a platform.

## What works today (live on Base Sepolia testnet)

- **Chat / LLM inference** with RAG (document upload + semantic search), streaming, per-request
  controls, and encrypted conversation persistence.
- **Image generation** (FLUX diffusion) with natural-language intent detection.
- **Video transcoding** (GPU H.264/AV1, HLS streaming, per-segment encryption, multi-host load
  balancing).
- **AI video generation (LTX 2.3)** — the newest capability, live end-to-end in the product UI:
  - **Three modes:** text-to-video, image-to-video (animate a still), and first-last-frame
    (supply two stills; the model generates the motion between them).
  - **Resolutions** from SD to 1440p live today (4K staged behind one final contract check),
    ~5-second clips with generated audio, at **$0.04–$0.40 per clip** on the current test pricing.
  - **Real settled economics:** paid sessions have generated clips, submitted proofs, and settled
    on-chain with host earnings and user refunds correct **to the unit** — verified independently
    by the client SDK, the node operator, and the contracts, which were built by different people
    against a frozen specification and cross-checked with shared test vectors.
  - **Provenance verified in the product:** every clip in the chat UI carries a "✓ verified" badge
    the user's own browser computed, upgrading to "verified + anchored" once the host's proof
    confirms on-chain.

The full stack is exercised daily by a Next.js product UI (Platformless AI chat), a test harness,
and scripted end-to-end gates that assert on-chain numbers exactly.

## How the money works (worked example)

A 1080p, 5-second generated clip: the model bills by **megapixel-frame** — 121 frames × 1920×1080
≈ 250,906 tokens. At the current test price (904 per thousand tokens), the user escrows $0.50 and
is charged **$0.227**; the host receives **$0.204** (90%), the protocol treasury $0.023 (10%), and
$0.273 refunds automatically. Every number above is from a real settled session, not a projection.

## Architecture in one paragraph

A browser-compatible TypeScript SDK (`@fabstir/sdk-core`) talks to host nodes over encrypted
WebSockets and to Base over standard RPC. Hosts run a Rust node that fronts GPU sidecars (ffmpeg
for transcode; a headless ComfyUI running pinned LTX templates for video generation) and settles
its own work on-chain. Storage is S5 (content-addressed, encrypted at rest). Smart contracts hold
host registrations, model allow-lists, per-model pricing, session escrows, and proof anchors. An
optional OpenAI-compatible daemon lets existing AI tools (Cursor, LangChain, etc.) use the network
without code changes, and a delegate-payment mode gives end users popup-free sessions under an
on-chain-capped allowance.

## Roadmap

- **Near term:** 4K generation (final contract check in progress), production TLS endpoints,
  host-signed attestations, and the prompt-fidelity template re-pin.
- **Next:** longer/higher-fidelity clips (LTX 1080p/15s class), additional pinned templates
  (style transfer, audio-conditioned video), C2PA/Content Credentials export backed by the
  on-chain proof, and a Blender add-on placing paid, provenance-bound generation directly in a
  filmmaker's timeline.
- **Foundational:** mainnet deployment and permissionless host onboarding at scale.

## Where to go deeper

- [README](../README.md) — feature overview and quick start
- [Architecture](ARCHITECTURE.md) — system design
- [SDK API Reference](SDK_API.md) — complete developer documentation
- [Video generation integration guide](platformless-ui/LTX_VIDEO_UI_INTEGRATION.md) — the
  end-to-end video flow as shipped in the product UI
- [Host Operator Guide](HOST_OPERATOR_GUIDE.md) — running a host and earning
