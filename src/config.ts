import type { LogLevel } from './logger.js';
import type { ModelSelection } from './types.js';

export interface VideoJobConfig {
  /** npm spec run through npx, e.g. mcp-video-analyzer@0.11.0. */
  readonly packageSpec: string;
  readonly cacheDir: string;
  readonly binDir: string;
  readonly cookiesFile: string;
  /** Scratch directory for analyzer jobs and downloaded frames. */
  readonly jobsDir: string;
  readonly maxFrames: number;
  readonly timeoutMs: number;
  readonly maxDurationSec: number;
  readonly maxEvidenceChars: number;
  readonly ocrLanguage: string;
  readonly maxConcurrent: number;
  readonly maxQueue: number;
}

export interface DiscordPluginConfig {
  readonly discordToken: string;
  readonly presetId: string;
  readonly replyTimeoutMs: number;
  readonly speechCooldownMs: number;
  readonly modelSelection?: ModelSelection;
  readonly commandStatusPath?: string;
  readonly videoJobs?: VideoJobConfig;
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
  /** Settings-card value: npm package or `owner/repo`; '' disables video. */
  readonly videoPackage: string;
}
