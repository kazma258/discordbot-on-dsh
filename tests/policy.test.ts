import { describe, expect, it } from 'vitest';

import { classifyMessage, shouldLeaveGuild } from '../src/policy.js';

const GUILD = '111111111111111111';
const CHANNEL = '222222222222222222';
const OTHER_GUILD = '333333333333333333';
const OTHER_CHANNEL = '444444444444444444';

const config = {
  allowedGuildIds: new Set([GUILD]),
  allowedChannelIds: new Set([CHANNEL])
};

const scope = {
  guildId: GUILD,
  channelId: CHANNEL,
  authorIsBot: false,
  mentionedBot: false,
  repliedToBot: false
};

describe('classifyMessage', () => {
  it('processes whitelisted messages without forcing a reply', () => {
    expect(classifyMessage(scope, config)).toEqual({
      action: 'process',
      replyRequired: false
    });
  });

  it('marks an @mention as a forced reply', () => {
    expect(classifyMessage({ ...scope, mentionedBot: true }, config)).toEqual({
      action: 'process',
      replyRequired: true
    });
  });

  it('marks a reply to the bot as a forced reply', () => {
    expect(classifyMessage({ ...scope, repliedToBot: true }, config)).toEqual({
      action: 'process',
      replyRequired: true
    });
  });

  it('ignores bots', () => {
    expect(classifyMessage({ ...scope, authorIsBot: true }, config)).toEqual({
      action: 'ignore',
      replyRequired: false
    });
  });

  it('ignores direct messages', () => {
    expect(classifyMessage({ ...scope, guildId: null }, config)).toEqual({
      action: 'ignore',
      replyRequired: false
    });
  });

  it('ignores a guild outside the whitelist', () => {
    expect(classifyMessage({ ...scope, guildId: OTHER_GUILD }, config)).toEqual({
      action: 'ignore',
      replyRequired: false
    });
  });

  it('ignores a channel outside the whitelist', () => {
    expect(classifyMessage({ ...scope, channelId: OTHER_CHANNEL }, config)).toEqual({
      action: 'ignore',
      replyRequired: false
    });
  });
});

describe('shouldLeaveGuild', () => {
  it('leaves only unknown guilds', () => {
    expect(shouldLeaveGuild(OTHER_GUILD, config)).toBe(true);
    expect(shouldLeaveGuild(GUILD, config)).toBe(false);
  });
});
