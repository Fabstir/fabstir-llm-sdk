# Web Search Integration Guide for UI

## Overview

The SDK now supports **automatic web search** that enhances LLM responses with real-time information from the web. This feature works transparently - **no UI changes are required for basic functionality**. The SDK automatically detects when a user's prompt needs web search and enables it.

**SDK Version**: `fabstir-sdk-core-1.8.1.tgz`
**Node Requirement**: v8.7.5+ (for encrypted session support)

---

## Quick Summary

| Aspect | Details |
|--------|---------|
| **User Experience** | Users just type naturally - "search for latest GPU prices" triggers web search automatically |
| **UI Changes Required** | None for basic functionality; optional visual indicators recommended |
| **Encryption Support** | Works with encrypted sessions (default) |
| **Override Controls** | Optional - can add UI toggles if desired |

---

## How It Works

### Automatic Intent Detection

The SDK analyzes each prompt and automatically enables web search when it detects search intent:

```
User types: "What are the latest NVIDIA RTX 5090 specs?"
                    ↓
SDK detects: "latest" keyword → search intent
                    ↓
SDK sends: web_search: true (automatically)
                    ↓
Node performs web search → injects results → LLM responds with fresh data
                    ↓
User receives: Answer with real-time information
```

**Trigger Patterns Detected:**
- **Keywords**: `search`, `find`, `look up`, `google`, `check online`
- **Time references**: `latest`, `recent`, `current`, `today`, `2025`, `2026`
- **News patterns**: `news about`, `what happened`

### What This Means for Your UI

**No code changes required** for the basic flow. The existing `sendPromptStreaming()` call will automatically use web search when appropriate.

**Both calling patterns work** - with or without the `onToken` callback:

```typescript
// Pattern 1: With streaming callback (real-time token display)
await sessionManager.sendPromptStreaming(
  sessionId,
  userInput,  // "Search for latest AI news" → auto web search
  (token) => {
    appendToResponse(token);  // Display tokens as they arrive
  }
);

// Pattern 2: Without callback (wait for full response) - used by test harness
const response = await sessionManager.sendPromptStreaming(
  sessionId,
  userInput  // "Search for latest AI news" → auto web search
);
// response contains the full LLM response
```

Both patterns support automatic web search detection.

---

## Recommended UI Enhancements

While not required, these enhancements improve user experience:

### 1. Web Search Indicator (Recommended)

Show users when their query triggered a web search. Here's the pattern from the working test harness:

**Step 1: Define the type inline** (avoids import resolution issues):

```typescript
// Define inline in your component file
interface WebSearchMetadata {
  performed: boolean;
  queriesCount: number;
  provider: string | null;
}
```

**Step 2: Extend your message type:**

```typescript
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  webSearchMetadata?: WebSearchMetadata;  // Add this field
}
```

**Step 3: Capture metadata after response** (note the `as any` cast - `getSession` is on concrete class):

```typescript
// After sendPromptStreaming completes
let webSearchMeta: WebSearchMetadata | undefined;
try {
  // IMPORTANT: Cast to any because getSession is on concrete class, not interface
  const session = (sessionManager as any).getSession?.(sessionId.toString());
  if (session?.webSearchMetadata) {
    webSearchMeta = session.webSearchMetadata;
    console.log("[WebSearch] Metadata captured:", webSearchMeta);
  }
} catch (e) {
  // Session might not have getSession method in all cases
}

// Add to your message
addMessage("assistant", response, tokens, webSearchMeta);
```

**Step 4: Display the indicator** (from working test harness):

```tsx
{/* Web Search Indicator */}
{msg.webSearchMetadata?.performed && (
  <span
    className="text-xs text-purple-500 ml-2"
    title={`Web search via ${msg.webSearchMetadata.provider || 'unknown'}`}
  >
    🔍 {msg.webSearchMetadata.provider || 'web'} ({msg.webSearchMetadata.queriesCount} {msg.webSearchMetadata.queriesCount === 1 ? 'query' : 'queries'})
  </span>
)}
```

This shows: `🔍 brave (2 queries)` next to responses that used web search.

### 2. Loading State Enhancement (Optional)

Show a different loading state when web search is likely:

```typescript
// Detect if prompt will trigger web search (before sending)
import { analyzePromptForSearchIntent } from '@fabstir/sdk-core';

const willSearch = analyzePromptForSearchIntent(userInput);

if (willSearch) {
  setLoadingMessage('Searching the web...');
} else {
  setLoadingMessage('Thinking...');
}
```

### 3. Manual Override Toggle (Optional)

If you want to give users explicit control:

```tsx
function ChatInput({ onSend }) {
  const [forceWebSearch, setForceWebSearch] = useState(false);
  const [prompt, setPrompt] = useState('');

  const handleSend = () => {
    onSend(prompt, {
      webSearch: forceWebSearch ? { forceEnabled: true } : undefined
    });
  };

  return (
    <div className="chat-input">
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <label>
        <input
          type="checkbox"
          checked={forceWebSearch}
          onChange={(e) => setForceWebSearch(e.target.checked)}
        />
        Force web search
      </label>
      <button onClick={handleSend}>Send</button>
    </div>
  );
}
```

