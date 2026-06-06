import { describe, it, expect } from 'vitest';
import { ToolCallParser, generateToolCallId, normalizeToolName } from '../../src/openai/tool-parser';

describe('ToolCallParser (4.1)', () => {
  it('emits text then a single tool_call after </tool_call>, then trailing text', () => {
    const p = new ToolCallParser();
    const events = p.feed('Hello <tool_call>Bash<arg_key>command</arg_key><arg_value>ls</arg_value></tool_call> done');
    expect(events).toEqual([
      { type: 'text', text: 'Hello ' },
      { type: 'tool_call', name: 'Bash', arguments: { command: 'ls' } },
      { type: 'text', text: ' done' },
    ]);
  });

  it('buffers a partial open tag across token boundaries', () => {
    const p = new ToolCallParser();
    expect(p.feed('Hello <tool')).toEqual([{ type: 'text', text: 'Hello ' }]);
    const ev = p.feed('_call>Echo<arg_key>x</arg_key><arg_value>1</arg_value></tool_call>');
    expect(ev).toEqual([{ type: 'tool_call', name: 'Echo', arguments: { x: 1 } }]);
  });

  it('coerces argument values (bool/number/json/string)', () => {
    const p = new ToolCallParser();
    const ev = p.feed('<tool_call>T<arg_key>b</arg_key><arg_value>true</arg_value><arg_key>n</arg_key><arg_value>42</arg_value></tool_call>');
    expect(ev[0]).toMatchObject({ type: 'tool_call', arguments: { b: true, n: 42 } });
  });

  it('surfaces a malformed tool_call (no name) as text, no crash', () => {
    const p = new ToolCallParser();
    expect(p.feed('<tool_call></tool_call>')).toEqual([{ type: 'text', text: '<tool_call></tool_call>' }]);
  });

  it('flush returns the buffered partial tag; reset clears state', () => {
    const p = new ToolCallParser();
    p.feed('hello <tool'); // emits 'hello ', buffers the partial open-tag '<tool'
    expect(p.flush()).toEqual([{ type: 'text', text: '<tool' }]);
    p.feed('<tool_call>unterminated'); // enters in_tool_call, buffers content
    p.reset();
    expect(p.flush()).toEqual([]);
  });

  it('generateToolCallId has call_ prefix', () => {
    expect(generateToolCallId()).toMatch(/^call_/);
  });
});

describe('normalizeToolName', () => {
  it('maps a mis-cased name onto the request casing (nested chat-completions shape)', () => {
    expect(normalizeToolName('Bash', [{ function: { name: 'bash' } }])).toBe('bash');
  });

  it('maps a mis-cased name onto the request casing (flat Responses shape)', () => {
    expect(normalizeToolName('Bash', [{ name: 'bash' }])).toBe('bash');
  });

  it('strips a stray <tool_call> tag glued onto the name', () => {
    expect(normalizeToolName('<tool_call>write', [{ function: { name: 'write' } }])).toBe('write');
  });

  it('strips tags case-insensitively even without a tools list', () => {
    expect(normalizeToolName('</TOOL_CALL>write')).toBe('write');
  });

  it('passes an unknown name through cleaned (no silent drop)', () => {
    expect(normalizeToolName('<tool_call>mystery', [{ function: { name: 'bash' } }])).toBe('mystery');
  });

  it('preserves an already-correct name', () => {
    expect(normalizeToolName('write', [{ function: { name: 'write' } }])).toBe('write');
  });
});

// Regression: some models (Qwen 3.6-27B) intermittently open a SUBSEQUENT arg key with
// <arg_value> instead of <arg_key>, which dropped the 2nd arg (e.g. write's `content`).
// The </arg_key> close still disambiguates a key from a value, so accept either opener.
describe('ToolCallParser malformed <arg_value>-opened keys (toolparser handoff)', () => {
  it('extracts BOTH args when a subsequent key is malformed-opened with <arg_value> (write content not dropped)', () => {
    const p = new ToolCallParser();
    const raw =
      '<tool_call>write<arg_key>path</arg_key><arg_value>index.html</arg_value>' +
      '<arg_value>content</arg_key><arg_value><!DOCTYPE html><html></html></arg_value></tool_call>';
    const ev = p.feed(raw);
    expect(ev[0]).toMatchObject({
      type: 'tool_call',
      name: 'write',
      arguments: { path: 'index.html', content: '<!DOCTYPE html><html></html>' },
    });
  });

  it('still extracts the right name when the FIRST key is malformed-opened with <arg_value>', () => {
    const p = new ToolCallParser();
    const ev = p.feed('<tool_call>write<arg_value>path</arg_key><arg_value>a.txt</arg_value></tool_call>');
    expect(ev[0]).toMatchObject({ type: 'tool_call', name: 'write', arguments: { path: 'a.txt' } });
  });

  it('leaves a well-formed call unchanged (real <arg_value> never mis-read as a key)', () => {
    const p = new ToolCallParser();
    const ev = p.feed('<tool_call>bash<arg_key>command</arg_key><arg_value>ls</arg_value></tool_call>');
    expect(ev[0]).toMatchObject({ type: 'tool_call', name: 'bash', arguments: { command: 'ls' } });
  });
});

