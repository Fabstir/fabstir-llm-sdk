# Image Generation Integration Guide for UI

## Overview

The SDK now supports **text-to-image generation** using host-side FLUX.2 diffusion models. Image generation uses the same E2E encrypted WebSocket channel as LLM inference — prompts and generated images are encrypted end-to-end with XChaCha20-Poly1305.

**SDK Version**: `@fabstir/sdk-core` v1.13.5+
**Node Requirement**: v8.16.0+ (routes `action: "image_generation"` to diffusion sidecar)

---

## Quick Summary

| Aspect | Details |
|--------|---------|
| **User Experience** | User types a prompt, selects size/steps, clicks Generate, sees the image |
| **Transport** | E2E encrypted WebSocket (same session as chat) |
| **Diffusion Model** | FLUX.2 Klein 4B via host sidecar |
| **Output** | Base64-encoded PNG returned in `ImageGenerationResult.image` |
| **Rate Limiting** | Client-side 5 requests/minute sliding window |
| **Billing** | Per megapixel-steps formula (returned in result) |

---

## How It Works

```
User types: "A cat astronaut floating in space"
                    ↓
SDK validates: prompt length, image size, steps range
                    ↓
SDK encrypts: { action: "image_generation", prompt, size, steps }
                    ↓
WebSocket sends: encrypted_message → Host Node
                    ↓
Host routes: action: "image_generation" → FLUX.2 diffusion sidecar
                    ↓
Host returns: encrypted_response → { type: "image_generation_result", image: "<base64 PNG>", ... }
                    ↓
SDK decrypts: returns ImageGenerationResult
                    ↓
UI displays: <img src="data:image/png;base64,..." />
```

---

## SDK API

### Core Method: `generateImage()`

```typescript
const sessionManager = await sdk.getSessionManager();

const result = await sessionManager.generateImage(
  sessionId,          // Active encrypted session ID (string)
  'A cat astronaut',  // Prompt (1-2000 characters)
  {
    size: '512x512',  // Optional, default '1024x1024'
    steps: 4,         // Optional, default 4 (range 1-100)
  }
);

// result.image is a base64-encoded PNG string
const imgSrc = `data:image/png;base64,${result.image}`;
```

### Response: `ImageGenerationResult`

```typescript
interface ImageGenerationResult {
  image: string;            // Base64-encoded PNG — display with data:image/png;base64,...
  model: string;            // Model used (e.g. 'stable-diffusion-xl')
  size: string;             // Actual size generated (e.g. '512x512')
  steps: number;            // Diffusion steps used
  seed: number;             // Seed (for reproducibility)
  processingTimeMs: number; // Generation time in milliseconds
  safety: {
    promptSafe: boolean;    // Did prompt pass safety check
    outputSafe: boolean;    // Did output pass safety check
    safetyLevel: 'strict' | 'moderate' | 'permissive';
  };
  billing: {
    generationUnits: number;   // Cost in generation units
    modelMultiplier: number;   // Model cost multiplier
    megapixels: number;        // Image megapixels
    steps: number;             // Steps used in billing calc
  };
  provider: string;         // Host address that generated the image
  chainId: number;
  chainName: string;
  nativeToken: string;
}
```

### Options: `ImageGenerationOptions`

```typescript
interface ImageGenerationOptions {
  size?: ImageSize;          // Image dimensions (see allowed sizes below)
  steps?: number;            // Diffusion steps: 1-100, default 4
  model?: string;            // Model override (optional)
  seed?: number;             // Seed for reproducibility (optional)
  negativePrompt?: string;   // What to avoid in the image (optional)
  guidanceScale?: number;    // Classifier-free guidance scale (optional)
  safetyLevel?: 'strict' | 'moderate' | 'permissive';  // Default: 'strict'
}
```

### Allowed Image Sizes

```typescript
import { ALLOWED_IMAGE_SIZES } from '@fabstir/sdk-core';

// ALLOWED_IMAGE_SIZES = ['256x256', '512x512', '768x768', '1024x1024', '1024x768', '768x1024']
```

