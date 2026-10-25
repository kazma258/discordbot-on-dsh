import { describe, expect, it } from 'vitest';

import { formatDeliveryStatus, isOptionalReplyCoolingDown } from '../src/bot.js';

describe('optional speech cooldown', () => {
  it('is active only inside the configured window', () => {
    expect(isOptionalReplyCoolingDown(10_000, 39_999, 30_000)).toBe(true);
    expect(isOptionalReplyCoolingDown(10_000, 40_000, 30_000)).toBe(false);
  });

  it('is disabled by zero and for a channel with no previous speech', () => {
    expect(isOptionalReplyCoolingDown(10_000, 10_001, 0)).toBe(false);
    expect(isOptionalReplyCoolingDown(undefined, 10_000, 30_000)).toBe(false);
  });

  it('describes delivery success, cooldown suppression, and failure', () => {
    expect(formatDeliveryStatus('sent')).toContain('已送到 Discord');
    expect(formatDeliveryStatus('unsent')).toContain('沒有送到 Discord');
    expect(formatDeliveryStatus('unsent')).toContain('不要假設使用者看過');
    expect(formatDeliveryStatus('failed')).toContain('傳送失敗');
    expect(formatDeliveryStatus(undefined)).toBeUndefined();
  });
});
