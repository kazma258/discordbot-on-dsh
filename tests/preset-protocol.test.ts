import { describe, expect, it } from 'vitest';

import { DISCORD_BRIDGE_PROTOCOL } from '../scripts/preset.js';

describe('Discord preset protocol', () => {
  it('forbids [SILENT] for messages that require a reply', () => {
    expect(DISCORD_BRIDGE_PROTOCOL).toContain('[需回覆]');
    expect(DISCORD_BRIDGE_PROTOCOL).toContain('絕對不要輸出 `[SILENT]`');
    expect(DISCORD_BRIDGE_PROTOCOL).toContain('[可回覆]');
    expect(DISCORD_BRIDGE_PROTOCOL).toContain('自行決定是否回覆');
  });
});
