import { describe, expect, it } from 'vitest';

import { classifyMessage } from '../src/policy.js';

const GUILD = '111111111111111111';
const CHANNEL = '222222222222222222';

const scope = {
  guildId: GUILD,
  channelId: CHANNEL,
  authorIsBot: false,
  mentionedBot: false,
  repliedToBot: false,
  accessEnabled: true
};

describe('classifyMessage', () => {
  it('processes enabled channels without forcing a reply', () => {
    expect(classifyMessage(scope)).toEqual({
      action: 'process',
      replyRequired: false
    });
  });

  it('marks an @mention as a forced reply', () => {
    expect(classifyMessage({ ...scope, mentionedBot: true })).toEqual({
      action: 'process',
      replyRequired: true
    });
  });

  it('marks a reply to the bot as a forced reply', () => {
    expect(classifyMessage({ ...scope, repliedToBot: true })).toEqual({
      action: 'process',
      replyRequired: true
    });
  });

  it('ignores a channel whose read toggle is off', () => {
    expect(classifyMessage({ ...scope, accessEnabled: false })).toEqual({
      action: 'ignore',
      replyRequired: false
    });
  });

  it('ignores bots', () => {
    expect(classifyMessage({ ...scope, authorIsBot: true })).toEqual({
      action: 'ignore',
      replyRequired: false
    });
  });

  it('ignores direct messages', () => {
    expect(classifyMessage({ ...scope, guildId: null })).toEqual({
      action: 'ignore',
      replyRequired: false
    });
  });
});
