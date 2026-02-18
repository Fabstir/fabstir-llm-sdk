const THINK_END = '</think>';
const THINK_MAX = 8000;
const THINK_PREFIX = '<think';

export function createThinkStripper(): (token: string) => string {
  let done = false;
  let buf = '';
  return (token: string) => {
    if (done) return token;
    buf += token;
    const idx = buf.indexOf(THINK_END);
    if (idx >= 0) { done = true; return buf.slice(idx + THINK_END.length); }
    const trimmed = buf.trimStart();
    if (trimmed.length > 0) {
      const couldBeThink = THINK_PREFIX.startsWith(trimmed) || trimmed.startsWith(THINK_PREFIX);
      if (!couldBeThink) { done = true; return buf; }
    }
    if (buf.length > THINK_MAX) { done = true; return buf; }
    return '';
  };
}

export function stripThinkFromText(text: string): string {
  const idx = text.indexOf(THINK_END);
  return idx >= 0 ? text.slice(idx + THINK_END.length) : text;
}