| Size | Aspect | Use Case |
|------|--------|----------|
| `256x256` | 1:1 | Thumbnails, avatars |
| `512x512` | 1:1 | Standard (fast, recommended default for UI) |
| `768x768` | 1:1 | Higher quality square |
| `1024x1024` | 1:1 | Maximum quality square |
| `1024x768` | 4:3 | Landscape |
| `768x1024` | 3:4 | Portrait |

**Recommendation**: Default to `512x512` in the UI. It generates fast (~3s) and produces good quality. Users can select larger sizes for higher quality.

---

## Capability Detection

Before showing the image generation UI, check if the connected host supports it:

```typescript
const hostManager = sdk.getHostManager();
const capabilities = await hostManager.getImageGenerationCapabilities(
  hostAddress,  // Host's Ethereum address
  hostApiUrl    // Optional — resolved from contract if omitted
);

if (capabilities.supportsImageGeneration) {
  // Show image generation UI
  showImageGenerationPanel();
}
```

```typescript
interface ImageGenerationCapabilities {
  supportsImageGeneration: boolean;      // Host has FLUX.2 diffusion sidecar
  supportsEncryptedWebSocket: boolean;   // E2E encrypted path available
  supportsHttp: boolean;                 // HTTP path available (testing only)
  hasSafetyClassifier: boolean;          // Prompt safety checking enabled
  hasOutputClassifier: boolean;          // Output safety checking enabled
  hasBilling: boolean;                   // Billing computation enabled
  hasContentHashes: boolean;             // Content hashes generated
}
```

**Important**: Only show the image generation section when `capabilities.supportsImageGeneration` is `true`. Not all hosts have the FLUX.2 diffusion sidecar.

---

## Error Handling

```typescript
import { ImageGenerationError } from '@fabstir/sdk-core';

try {
  const result = await sessionManager.generateImage(sessionId, prompt, options);
  displayImage(result);
} catch (error) {
  if (error instanceof ImageGenerationError) {
    switch (error.code) {
      case 'VALIDATION_FAILED':
        // Bad input: empty prompt, invalid size, steps out of range
        showError('Invalid input: ' + error.message);
        break;

      case 'PROMPT_BLOCKED':
        // Safety classifier rejected the prompt
        showError('This prompt was blocked by the safety filter. Please try a different description.');
        break;

      case 'RATE_LIMIT_EXCEEDED':
        // Client-side rate limit (5 req/min)
        const waitSec = Math.ceil(error.retryAfter! / 1000);
        showError(`Rate limited. Please wait ${waitSec} seconds.`);
        break;

      case 'DIFFUSION_SERVICE_UNAVAILABLE':
        // Host's diffusion sidecar is down
        showError('Image generation is temporarily unavailable on this host.');
        break;

      case 'IMAGE_GENERATION_FAILED':
        // Generation failed (retryable)
        showError('Image generation failed. Please try again.');
        break;

      case 'ENCRYPTION_FAILED':
        // E2E encryption issue
        showError('Encryption error. Please restart the session.');
        break;
    }
  }
}
```

**Retryable errors**: `RATE_LIMIT_EXCEEDED` and `IMAGE_GENERATION_FAILED` — the `error.isRetryable` getter returns `true` for these. Show a retry button for these cases.

---

## UI Integration Guide

### Where to Add Image Generation

Image generation should be accessible from the **active chat session** view. Two approaches:

**Option A: Inline in Chat** (recommended)
- Add an image generation toggle/tab next to the message input
- Generated images appear as messages in the chat thread
- Natural conversational flow: "Generate me a picture of..."

**Option B: Separate Panel**
- Dedicated image generation section below or beside the chat
- Gallery of generated images with metadata
- This is what the test harness uses

### Component Architecture

```
ChatInterface
├── MessageBubble          (existing — extend for image messages)
│   └── ImageBubble        (NEW — renders generated image with metadata)
├── MessageInput           (existing — extend with image gen mode)
│   └── ImageGenControls   (NEW — size dropdown, steps, generate button)
└── ImageGallery           (NEW — optional history of generated images)
```

