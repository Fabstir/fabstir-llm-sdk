# SDK Image Generation Integration Guide

**Version**: v8.16.0+
**Status**: Production Ready (Encrypted WebSocket + HTTP)
**Last Updated**: February 15, 2026

---

## Overview

Starting with v8.16.0, Fabstir LLM Nodes support **text-to-image generation** via an SGLang Diffusion sidecar running **FLUX.2 Klein 4B** (~13GB VRAM, Apache 2.0 licensed). Images are generated entirely on the host GPU — no external API calls.

Two transport options are available:

| Transport | Encryption | Recommended |
|-----------|-----------|-------------|
| **Encrypted WebSocket** | XChaCha20-Poly1305 E2E | **Yes — use for production** |
| **HTTP POST** | None (plaintext) | Testing/development only |

A **three-layer content safety pipeline** (UK Online Safety Act / deepfake law compliant) runs on every request:

1. **Keyword blocklist** — instant rejection of known-unsafe prompts (< 1 ms)
2. **LLM prompt classification** — resident LLM classifies prompt intent (types defined, full wiring in future release)
3. **VLM output classification** — Qwen3-VL classifies the generated image (types defined, full wiring in future release)

### Key Properties

| Property | Value |
|----------|-------|
| **Model** | FLUX.2 Klein 4B (Black Forest Labs, Apache 2.0) |
| **Default resolution** | 1024x1024 |
| **Default steps** | 4 (sub-second on modern GPUs) |
| **Output format** | Base64-encoded PNG |
| **Safety** | Always-on keyword filter; LLM + VLM layers in future release |
| **Billing** | Megapixel-steps formula (see [Billing Formula](#billing-formula)) |
| **Rate limit** | Configurable per session (default: 5 requests/minute) |
| **Availability** | Only when host has `DIFFUSION_ENDPOINT` configured |

---

## Feature Detection

Before showing image generation UI, verify the host supports it:

```javascript
const response = await fetch(`${hostUrl}/v1/version`);
const version = await response.json();

if (!version.features.includes('image-generation')) {
  hideImageGenTab();  // Host does not support image generation
  return;
}

// Prefer encrypted WebSocket when available
const useEncryptedWs = version.features.includes('websocket-image-generation');
const useHttp = version.features.includes('http-image-generation');
```

### Feature Flags

| Flag | Meaning |
|------|---------|
| `image-generation` | Image generation is available on this host |
| `websocket-image-generation` | Encrypted WebSocket image generation (production) |
| `http-image-generation` | HTTP endpoint available (unencrypted, testing only) |
| `diffusion-sidecar` | SGLang Diffusion sidecar is configured |
| `prompt-safety-classifier` | Prompt safety filtering active |
| `output-safety-classifier` | Output safety classification available |
| `image-generation-billing` | Billing units calculated per request |
| `image-content-hashes` | SHA-256 content hashes for proof witness |

If `image-generation` is absent, the host is running a pre-v8.16.0 node or does not have the diffusion sidecar configured.

---

## Request Fields

Both the encrypted WebSocket and HTTP transports accept the same fields (all `camelCase` in JSON):

```typescript
interface ImageGenerationFields {
  prompt: string;              // Required: text description of desired image
  model?: string;              // Optional: override model name (default: host's configured model)
  size?: string;               // Optional: output dimensions (default: "1024x1024")
  steps?: number;              // Optional: inference steps 1-100 (default: 4)
  seed?: number;               // Optional: random seed for reproducibility
  negativePrompt?: string;     // Optional: what to avoid in the image
  guidanceScale?: number;      // Optional: classifier-free guidance (default: 3.5)
  safetyLevel?: string;        // Optional: "strict" | "moderate" | "permissive" (default: "strict")
  chainId?: number;            // Optional: blockchain context (default: 84532)
  sessionId?: string;          // Optional: for rate limiting tracking (HTTP only; WebSocket uses session_id from envelope)
  jobId?: number;              // Optional: for billing integration with smart contracts
}
```

> For encrypted WebSocket, add `"action": "image_generation"` to the JSON (see below).

### Allowed Sizes

| Size | Megapixels | Aspect Ratio |
|------|-----------|--------------|
| `256x256` | 0.065 | 1:1 |
| `512x512` | 0.25 | 1:1 |
| `768x768` | 0.56 | 1:1 |
| `1024x1024` | 1.0 | 1:1 |
| `1024x768` | 0.75 | 4:3 |
| `768x1024` | 0.75 | 3:4 |

Any other size string is rejected with a validation error.

### Response Fields

Both transports return the same response shape:

```typescript
interface GenerateImageResponse {
  image: string;               // Base64-encoded PNG image data
  model: string;               // Model used (e.g., "flux2-klein-4b")
  size: string;                // Output size (e.g., "1024x1024")
  steps: number;               // Inference steps actually used
  seed: number;                // Random seed used (useful for reproducibility)
  processingTimeMs: number;    // Server-side generation time in milliseconds
  safety: SafetyInfo;          // Safety classification results
  provider: string;            // Always "host"
  chainId: number;             // Blockchain chain ID
  chainName: string;           // Human-readable chain name (e.g., "Base Sepolia")
  nativeToken: string;         // Native token symbol (e.g., "ETH")
  billing: BillingInfo;        // Billing breakdown
}

interface SafetyInfo {
  promptSafe: boolean;         // true if prompt passed all safety checks
  outputSafe: boolean;         // true if generated image passed safety checks
  safetyLevel: string;         // Safety level used ("strict", "moderate", "permissive")
}

interface BillingInfo {
  generationUnits: number;     // Total billing units consumed
  modelMultiplier: number;     // Model-specific cost multiplier (1.0 for FLUX Klein)
  megapixels: number;          // Output image megapixels
  steps: number;               // Inference steps used
}
```

---

## Encrypted WebSocket Integration (Recommended)

Image generation over WebSocket uses the **same end-to-end encrypted channel** as inference, RAG, and vision. All requests and responses (including errors) are encrypted with XChaCha20-Poly1305 using the session key established during `encrypted_session_init`.

> **Why use this over HTTP?** The HTTP endpoint transmits the generated image as plaintext Base64 over the wire. The WebSocket endpoint encrypts everything — the prompt going up, the image coming back, and even error messages. For production use, always prefer the encrypted WebSocket.

### Prerequisites

The SDK must have an active encrypted session before sending image generation messages:

1. Connect to the WebSocket endpoint at `/v1/ws`
2. Complete the `encrypted_session_init` handshake (ECDH key exchange on secp256k1)
3. Receive and store the 32-byte session key

See [SDK Encryption Integration Guide](./SDK_ENCRYPTION_INTEGRATION.md) for the full handshake protocol.

### Step 1: Build the Inner Payload

The inner JSON contains `"action": "image_generation"` as a routing key. This tells the node to route the message to the image generation handler instead of the inference pipeline.

```typescript
const innerPayload = {
  action: "image_generation",       // Required: routing key (MUST be present)
  prompt: "A cat astronaut floating in space",
  size: "512x512",                  // Optional (default: "1024x1024")
  steps: 4,                         // Optional (default: 4)
  seed: 42,                         // Optional (random if omitted)
  negativePrompt: "blurry",         // Optional
  guidanceScale: 3.5,               // Optional (default: 3.5)
  safetyLevel: "strict",            // Optional (default: "strict")
  chainId: 84532,                   // Optional (default: 84532)
};
```

### Step 2: Encrypt and Send

Encrypt the inner payload with the session key, then wrap it in an `encrypted_message` envelope:

```typescript
// Encrypt
const plaintext = new TextEncoder().encode(JSON.stringify(innerPayload));
const nonce = crypto.getRandomValues(new Uint8Array(24));  // Fresh nonce every time!
const aad = new TextEncoder().encode(`message_${messageIndex}`);
const ciphertext = xchacha20poly1305(sessionKey, nonce).encrypt(plaintext, aad);

// Send
ws.send(JSON.stringify({
  type: "encrypted_message",
  session_id: sessionId,
  id: messageId,                     // Optional: echoed back in response
  payload: {
    ciphertextHex: bytesToHex(ciphertext),
    nonceHex: bytesToHex(nonce),
    aadHex: bytesToHex(aad),
  }
}));
```

> **Important**: The AAD for the **outgoing** `encrypted_message` follows the same pattern as inference messages (`message_${index}`). The node decrypts with whatever AAD you sent. The **response** from the node uses a different AAD (`encrypted_image_response`) — see below.

### Step 3: Receive and Decrypt the Response

The node responds with an `encrypted_response` envelope. The SDK must decrypt the payload to access the result.

```typescript
ws.onmessage = async (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === "encrypted_response" && msg.session_id) {
    // Decrypt the payload
    const ct = hexToBytes(msg.payload.ciphertextHex);
    const nonce = hexToBytes(msg.payload.nonceHex);
    const aad = hexToBytes(msg.payload.aadHex);  // "encrypted_image_response"
    const plaintext = xchacha20poly1305(sessionKey, nonce).decrypt(ct, aad);
    const inner = JSON.parse(new TextDecoder().decode(plaintext));

    if (inner.type === "image_generation_result") {
      // Success — display the image
      const img = new Image();
      img.src = `data:image/png;base64,${inner.image}`;
      container.appendChild(img);

      console.log(`Model: ${inner.model}`);
      console.log(`Generated in ${inner.processingTimeMs}ms, seed=${inner.seed}`);
      console.log(`Billing: ${inner.billing.generationUnits} units`);
      console.log(`Chain: ${inner.chainName} (${inner.chainId})`);

    } else if (inner.type === "image_generation_error") {
      // Error — handle by code
      handleImageGenError(inner.error.code, inner.error.message);
    }
  }
};
```

### Decryption Details

| Direction | AAD Value | Notes |
|-----------|-----------|-------|
| SDK → Node (encrypted_message) | `message_${index}` | Same AAD pattern as inference messages |
| Node → SDK (encrypted_response) | `encrypted_image_response` | Fixed string; hex-encoded in `aadHex` |

The `encrypted_response` envelope structure:

```json
{
  "type": "encrypted_response",
  "session_id": "session-abc-123",
  "id": "msg-42",
  "payload": {
    "ciphertextHex": "a1b2c3...",
    "nonceHex": "d4e5f6...",
    "aadHex": "656e637279707465645f696d6167655f726573706f6e7365"
  }
}
```

- `session_id` — echoed from the request
- `id` — echoed from the request's `id` field (if provided)
- `payload.aadHex` — hex encoding of `"encrypted_image_response"` (used to decrypt)

### Decrypted Success Response

After decryption, the inner JSON for a successful generation:

```json
{
  "type": "image_generation_result",
  "image": "<base64 PNG>",
  "model": "flux2-klein-4b",
  "size": "512x512",
  "steps": 4,
  "seed": 42,
  "processingTimeMs": 650,
  "safety": {
    "promptSafe": true,
    "outputSafe": true,
    "safetyLevel": "strict"
  },
  "billing": {
    "generationUnits": 0.05,
    "modelMultiplier": 1.0,
    "megapixels": 0.25,
    "steps": 4
  },
  "provider": "host",
  "chainId": 84532,
  "chainName": "Base Sepolia",
  "nativeToken": "ETH"
}
```

### Decrypted Error Response

All errors are **encrypted** — no plaintext error leakage over the wire:

```json
{
  "type": "image_generation_error",
  "error": {
    "code": "PROMPT_BLOCKED",
    "message": "Blocked keyword detected: gore"
  }
}
```

### WebSocket Error Codes

| Code | Cause | SDK Action |
|------|-------|------------|
| `RATE_LIMIT_EXCEEDED` | Too many requests in the sliding window (default: 5/min per session) | Show rate limit message, retry after cooldown |
| `VALIDATION_FAILED` | Empty prompt, invalid size, steps out of range, or malformed JSON | Show validation error to user |
| `PROMPT_BLOCKED` | Keyword safety filter blocked the prompt | Show safety warning with reason |
| `DIFFUSION_SERVICE_UNAVAILABLE` | No diffusion sidecar configured on this host | Hide image generation UI |
| `IMAGE_GENERATION_FAILED` | Sidecar generation error (timeout, OOM, etc.) | Retry once, then show error |
| `ENCRYPTION_FAILED` | Failed to encrypt response (extremely rare) | Reconnect and re-establish session |

### Complete Example: WebSocket Image Generation

```typescript
class ImageGenerator {
  private ws: WebSocket;
  private sessionKey: Uint8Array;
  private sessionId: string;
  private messageIndex: number = 0;

  /**
   * Generate an image over the encrypted WebSocket channel.
   * Returns a promise that resolves with the decrypted response.
   */
  async generate(prompt: string, options: Partial<ImageGenOptions> = {}): Promise<ImageGenResult> {
    return new Promise((resolve, reject) => {
      const msgId = `img-${Date.now()}`;

      // Build inner payload
      const inner = {
        action: "image_generation",
        prompt,
        size: options.size ?? "1024x1024",
        steps: options.steps ?? 4,
        ...(options.seed !== undefined && { seed: options.seed }),
        ...(options.negativePrompt && { negativePrompt: options.negativePrompt }),
        ...(options.guidanceScale !== undefined && { guidanceScale: options.guidanceScale }),
        safetyLevel: options.safetyLevel ?? "strict",
        chainId: options.chainId ?? 84532,
      };

      // Encrypt
      const plaintext = new TextEncoder().encode(JSON.stringify(inner));
      const nonce = crypto.getRandomValues(new Uint8Array(24));
      const aad = new TextEncoder().encode(`message_${this.messageIndex++}`);
      const ciphertext = this.encrypt(plaintext, nonce, aad);

      // Listen for response
      const handler = async (event: MessageEvent) => {
        const msg = JSON.parse(event.data);
        if (msg.type !== "encrypted_response" || msg.id !== msgId) return;

        this.ws.removeEventListener("message", handler);

        try {
          const ct = hexToBytes(msg.payload.ciphertextHex);
          const respNonce = hexToBytes(msg.payload.nonceHex);
          const respAad = hexToBytes(msg.payload.aadHex);
          const decrypted = this.decrypt(ct, respNonce, respAad);
          const result = JSON.parse(new TextDecoder().decode(decrypted));

          if (result.type === "image_generation_result") {
            resolve(result);
          } else if (result.type === "image_generation_error") {
            reject(new ImageGenError(result.error.code, result.error.message));
          }
        } catch (e) {
          reject(new Error(`Decryption failed: ${e}`));
        }
      };

      this.ws.addEventListener("message", handler);

      // Send
      this.ws.send(JSON.stringify({
        type: "encrypted_message",
        session_id: this.sessionId,
        id: msgId,
        payload: {
          ciphertextHex: bytesToHex(ciphertext),
          nonceHex: bytesToHex(nonce),
          aadHex: bytesToHex(aad),
        }
      }));

      // Timeout after 30 seconds
      setTimeout(() => {
        this.ws.removeEventListener("message", handler);
        reject(new Error("Image generation timed out"));
      }, 30_000);
    });
  }

  private encrypt(plaintext: Uint8Array, nonce: Uint8Array, aad: Uint8Array): Uint8Array {
    return xchacha20poly1305(this.sessionKey, nonce).encrypt(plaintext, aad);
  }

  private decrypt(ciphertext: Uint8Array, nonce: Uint8Array, aad: Uint8Array): Uint8Array {
    return xchacha20poly1305(this.sessionKey, nonce).decrypt(ciphertext, aad);
  }
}

// Usage
const generator = new ImageGenerator(ws, sessionKey, sessionId);

try {
  const result = await generator.generate("A sunset over mountains", {
    size: "1024x1024",
    steps: 4,
  });

  showImage(result.image);
  showSeed(result.seed);
  showCost(result.billing.generationUnits);
} catch (error) {
  if (error instanceof ImageGenError) {
    switch (error.code) {
      case "PROMPT_BLOCKED":     showSafetyWarning(error.message); break;
      case "RATE_LIMIT_EXCEEDED": showRateLimitMessage(); break;
      default:                   showError(error.message);
    }
  }
}
```

---

## HTTP Integration (Testing Only)

> **Warning**: The HTTP endpoint transmits images as plaintext Base64. Use the [Encrypted WebSocket](#encrypted-websocket-integration-recommended) for production.

### Endpoint

```
POST /v1/images/generate
Content-Type: application/json
```

### Example: Basic Image Generation

```javascript
const response = await fetch('http://host:8080/v1/images/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'A serene mountain lake at golden hour, photorealistic',
    size: '1024x1024',
    steps: 4,
  }),
});

if (!response.ok) {
  const error = await response.text();
  console.error('Generation failed:', response.status, error);
  return;
}

const result = await response.json();

// Display the image
const img = document.createElement('img');
img.src = `data:image/png;base64,${result.image}`;
document.body.appendChild(img);

console.log(`Generated in ${result.processingTimeMs}ms, seed=${result.seed}`);
console.log(`Billing: ${result.billing.generationUnits} units`);
```

### Example: Reproducible Generation with Seed

```javascript
// Generate the same image twice using a fixed seed
const request = {
  prompt: 'A cyberpunk cityscape with neon lights',
  size: '1024x768',
  steps: 8,
  seed: 12345,
  guidanceScale: 4.0,
};

const result1 = await generateImage(request);
const result2 = await generateImage(request);

// result1.image === result2.image (same seed = same output)
```

### HTTP Status Codes

| Status | Cause | SDK Action |
|--------|-------|------------|
| `200` | Success | Display image, record billing |
| `400` | Empty prompt, invalid size, steps out of range, or prompt blocked by safety filter | Show validation error to user |
| `500` | Sidecar generation failure | Retry once, then show error |
| `503` | Diffusion sidecar not configured or unavailable | Hide image generation UI or show "unavailable" badge |

### HTTP Error Response Body

Error responses return a plain text string:

```javascript
if (!response.ok) {
  const errorMessage = await response.text();
  // e.g., "prompt must not be empty"
  // e.g., "Prompt blocked: contains blocked keyword in category 'violence'"
}
```

---

## Billing Formula

Generation units determine how much a request costs:

```
generationUnits = (width * height / 1,048,576) * (steps / 20) * modelMultiplier
```

Where:
- **1,048,576** = 1024 * 1024 (1 megapixel baseline)
- **20** = baseline step count
- **modelMultiplier** = 1.0 for FLUX Klein (premium models may have higher multipliers)

### Quick Reference

| Size | Steps | Generation Units |
|------|-------|-----------------|
| 256x256 | 4 | 0.013 |
| 512x512 | 4 | 0.05 |
| 512x512 | 20 | 0.25 |
| 1024x1024 | 4 | 0.20 |
| 1024x1024 | 20 | 1.00 |
| 1024x1024 | 50 | 2.50 |
| 1024x768 | 4 | 0.15 |

### SDK Billing Helper

```javascript
function estimateGenerationUnits(width, height, steps, modelMultiplier = 1.0) {
  const megapixels = (width * height) / 1_048_576;
  const stepFactor = steps / 20;
  return megapixels * stepFactor * modelMultiplier;
}

function parseSize(sizeStr) {
  const [w, h] = sizeStr.split('x').map(Number);
  return { width: w, height: h };
}

// Show cost preview before generating
function onSettingsChange(size, steps) {
  const { width, height } = parseSize(size);
  const units = estimateGenerationUnits(width, height, steps);
  costLabel.textContent = `~${units.toFixed(2)} generation units`;
}
```

---

## Safety Levels

The `safetyLevel` field controls content filtering strictness:

| Level | Blocked Categories | Use Case |
|-------|-------------------|----------|
| `strict` (default) | Sexual, Violence, Illegal, Self-Harm | General-purpose, public-facing |
| `moderate` | Sexual, Illegal, Self-Harm | Creative/artistic applications |
| `permissive` | Illegal, Self-Harm | Research, professional contexts |

### Blocked Categories

| Category | Description |
|----------|-------------|
| `sexual` | Sexually explicit or suggestive content |
| `violence` | Graphic violence or gore |
| `illegal` | Content promoting illegal activities |
| `self_harm` | Content promoting self-harm or suicide |
| `hate_speech` | Discriminatory or hateful content |
| `child_safety` | Any content involving minors inappropriately |
| `deception` | Deepfakes, impersonation, misinformation |

> `child_safety` and `deception` are blocked at **all** safety levels and cannot be unblocked.

---

## Rate Limiting

Image generation requests are rate-limited **per session** using a sliding window:

| Parameter | Default | Configurable |
|-----------|---------|-------------|
| Max requests per window | 5 | Yes (`IMAGE_GEN_RATE_LIMIT` env var on host) |
| Window duration | 60 seconds | No (fixed) |

When the rate limit is exceeded:
- **WebSocket**: encrypted error with code `RATE_LIMIT_EXCEEDED`
- **HTTP**: not currently rate-limited at the application layer (relies on the existing connection-level rate limiter)

### Recommended SDK Behaviour

```javascript
// Track request timestamps client-side to avoid unnecessary rejections
const recentRequests = [];
const RATE_LIMIT = 5;
const WINDOW_MS = 60_000;

function canGenerate() {
  const now = Date.now();
  const recent = recentRequests.filter(t => now - t < WINDOW_MS);
  return recent.length < RATE_LIMIT;
}

function recordRequest() {
  recentRequests.push(Date.now());
  // Prune old entries
  const now = Date.now();
  while (recentRequests.length > 0 && now - recentRequests[0] >= WINDOW_MS) {
    recentRequests.shift();
  }
}
```

---

## Recommended SDK UI Patterns

### 1. Feature-Gated UI

```javascript
async function initImageGenUI(hostUrl) {
  const version = await fetch(`${hostUrl}/v1/version`).then(r => r.json());

  if (!version.features.includes('image-generation')) {
    hideImageGenTab();
    return;
  }

  showImageGenTab();

  // Determine transport
  if (version.features.includes('websocket-image-generation')) {
    useEncryptedWebSocket();  // Preferred
  } else if (version.features.includes('http-image-generation')) {
    useHttpFallback();        // Testing only
  }
}
```

### 2. Loading State

Image generation takes 0.5-5 seconds depending on steps and size:

```javascript
async function generateWithUI(prompt, options = {}) {
  showSpinner('Generating image...');

  try {
    const result = await generator.generate(prompt, options);
    displayImage(result.image);
    showMetadata(
      `${result.processingTimeMs}ms | ` +
      `${result.billing.generationUnits} units | ` +
      `seed: ${result.seed}`
    );
  } catch (error) {
    if (error.code === 'PROMPT_BLOCKED') {
      showWarning(error.message);
    } else if (error.code === 'DIFFUSION_SERVICE_UNAVAILABLE') {
      showError('Image generation is not available on this host');
    } else if (error.code === 'RATE_LIMIT_EXCEEDED') {
      showWarning('Rate limit reached. Please wait a moment.');
    } else {
      showError('Generation failed. Please try again.');
    }
  } finally {
    hideSpinner();
  }
}
```

### 3. Seed Display for Reproducibility

Always display the returned `seed` so users can regenerate the same image:

```javascript
const result = await generator.generate('A sunset');
showSeedBadge(result.seed);  // User can copy this and pass it back
```

### 4. Cost Preview

Show estimated cost before generating:

```javascript
function onSettingsChange(size, steps) {
  const { width, height } = parseSize(size);
  const units = estimateGenerationUnits(width, height, steps);
  costLabel.textContent = `~${units.toFixed(2)} generation units`;
}
```

---

## Migration Notes

### From No Image Generation (pre-v8.16.0)

This is a new feature with no breaking changes to existing endpoints. Existing inference, OCR, describe-image, and web search endpoints are unchanged.

### Choosing a Transport

| Scenario | Use |
|----------|-----|
| Production SDK builds | Encrypted WebSocket |
| Local development / debugging | HTTP POST (simpler, no encryption setup) |
| Testing safety filters | Either (both run the same safety pipeline) |
| CI/CD integration tests | HTTP POST (stateless, no session handshake needed) |

### Environment Variables (Host-Side)

SDK developers do not need to configure these, but may want to document them for host operators:

| Variable | Default | Description |
|----------|---------|-------------|
| `DIFFUSION_ENDPOINT` | *(unset)* | SGLang sidecar URL. If unset, image generation is disabled. |
| `DIFFUSION_MODEL_NAME` | `flux2-klein-4b` | Model identifier returned in responses |
| `DIFFUSION_MODEL_PATH` | `./models/flux2-klein-4b` | Host filesystem path to model weights (Docker volume mount) |
| `IMAGE_GEN_RATE_LIMIT` | `5` | Maximum image generation requests per minute per session |

---

## Related Documentation

- [SDK Encryption Integration Guide](./SDK_ENCRYPTION_INTEGRATION.md) — full ECDH handshake and encryption protocol
- [Node Encryption Guide](./NODE_ENCRYPTION_GUIDE.md) — node-side encryption configuration
- [S5 Vector Loading Guide](./S5_VECTOR_LOADING.md) — vector storage for RAG sessions

---

## Changelog

- **v8.16.0** (Feb 15, 2026): Initial release
  - HTTP `POST /v1/images/generate` endpoint
  - Encrypted WebSocket image generation via `encrypted_message` with `"action": "image_generation"` routing
  - All WebSocket responses (success + errors) encrypted with XChaCha20-Poly1305 (AAD: `encrypted_image_response`)
  - Keyword safety filter (Layer 1 of 3)
  - Billing with megapixel-steps formula
  - Per-session rate limiting (sliding window, default 5/min)
  - 6 supported output sizes (256x256 to 1024x1024)
  - FLUX.2 Klein 4B model support (Apache 2.0, ~13GB VRAM)