Then in your send handler:

```typescript
async function handleSendMessage(prompt: string, options?: { webSearch?: { forceEnabled?: boolean } }) {
  await sessionManager.sendPromptStreaming(
    sessionId,
    prompt,
    onToken,
    options  // Pass through web search options
  );
}
```

---

## TypeScript Types

Key types you may want to use:

```typescript
// Import from SDK
import type {
  SearchIntentConfig,
  WebSearchMetadata,
  SearchApiResponse,
  WebSearchCapabilities
} from '@fabstir/sdk-core';

// Search configuration (for override controls)
interface SearchIntentConfig {
  forceEnabled?: boolean;   // Force web search on
  forceDisabled?: boolean;  // Force web search off
  autoDetect?: boolean;     // Enable/disable auto-detection (default: true)
  maxSearches?: number;     // Limit number of searches (default: 5)
  queries?: string[];       // Custom search queries
}

// Metadata returned after search
interface WebSearchMetadata {
  performed: boolean;       // Was web search performed?
  provider: string | null;  // 'brave', 'duckduckgo', 'bing', null
  queriesCount: number;     // Number of searches made
}

// Search results (if using direct search)
interface SearchApiResponse {
  results: Array<{
    title: string;
    url: string;
    content: string;
    score?: number;
  }>;
  query: string;
  search_provider: string;
  timestamp: number;
}
```

---

## Direct Search API (Advanced)

If you want to let users perform explicit web searches:

```typescript
// Direct search via HTTP
const results = await sessionManager.searchDirect(
  sessionId,
  'NVIDIA RTX 5090 specifications',
  { numResults: 10 }
);

// Display results
results.results.forEach(result => {
  console.log(`${result.title}: ${result.url}`);
});
```

---

## Checking Host Capabilities

Before relying on web search, verify the host supports it:

```typescript
const hostManager = sdk.getHostManager();
const capabilities = await hostManager.getWebSearchCapabilities(hostUrl);

if (capabilities.supportsWebSearch) {
  console.log(`Web search available via ${capabilities.provider}`);
  console.log(`Rate limit: ${capabilities.rateLimitPerMinute}/min`);
} else {
  console.log('Host does not support web search');
  // Hide web search UI elements
}
```

---

## Error Handling

Handle web search errors gracefully:

```typescript
import { WebSearchError } from '@fabstir/sdk-core';

try {
  await sessionManager.sendPromptStreaming(sessionId, prompt, onToken);
} catch (error) {
  if (error instanceof WebSearchError) {
    switch (error.code) {
      case 'rate_limited':
        showToast('Search rate limited. Please wait a moment.');
        break;
      case 'timeout':
        showToast('Search timed out. Response generated without web data.');
        break;
      case 'provider_error':
        // Search failed but inference continues without web data
        break;
      case 'not_supported':
        // Host doesn't support web search
        break;
    }
  }
}
```

---

## Testing

### Verify Web Search is Working

1. **Start a session** (encryption enabled by default)
2. **Send a prompt with search trigger**: "Search for the latest GPU benchmarks"
3. **Check response**: Should contain recent/real-time information
4. **Check metadata**: `session.webSearchMetadata.performed` should be `true`

### Test Prompts

| Prompt | Should Trigger Search |
|--------|----------------------|
| "Search for latest AI news" | Yes |
| "What is 2+2?" | No |
| "Current Bitcoin price" | Yes |
| "Explain photosynthesis" | No |
| "News about Tesla today" | Yes |
| "Write a poem about cats" | No |
| "What happened in tech 2026" | Yes |

---

## Important Notes

### Encrypted Sessions

Web search works with encrypted sessions (the default). The SDK sends `web_search: true` at the message level (outside the encrypted payload), so the node can perform the search while keeping your prompt content encrypted.

### No Visual Change for Users

From the user's perspective, they just type naturally. They don't need to know about web search - it "just works" when needed.

### Rate Limiting

Hosts may rate limit web searches (typically 60/minute). The SDK handles this gracefully - if rate limited, the LLM still responds but without web data.

### Fallback Behavior

If web search fails for any reason:
- The LLM still generates a response
- The response uses the LLM's training data instead of live web data
- No error is thrown to the user

---

## Migration Checklist

1. [ ] Update SDK: `pnpm add /path/to/fabstir-sdk-core-1.8.1.tgz`
2. [ ] Verify node is v8.7.5+ (ask backend team)
3. [ ] Test with search-triggering prompts
4. [ ] (Optional) Add web search indicator to UI
5. [ ] (Optional) Add loading state differentiation
6. [ ] (Optional) Add manual override toggle

---

## Files to Reference

- `apps/harness/pages/chat-context-rag-demo.tsx` - Working example with web search
- `docs/SDK_API.md` - Full API documentation (see "Web Search Integration" section)
- `packages/sdk-core/src/utils/search-intent-analyzer.ts` - Intent detection logic

---

## Questions?

The web search feature is designed to be invisible to users while providing better answers. If you have questions about integration, refer to the test harness at `apps/harness/pages/chat-context-rag-demo.tsx` which demonstrates the full flow.