### 1. Extend ChatMessage Type

Add image data to your existing message type:

```typescript
// In message-bubble.tsx or a shared types file
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokens?: number;
  sources?: { /* existing RAG sources */ }[];

  // NEW: Image generation data
  generatedImage?: {
    image: string;           // Base64 PNG
    size: string;            // '512x512'
    steps: number;
    seed: number;
    processingTimeMs: number;
    billing?: {
      generationUnits: number;
    };
  };
}
```

### 2. Add Image Bubble to MessageBubble

Extend `message-bubble.tsx` to render images:

```tsx
// Inside MessageBubble component, after the text content:

{/* Generated Image */}
{message.generatedImage && (
  <div className="mt-3">
    <img
      src={`data:image/png;base64,${message.generatedImage.image}`}
      alt={message.content}
      className="rounded-lg max-w-full shadow-md"
      style={{ maxHeight: '512px' }}
    />
    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
      <span>{message.generatedImage.size}</span>
      <span>{message.generatedImage.steps} steps</span>
      <span>seed: {message.generatedImage.seed}</span>
      <span>{message.generatedImage.processingTimeMs}ms</span>
      {message.generatedImage.billing && (
        <span>{message.generatedImage.billing.generationUnits.toFixed(3)} units</span>
      )}
    </div>
  </div>
)}
```

### 3. Add Image Generation Controls

Extend `message-input.tsx` or create a new `ImageGenControls` component:

```tsx
import { ALLOWED_IMAGE_SIZES } from '@fabstir/sdk-core';
import { Image as ImageIcon } from 'lucide-react';

interface ImageGenControlsProps {
  onGenerate: (prompt: string, options: { size: string; steps: number }) => void;
  disabled?: boolean;
  loading?: boolean;
}

export function ImageGenControls({ onGenerate, disabled, loading }: ImageGenControlsProps) {
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('512x512');
  const [steps, setSteps] = useState(4);

  const handleGenerate = () => {
    if (prompt.trim() && !disabled && !loading) {
      onGenerate(prompt.trim(), { size, steps });
      setPrompt('');
    }
  };

  return (
    <div className="border-t border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <ImageIcon className="h-4 w-4 text-green-600" />
        <span className="text-sm font-medium text-green-900">Image Generation</span>
      </div>

      {/* Prompt Input */}
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
        placeholder="Describe the image you want to generate..."
        disabled={disabled || loading}
        className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-3 focus:ring-2 focus:ring-green-500"
      />

      <div className="flex items-center gap-3">
        {/* Size Dropdown */}
        <select
          value={size}
          onChange={(e) => setSize(e.target.value)}
          disabled={disabled || loading}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          {ALLOWED_IMAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Steps Input */}
        <div className="flex items-center gap-1">
          <label className="text-sm text-gray-600">Steps:</label>
          <input
            type="number"
            min={1}
            max={50}
            value={steps}
            onChange={(e) => setSteps(Number(e.target.value))}
            disabled={disabled || loading}
            className="w-16 border border-gray-300 rounded-lg px-2 py-2 text-sm"
          />
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || disabled || loading}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          {loading ? 'Generating...' : 'Generate'}
        </button>
      </div>
    </div>
  );
}
```

### 4. Wire Up in Chat Interface

In `chat-interface.tsx`, add the handler and controls:

