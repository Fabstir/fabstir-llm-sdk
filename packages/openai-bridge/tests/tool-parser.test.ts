import { describe, it, expect } from 'vitest';
import { ToolCallParser, ParserEvent } from '../src/tool-parser';

describe('ToolCallParser', () => {
  it('emits text event for plain text', () => {
    const parser = new ToolCallParser();
    const events = parser.feed('Hello world');
    expect(events).toEqual([{ type: 'text', text: 'Hello world' }]);
  });

  it('emits tool_call event for complete tool call', () => {
    const parser = new ToolCallParser();
    const events = parser.feed('<tool_call>get_weather<arg_key>city</arg_key><arg_value>London</arg_value></tool_call>');
    expect(events).toEqual([
      { type: 'tool_call', name: 'get_weather', arguments: { city: 'London' } },
    ]);
  });

  it('parses tool name correctly', () => {
    const parser = new ToolCallParser();
    const events = parser.feed('<tool_call>my_tool</tool_call>');
    expect(events).toEqual([{ type: 'tool_call', name: 'my_tool', arguments: {} }]);
  });

  it('parses single argument', () => {
    const parser = new ToolCallParser();
    const events = parser.feed('<tool_call>Bash<arg_key>command</arg_key><arg_value>ls -la</arg_value></tool_call>');
    expect(events).toEqual([
      { type: 'tool_call', name: 'Bash', arguments: { command: 'ls -la' } },
    ]);
  });

  it('parses multiple arguments', () => {
    const parser = new ToolCallParser();
    const events = parser.feed(
      '<tool_call>Bash<arg_key>command</arg_key><arg_value>ls -la</arg_value>' +
      '<arg_key>description</arg_key><arg_value>List files</arg_value></tool_call>'
    );
    expect(events).toEqual([
      { type: 'tool_call', name: 'Bash', arguments: { command: 'ls -la', description: 'List files' } },
    ]);
  });

  it('coerces boolean string true to boolean', () => {
    const parser = new ToolCallParser();
    const events = parser.feed('<tool_call>test<arg_key>flag</arg_key><arg_value>true</arg_value></tool_call>');
    expect(events).toEqual([{ type: 'tool_call', name: 'test', arguments: { flag: true } }]);
  });

  it('coerces boolean string false to boolean', () => {
    const parser = new ToolCallParser();
    const events = parser.feed('<tool_call>test<arg_key>flag</arg_key><arg_value>false</arg_value></tool_call>');
    expect(events).toEqual([{ type: 'tool_call', name: 'test', arguments: { flag: false } }]);
  });

  it('coerces numeric string to number', () => {
    const parser = new ToolCallParser();
    const events = parser.feed('<tool_call>Bash<arg_key>timeout</arg_key><arg_value>120000</arg_value></tool_call>');
    expect(events).toEqual([
      { type: 'tool_call', name: 'Bash', arguments: { timeout: 120000 } },
    ]);
  });

  it('handles JSON object in arg_value', () => {
    const parser = new ToolCallParser();
    const events = parser.feed('<tool_call>test<arg_key>data</arg_key><arg_value>{"a":1}</arg_value></tool_call>');
    const toolCall = events.find(e => e.type === 'tool_call');
    expect(toolCall).toBeDefined();
    expect((toolCall as any).arguments.data).toEqual({ a: 1 });
  });

  it('handles tool call split across multiple tokens', () => {
    const parser = new ToolCallParser();
    const all: ParserEvent[] = [];
    all.push(...parser.feed('<tool_call>'));
    all.push(...parser.feed('read_file'));
    all.push(...parser.feed('<arg_key>path</arg_key>'));
    all.push(...parser.feed('<arg_value>/tmp</arg_value>'));
    all.push(...parser.feed('</tool_call>'));
    const toolEvents = all.filter(e => e.type === 'tool_call');
    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0]).toEqual({ type: 'tool_call', name: 'read_file', arguments: { path: '/tmp' } });
  });

  it('handles partial tag at buffer boundary', () => {
    const parser = new ToolCallParser();
    const all: ParserEvent[] = [];
    all.push(...parser.feed('hello <tool_'));
    all.push(...parser.feed('xyz> world'));
    all.push(...parser.flush());
    const text = all.filter(e => e.type === 'text').map(e => (e as any).text).join('');
    expect(text).toContain('hello');
    expect(text).toContain('world');
  });

  it('emits text before tool call', () => {
    const parser = new ToolCallParser();
    const all: ParserEvent[] = [];
    all.push(...parser.feed('Let me read.\n'));
    all.push(...parser.feed('<tool_call>read<arg_key>p</arg_key><arg_value>a.txt</arg_value></tool_call>'));
    all.push(...parser.flush());
    const textParts = all.filter(e => e.type === 'text').map(e => (e as any).text).join('');
    expect(textParts).toContain('Let me read.');
    expect(all.filter(e => e.type === 'tool_call')).toHaveLength(1);
  });

  it('emits text after tool call', () => {
    const parser = new ToolCallParser();
    const all: ParserEvent[] = [];
    all.push(...parser.feed('<tool_call>get_weather</tool_call>'));
    all.push(...parser.feed('Done.'));
    all.push(...parser.flush());
    expect(all.map(e => e.type)).toContain('tool_call');
    expect(all.map(e => e.type)).toContain('text');
    const textAfter = all.filter(e => e.type === 'text').map(e => (e as any).text).join('');
    expect(textAfter).toContain('Done.');
  });

  it('flush() emits remaining buffered text', () => {
    const parser = new ToolCallParser();
    parser.feed('<tool_call>incomplete');
    const events = parser.flush();
    expect(events).toEqual([{ type: 'text', text: '<tool_call>incomplete' }]);
  });
});
