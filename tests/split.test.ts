import { describe, expect, it } from 'vitest';

import { DISCORD_MESSAGE_LIMIT, splitMessage } from '../src/split.js';

describe('splitMessage', () => {
  it('returns no chunks for empty or whitespace-only text', () => {
    expect(splitMessage('')).toEqual([]);
    expect(splitMessage('   \n\t ')).toEqual([]);
  });

  it('keeps a short message as one chunk', () => {
    expect(splitMessage('hello')).toEqual(['hello']);
  });

  it('keeps exactly 2000 characters as one chunk', () => {
    const text = 'a'.repeat(DISCORD_MESSAGE_LIMIT);
    expect(splitMessage(text)).toEqual([text]);
  });

  it('splits a 2001-character hard cut into two chunks', () => {
    const text = 'a'.repeat(2001);
    const chunks = splitMessage(text);
    expect(chunks.map((chunk) => chunk.length)).toEqual([2000, 1]);
    expect(chunks.join('')).toBe(text);
  });

  it('never emits a chunk over the limit', () => {
    const text = 'word '.repeat(1200);
    const chunks = splitMessage(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(DISCORD_MESSAGE_LIMIT);
    }
  });

  it('prefers a newline near the limit', () => {
    const text = `${'a'.repeat(1900)}\n${'b'.repeat(200)}`;
    const chunks = splitMessage(text);
    expect(chunks).toEqual(['a'.repeat(1900), 'b'.repeat(200)]);
  });

  it('prefers a space near the limit', () => {
    const text = `${'a'.repeat(1900)} ${'b'.repeat(200)}`;
    const chunks = splitMessage(text);
    expect(chunks).toEqual(['a'.repeat(1900), 'b'.repeat(200)]);
  });

  it('does not cut a surrogate pair in half', () => {
    const text = `${'a'.repeat(1999)}😀${'b'.repeat(10)}`;
    const chunks = splitMessage(text);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe('a'.repeat(1999));
    expect(chunks[1]).toBe(`😀${'b'.repeat(10)}`);
    expect(chunks.join('')).toBe(text);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(DISCORD_MESSAGE_LIMIT);
    }
  });

  it('normalizes CRLF to LF before splitting', () => {
    const text = `${'a'.repeat(1900)}\r\n${'b'.repeat(200)}`;
    expect(splitMessage(text)).toEqual(['a'.repeat(1900), 'b'.repeat(200)]);
  });

  it('rejects an invalid limit', () => {
    expect(() => splitMessage('x', 0)).toThrow('limit must be a positive integer');
  });
});
