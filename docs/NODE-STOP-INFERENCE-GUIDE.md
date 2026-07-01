# Node Implementation Guide: `stream_cancel` Message Support

## Context

The SDK (`@fabstir/sdk-core` v1.14.16+) adds a "Stop Inference" feature using `AbortController`. When the user clicks "Stop" in the UI, the SDK:

1. Sends a `{ type: "stream_cancel" }` message to the node via WebSocket (best-effort, fire-and-forget)
2. Unsubscribes its chunk handler client-side
3. Resolves the streaming promise with the partial response collected so far

**Without node support**: The SDK stop works purely client-side — the user sees inference stop immediately, but the node continues generating tokens until completion, wasting GPU cycles. Those tokens arrive on the WebSocket but the SDK's handler is already gone, so they're silently dropped.

**With node support**: The node actually stops the llama-cpp generation loop, frees GPU/KV cache resources, and responds with accurate token counts for billing.

See `docs/IMPLEMENTATION-STOP-INFERENCE.md` for the SDK-side implementation.

---

## 1. Message Specification

### Client → Server: `stream_cancel`

Always sent as a **plaintext top-level message**, even during encrypted sessions. The cancel message contains no sensitive data (just session_id and reason), so there is no need to encrypt it.

```json
{
  "type": "stream_cancel",
  "session_id": "active-session-uuid",
  "reason": "user_cancelled"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Always `"stream_cancel"` |
| `session_id` | string | Yes | Active session to cancel |
| `reason` | string | No | Why cancelled. Currently always `"user_cancelled"` |

### Server → Client: `stream_end` (on successful cancel)

After cancelling, send the standard `stream_end` with a `reason` field:

```json
{
  "type": "stream_end",
  "session_id": "active-session-uuid",
  "tokens_used": 47,
  "vlm_tokens": 0,
  "reason": "cancelled",
  "timestamp": 1740422400000
}
```

The `reason: "cancelled"` field is new. Existing `stream_end` messages have no `reason` field (or could use `reason: "complete"`). The SDK currently ignores this field but it's useful for logging and future billing.

---

## 2. Where to Add the Handler

In the WebSocket message dispatch (where `type` field is routed to handlers), add `stream_cancel` alongside the existing types:

```
Existing dispatch:
  "session_init"       → session_init_handler()
  "session_resume"     → resume_handler()
  "prompt"             → prompt_handler()
  "session_end"        → end_handler()
  "ping"               → pong_handler()
  "encrypted_message"  → decrypt → route by action

Add:
  "stream_cancel"      → stream_cancel_handler()
```

Note: `stream_cancel` is always a top-level plaintext message — no encrypted routing needed.

---

## 3. Cancellation Flag in Inference Loop

The core mechanism is an atomic boolean flag per session that the inference loop polls between tokens.

### Conceptual Pattern (Rust/Tokio):

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

struct SessionState {
    session_id: String,
    cancel_flag: Arc<AtomicBool>,
    tokens_generated: u64,
    // ... existing fields
}

// In the inference/token generation loop:
async fn run_inference(session: &SessionState, prompt: &str) -> InferenceResult {
    let mut tokens_generated = 0u64;

    for token in llama_cpp_stream(prompt) {
        // Generate and send the token
        tokens_generated += 1;
        send_stream_chunk(token, tokens_generated).await?;

        // >>> CHECK CANCELLATION BETWEEN TOKENS <<<
        if session.cancel_flag.load(Ordering::Acquire) {
            // Exit the loop — cleanup happens below
            break;
        }

        // Existing checkpoint logic
        if tokens_generated % 50 == 0 {
            submit_checkpoint(tokens_generated).await?;
        }
    }

    // Determine completion reason
    let reason = if session.cancel_flag.load(Ordering::Acquire) {
        "cancelled"
    } else {
        "complete"
    };

    // Send stream_end with accurate token count
    send_stream_end(tokens_generated, reason).await?;

    // Free KV cache for this session
    clear_kv_cache(session).await;

    InferenceResult {
        tokens_used: tokens_generated,
        reason: reason.to_string(),
    }
}
```

### The `stream_cancel` Handler:

```rust
async fn handle_stream_cancel(session_id: &str, sessions: &SessionStore) -> Result<()> {
    let session = sessions.get(session_id)
        .ok_or_else(|| Error::SessionNotFound(session_id.to_string()))?;

    // Set the flag — inference loop will see it on next iteration
    session.cancel_flag.store(true, Ordering::Release);

    // The inference loop handles sending stream_end and cleanup
    // No need to send anything here — the loop will send stream_end with reason: "cancelled"

    Ok(())
}
```

**Key point**: The handler just sets a flag. The inference loop detects it, sends `stream_end`, and cleans up. This avoids race conditions between the handler and the loop.

---

## 4. Token Counting & Billing on Cancel

Tokens already generated and sent to the client are billable — the host did the work. The question is what happens with partial checkpoints.

### Checkpoint States at Cancel Time

| State | Tokens Since Last Checkpoint | Action |
|-------|------------------------------|--------|
| < 50 tokens accumulated | e.g. 35 | **Don't submit** — too few for a checkpoint. These are "free" tokens for the user. |
| ≥ 50 tokens accumulated | e.g. 82 | Submit checkpoint for the last complete 50-token block. Remaining 32 are "free". |
| Checkpoint already in-flight | N/A | Let it complete — it's already submitted to the blockchain. |

