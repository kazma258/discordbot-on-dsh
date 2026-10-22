export const DISCORD_MESSAGE_LIMIT = 2000;

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Split a Discord reply into messages of at most `limit` UTF-16 code units.
 *
 * Discord counts JS string length (UTF-16), so the limit is applied to
 * `string.length`. The splitter backs off when the cut would land between a
 * surrogate pair, and prefers a newline or space near the cut.
 */
export function splitMessage(text: string, limit = DISCORD_MESSAGE_LIMIT): string[] {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error('limit must be a positive integer');
  }

  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (normalized === '') return [];

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > limit) {
    let splitAt = limit;

    // Do not cut a surrogate pair in half.
    if (
      splitAt < remaining.length &&
      isLowSurrogate(remaining.charCodeAt(splitAt)) &&
      isHighSurrogate(remaining.charCodeAt(splitAt - 1))
    ) {
      splitAt -= 1;
    }
    // A tiny limit can force a cut inside a surrogate pair; prefer progress
    // over an infinite loop.
    if (splitAt <= 0) splitAt = 1;

    const window = remaining.slice(0, splitAt);
    const newline = window.lastIndexOf('\n');
    const space = window.lastIndexOf(' ');
    const preferredMinimum = Math.floor(limit / 2);

    if (newline >= preferredMinimum) {
      splitAt = newline + 1;
    } else if (space >= preferredMinimum) {
      splitAt = space + 1;
    }

    const chunk = remaining.slice(0, splitAt).trimEnd();
    if (chunk !== '') chunks.push(chunk);
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining !== '') chunks.push(remaining);
  return chunks;
}