```typescript
import { ImageGenerationError } from '@fabstir/sdk-core';
import type { ImageGenerationResult } from '@fabstir/sdk-core';

// State
const [isGeneratingImage, setIsGeneratingImage] = useState(false);
const [imageCapabilities, setImageCapabilities] = useState<any>(null);

// Check capabilities after session starts
async function checkImageCapabilities(hostAddress: string, hostApiUrl: string) {
  try {
    const hostManager = sdk.getHostManager();
    const caps = await hostManager.getImageGenerationCapabilities(hostAddress, hostApiUrl);
    setImageCapabilities(caps);
  } catch (e) {
    console.warn('Could not check image gen capabilities:', e);
  }
}

// Handler
async function handleGenerateImage(prompt: string, options: { size: string; steps: number }) {
  const sessionManager = sdk.getSessionManager();
  if (!sessionManager || !sessionId) return;

  setIsGeneratingImage(true);

  // Add user message showing the prompt
  addMessage({
    role: 'user',
    content: `[Image] ${prompt}`,
    timestamp: Date.now(),
  });

  try {
    const result: ImageGenerationResult = await sessionManager.generateImage(
      sessionId,
      prompt,
      { size: options.size as any, steps: options.steps }
    );

    // Add assistant message with the generated image
    addMessage({
      role: 'assistant',
      content: `Generated ${result.size} image in ${result.processingTimeMs}ms`,
      timestamp: Date.now(),
      generatedImage: {
        image: result.image,
        size: result.size,
        steps: result.steps,
        seed: result.seed,
        processingTimeMs: result.processingTimeMs,
        billing: result.billing
          ? { generationUnits: result.billing.generationUnits }
          : undefined,
      },
    });
  } catch (error: any) {
    let msg: string;
    if (error instanceof ImageGenerationError) {
      msg = `[${error.code}] ${error.message}`;
      if (error.retryAfter) {
        msg += ` (retry in ${Math.ceil(error.retryAfter / 1000)}s)`;
      }
    } else {
      msg = error.message;
    }

    addMessage({
      role: 'system',
      content: `Image generation failed: ${msg}`,
      timestamp: Date.now(),
    });
  } finally {
    setIsGeneratingImage(false);
  }
}
```

In the JSX, add the controls conditionally:

```tsx
{/* Existing Message Input */}
<MessageInput onSend={onSendMessage} disabled={loading} loading={loading} />

{/* Image Generation Controls — only show when host supports it */}
{imageCapabilities?.supportsImageGeneration && (
  <ImageGenControls
    onGenerate={handleGenerateImage}
    disabled={loading}
    loading={isGeneratingImage}
  />
)}
```

---

## TypeScript Imports

Everything you need from the SDK:

```typescript
// Types
import type {
  ImageGenerationResult,
  ImageGenerationOptions,
  ImageGenerationCapabilities,
  ImageSize,
  SafetyInfo,
  BillingInfo,
} from '@fabstir/sdk-core';

// Runtime values
import {
  ALLOWED_IMAGE_SIZES,       // Array of 6 valid size strings
  ImageGenerationError,       // Error class with .code, .retryAfter, .isRetryable
  isValidImageSize,           // Type guard: isValidImageSize('512x512') → true
  estimateGenerationUnits,    // Billing estimation helper
} from '@fabstir/sdk-core';
```

---

## Session ID Pattern

The test harness stores the session ID on the window object for popup-free Base Account Kit access:

```typescript
// After session starts
(window as any).__currentSessionId = sessionId;

// When calling generateImage
const currentSessionId = (window as any).__currentSessionId || sessionId;
await sessionManager.generateImage(currentSessionId.toString(), prompt, options);
```

Follow whatever session ID pattern your UI already uses for `sendPromptStreaming`. The same session ID works for both chat and image generation — they share the encrypted WebSocket connection.

---

## UX Recommendations

### Loading State
Image generation takes 2-6 seconds depending on size and steps. Show a meaningful loading state:
- Spinner with "Generating image..." text
- Disable the Generate button and input during generation
- Consider a progress indicator or estimated time

### Quick Prompts
Help users get started with preset prompt buttons:
```
"A cat astronaut floating in space"
"A serene mountain lake at golden hour"
"Cyberpunk city street at night, neon lights"
```

### Error Messages
Map error codes to user-friendly messages:

