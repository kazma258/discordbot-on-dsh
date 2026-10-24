import { describe, expect, it } from 'vitest';

import { outboundReplyForTagged, TAGGED_SILENT_FALLBACK } from '../src/bot.js';

describe('outboundReplyForTagged', () => {
  it('falls back when a tagged turn produced no visible reply', () => {
    expect(outboundReplyForTagged(null)).toBe(TAGGED_SILENT_FALLBACK);
    expect(outboundReplyForTagged('')).toBe(TAGGED_SILENT_FALLBACK);
    expect(outboundReplyForTagged('   ')).toBe(TAGGED_SILENT_FALLBACK);
  });

  it('preserves a real reply', () => {
    expect(outboundReplyForTagged('在')).toBe('在');
  });
});
