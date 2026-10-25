import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LocalSessionBackend } from '../src/backend/local.js';
import { createLogger } from '../src/logger.js';
import type {
  IncomingDiscordMessage,
  ModelSelection,
  SessionControllerLike,
  SessionEventLike,
  SessionEventHandler
} from '../src/types.js';

const CHANNEL = '222222222222222222';

const MESSAGE: IncomingDiscordMessage = {
  guildId: '111111111111111111',
  guildName: 'Test Guild',
  channelId: CHANNEL,
  channelName: 'general',
  messageId: '444444444444444444',
  authorId: '555555555555555555',
  authorName: 'Alice',
  createdAt: new Date('2026-01-02T03:04:05.000Z'),
  text: '[Alice|555555555555555555|2026-01-02T03:04:05.000Z|444444444444444444|-] hi',
  replyRequired: true
};

const logger = createLogger({ level: 'error', sink: () => undefined });

class EventBus {
  private readonly handlers = new Map<string, Set<SessionEventHandler>>();

  subscribe = (sessionId: string, handler: SessionEventHandler): (() => void) => {
    let set = this.handlers.get(sessionId);
    if (!set) {
      set = new Set();
      this.handlers.set(sessionId, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  };

  emit(sessionId: string, event: SessionEventLike): void {
    for (const handler of this.handlers.get(sessionId) ?? []) handler(event);
  }
}

class FakeController implements SessionControllerLike {
  creates = 0;
  turn = 0;
  readonly cwds: string[] = [];
  readonly prompts: string[] = [];
  readonly cancels: string[] = [];
  readonly modelSelections: Array<{
    sessionId: string;
    provider: string;
    model: string;
    reasoningEffort?: string;
  }> = [];
  readonly renames: Array<{ sessionId: string; title: string }> = [];
  failNextPrompt = false;
  emitReply = true;

  constructor(private readonly bus: EventBus) {}

  async create(params: {
    cwd: string;
    agentPreset: string;
  }): Promise<{ sessionId: string; agentPreset?: string }> {
    this.creates += 1;
    this.cwds.push(params.cwd);
    return { sessionId: `session-${this.creates}`, agentPreset: params.agentPreset };
  }

  async prompt(request: {
    requestId: string;
    sessionId: string;
    mode: 'queue';
    content: readonly { type: 'text'; text: string }[];
  }): Promise<unknown> {
    this.prompts.push(request.content[0]?.text ?? '');
    if (this.failNextPrompt) {
      this.failNextPrompt = false;
      throw { code: 'session/not-found' };
    }
    if (!this.emitReply) return {};
    this.turn += 1;
    const turn = this.turn;
    queueMicrotask(() => {
      this.bus.emit(request.sessionId, { type: 'turn/start', data: { turn } });
      this.bus.emit(request.sessionId, {
        type: 'assistant/message',
        data: { turn, message: { content: [{ type: 'text', text: 'reply' }] } }
      });
      this.bus.emit(request.sessionId, { type: 'turn/end', data: { turn, reason: 'completed' } });
    });
    return {};
  }

  async selectModel(request: {
    sessionId: string;
    provider: string;
    model: string;
    reasoningEffort?: string;
  }): Promise<unknown> {
    this.modelSelections.push(request);
    return {};
  }

  async rename(request: { sessionId: string; title: string }): Promise<unknown> {
    this.renames.push(request);
    return {};
  }

  async cancel(request: { sessionId: string }): Promise<unknown> {
    this.cancels.push(request.sessionId);
    return {};
  }
}

function withTempDir(run: (directory: string) => Promise<void>): Promise<void> {
  return (async () => {
    const directory = mkdtempSync(join(tmpdir(), 'discord-plugin-'));
    try {
      await run(directory);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  })();
}

function makeBackend(
  directory: string,
  controller: FakeController,
  bus: EventBus,
  replyTimeoutMs = 5_000,
  modelSelection?: ModelSelection,
  onSessionBound?: (sessionId: string, channelId: string, workspace: string) => void
): LocalSessionBackend {
  return new LocalSessionBackend({
    controller,
    subscribeSessionEvents: bus.subscribe,
    logger,
    statePath: join(directory, 'sessions.json'),
    agentsDir: join(directory, 'agents'),
    workspacesDir: join(directory, 'workspaces'),
    onSessionBound,
    replyTimeoutMs,
    modelSelection
  });
}

describe('LocalSessionBackend', () => {
  it('creates one session per channel, prompts it, and returns the reply', async () => {
    await withTempDir(async (directory) => {
      const bus = new EventBus();
      const controller = new FakeController(bus);
      const backend = makeBackend(directory, controller, bus);
      await backend.start();

      const first = await backend.onMessage(MESSAGE);
      const second = await backend.onMessage({ ...MESSAGE, messageId: '666666666666666666' });

      expect(first).toBe('reply');
      expect(second).toBe('reply');
      expect(controller.creates).toBe(1);
      expect(controller.prompts).toHaveLength(2);
      expect(controller.prompts[0]).toContain('[需回覆]');
      expect(existsSync(join(directory, 'sessions.json'))).toBe(true);
      expect(JSON.parse(readFileSync(join(directory, 'sessions.json'), 'utf8'))).toMatchObject({
        sessions: {
          [CHANNEL]: {
            sessionId: 'session-1',
            preset: 'discord-whale'
          }
        }
      });

      await backend.stop();
    });
  });

  it('marks optional messages with [可回覆]', async () => {
    await withTempDir(async (directory) => {
      const bus = new EventBus();
      const controller = new FakeController(bus);
      const backend = makeBackend(directory, controller, bus);
      await backend.start();

      await backend.onMessage({ ...MESSAGE, replyRequired: false });

      expect(controller.prompts[0]).toContain('[可回覆]');
      await backend.stop();
    });
  });

  it('returns null and cancels on timeout', async () => {
    await withTempDir(async (directory) => {
      const bus = new EventBus();
      const controller = new FakeController(bus);
      controller.emitReply = false;
      const backend = makeBackend(directory, controller, bus, 20);
      await backend.start();

      const reply = await backend.onMessage(MESSAGE);

      expect(reply).toBeNull();
      expect(controller.cancels).toEqual(['session-1']);
      await backend.stop();
    });
  });

  it('recreates the session on session/not-found', async () => {
    await withTempDir(async (directory) => {
      const bus = new EventBus();
      const controller = new FakeController(bus);
      controller.failNextPrompt = true;
      const backend = makeBackend(directory, controller, bus);
      await backend.start();

      const reply = await backend.onMessage(MESSAGE);

      expect(reply).toBe('reply');
      expect(controller.creates).toBe(2);
      await backend.stop();
    });
  });

  it('titles a newly created session from guild and channel names', async () => {
    await withTempDir(async (directory) => {
      const bus = new EventBus();
      const controller = new FakeController(bus);
      const backend = makeBackend(directory, controller, bus);
      await backend.start();

      await backend.onMessage(MESSAGE);

      expect(controller.renames).toEqual([
        { sessionId: 'session-1', title: '[Test Guild]general' }
      ]);
      await backend.stop();
    });
  });

  it('resumes a persisted session instead of recreating it', async () => {
    await withTempDir(async (directory) => {
      const bus = new EventBus();
      const controller = new FakeController(bus);
      writeFileSync(
        join(directory, 'sessions.json'),
        JSON.stringify({
          version: 1,
          sessions: {
            [CHANNEL]: {
              sessionId: 'session-old',
              preset: 'discord-whale',
              cwd: join(directory, 'agents'),
              updatedAt: Date.now()
            }
          }
        })
      );
      const backend = makeBackend(directory, controller, bus);
      await backend.start();

      const reply = await backend.onMessage(MESSAGE);

      expect(reply).toBe('reply');
      expect(controller.prompts).toHaveLength(1);
      expect(controller.prompts[0]).toContain('[需回覆]');
      expect(controller.creates).toBe(0);
      expect(controller.renames).toEqual([
        { sessionId: 'session-old', title: '[Test Guild]general' }
      ]);
      await backend.stop();
    });
  });

  it('marks cooldown messages for recording without a reply', async () => {
    await withTempDir(async (directory) => {
      const bus = new EventBus();
      const controller = new FakeController(bus);
      const backend = makeBackend(directory, controller, bus);
      await backend.start();

      await backend.onMessage({
        ...MESSAGE,
        replyRequired: false,
        cooldownActive: true,
        deliveryNote: '[發送狀態] 上一則回覆沒有送到 Discord（發言冷卻）。',
        emojiNames: ['wave']
      });

      expect(controller.prompts[0]).toContain('[冷卻]');
      expect(controller.prompts[0]).toContain('[發送狀態]');
      expect(controller.prompts[0]).toContain('[可用應用表情]');
      await backend.stop();
    });
  });

  it('creates a per-channel workspace and binds the session', async () => {
    await withTempDir(async (directory) => {
      const bus = new EventBus();
      const controller = new FakeController(bus);
      const bindings: Array<{ sessionId: string; channelId: string; workspace: string }> = [];
      const backend = makeBackend(directory, controller, bus, 5_000, undefined, (...args) => {
        bindings.push({ sessionId: args[0], channelId: args[1], workspace: args[2] });
      });
      await backend.start();

      await backend.onMessage(MESSAGE);

      expect(controller.cwds).toEqual([join(directory, 'workspaces', CHANNEL)]);
      expect(bindings).toEqual([
        {
          sessionId: 'session-1',
          channelId: CHANNEL,
          workspace: join(directory, 'workspaces', CHANNEL)
        }
      ]);
      await backend.stop();
    });
  });

  it('applies the configured model selection before prompting', async () => {
    await withTempDir(async (directory) => {
      const bus = new EventBus();
      const controller = new FakeController(bus);
      const backend = makeBackend(directory, controller, bus, 5_000, {
        provider: 'dsh-opencode-go',
        model: 'deepseek-v4.1-flash',
        reasoningEffort: 'low'
      });
      await backend.start();

      const reply = await backend.onMessage(MESSAGE);

      expect(reply).toBe('reply');
      expect(controller.modelSelections).toEqual([
        {
          sessionId: 'session-1',
          provider: 'dsh-opencode-go',
          model: 'deepseek-v4.1-flash',
          reasoningEffort: 'low'
        }
      ]);
      await backend.stop();
    });
  });
});
