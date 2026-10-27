import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { credentialRef } from '@deepseek-ai/dsh-credentials';
import z from '@deepseek-ai/schemastery';

import { ChannelAccessStore } from './access.js';
import { LocalSessionBackend } from './backend/local.js';
import { DiscordBridge } from './bot.js';
import type { DiscordPluginConfig, DiscordPluginSettings } from './config.js';
import { SessionEventBus } from './events.js';
import { createLogger, isLogLevel, type Logger } from './logger.js';
import { VideoAnalyzer, resolveVideoPackage } from './video/analyzer.js';
import { writeYtDlpCookies } from './video/cookies.js';
import { installYtDlp, installYtDlpWrapper } from './video/ytdlp.js';
import { ContainerToolService, containerImageTag } from './container/service.js';
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
        req: {
          method?: string;
          headers: Record<string, string | string[] | undefined>;
        } & AsyncIterable<Buffer>,
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
  provide(name: string, value: unknown): () => void;
}

/** 19-second public video ("Me at the zoo"), also used by the analyzer's own docs. */
const VIDEO_CHECK_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

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
  speechCooldownMs: z.number().default(30_000).volatile(),
  logLevel: z.string().default('info').volatile(),
  videoPackage: z.string().default('').volatile()
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The video routes run npx / download binaries and the DSH web server has no
 * auth for plugin routes: refuse cross-site requests. A JSON content type
 * forces a CORS preflight that DSH never grants.
 */
function sameOriginJsonPost(req: {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}): boolean {
  if (req.method !== 'POST') return false;
  const contentType = String(req.headers['content-type'] ?? '');
  const origin = req.headers.origin;
  return (
    contentType.startsWith('application/json') &&
    (typeof origin !== 'string' || URL.parse(origin)?.host === req.headers.host)
  );
}

function envPositiveInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
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
  const rawSpeechCooldownMs = readVolatile<unknown>(raw.speechCooldownMs, 30_000);
  const speechCooldownMs =
    typeof rawSpeechCooldownMs === 'number' &&
    Number.isSafeInteger(rawSpeechCooldownMs) &&
    rawSpeechCooldownMs >= 0 &&
    rawSpeechCooldownMs <= 600_000
      ? rawSpeechCooldownMs
      : 30_000;
  const rawProvider = readVolatile<unknown>(raw.provider, '');
  const rawModel = readVolatile<unknown>(raw.model, '');
  const rawEffort = readVolatile<unknown>(raw.reasoningEffort, '');
  const rawVideoPackage = readVolatile<unknown>(raw.videoPackage, '');

  return {
    videoPackage: typeof rawVideoPackage === 'string' ? rawVideoPackage.trim() : '',
    preset,
    provider: typeof rawProvider === 'string' ? rawProvider.trim() : '',
    model: typeof rawModel === 'string' ? rawModel.trim() : '',
    reasoningEffort: typeof rawEffort === 'string' ? rawEffort.trim() : '',
    replyTimeoutMs,
    speechCooldownMs,
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
  try {
    installYtDlpWrapper(join(baseDir, 'bin'));
  } catch (error) {
    logger.warn('yt-dlp subtitle wrapper was not installed', { error });
  }

  const videoPackageSpec = resolveVideoPackage(settings.videoPackage);
  if (settings.videoPackage !== '' && videoPackageSpec === null) {
    logger.warn('video analysis disabled: invalid videoPackage', {
      videoPackage: settings.videoPackage
    });
  }

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

  let videoCheckRunning = false;
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/discord-bot/video-check',
        handler: async (req, res) => {
          const send = (status: number, body: unknown): void => {
            res.statusCode = status;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(body));
          };
          if (!sameOriginJsonPost(req)) {
            send(403, { ok: false, error: 'forbidden' });
            return;
          }
          if (videoCheckRunning) {
            send(409, { ok: false, error: '已有驗證正在執行' });
            return;
          }
          videoCheckRunning = true;
          try {
            let raw = '';
            for await (const chunk of req) {
              raw += chunk.toString('utf8');
              if (raw.length > 4096) throw new Error('request body too large');
            }
            const body: unknown = JSON.parse(raw === '' ? '{}' : raw);
            const input = isRecord(body) ? body : {};
            const spec = resolveVideoPackage(
              typeof input.package === 'string' ? input.package : settings.videoPackage
            );
            if (spec === null) {
              send(400, { ok: false, error: '影片分析套件名稱無效或未填' });
              return;
            }
            const url =
              typeof input.url === 'string' && /^https?:\/\//i.test(input.url.trim())
                ? input.url.trim()
                : VIDEO_CHECK_URL;
            const analyzer = new VideoAnalyzer({
              packageSpec: spec,
              cacheDir: join(baseDir, 'video-cache'),
              binDir: join(baseDir, 'bin'),
              cookiesFile: join(baseDir, 'youtube-cookies.txt'),
              jobsDir: join(baseDir, 'video-jobs'),
              logger,
              ocrLanguage: (process.env.DSH_DISCORD_VIDEO_OCR_LANG ?? 'eng').trim() || 'eng'
            });
            const result = await analyzer.check(url, AbortSignal.timeout(11 * 60_000));
            send(200, { ...result, package: spec, url });
          } catch (error) {
            send(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
          } finally {
            videoCheckRunning = false;
          }
        }
      }),
    'discord-bot: video check route'
  );

  let ytDlpInstalling = false;
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/discord-bot/ytdlp-install',
        handler: async (req, res) => {
          const send = (status: number, body: unknown): void => {
            res.statusCode = status;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(body));
          };
          if (!sameOriginJsonPost(req)) {
            send(403, { ok: false, error: 'forbidden' });
            return;
          }
          if (ytDlpInstalling) {
            send(409, { ok: false, error: 'yt-dlp 正在安裝' });
            return;
          }
          ytDlpInstalling = true;
          try {
            const binDir = join(baseDir, 'bin');
            const asset = await installYtDlp(binDir, AbortSignal.timeout(5 * 60_000));
            logger.info('yt-dlp installed', { asset, binDir });
            send(200, { ok: true, asset, path: join(binDir, 'yt-dlp') });
          } catch (error) {
            logger.warn('yt-dlp install failed', { error });
            send(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
          } finally {
            ytDlpInstalling = false;
          }
        }
      }),
    'discord-bot: yt-dlp install route'
  );

  const cookiesFile = join(baseDir, 'youtube-cookies.txt');
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/discord-bot/cookies',
        handler: async (req, res) => {
          const send = (status: number, body: unknown): void => {
            res.statusCode = status;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(body));
          };
          if (!sameOriginJsonPost(req)) {
            send(403, { ok: false, error: 'forbidden' });
            return;
          }
          try {
            let raw = '';
            for await (const chunk of req) {
              raw += chunk.toString('utf8');
              if (raw.length > 300_000) throw new Error('cookies 超過 256KB');
            }
            const body: unknown = JSON.parse(raw === '' ? '{}' : raw);
            const action = isRecord(body) && typeof body.action === 'string' ? body.action : '';
            if (action === 'status') {
              let configured = false;
              try {
                configured = readFileSync(cookiesFile, 'utf8').trim() !== '';
              } catch {
                configured = false;
              }
              send(200, { ok: true, configured });
              return;
            }
            if (action === 'clear') {
              writeYtDlpCookies(cookiesFile, null);
              send(200, { ok: true, configured: false });
              return;
            }
            if (action !== 'set' || typeof (isRecord(body) ? body.content : undefined) !== 'string') {
              send(400, { ok: false, error: '不支援的操作' });
              return;
            }
            const content = (body as { content: string }).content;
            if (content.trim() === '') {
              send(400, { ok: false, error: 'Cookies 不能為空' });
              return;
            }
            writeYtDlpCookies(cookiesFile, content);
            logger.info('video cookies stored');
            send(200, { ok: true, configured: true });
          } catch (error) {
            send(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
          }
        }
      }),
    'discord-bot: cookies route'
  );

  ctx.on('session/event', (session, event) => {
    bus.dispatch(session.id, event);
  });

  let bridge: DiscordBridge | undefined;
  let backend: LocalSessionBackend | undefined;
  let disposed = false;

  const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

  ctx.effect(() => {
    const containerService = new ContainerToolService({
      baseDir,
      containerDir: join(packageRoot, 'container'),
      image: containerImageTag('0.6.0'),
      uid: 1000,
      gid: 1000,
      idleMs: 15 * 60_000,
      limits: { memory: '512m', pids: 256, cpus: 1, tmpfsSize: '64m' },
      quotaBytes: 256 * 1024 * 1024,
      logger
    });
    ctx.provide('discordBotContainers', containerService);
    const writeContainerStatus = (): void => {
      try {
        writeFileSync(
          join(baseDir, 'container.json'),
          JSON.stringify(
            { at: new Date().toISOString(), ...containerService.status() },
            null,
            2
          ) + '\n',
          { encoding: 'utf8', mode: 0o600 }
        );
      } catch (error) {
        logger.warn('failed to write container status', { error });
      }
    };
    void containerService.ready.then(writeContainerStatus);
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
        workspacesDir: join(baseDir, 'workspaces'),
        onSessionBound: (sessionId, channelId, workspace) => {
          containerService.bindSession(sessionId, { channelId, workspace });
        },
        onSessionRetired: (sessionId) => {
          containerService.unbindSession(sessionId);
        },
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
        speechCooldownMs: settings.speechCooldownMs,
        modelSelection,
        commandStatusPath: join(baseDir, 'commands.json'),
        ...(videoPackageSpec === null ? {} : { videoJobs: {
          packageSpec: videoPackageSpec,
          cacheDir: join(baseDir, 'video-cache'),
          binDir: join(baseDir, 'bin'),
          cookiesFile: join(baseDir, 'youtube-cookies.txt'),
          jobsDir: join(baseDir, 'video-jobs'),
          maxFrames: envPositiveInt('DSH_DISCORD_VIDEO_MAX_FRAMES', 8, 1, 16),
          timeoutMs: envPositiveInt('DSH_DISCORD_VIDEO_TIMEOUT_MS', 3_900_000, 60_000, 7_200_000),
          maxDurationSec: envPositiveInt('DSH_DISCORD_VIDEO_MAX_DURATION_SEC', 3_600, 60, 86_400),
          maxEvidenceChars: envPositiveInt('DSH_DISCORD_VIDEO_MAX_CHARS', 500_000, 10_000, 2_000_000),
          ocrLanguage: (process.env.DSH_DISCORD_VIDEO_OCR_LANG ?? 'eng').trim() || 'eng',
          maxConcurrent: 1,
          maxQueue: envPositiveInt('DSH_DISCORD_VIDEO_QUEUE', 8, 1, 32)
        } })
      };
      bridge = new DiscordBridge(config, backend, access, logger);
      await bridge.start();
      writeStatus('started', {
        tokenConfigured: true,
        enabledChannels: [...access.enabledChannels()].length,
        containerTools: containerService.available,
        containerEngine: containerService.status().engine?.kind ?? 'none'
      });
      writeContainerStatus();
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
      try {
        await containerService.dispose();
      } catch (error) {
        logger.error('failed to dispose container tools', { error });
      }
      bus.clear();
    };
  }, 'discord-bot');
}
