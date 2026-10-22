export interface DiscordPluginConfig {
  readonly discordToken: string;
  readonly allowedGuildIds: ReadonlySet<string>;
  readonly allowedChannelIds: ReadonlySet<string>;
  readonly ownerUserId: string;
  readonly presetId: string;
  readonly replyTimeoutMs: number;
}

/** Shape of the plugin row's non-secret config in cordis.patch.yml. */
import type { LogLevel } from './logger.js';

export interface DiscordPluginSettings {
  readonly guildIds: readonly string[];
  readonly channelIds: readonly string[];
  readonly ownerUserId: string;
  readonly preset: string;
  readonly replyTimeoutMs: number;
  readonly logLevel: LogLevel;
}
