import { describe, expect, it } from 'vitest';

import { Config, normalizeSettings } from '../src/index.js';

describe('normalizeSettings', () => {
  it('reads volatile Config references with .get()', () => {
    const config = Config({
      preset: 'discord-whale',
      provider: 'dsh-opencode-go',
      model: 'deepseek-v4.1-flash',
      reasoningEffort: 'low',
      replyTimeoutMs: 45_000,
      logLevel: 'debug'
    });

    expect(normalizeSettings(config)).toEqual({
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
        preset: '',
        provider: ' p ',
        model: ' m ',
        reasoningEffort: ' high ',
        replyTimeoutMs: 1,
        logLevel: 'nope'
      })
    ).toMatchObject({
      preset: 'discord-whale',
      provider: 'p',
      model: 'm',
      reasoningEffort: 'high',
      replyTimeoutMs: 120_000,
      logLevel: 'info'
    });
  });
});
