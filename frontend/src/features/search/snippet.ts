/** Hit markers sent by the server (ADR-0040): private-use characters, never HTML. */
export const HIT_START = "";
export const HIT_END = "";

/** Splits a snippet into plain and highlighted parts; text is rendered as text, never markup. */
export function highlightParts(snippet: string): { text: string; hit: boolean }[] {
  const parts: { text: string; hit: boolean }[] = [];
  for (const [index, chunk] of snippet.split(HIT_START).entries()) {
    if (index === 0) {
      if (chunk) parts.push({ text: chunk, hit: false });
      continue;
    }
    const end = chunk.indexOf(HIT_END);
    const hit = end === -1 ? chunk : chunk.slice(0, end);
    const rest = end === -1 ? "" : chunk.slice(end + 1);
    if (hit) parts.push({ text: hit, hit: true });
    if (rest) parts.push({ text: rest, hit: false });
  }
  return parts;
}
