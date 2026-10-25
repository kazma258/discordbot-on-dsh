import { describe, expect, it } from 'vitest';

import { DISCORD_BRIDGE_PROTOCOL, buildDiscordPresetPatch } from '../scripts/preset.js';

describe('Discord preset protocol', () => {
  it('forbids [SILENT] for messages that require a reply', () => {
    expect(DISCORD_BRIDGE_PROTOCOL).toContain('[需回覆]');
    expect(DISCORD_BRIDGE_PROTOCOL).toContain('絕對不要輸出 `[SILENT]`');
    expect(DISCORD_BRIDGE_PROTOCOL).toContain('[可回覆]');
    expect(DISCORD_BRIDGE_PROTOCOL).toContain('自行決定是否回覆');
    expect(DISCORD_BRIDGE_PROTOCOL).toContain('[冷卻]');
    expect(DISCORD_BRIDGE_PROTOCOL).toContain('不得回覆');
    expect(DISCORD_BRIDGE_PROTOCOL).toContain('[發送狀態]');
  });

  it('mounts only the container tools and web tools', () => {
    const patch = buildDiscordPresetPatch('persona');
    expect(patch).toContain('@local/dsh-discord-bot/container-tools');
    expect(patch).toContain('@deepseek-ai/dsh-tool-web');
    expect(patch).not.toContain('@deepseek-ai/dsh-tool-fs');
    expect(patch).not.toContain('@deepseek-ai/dsh-tool-bash');
    expect(patch).not.toContain('dsh-tool-subagent');
    expect(patch).not.toContain('dsh-tool-workflow');
  });
});
