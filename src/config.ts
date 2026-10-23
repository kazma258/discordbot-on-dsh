import type { LogLevel } from './logger.js';
import type { ModelSelection } from './types.js';

export interface DiscordPluginConfig {
  readonly discordToken: string;
  readonly allowedGuildIds: ReadonlySet<string>;
  readonly allowedChannelIds: ReadonlySet<string>;
  readonly ownerUserId: string;
  readonly presetId: string;
  readonly replyTimeoutMs: number;
  readonly modelSelection?: ModelSelection;
}

/** Shape of the plugin row's non-secret config in cordis.patch.yml. */
export interface DiscordPluginSettings {
  readonly guildIds: readonly string[];
  readonly channelIds: readonly string[];
  readonly ownerUserId: string;
  readonly preset: string;
  readonly provider: string;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly replyTimeoutMs: number;
  readonly logLevel: LogLevel;
}