// Native JSON tool-call format (Hermes/ChatML — what Qwen is trained to emit).
// The per-arg XML is unparseable with this model (mutually-incompatible malforms), so the
// converter now instructs native JSON and the parser reads it; XML is kept as a fallback.
describe('ToolCallParser native JSON tool calls (native-toolcall handoff)', () => {
  it('parses a native JSON tool call (name + arguments object); content preserved verbatim, no coercion', () => {
    const p = new ToolCallParser();
    const ev = p.feed('<tool_call>{"name":"write","arguments":{"path":"a.html","content":"<h1>hi</h1>"}}</tool_call>');
    expect(ev[0]).toMatchObject({
      type: 'tool_call',
      name: 'write',
      arguments: { path: 'a.html', content: '<h1>hi</h1>' },
    });
  });

  it('parses native JSON with whitespace/newlines around the object', () => {
    const p = new ToolCallParser();
    const ev = p.feed('<tool_call>\n{"name": "bash", "arguments": {"command": "ls"}}\n</tool_call>');
    expect(ev[0]).toMatchObject({ type: 'tool_call', name: 'bash', arguments: { command: 'ls' } });
  });

  it('native JSON with no arguments → empty args object', () => {
    const p = new ToolCallParser();
    const ev = p.feed('<tool_call>{"name":"list"}</tool_call>');
    expect(ev[0]).toMatchObject({ type: 'tool_call', name: 'list', arguments: {} });
  });

  it('still falls back to the legacy XML format for models that emit it', () => {
    const p = new ToolCallParser();
    const ev = p.feed('<tool_call>Bash<arg_key>command</arg_key><arg_value>ls</arg_value></tool_call>');
    expect(ev[0]).toMatchObject({ type: 'tool_call', name: 'Bash', arguments: { command: 'ls' } });
  });
});

// Qwen 3.6-27B intermittently truncates the tool-call JSON by its trailing brace(s) — it closes
// `arguments` but omits the outer object's `}`. Repair (string-aware brace/bracket balancing) and
// re-parse before falling back to XML, so `write` keeps its `content`.
describe('ToolCallParser truncated JSON repair (json-repair handoff)', () => {
  it('repairs a tool-call JSON missing the outer closing brace (the captured Qwen truncation)', () => {
    const p = new ToolCallParser();
    const ev = p.feed('<tool_call>{"name":"write","arguments":{"content":"<h1>hi</h1>","path":"todo.html"}</tool_call>');
    expect(ev[0]).toMatchObject({
      type: 'tool_call',
      name: 'write',
      arguments: { content: '<h1>hi</h1>', path: 'todo.html' },
    });
  });

  it('ignores braces inside string content when balancing (CSS/JS literal {} in content)', () => {
    const p = new ToolCallParser();
    const ev = p.feed('<tool_call>{"name":"write","arguments":{"content":"body { color: red }","path":"a.css"}</tool_call>');
    expect(ev[0]).toMatchObject({
      type: 'tool_call',
      name: 'write',
      arguments: { content: 'body { color: red }', path: 'a.css' },
    });
  });

  it('repairs a value string truncated mid-content (closes the open string + braces)', () => {
    const p = new ToolCallParser();
    const ev = p.feed('<tool_call>{"name":"write","arguments":{"path":"a.html","content":"<div' + '</tool_call>');
    expect(ev[0]).toMatchObject({ type: 'tool_call', name: 'write' });
    expect((ev[0] as any).arguments.path).toBe('a.html');
  });
});
