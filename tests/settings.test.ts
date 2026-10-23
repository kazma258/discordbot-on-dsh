import { describe, expect, it } from 'vitest';

import { Config, normalizeSettings } from '../src/index.js';

describe('normalizeSettings', () => {
  it('reads volatile Config references with .get()', () => {
    const config = Config({
      guildIds: ['111111111111111111'],
      channelIds: ['222222222222222222'],
      ownerUserId: '333333333333333333',
      preset: 'discord-whale',
      provider: 'dsh-opencode-go',
      model: 'deepseek-v4.1-flash',
      reasoningEffort: 'low',
      replyTimeoutMs: 45_000,
      logLevel: 'debug'
    });

    expect(normalizeSettings(config)).toEqual({
      guildIds: ['111111111111111111'],
      channelIds: ['222222222222222222'],
      ownerUserId: '333333333333333333',
      preset: 'discord-whale',
      provider: 'dsh-opencode-go',
      model: 'deepseek-v4.1-flash',
      reasoningEffort: 'low',
      replyTimeoutMs: 45_000,
      logLevel: 'debug'
    });
  });

  it('still accepts a plain config object', () => {
    expect(
      normalizeSettings({
        guildIds: ['1'],
        channelIds: ['2'],
        preset: '',
        provider: ' p ',
        model: ' m ',
        reasoningEffort: ' high ',
        replyTimeoutMs: 1,
        logLevel: 'nope'
      })
    ).toMatchObject({
      guildIds: ['1'],
      channelIds: ['2'],
      preset: 'discord-whale',
      provider: 'p',
      model: 'm',
      reasoningEffort: 'high',
      replyTimeoutMs: 120_000,
      logLevel: 'info'
    });
  });
});