| Error Code | User-Facing Message |
|-----------|---------------------|
| `VALIDATION_FAILED` | "Please enter a valid prompt (1-2000 characters)" |
| `PROMPT_BLOCKED` | "This prompt was blocked by the safety filter. Try a different description." |
| `RATE_LIMIT_EXCEEDED` | "Please wait a moment before generating another image." |
| `DIFFUSION_SERVICE_UNAVAILABLE` | "Image generation is temporarily unavailable." |
| `IMAGE_GENERATION_FAILED` | "Generation failed. Please try again." |

### Image Display
- Show images at a reasonable max size (e.g. `max-height: 512px`)
- Allow clicking to view full size in a modal/lightbox
- Show metadata below: size, steps, seed, processing time, billing units
- The seed is useful for reproducibility — users can note it and reuse it

### Steps Guide for Users
| Steps | Speed | Quality | Recommended For |
|-------|-------|---------|-----------------|
| 1-4 | Fast (~2-3s) | Good | Quick previews, iteration |
| 8-12 | Medium (~5-8s) | Better | General use |
| 20-50 | Slow (~15-30s) | Best | Final quality images |

Default to 4 steps. Most users won't need to change this.

---

## Testing

### Verify Image Generation Works

1. **Start a session** with a host that has the FLUX.2 diffusion sidecar
2. **Check capabilities**: `getImageGenerationCapabilities()` should return `supportsImageGeneration: true`
3. **Generate an image**: Enter "A mountain landscape at sunset" with size 512x512, steps 4
4. **Verify result**: Image displays, metadata shows size/steps/seed/time/billing
5. **Test error handling**: Try an empty prompt — should show validation error

### Test Prompts

| Prompt | Expected |
|--------|----------|
| "A cat astronaut floating in space" | Generates successfully |
| "A serene mountain lake at golden hour" | Generates successfully |
| "" (empty) | VALIDATION_FAILED error |
| "x".repeat(2001) | VALIDATION_FAILED error (prompt too long) |

### Host Filtering

Not all hosts support image generation. The test harness uses a model filter to select the specific host with FLUX.2:

```typescript
// Model that the image-gen host serves as LLM
const IMAGE_GEN_HOST_MODEL = 'ggml-org/gpt-oss-120b-GGUF:gpt-oss-120b-mxfp4-00001-of-00003.gguf';
```

Your UI should use `getImageGenerationCapabilities()` after session start to determine whether to show the image generation panel, rather than hardcoding model filters.

---

## Migration Checklist

1. [ ] Ensure SDK is v1.13.5+ (`pnpm add @fabstir/sdk-core`)
2. [ ] Ensure node is v8.16.0+ (ask backend team)
3. [ ] Add `generatedImage` field to `ChatMessage` type
4. [ ] Extend `MessageBubble` to render base64 images
5. [ ] Create `ImageGenControls` component (prompt, size, steps, generate button)
6. [ ] Add `handleGenerateImage()` handler in chat interface
7. [ ] Add capability check after session starts
8. [ ] Conditionally show image gen controls when host supports it
9. [ ] Handle all `ImageGenerationError` codes with user-friendly messages
10. [ ] Test with a host that has FLUX.2 sidecar (node v8.16.0+)

---

## Files to Reference

- `apps/harness/pages/chat-context-rag-demo.tsx` — **Working reference implementation** with image generation UI
- `apps/ui4/components/chat/message-bubble.tsx` — Current message bubble (extend with image support)
- `apps/ui4/components/chat/message-input.tsx` — Current message input (extend or add image gen controls alongside)
- `apps/ui4/components/chat/chat-interface.tsx` — Main chat component (wire up handler here)
- `docs/SDK_API.md` — Full API docs (see "Image Generation" section)
- `docs/WEBSOCKET_PROTOCOL_GUIDE.md` — WebSocket message types (see messages 7-9)
- `packages/sdk-core/src/types/image-generation.types.ts` — All TypeScript types

---

## Questions?

The image generation feature shares the same encrypted session as chat — no separate connection or authentication needed. The test harness at `apps/harness/pages/chat-context-rag-demo.tsx` demonstrates the full working flow. If anything is unclear, that file is the definitive reference.
