import type { LogLevel } from './logger.js';
import type { ModelSelection } from './types.js';

export interface DiscordPluginConfig {
  readonly discordToken: string;
  readonly presetId: string;
  readonly replyTimeoutMs: number;
  readonly speechCooldownMs: number;
  readonly modelSelection?: ModelSelection;
  readonly commandStatusPath?: string;
}

/** Shape of the plugin row's non-secret config in cordis.patch.yml. */
export interface DiscordPluginSettings {
  readonly preset: string;
  readonly provider: string;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly replyTimeoutMs: number;
  readonly speechCooldownMs: number;
  readonly logLevel: LogLevel;
}
