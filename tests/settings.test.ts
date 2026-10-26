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
      speechCooldownMs: 30_000,
      logLevel: 'debug',
      videoPackage: ' guimatheus92/mcp-video-analyzer '
    });

    expect(normalizeSettings(config)).toEqual({
      preset: 'discord-whale',
      provider: 'dsh-opencode-go',
      model: 'deepseek-v4.1-flash',
      reasoningEffort: 'low',
      replyTimeoutMs: 45_000,
      speechCooldownMs: 30_000,
      logLevel: 'debug',
      videoPackage: 'guimatheus92/mcp-video-analyzer'
    });
  });

  it('defaults the speech cooldown to 30000ms and rejects invalid values', () => {
    const defaults = normalizeSettings(
      Config({
        preset: 'discord-whale',
        provider: '',
        model: '',
        reasoningEffort: '',
        replyTimeoutMs: 120_000,
        logLevel: 'info'
      })
    );
    expect(defaults.speechCooldownMs).toBe(30_000);

    expect(
      normalizeSettings({
        speechCooldownMs: 600_001,
        replyTimeoutMs: 120_000
      }).speechCooldownMs
    ).toBe(30_000);
  });

  it('still accepts a plain config object', () => {
    expect(
      normalizeSettings({
        preset: '',
        provider: ' p ',
        model: ' m ',
        reasoningEffort: ' high ',
        replyTimeoutMs: 1,
        speechCooldownMs: 0,
        logLevel: 'nope'
      })
    ).toMatchObject({
      preset: 'discord-whale',
      provider: 'p',
      model: 'm',
      reasoningEffort: 'high',
      replyTimeoutMs: 120_000,
      speechCooldownMs: 0,
      logLevel: 'info'
    });
  });
});
