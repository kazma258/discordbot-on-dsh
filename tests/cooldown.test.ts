import { describe, expect, it } from 'vitest';

import { isOptionalReplyCoolingDown } from '../src/bot.js';

describe('optional speech cooldown', () => {
  it('is active only inside the configured window', () => {
    expect(isOptionalReplyCoolingDown(10_000, 39_999, 30_000)).toBe(true);
    expect(isOptionalReplyCoolingDown(10_000, 40_000, 30_000)).toBe(false);
  });

  it('is disabled by zero and for a channel with no previous speech', () => {
    expect(isOptionalReplyCoolingDown(10_000, 10_001, 0)).toBe(false);
    expect(isOptionalReplyCoolingDown(undefined, 10_000, 30_000)).toBe(false);
  });
});
