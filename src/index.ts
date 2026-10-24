import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import { credentialRef } from '@deepseek-ai/dsh-credentials';
import z from '@deepseek-ai/schemastery';

import { ChannelAccessStore } from './access.js';
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

interface SettingsContext {
  readonly settings?: {
    configure(policy: { auto: boolean }, fiber: unknown): void;
  };
  readonly fiber?: unknown;
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
  readonly webServer: {
    register(options: {
      kind: 'exact';
      path: string;
      handler: (
        req: { method?: string },
        res: {
          statusCode: number;
          setHeader(name: string, value: string): void;
          end(body?: string): void;
        }
      ) => Promise<void> | void;
    }): () => void;
  };
  inject?(
    names: readonly string[],
    callback: (child: SettingsContext) => void
  ): unknown;
  on(
    event: 'session/event',
    handler: (session: { id: string }, event: SessionEventLike) => void
  ): () => void;
  effect(factory: () => () => void | Promise<void>, label?: string): void;
}

export const name = 'discord-bot';
export const inject = [
  'sessionController',
  'agentPresets',
  'credentials',
  'webServer'
] as const;

export const Config = z.object({
  // Deprecated: read access is controlled by Discord permissions plus the
  // per-channel /deeplook toggle. Kept only so older profile patches still parse.
  guildIds: z.array(z.string()).default([]).volatile(),
  channelIds: z.array(z.string()).default([]).volatile(),
  ownerUserId: z.string().default('').volatile(),
  preset: z.string().default('discord-whale').volatile(),
  provider: z.string().default('').volatile(),
  model: z.string().default('').volatile(),
  reasoningEffort: z.string().default('').volatile(),
  replyTimeoutMs: z.number().default(120_000).volatile(),
  logLevel: z.string().default('info').volatile()
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * `.volatile()` fields are stable references, not plain values. DSH passes
 * those references to `apply`; read them with `.get()` before normalizing.
 */
function readVolatile<T>(value: unknown, fallback: T): T {
  if (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { get?: unknown }).get === 'function'
  ) {
    try {
      const resolved = (value as { get: () => T | undefined }).get();
      return resolved === undefined ? fallback : resolved;
    } catch {
      return fallback;
    }
  }
  return (value as T | undefined) === undefined ? fallback : (value as T);
}

export function normalizeSettings(input: unknown): DiscordPluginSettings {
  const raw = isRecord(input) ? input : {};
  const rawPreset = readVolatile<unknown>(raw.preset, '');
  const preset = typeof rawPreset === 'string' && rawPreset.trim() !== ''
    ? rawPreset.trim()
    : 'discord-whale';
  const rawLogLevel = readVolatile<unknown>(raw.logLevel, 'info');
  const logLevel: DiscordPluginSettings['logLevel'] =
    typeof rawLogLevel === 'string' && isLogLevel(rawLogLevel)
      ? rawLogLevel
      : 'info';
  const rawReplyTimeoutMs = readVolatile<unknown>(raw.replyTimeoutMs, 120_000);
  const replyTimeoutMs =
    typeof rawReplyTimeoutMs === 'number' &&
    Number.isSafeInteger(rawReplyTimeoutMs) &&
    rawReplyTimeoutMs >= 5_000 &&
    rawReplyTimeoutMs <= 600_000
      ? rawReplyTimeoutMs
      : 120_000;
  const rawProvider = readVolatile<unknown>(raw.provider, '');
  const rawModel = readVolatile<unknown>(raw.model, '');
  const rawEffort = readVolatile<unknown>(raw.reasoningEffort, '');

  return {
    preset,
    provider: typeof rawProvider === 'string' ? rawProvider.trim() : '',
    model: typeof rawModel === 'string' ? rawModel.trim() : '',
    reasoningEffort: typeof rawEffort === 'string' ? rawEffort.trim() : '',
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
  const baseDir = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'discord-bot');

  const writeStatus = (phase: string, extra: Record<string, unknown> = {}): void => {
    try {
      mkdirSync(baseDir, { recursive: true });
      writeFileSync(
        join(baseDir, 'status.json'),
        JSON.stringify(
          {
            at: new Date().toISOString(),
            pid: process.pid,
            phase,
            preset: settings.preset,
            ...extra
          },
          null,
          2
        ) + '\n',
        'utf8'
      );
    } catch {
      // Diagnostics must never block plugin startup.
    }
  };

  writeStatus('apply', { tokenConfigured: null });

  // We ship a custom Settings -> Discord Bot page; suppress the generic form.
  if (ctx.inject) {
    ctx.inject(['settings'], (settingsCtx) => {
      try {
        settingsCtx.settings?.configure({ auto: false }, settingsCtx.fiber);
      } catch (error) {
        logger.warn('failed to disable the generated settings form', { error });
      }
    });
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/discord-bot/models',
        handler: async (req, res) => {
          const send = (status: number, body: unknown): void => {
            res.statusCode = status;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(body));
          };
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            send(405, { ok: false, error: 'method-not-allowed' });
            return;
          }
          if (!ctx.sessionController.modelCatalog) {
            send(501, { ok: false, error: 'model-catalog-unavailable' });
            return;
          }
          try {
            const catalog = await ctx.sessionController.modelCatalog();
            send(200, { ok: true, catalog });
          } catch (error) {
            logger.warn('failed to read the DSH model catalog', { error });
            send(500, {
              ok: false,
              error: 'model-catalog-failed',
              message: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }),
    'discord-bot: model catalog route'
  );

  ctx.on('session/event', (session, event) => {
    bus.dispatch(session.id, event);
  });

  let bridge: DiscordBridge | undefined;
  let backend: LocalSessionBackend | undefined;
  let disposed = false;

  ctx.effect(() => {
    void (async () => {
      const token = await resolveDiscordToken(ctx, logger);
      writeStatus('token-resolved', { tokenConfigured: token !== '' });
      if (disposed) return;
      if (token === '') {
        writeStatus('no-token', { tokenConfigured: false });
        logger.error('Discord plugin not started: DISCORD_TOKEN is not configured');
        return;
      }
      const modelSelection =
        settings.provider !== '' && settings.model !== ''
          ? {
              provider: settings.provider,
              model: settings.model,
              ...(settings.reasoningEffort !== ''
                ? { reasoningEffort: settings.reasoningEffort }
                : {})
            }
          : undefined;

      backend = new LocalSessionBackend({
        controller: ctx.sessionController,
        subscribeSessionEvents: bus.subscribe,
        logger,
        statePath: join(baseDir, 'sessions.json'),
        agentsDir: join(baseDir, 'agents'),
        presetId: settings.preset,
        replyTimeoutMs: settings.replyTimeoutMs,
        modelSelection,
        diagnosticPath: join(baseDir, 'last-message.json'),
        ensurePreset: async () => {
          const resolved = await ctx.agentPresets.resolve(settings.preset);
          if (!resolved) {
            throw new Error(`DSH preset "${settings.preset}" is not available`);
          }
        }
      });
      await backend.start();
      const access = new ChannelAccessStore(join(baseDir, 'access.json'), logger);
      access.load();
      writeStatus('backend-started', {
        tokenConfigured: true,
        enabledChannels: [...access.enabledChannels()].length
      });
      if (disposed) {
        await backend.stop();
        backend = undefined;
        return;
      }

      const config: DiscordPluginConfig = {
        discordToken: token,
        presetId: settings.preset,
        replyTimeoutMs: settings.replyTimeoutMs,
        modelSelection,
        commandStatusPath: join(baseDir, 'commands.json')
      };
      bridge = new DiscordBridge(config, backend, access, logger);
      await bridge.start();
      writeStatus('started', {
        tokenConfigured: true,
        enabledChannels: [...access.enabledChannels()].length
      });
      logger.info('Discord plugin started', {
        preset: settings.preset,
        enabledChannels: [...access.enabledChannels()].length
      });
    })().catch((error: unknown) => {
      writeStatus('error', {
        tokenConfigured: null,
        error: error instanceof Error ? error.message : String(error)
      });
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
