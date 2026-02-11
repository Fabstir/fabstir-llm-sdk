import { describe, it, expect } from 'vitest';
import { ToolCallParser, ParserEvent } from '../src/tool-parser';

describe('ToolCallParser', () => {
  it('emits text tokens unchanged when no tool_call present', () => {
    const parser = new ToolCallParser();
    const events = parser.feed('Hello world');
    expect(events).toEqual([{ type: 'text', text: 'Hello world' }]);
  });

  it('detects complete tool_call in a single chunk', () => {
    const parser = new ToolCallParser();
    const events = parser.feed('<tool_call>get_weather<arg_key>city</arg_key><arg_value>London</arg_value></tool_call>');
    expect(events).toEqual([
      { type: 'tool_call', name: 'get_weather', arguments: { city: 'London' } },
    ]);
  });

  it('detects tool_call split across multiple tokens', () => {
    const parser = new ToolCallParser();
    const allEvents: ParserEvent[] = [];
    allEvents.push(...parser.feed('<tool_call>'));
    allEvents.push(...parser.feed('read_file'));
    allEvents.push(...parser.feed('<arg_key>path</arg_key>'));
    allEvents.push(...parser.feed('<arg_value>/tmp</arg_value>'));
    allEvents.push(...parser.feed('</tool_call>'));
    const toolEvents = allEvents.filter(e => e.type === 'tool_call');
    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0]).toEqual({
      type: 'tool_call', name: 'read_file', arguments: { path: '/tmp' },
    });
  });

  it('emits text before tool_call, then tool_call event', () => {
    const parser = new ToolCallParser();
    const allEvents: ParserEvent[] = [];
    allEvents.push(...parser.feed('Let me read that.\n'));
    allEvents.push(...parser.feed('<tool_call>read_file<arg_key>path</arg_key><arg_value>a.txt</arg_value></tool_call>'));
    allEvents.push(...parser.flush());
    const textEvents = allEvents.filter(e => e.type === 'text');
    const toolEvents = allEvents.filter(e => e.type === 'tool_call');
    expect(textEvents.map(e => (e as any).text).join('')).toContain('Let me read that.');
    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0]).toEqual({
      type: 'tool_call', name: 'read_file', arguments: { path: 'a.txt' },
    });
  });

  it('emits text after tool_call', () => {
    const parser = new ToolCallParser();
    const allEvents: ParserEvent[] = [];
    allEvents.push(...parser.feed('<tool_call>get_weather</tool_call>'));
    allEvents.push(...parser.feed('Done.'));
    allEvents.push(...parser.flush());
    const types = allEvents.map(e => e.type);
    expect(types).toContain('tool_call');
    expect(types).toContain('text');
    const textAfter = allEvents.filter(e => e.type === 'text').map(e => (e as any).text).join('');
    expect(textAfter).toContain('Done.');
  });

  it('handles multiple tool_calls in sequence', () => {
    const parser = new ToolCallParser();
    const allEvents: ParserEvent[] = [];
    allEvents.push(...parser.feed('<tool_call>a</tool_call><tool_call>b</tool_call>'));
    allEvents.push(...parser.flush());
    const toolEvents = allEvents.filter(e => e.type === 'tool_call');
    expect(toolEvents).toHaveLength(2);
    expect((toolEvents[0] as any).name).toBe('a');
    expect((toolEvents[1] as any).name).toBe('b');
  });

  it('does not treat < in middle of text as tool_call', () => {
    const parser = new ToolCallParser();
    const allEvents: ParserEvent[] = [];
    allEvents.push(...parser.feed('Use a < b comparison'));
    allEvents.push(...parser.flush());
    const text = allEvents.filter(e => e.type === 'text').map(e => (e as any).text).join('');
    expect(text).toBe('Use a < b comparison');
  });

  it('partial <tool_ tag buffered then flushed when not matching', () => {
    const parser = new ToolCallParser();
    const allEvents: ParserEvent[] = [];
    allEvents.push(...parser.feed('hello <tool_'));
    allEvents.push(...parser.feed('xyz> world'));
    allEvents.push(...parser.flush());
    const text = allEvents.filter(e => e.type === 'text').map(e => (e as any).text).join('');
    expect(text).toContain('hello');
    expect(text).toContain('world');
  });

  it('tool_call with no arg_key/arg_value still parsed (no-arg tool)', () => {
    const parser = new ToolCallParser();
    const events = parser.feed('<tool_call>simple_tool</tool_call>');
    expect(events).toEqual([
      { type: 'tool_call', name: 'simple_tool', arguments: {} },
    ]);
  });

  it('coerces numeric arg values', () => {
    const parser = new ToolCallParser();
    const events = parser.feed('<tool_call>Bash<arg_key>timeout</arg_key><arg_value>120000</arg_value></tool_call>');
    expect(events).toEqual([
      { type: 'tool_call', name: 'Bash', arguments: { timeout: 120000 } },
    ]);
  });

  it('coerces boolean arg values', () => {
    const parser = new ToolCallParser();
    const events = parser.feed('<tool_call>test<arg_key>flag</arg_key><arg_value>true</arg_value></tool_call>');
    expect(events).toEqual([
      { type: 'tool_call', name: 'test', arguments: { flag: true } },
    ]);
  });

  it('reset() clears all state', () => {
    const parser = new ToolCallParser();
    parser.feed('<tool_call>test');
    parser.reset();
    const events = parser.feed('normal text');
    expect(events).toEqual([{ type: 'text', text: 'normal text' }]);
  });

  it('flush() emits any buffered content as text', () => {
    const parser = new ToolCallParser();
    parser.feed('<tool_call>incomplete');
    const events = parser.flush();
    expect(events).toEqual([{ type: 'text', text: '<tool_call>incomplete' }]);
  });

  it('handles multiple arg_key/arg_value pairs', () => {
    const parser = new ToolCallParser();
    const events = parser.feed(
      '<tool_call>Bash<arg_key>command</arg_key><arg_value>ls -la</arg_value>' +
      '<arg_key>description</arg_key><arg_value>List files</arg_value></tool_call>'
    );
    expect(events).toEqual([
      { type: 'tool_call', name: 'Bash', arguments: { command: 'ls -la', description: 'List files' } },
    ]);
  });
});
