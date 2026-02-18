// Streaming Tool Call Parser — detects <tool_call>Name<arg_key>k</arg_key><arg_value>v</arg_value></tool_call>
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
    const firstArg = content.indexOf('<arg_key>');
    const name = (firstArg >= 0 ? content.slice(0, firstArg) : content).trim();
    if (!name) return null;
    const args: Record<string, any> = {};
    const re = /<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)<\/arg_value>/g;
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
