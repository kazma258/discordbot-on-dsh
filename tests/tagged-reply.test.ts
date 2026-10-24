import { describe, expect, it } from 'vitest';

import { outboundReply, TAGGED_SILENT_FALLBACK } from '../src/bot.js';

describe('outboundReply', () => {
  it('sends a real reply for optional and required turns', () => {
    expect(outboundReply('在', false)).toBe('在');
    expect(outboundReply('在', true)).toBe('在');
  });

  it('falls back only when a required turn produced no visible reply', () => {
    expect(outboundReply(null, true)).toBe(TAGGED_SILENT_FALLBACK);
    expect(outboundReply('   ', true)).toBe(TAGGED_SILENT_FALLBACK);
    expect(outboundReply(null, false)).toBeNull();
    expect(outboundReply('', false)).toBeNull();
  });
});
