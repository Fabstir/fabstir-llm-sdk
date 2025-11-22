# GPT-OSS-20B CRITICAL FINDINGS - Harmony Format Required

**Date**: 2025-11-08
**Status**: 🚨 URGENT - v8.3.12 uses WRONG template format
**Found By**: Web research + testing

---

## ❌ CRITICAL ISSUE: v8.3.12 Uses Wrong Template

### What v8.3.12 Does (INCORRECT)
```
System: You are ChatGPT, a large language model trained by OpenAI.

User: What is the capital of Turkey?
Assistant:
```

**Result**: Meta-commentary, weird responses, model confusion

### What GPT-OSS-20B Actually Requires (CORRECT)
```
<|start|>system<|message|>You are ChatGPT, a large language model trained by OpenAI.
Knowledge cutoff: 2024-06
Current date: 2025-11-08<|end|>
<|start|>user<|message|>What is the capital of Turkey?<|end|>
<|start|>assistant<|channel|>final<|message|>
```

**Format**: **Harmony Response Format** (NOT DEFAULT format)

---

## Evidence from OpenAI Documentation

### Source 1: Hugging Face Model Card
> "Both GPT-OSS models were trained on the harmony response format and should **only be used with the harmony format** as it will not work correctly otherwise."

**URL**: https://huggingface.co/openai/gpt-oss-20b

### Source 2: OpenAI Cookbook
> "The harmony chat format provides special tokens to delineate message boundaries and uses keyword arguments (e.g., User and Assistant) to indicate message authors and recipients."

**URL**: https://cookbook.openai.com/articles/openai-harmony

### Source 3: Model Training Documentation
> "If you use Transformers' chat template, it will automatically apply the harmony response format. If you use model.generate directly, you need to apply the harmony format manually using the chat template or use the openai-harmony package."

---

## Harmony Format Specification

### Special Tokens
- `<|start|>` (token 200006): Begin a message
- `<|message|>` (token 200008): Transition to content
- `<|end|>` (token 200007): End a message
- `<|channel|>` (token 200005): Specify message channel
- `<|return|>` (token 200002): Model finished generation

### Message Roles
- `system`: System-level instructions
- `developer`: Developer instructions (higher priority than user)
- `user`: User input
- `assistant`: Model responses
- `tool`: Tool/function call results

### Channel Types (Assistant Messages Only)
- `final`: User-facing responses (what the user sees)
- `analysis`: Internal chain-of-thought reasoning
- `commentary`: Function calls, preambles, metadata

### Role Hierarchy (for conflict resolution)
System > Developer > User > Assistant > Tool

---

## Correct Multi-Turn Conversation Format

### Example: Simple Q&A
```
<|start|>system<|message|>You are ChatGPT, a large language model trained by OpenAI.
Knowledge cutoff: 2024-06
Current date: 2025-11-08<|end|>
<|start|>user<|message|>What is the capital of Turkey?<|end|>
<|start|>assistant<|channel|>final<|message|>Ankara<|return|>
```

### Example: Multi-Turn Conversation
```
<|start|>system<|message|>You are ChatGPT, a large language model trained by OpenAI.
Knowledge cutoff: 2024-06<|end|>
<|start|>user<|message|>What is the capital of Turkey?<|end|>
<|start|>assistant<|channel|>final<|message|>Ankara<|end|>
<|start|>user<|message|>Tell me about it<|end|>
<|start|>assistant<|channel|>final<|message|>Ankara is the capital and second-largest city of Turkey...
```

**Note**: Replace `<|return|>` with `<|end|>` when storing conversation history for multi-turn.

### Example: With Reasoning (analysis channel)
```
<|start|>user<|message|>What is 2 + 2?<|end|>
<|start|>assistant<|channel|>analysis<|message|>User asks simple arithmetic: 2 + 2. Answer is 4.<|end|>
<|start|>assistant<|channel|>final<|message|>2 + 2 = 4.<|return|>
```

---

## System Message Configuration

### Default System Message
```
<|start|>system<|message|>You are ChatGPT, a large language model trained by OpenAI.
Knowledge cutoff: 2024-06
Current date: YYYY-MM-DD<|end|>
```

### With Reasoning Level
```
<|start|>system<|message|>You are ChatGPT, a large language model trained by OpenAI.
Knowledge cutoff: 2024-06
Current date: 2025-11-08

Reasoning: high<|end|>
```

**Reasoning Levels**:
- `low`: Fast responses, minimal analysis
- `medium`: Balanced (default)
- `high`: Detailed analysis, chain-of-thought

### With Custom Instructions
```
<|start|>system<|message|>You are ChatGPT, a large language model trained by OpenAI.
Knowledge cutoff: 2024-06

Always respond concisely in under 50 words.<|end|>
```

