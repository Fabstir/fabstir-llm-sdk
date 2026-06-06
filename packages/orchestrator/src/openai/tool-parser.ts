// Streaming Tool Call Parser (ported from @fabstir/openai-bridge tool-parser.ts, Constraint 9)
// Detects <tool_call>Name<arg_key>k</arg_key><arg_value>v</arg_value></tool_call>
import { randomUUID } from 'crypto';

export type ParserEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; name: string; arguments: Record<string, any> }
  | { type: 'error'; rawContent: string };

const OPEN_TAG = '<tool_call>';
const CLOSE_TAG = '</tool_call>';

export class ToolCallParser {
  private buffer = '';
  private state: 'text' | 'in_tool_call' = 'text';

  feed(token: string): ParserEvent[] {
    this.buffer += token;
    if (this.state === 'text') return this.processText();
    return this.processToolCall();
  }

  private processText(): ParserEvent[] {
    const idx = this.buffer.indexOf(OPEN_TAG);
    if (idx >= 0) {
      const events: ParserEvent[] = [];
      const before = this.buffer.slice(0, idx);
      if (before) events.push({ type: 'text', text: before });
      this.buffer = this.buffer.slice(idx + OPEN_TAG.length);
      this.state = 'in_tool_call';
      return events.concat(this.processToolCall());
    }
    // Keep partial tag match in buffer (e.g. "<tool_" waiting for more chars)
    const partial = this.partialTagEnd(this.buffer, OPEN_TAG);
    if (partial >= 0) {
      const text = this.buffer.slice(0, partial);
      this.buffer = this.buffer.slice(partial);
      return text ? [{ type: 'text', text }] : [];
    }
    const text = this.buffer; this.buffer = '';
    return text ? [{ type: 'text', text }] : [];
  }

  private processToolCall(): ParserEvent[] {
    const endIdx = this.buffer.indexOf(CLOSE_TAG);
    if (endIdx < 0) return []; // keep buffering
    const content = this.buffer.slice(0, endIdx);
    this.buffer = this.buffer.slice(endIdx + CLOSE_TAG.length);
    this.state = 'text';
    const parsed = this.parseContent(content);
    const events: ParserEvent[] = parsed
      ? [{ type: 'tool_call', name: parsed.name, arguments: parsed.args }]
      : [{ type: 'text', text: OPEN_TAG + content + CLOSE_TAG }];
    if (this.buffer) return events.concat(this.processText());
    return events;
  }

  private parseContent(content: string): { name: string; args: Record<string, any> } | null {
    const trimmed = content.trim();
    // Native JSON tool call (Hermes/ChatML): {"name":"...","arguments":{...}}.
    // This is what the converter now instructs; trust the model's JSON types (no coercion).
    if (trimmed.startsWith('{')) {
      // The model intermittently truncates the JSON by its trailing brace(s); on parse
      // failure, repair (string-aware brace/bracket balancing) and retry before giving up.
      let obj: any;
      try { obj = JSON.parse(trimmed); }
      catch { try { obj = JSON.parse(completeJson(trimmed)); } catch { /* fall through to XML */ } }
      if (obj && typeof obj.name === 'string' && obj.name.trim()) {
        let args = obj.arguments ?? obj.parameters ?? {};
        if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
        return { name: obj.name.trim(), args: (args && typeof args === 'object') ? args : {} };
      }
    }
    // Legacy fallback: hand-rolled <arg_key>/<arg_value> XML (other models still emit it).
    // Name ends at the first arg tag. Tolerate a malformed first key opened with
    // <arg_value> (some models do this), so the name isn't swallowed.
    const ki = content.indexOf('<arg_key>');
    const vi = content.indexOf('<arg_value>');
    const firstArg = ki < 0 ? vi : (vi < 0 ? ki : Math.min(ki, vi));
    const name = (firstArg >= 0 ? content.slice(0, firstArg) : content).trim();
    if (!name) return null;
    const args: Record<string, any> = {};
    // A key may open with <arg_key> OR (malformed) <arg_value>; the </arg_key> close
    // disambiguates a key from a value, so a real <arg_value>v</arg_value> (which closes
    // with </arg_value>) is never mis-read as a key.
    const re = /<arg_(?:key|value)>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)<\/arg_value>/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      args[m[1].trim()] = this.coerce(m[2].trim());
    }
    return { name, args };
  }

  private coerce(v: string): any {
    if (v === 'true') return true;
    if (v === 'false') return false;
    const n = Number(v);
    if (!isNaN(n) && v !== '') return n;
    try { return JSON.parse(v); } catch {}
    return v;
  }

  private partialTagEnd(buf: string, tag: string): number {
    for (let len = Math.min(tag.length - 1, buf.length); len > 0; len--) {
      if (buf.endsWith(tag.slice(0, len))) return buf.length - len;
    }
    return -1;
  }

  flush(): ParserEvent[] {
    if (!this.buffer) return [];
    const text = this.state === 'in_tool_call' ? OPEN_TAG + this.buffer : this.buffer;
    this.buffer = ''; this.state = 'text';
    return [{ type: 'text', text }];
  }

  reset(): void {
    this.buffer = ''; this.state = 'text';
  }
}

/**
 * Repair truncated JSON by closing any unterminated string and unbalanced braces/brackets.
 * String-aware: `{`/`}`/`[`/`]` inside a JSON string value (e.g. CSS/JS in `content`) are
 * ignored — only structural brackets are balanced. Used to recover tool-call JSON that the
 * model cut one or more closing braces short.
 */
export function completeJson(str: string): string {
  const stack: string[] = [];
  let inStr = false, esc = false;
  for (const ch of str) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let out = str;
  if (inStr) out += '"';
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === '{' ? '}' : ']';
  return out;
}

export function generateToolCallId(): string {
  return 'call_' + randomUUID().replace(/-/g, '').slice(0, 24);
}

/**
 * Reconcile a model-emitted tool-call name with the request's own tool list before
 * surfacing it as `tool_calls`. Strips stray <tool_call> tags the model may glue on,
 * then case-insensitively maps the name onto the caller's declared tool so strict
 * clients (e.g. OpenCode) accept it (`Bash` -> `bash`, `<tool_call>write` -> `write`).
 * Handles both the chat-completions (`function.name`) and Responses (`name`) tool
 * shapes. An unknown name passes through cleaned — never silently dropped.
 */
export function normalizeToolName(
  raw: string,
  tools?: Array<{ name?: string; function?: { name?: string } }>,
): string {
  const cleaned = String(raw ?? '').replace(/<\/?tool_call>/gi, '').trim();
  if (tools?.length) {
    const lower = cleaned.toLowerCase();
    for (const t of tools) {
      const n = t?.function?.name ?? t?.name;
      if (n && n.toLowerCase() === lower) return n;
    }
  }
  return cleaned;
}
