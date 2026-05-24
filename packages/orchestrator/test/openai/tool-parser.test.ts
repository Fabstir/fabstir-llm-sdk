import { describe, it, expect } from 'vitest';
import { ToolCallParser, generateToolCallId } from '../../src/openai/tool-parser';

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