---

## What Went Wrong: Version History

### v8.3.10-v8.3.11 (Partially Correct)
- ✅ **Used Harmony format** (correct template)
- ❌ **Produced garbage output** (dots/ellipsis: `... (………………………………)`)
- **Root Cause**: Likely tokenizer/decoder bug, NOT template issue

### v8.3.12 (INCORRECT - Current Version)
- ❌ **Switched to DEFAULT format** (wrong template)
- ❌ **Produces meta-commentary** instead of answers
- **Example Bad Output**: `"1. The user is asking for a summary of the conversation. 2. The user wants to be told about the "it"..."`
- **Root Cause**: Using wrong template format entirely

---

## Required Fixes for v8.3.13+

### 1. Revert to Harmony Format ✅
Change template mapping back:
```rust
// CORRECT
"gpt-oss-20b" => ChatTemplate::Harmony

// WRONG (current v8.3.12)
"gpt-oss-20b" => ChatTemplate::Default
```

### 2. Fix Tokenizer/Decoder Issue ⚠️
The garbage output in v8.3.10-11 was NOT caused by using Harmony format. Investigate:
- Tokenizer configuration for GPT-OSS-20B
- Special token handling (`<|start|>`, `<|message|>`, etc.)
- Decoder settings (temperature, top_p, stopping criteria)
- Ensure special tokens are in vocabulary

### 3. Implement Channel Support 🆕
GPT-OSS-20B generates responses with channels:
```
<|start|>assistant<|channel|>analysis<|message|>Internal reasoning...<|end|>
<|start|>assistant<|channel|>final<|message|>User-facing answer<|return|>
```

**Node should**:
- Parse both `analysis` and `final` channels
- **Only return `final` channel content to user** (filter out analysis)
- Store full response (all channels) for conversation history

### 4. Proper Multi-Turn Context 📝
When sending conversation history:
```
<|start|>system<|message|>...<|end|>
<|start|>user<|message|>First question<|end|>
<|start|>assistant<|channel|>final<|message|>First answer<|end|>
<|start|>user<|message|>Follow-up question<|end|>
<|start|>assistant<|channel|>final<|message|>
```

**Important**: Use `<|end|>` for historical messages, `<|return|>` only for final generation.

---

## Testing Checklist for v8.3.13

### ✅ Must Pass Before Deployment

#### Test 1: Basic Single-Turn
```
User: What is 2+2?
Expected: "4" (clean, concise)
NOT: Garbage dots
NOT: Meta-commentary about the question
```

#### Test 2: Multi-Turn Conversation
```
User: What is the capital of Turkey?
Assistant: Ankara
User: Tell me about it
Expected: Information about Ankara
NOT: "The user is asking for..."
NOT: Garbage output
```

#### Test 3: Channel Filtering
```
User: What is 2+2?
Model generates:
  <|channel|>analysis<|message|>User asks simple math.<|end|>
  <|channel|>final<|message|>4<|return|>
User receives: "4" (only final channel)
```

#### Test 4: Reasoning Level
```
System: Reasoning: high
User: What is 2+2?
Expected: More detailed analysis in 'analysis' channel, but 'final' still concise
```

---

## References

1. **OpenAI GPT-OSS GitHub**: https://github.com/openai/gpt-oss
2. **Hugging Face Model Card**: https://huggingface.co/openai/gpt-oss-20b
3. **Harmony Format Cookbook**: https://cookbook.openai.com/articles/openai-harmony
4. **Transformers Example**: https://cookbook.openai.com/articles/gpt-oss/run-transformers
5. **Model Card PDF**: https://cdn.openai.com/pdf/419b6906-9da6-406c-a19d-1bb078ac7637/oai_gpt-oss_model_card.pdf

---

## Immediate Next Steps

1. **URGENT**: Do NOT deploy v8.3.12 to production
2. **Investigate**: Why did Harmony format produce garbage in v8.3.10-11?
   - Check tokenizer configuration
   - Verify special tokens in vocabulary
   - Test with minimal example (just system + user message)
3. **Develop v8.3.13**:
   - Revert to Harmony format
   - Fix the actual tokenizer/decoder bug
   - Implement channel support
4. **Test thoroughly** with all scenarios above before deployment

---

## Summary

**The Problem**: GPT-OSS-20B is being forced into the wrong chat template format (DEFAULT instead of Harmony).

**The Solution**: Use Harmony format with proper special tokens, channels, and fix the underlying tokenizer issue that caused garbage in v8.3.10.

**The Evidence**: Official OpenAI documentation explicitly states GPT-OSS models "should only be used with the harmony format as it will not work correctly otherwise."

**Action Required**: Build v8.3.13 with correct Harmony format + tokenizer fix.
