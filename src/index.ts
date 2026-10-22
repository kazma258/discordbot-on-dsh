import { join } from 'node:path';
import { homedir } from 'node:os';

import { credentialRef } from '@deepseek-ai/dsh-credentials';
import z from '@deepseek-ai/schemastery';

import { LocalSessionBackend } from './backend/local.js';
import { DiscordBridge } from './bot.js';
import type { DiscordPluginConfig, DiscordPluginSettings } from './config.js';
import { SessionEventBus } from './events.js';
import { createLogger, isLogLevel, type Logger } from './logger.js';
import type { SessionControllerLike, SessionEventLike } from './types.js';

interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

interface PluginContext {
  readonly sessionController: SessionControllerLike;
  readonly agentPresets: {
    resolve(id: string): Promise<unknown>;
  };
  readonly credentials: {
    resolve(ref: unknown): Promise<{ value?: string } | undefined>;
  };
  readonly logger: PluginLogger;
  on(
    event: 'session/event',
    handler: (session: { id: string }, event: SessionEventLike) => void
  ): () => void;
  effect(factory: () => () => void | Promise<void>, label?: string): void;
}

export const name = 'discord-bot';
export const inject = ['sessionController', 'agentPresets', 'credentials'] as const;

export const Config = z.object({
  guildIds: z.array(z.string()).default([]),
  channelIds: z.array(z.string()).default([]),
  ownerUserId: z.string().default(''),
  preset: z.string().default('discord-whale'),
  replyTimeoutMs: z.number().default(120_000),
  logLevel: z.string().default('info')
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function normalizeSettings(input: unknown): DiscordPluginSettings {
  const raw = isRecord(input) ? input : {};
  const preset = typeof raw.preset === 'string' && raw.preset.trim() !== ''
    ? raw.preset.trim()
    : 'discord-whale';
  const logLevel: DiscordPluginSettings['logLevel'] =
    typeof raw.logLevel === 'string' && isLogLevel(raw.logLevel)
      ? raw.logLevel
      : 'info';
  const replyTimeoutMs =
    typeof raw.replyTimeoutMs === 'number' &&
    Number.isSafeInteger(raw.replyTimeoutMs) &&
    raw.replyTimeoutMs >= 5_000 &&
    raw.replyTimeoutMs <= 600_000
      ? raw.replyTimeoutMs
      : 120_000;

  return {
    guildIds: stringArray(raw.guildIds),
    channelIds: stringArray(raw.channelIds),
    ownerUserId: typeof raw.ownerUserId === 'string' ? raw.ownerUserId.trim() : '',
    preset,
    replyTimeoutMs,
    logLevel
  };
}

function createPluginLogger(ctx: PluginContext, level: DiscordPluginSettings['logLevel']): Logger {
  return createLogger({
    level,
    sink: (line, lineLevel) => {
      if (lineLevel === 'error') ctx.logger.error(line);
      else if (lineLevel === 'warn') ctx.logger.warn(line);
      else ctx.logger.info(line);
    }
  });
}

async function resolveDiscordToken(ctx: PluginContext, logger: Logger): Promise<string> {
  try {
    const hit = await ctx.credentials.resolve(credentialRef('DISCORD_TOKEN'));
    const fromCredentials = hit?.value?.trim();
    if (fromCredentials) return fromCredentials;
  } catch (error) {
    logger.warn('DISCORD_TOKEN credential lookup failed; using environment fallback', {
      error
    });
  }
  return process.env.DISCORD_TOKEN?.trim() ?? '';
}

export function apply(ctx: PluginContext, rawConfig: unknown = {}): void {
  const settings = normalizeSettings(rawConfig);
  const logger = createPluginLogger(ctx, settings.logLevel);
  const bus = new SessionEventBus();

  ctx.on('session/event', (session, event) => {
    bus.dispatch(session.id, event);
  });

  let bridge: DiscordBridge | undefined;
  let backend: LocalSessionBackend | undefined;
  let disposed = false;

  ctx.effect(() => {
    void (async () => {
      const token = await resolveDiscordToken(ctx, logger);
      if (disposed) return;
      if (token === '') {
        logger.error('Discord plugin not started: DISCORD_TOKEN is not configured');
        return;
      }
      if (settings.guildIds.length === 0 || settings.channelIds.length === 0) {
        logger.error('Discord plugin not started: guildIds and channelIds must not be empty');
        return;
      }

      const baseDir = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'discord-bot');
      backend = new LocalSessionBackend({
        controller: ctx.sessionController,
        subscribeSessionEvents: bus.subscribe,
        logger,
        statePath: join(baseDir, 'sessions.json'),
        agentsDir: join(baseDir, 'agents'),
        presetId: settings.preset,
        replyTimeoutMs: settings.replyTimeoutMs,
        ensurePreset: async () => {
          const resolved = await ctx.agentPresets.resolve(settings.preset);
          if (!resolved) {
            throw new Error(`DSH preset "${settings.preset}" is not available`);
          }
        }
      });
      await backend.start();
      if (disposed) {
        await backend.stop();
        backend = undefined;
        return;
      }

      const config: DiscordPluginConfig = {
        discordToken: token,
        allowedGuildIds: new Set(settings.guildIds),
        allowedChannelIds: new Set(settings.channelIds),
        ownerUserId: settings.ownerUserId,
        presetId: settings.preset,
        replyTimeoutMs: settings.replyTimeoutMs
      };
      bridge = new DiscordBridge(config, backend, logger);
      await bridge.start();
      logger.info('Discord plugin started', {
        guilds: settings.guildIds.length,
        channels: settings.channelIds.length,
        preset: settings.preset
      });
    })().catch((error: unknown) => {
      logger.error('Discord plugin failed to start', { error });
    });

    return async () => {
      disposed = true;
      try {
        await bridge?.stop();
      } catch (error) {
        logger.error('failed to stop Discord client', { error });
      }
      try {
        await backend?.stop();
      } catch (error) {
        logger.error('failed to stop local session backend', { error });
      }
      bus.clear();
    };
  }, 'discord-bot');
}