**Settlement is unchanged**: When the session eventually ends (disconnect or `session_end`), `completeSessionJob()` distributes payment based on submitted checkpoints. Unsubmitted partial work is refunded to the user.

### Example Timeline:

```
Token 0:    Prompt received
Token 50:   Checkpoint #1 submitted ✓ (on-chain)
Token 100:  Checkpoint #2 submitted ✓ (on-chain)
Token 130:  <<< stream_cancel received >>>
            - Inference stops
            - 30 tokens since last checkpoint — NOT submitted
            - stream_end sent with tokens_used: 130

On disconnect:
  - completeSessionJob() settles based on checkpoints: 100 tokens billed
  - Host gets 90% of 100 tokens' value
  - Treasury gets 10%
  - User refunded: initial_deposit - (100 tokens' value)
  - The 30 uncheckpointed tokens are effectively free
```

---

## 5. KV Cache & GPU Resource Cleanup

When inference is cancelled:

1. **Stop generating tokens** — the loop exits via the cancel flag
2. **Clear KV cache** for this session — the partial response context is no longer needed
3. **Free GPU memory** — return the memory to the available pool for other sessions
4. **Keep the session alive** — the user may send another prompt (the SDK keeps the WebSocket open)

```rust
async fn cleanup_cancelled_inference(session: &mut SessionState) {
    // Clear the KV cache for this inference (not the whole session)
    session.kv_cache.clear_current_generation();

    // Reset cancel flag for next prompt
    session.cancel_flag.store(false, Ordering::Release);

    // Session remains active — user can send new prompts
    // Do NOT call completeSessionJob() — that only happens on disconnect
}
```

**Important**: After cancel, the session is still active. The user might send another prompt. The node should be ready to accept new `prompt` messages on the same session. Reset the cancel flag after cleanup so the next inference isn't immediately cancelled.

---

## 6. Edge Cases to Handle

### 6a. `stream_cancel` When No Inference is Active

The user might send cancel when no prompt is being processed (race condition — inference just finished).

**Action**: Ignore silently. Log at debug level. Do not error.

### 6b. `stream_cancel` for Unknown Session

**Action**: Ignore. The session may have already been cleaned up.

### 6c. Multiple `stream_cancel` Messages (Duplicates)

The SDK sends cancel once, but network issues could cause duplicates.

**Action**: Idempotent — setting an already-true flag is a no-op.

### 6d. `stream_cancel` After `stream_end` Already Sent

Inference completed naturally, but the cancel message arrives late.

**Action**: Ignore. The flag is irrelevant after inference is done.

### 6e. `stream_cancel` During Checkpoint Submission

A checkpoint is being submitted to the blockchain while cancel arrives.

**Action**: Let the in-flight checkpoint complete (it's already on-chain or in a transaction). Stop generating further tokens.

### 6f. ~~Encrypted `stream_cancel`~~ (N/A)

`stream_cancel` is always sent as plaintext — no decryption needed. Validate only that the `session_id` exists.

---

## 7. Backwards Compatibility

**Old SDK (< v1.14.16) + New Node**: No issue. Old SDKs never send `stream_cancel`. The node handler is never triggered.

**New SDK (≥ v1.14.16) + Old Node**: No issue. The SDK sends `stream_cancel` fire-and-forget. Old nodes ignore unknown message types. The SDK's client-side abort works regardless.

**No protocol version negotiation needed.**

---

## 8. Testing Recommendations

| Test | Setup | Expected |
|------|-------|----------|
| Basic cancel | Send prompt, wait for ~10 chunks, send `stream_cancel` | Inference stops, `stream_end` sent with `reason: "cancelled"`, token count matches chunks sent |
| Cancel before any tokens | Send prompt, immediately send `stream_cancel` | Inference stops (0 or very few tokens), `stream_end` with `tokens_used: 0` (or small number) |
| Cancel after natural completion | Send prompt, wait for full response, then send `stream_cancel` | Cancel ignored, normal `stream_end` already sent |
| Duplicate cancel | Send `stream_cancel` twice | Second is no-op, no error |
| Cancel with no active inference | Send `stream_cancel` without prior prompt | Ignored silently |
| New prompt after cancel | Cancel mid-inference, then send new prompt | New inference works normally |
| Cancel during encrypted session | Send plaintext `stream_cancel` while session uses encryption | Cancel handled normally (cancel is always plaintext) |
| Cancel at checkpoint boundary | Cancel at exactly 50 tokens | Checkpoint submits, then inference stops |
| Settlement after cancel | Cancel, then disconnect | `completeSessionJob()` settles correctly based on submitted checkpoints |

---

## 9. Summary

| Aspect | Requirement | Priority |
|--------|-------------|----------|
| Add `stream_cancel` to message dispatch | Route to handler | **Required** |
| Atomic cancel flag per session | Set in handler, poll in loop | **Required** |
| Send `stream_end` with `reason: "cancelled"` | Accurate token count | **Required** |
| Clear KV cache on cancel | Free GPU memory | **Required** |
| Reset cancel flag after cleanup | Ready for next prompt | **Required** |
| Handle edge cases (no inference, duplicates, etc.) | Ignore silently | **Required** |
| Partial checkpoint handling | Don't submit < 50 tokens | **Recommended** |

The SDK side is ready to ship independently. Once the node adds `stream_cancel` support, the GPU savings kick in automatically — no SDK or UI changes needed.
