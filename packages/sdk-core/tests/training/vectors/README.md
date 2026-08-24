# Training M0 test vectors

Shipped by the node implementation; **do not hand-edit**. Each file's sha256 is the identity
both sides quote in correspondence to prove they are looking at the same bytes — editing one
silently breaks that check, which is the whole reason it exists.

Conformance is asserted in `../vectors.test.ts` (encoding, byte-exact) and
`../training-count.test.ts` (counting parity).

| file | sha256 | pins |
|---|---|---|
| `input-commitment.json` | `bea31501c79c8cc6f2030d03419d6a7aded9d99e46913cf05518e56b014e67de` | §B.4 — nine ABI types, encoded bytes, commitment |
| `sig-digest.json` | `74aed6fcc83e53509cfc8bb608a77e2adbebec2d71efbafc3851eba0c1f46b06` | §B.5 — ten types, digest, EIP-191 signer recovery |
| `manifests.json` | `2f4d0ee5eb2615c72c1ce7e85d8a0ea90790da1ca6b83fd4725cf91d0512104d` | §D.2/§D.3 canonical bytes + hashes, and §D.1's shift branch |
| `slice-schedule.json` | `54e997ebeb51373cb7b497555955b481c212d7eb64153b8c6d85b6d68fcaf05c` | §B.1 — the floor rule, four cases |
| `billing.json` | `0d0e503ab5ae6d2e374a04279f131fafc2efe7d775cdae5a9784900b58b4c1ff` | §C.1 money, plus the billing block's JSON **types** |
| `counting-fixture.json` | `ff0f42fb6dc7069ec813631b77dacc0e96d3e0cb8c52841d9dd136d12059fef7` | §C.2 `count-v1`, 15 cases |
| `counting-corpus-differential.json` | `7eeffd0b75c91b0835c603c36f431a9dc26cac28fbb1bbe662fc0a6a5d573e06` | 158-case differential corpus, 12 groups |

## Running the counting-parity suites

Five tests skip unless the tokenizer is available. It is **not vendored** — 12 MB, and it
belongs to the training template rather than to this SDK:

```bash
# unsloth/Qwen3.8-27B @ 3ea932cee0a432ae86e9c7826cbe8aef52323a28
TRAINING_TOKENIZER_JSON=/path/to/tokenizer.json pnpm test tests/training
```

Its sha256 must be `0x0997f410c57a1f4e53b09e4be8f4a172d90edd9564368fb0847030937229b9f3` — the
value `counting-fixture.json` pins, and the SDK verifies it before counting anything.

**Re-run the 158-case corpus on every bump of `@huggingface/tokenizers`.** The pin covers the
tokenizer DATA, never the implementation that reads it, and two readers of the same
`tokenizer.json` can disagree — a minor version bump moving a count would otherwise reach
production as honest jobs being rejected.

## A note on `sig-digest.json`

It contains a `privateKey` field. That is Hardhat/Anvil account #0 — published in their docs,
funded only on local devnets, and used by most Ethereum test suites. It is **not a secret**, but
secret scanners match the pattern; allowlist it rather than editing the file, whose hash is the
cross-side identity above.
