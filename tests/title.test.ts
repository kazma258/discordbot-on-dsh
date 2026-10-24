import { describe, expect, it } from 'vitest';

import { formatSessionTitle } from '../src/title.js';

describe('formatSessionTitle', () => {
  it('uses the requested [GuildName]ChannelName format', () => {
    expect(formatSessionTitle('My Server', 'general', '1', '2')).toBe('[My Server]general');
  });

  it('normalizes whitespace and falls back to ids', () => {
    expect(formatSessionTitle('  My\nServer  ', ' general ', '1', '2')).toBe(
      '[My Server]general'
    );
    expect(formatSessionTitle(undefined, null, '111', '222')).toBe('[111]222');
  });
});
