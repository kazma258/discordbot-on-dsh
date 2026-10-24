import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Logger } from '../logger.js';
import { cleanDshReply, formatDshPrompt } from '../prompt.js';
import { KeyedQueue } from '../queue.js';
import { loadSessionState, saveSessionState, type SessionRecord } from '../state.js';
import { formatSessionTitle } from '../title.js';
import type {
  IncomingDiscordMessage,
  MessageHandler,
  ModelSelection,
  SessionControllerLike,
  SessionEventLike,
  SessionEventSubscriber
} from '../types.js';

export interface LocalBackendOptions {
  readonly controller: SessionControllerLike;
  readonly subscribeSessionEvents: SessionEventSubscriber;
  readonly logger: Logger;
  readonly statePath: string;
  readonly agentsDir: string;
  /** Root for per-channel workspaces. Defaults to <agentsDir>/workspaces. */
  readonly workspacesDir?: string;
  readonly onSessionBound?: (
    sessionId: string,
    channelId: string,
    workspace: string
  ) => void;
  readonly onSessionRetired?: (sessionId: string) => void;
  readonly presetId?: string;
  readonly replyTimeoutMs?: number;
  readonly modelSelection?: ModelSelection;
  /** Last-message diagnostic file; never contains the prompt text or token. */
  readonly diagnosticPath?: string;
  /** Fail-closed check performed before the first session is created. */
  readonly ensurePreset?: () => Promise<void>;
}

interface PendingTurn {
  readonly resolve: (text: string) => void;
  readonly reject: (error: unknown) => void;
  readonly timer: NodeJS.Timeout;
  turn: number | null;
  text: string;
}

interface Connection {
  readonly sessionId: string;
  readonly unsubscribe: () => void;
}

function textFromContent(
  content: readonly { readonly type?: string; readonly text?: string }[] | undefined
): string {
  if (!content) return '';
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('');
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isSessionNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'session/not-found'
  );
}

/**
 * Discord plugin backend for the DSH instance that hosts the plugin.
 * It creates one `discord-whale` session per channel and prompts it through
 * the host `sessionController`; no DSH cookie or Web API is involved.
 */
export class LocalSessionBackend implements MessageHandler {
  private readonly controller: SessionControllerLike;
  private readonly subscribeSessionEvents: SessionEventSubscriber;
  private readonly logger: Logger;
  private readonly statePath: string;
  private readonly agentsDir: string;
  private readonly workspacesDir: string;
  private readonly onSessionBound?: LocalBackendOptions['onSessionBound'];
  private readonly onSessionRetired?: LocalBackendOptions['onSessionRetired'];
  private readonly presetId: string;
  private readonly replyTimeoutMs: number;
  private readonly modelSelection?: ModelSelection;
  private readonly diagnosticPath?: string;
  private readonly ensurePreset?: () => Promise<void>;
  private readonly queue = new KeyedQueue();
  private readonly connections = new Map<string, Connection>();
  private readonly pending = new Map<string, PendingTurn>();
  private records = new Map<string, SessionRecord>();

  constructor(options: LocalBackendOptions) {
    this.controller = options.controller;
    this.subscribeSessionEvents = options.subscribeSessionEvents;
    this.logger = options.logger;
    this.statePath = options.statePath;
    this.agentsDir = options.agentsDir;
    this.workspacesDir = options.workspacesDir ?? join(options.agentsDir, 'workspaces');
    this.onSessionBound = options.onSessionBound;
    this.onSessionRetired = options.onSessionRetired;
    this.presetId = options.presetId ?? 'discord-whale';
    this.replyTimeoutMs = options.replyTimeoutMs ?? 120_000;
    this.modelSelection = options.modelSelection;
    this.diagnosticPath = options.diagnosticPath;
    this.ensurePreset = options.ensurePreset;
  }

  async start(): Promise<void> {
    mkdirSync(this.agentsDir, { recursive: true });
    mkdirSync(this.workspacesDir, { recursive: true, mode: 0o700 });
    this.records = loadSessionState(this.statePath, this.logger);
    this.logger.info('Discord local backend ready', {
      preset: this.presetId,
      knownChannels: this.records.size
    });
  }

  async onMessage(message: IncomingDiscordMessage): Promise<string | null> {
    this.writeDiagnostic('message', {
      channelId: message.channelId,
      messageId: message.messageId,
      replyRequired: message.replyRequired,
      textChars: message.text.length
    });
    return this.queue.enqueue(message.channelId, () => this.processMessage(message));
  }

  private writeDiagnostic(phase: string, extra: Record<string, unknown> = {}): void {
    if (!this.diagnosticPath) return;
    try {
      mkdirSync(dirname(this.diagnosticPath), { recursive: true });
      writeFileSync(
        this.diagnosticPath,
        JSON.stringify({ at: new Date().toISOString(), phase, ...extra }, null, 2) + '\n',
        'utf8'
      );
    } catch {
      // Diagnostics must never affect message handling.
    }
  }

  async stop(): Promise<void> {
    for (const [channelId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Discord local backend stopped'));
      this.pending.delete(channelId);
    }
    for (const connection of this.connections.values()) {
      connection.unsubscribe();
      this.onSessionRetired?.(connection.sessionId);
    }
    this.connections.clear();
    this.logger.info('Discord local backend stopped');
  }

  private async processMessage(message: IncomingDiscordMessage): Promise<string | null> {
    const startedAt = Date.now();
    this.writeDiagnostic('processing', {
      channelId: message.channelId,
      messageId: message.messageId,
      replyRequired: message.replyRequired
    });
    try {
      const replyText = await this.runPrompt(message);
      const reply = cleanDshReply(replyText);
      this.writeDiagnostic('reply-ready', {
        channelId: message.channelId,
        messageId: message.messageId,
        replyRequired: message.replyRequired,
        rawChars: replyText.length,
        replyChars: reply?.length ?? 0,
        silent: reply === null
      });
      this.logger.info('DSH turn completed', {
        channelId: message.channelId,
        messageId: message.messageId,
        replyRequired: message.replyRequired,
        durationMs: Date.now() - startedAt,
        replyChars: reply?.length ?? 0
      });
      return reply;
    } catch (error) {
      if (isSessionNotFound(error)) {
        this.logger.warn('DSH session no longer exists; recreating', {
          channelId: message.channelId
        });
        this.retire(message.channelId);
        try {
          const replyText = await this.runPrompt(message);
          const reply = cleanDshReply(replyText);
          this.writeDiagnostic('reply-ready', {
            channelId: message.channelId,
            messageId: message.messageId,
            replyRequired: message.replyRequired,
            rawChars: replyText.length,
            replyChars: reply?.length ?? 0,
            silent: reply === null
          });
          this.logger.info('DSH turn completed after session recreation', {
            channelId: message.channelId,
            messageId: message.messageId,
            durationMs: Date.now() - startedAt,
            replyChars: reply?.length ?? 0
          });
          return reply;
        } catch (retryError) {
          this.writeDiagnostic('process-error', {
            channelId: message.channelId,
            messageId: message.messageId,
            error: errorText(retryError),
            stack: retryError instanceof Error ? retryError.stack : undefined
          });
          this.logger.error('DSH turn failed after session recreation', {
            channelId: message.channelId,
            messageId: message.messageId,
            error: retryError
          });
          return null;
        }
      }

      this.writeDiagnostic('process-error', {
        channelId: message.channelId,
        messageId: message.messageId,
        error: errorText(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      this.logger.error('DSH turn failed', {
        channelId: message.channelId,
        messageId: message.messageId,
        error
      });
      return null;
    }
  }

  private async runPrompt(message: IncomingDiscordMessage): Promise<string> {
    const connection = await this.ensureConnection(message);
    await this.applyModelSelection(connection.sessionId);
    this.writeDiagnostic('prompting', {
      channelId: message.channelId,
      messageId: message.messageId,
      sessionId: connection.sessionId
    });
    const reply = this.waitForTurn(message.channelId, connection.sessionId, this.replyTimeoutMs);
    const content = [
      { type: 'text' as const, text: formatDshPrompt(message.text, message.replyRequired) }
    ];
    try {
      await this.controller.prompt(
        {
          requestId: randomUUID(),
          sessionId: connection.sessionId,
          mode: 'queue',
          content
        },
        new AbortController().signal
      );
      this.writeDiagnostic('prompt-accepted', {
        channelId: message.channelId,
        messageId: message.messageId,
        sessionId: connection.sessionId
      });
    } catch (error) {
      this.writeDiagnostic('prompt-error', {
        channelId: message.channelId,
        messageId: message.messageId,
        error: errorText(error)
      });
      this.failPending(message.channelId, error);
    }
    return reply;
  }

  private async applyModelSelection(sessionId: string): Promise<void> {
    const selection = this.modelSelection;
    if (!selection) return;
    if (!this.controller.selectModel) {
      throw new Error('sessionController.selectModel is unavailable; cannot apply the configured model');
    }
    await this.controller.selectModel({
      sessionId,
      provider: selection.provider,
      model: selection.model,
      ...(selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {})
    });
    this.logger.debug('applied DSH model selection', {
      sessionId,
      provider: selection.provider,
      model: selection.model,
      reasoningEffort: selection.reasoningEffort ?? null
    });
  }

  private waitForTurn(channelId: string, sessionId: string, timeoutMs: number): Promise<string> {
    if (this.pending.has(channelId)) {
      return Promise.reject(new Error('a DSH turn is already pending for this channel'));
    }

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(channelId);
        reject(new Error(`DSH reply timed out after ${timeoutMs}ms`));
        void this.controller.cancel?.({ sessionId }).catch((error: unknown) => {
          this.logger.warn('failed to cancel timed-out DSH turn', { channelId, sessionId, error });
        });
      }, timeoutMs);

      this.pending.set(channelId, { resolve, reject, timer, turn: null, text: '' });
    });
  }

  private handleEvent(channelId: string, event: SessionEventLike): void {
    const pending = this.pending.get(channelId);
    if (!pending) return;

    if (event.type === 'turn/start') {
      const turn = event.data?.turn;
      if (typeof turn !== 'number' || pending.turn !== null) return;
      pending.turn = turn;
      pending.text = '';
      return;
    }

    if (event.type === 'assistant/message') {
      const turn = event.data?.turn;
      if (typeof turn !== 'number' || pending.turn !== turn) return;
      pending.text += textFromContent(event.data?.message?.content);
      return;
    }

    if (event.type === 'turn/end') {
      const turn = event.data?.turn;
      if (typeof turn !== 'number' || pending.turn !== turn) return;

      this.pending.delete(channelId);
      clearTimeout(pending.timer);
      this.writeDiagnostic('turn-end', {
        channelId,
        turn,
        replyChars: pending.text.length,
        reason: event.data?.reason
      });
      this.logger.debug('DSH turn ended', {
        channelId,
        turn,
        reason: event.data?.reason
      });
      pending.resolve(pending.text);
    }
  }

  private async ensureConnection(message: IncomingDiscordMessage): Promise<Connection> {
    const channelId = message.channelId;
    const existing = this.connections.get(channelId);
    if (existing) return existing;

    const title = formatSessionTitle(
      message.guildName,
      message.channelName,
      message.guildId,
      channelId
    );
    let record = this.records.get(channelId);
    if (record && record.preset !== this.presetId) {
      this.logger.warn('session preset changed; recreating', {
        channelId,
        oldPreset: record.preset,
        newPreset: this.presetId
      });
      this.retire(channelId);
      record = undefined;
    }

    // `rename` resolves and resumes a cold session through SessionController,
    // which composes the recorded agent preset (including the persona). The
    // later prompt then reuses that live agent.
    if (record) {
      await this.applyTitle(record.sessionId, title, channelId);
    } else {
      record = await this.createSession(channelId, title);
    }

    if (record.cwd === this.agentsDir) {
      this.logger.warn('session uses the legacy shared workspace; keeping history', {
        channelId,
        sessionId: record.sessionId,
        cwd: record.cwd
      });
    }
    this.onSessionBound?.(record.sessionId, channelId, record.cwd);

    const connection: Connection = {
      sessionId: record.sessionId,
      unsubscribe: this.subscribeSessionEvents(record.sessionId, (event) => {
        this.handleEvent(channelId, event);
      })
    };
    this.connections.set(channelId, connection);
    return connection;
  }

  private async applyTitle(
    sessionId: string,
    title: string,
    channelId: string
  ): Promise<void> {
    if (!this.controller.rename) return;
    try {
      await this.controller.rename({ sessionId, title });
      this.writeDiagnostic('session-titled', { channelId, sessionId, title });
    } catch (error) {
      this.logger.warn('failed to set DSH session title', {
        channelId,
        sessionId,
        title,
        error
      });
    }
  }

  private workspaceFor(channelId: string): string {
    if (!/^\d{5,}$/.test(channelId)) throw new Error('invalid Discord channel id');
    const workspace = join(this.workspacesDir, channelId);
    mkdirSync(workspace, { recursive: true, mode: 0o700 });
    return workspace;
  }

  private async createSession(channelId: string, title: string): Promise<SessionRecord> {
    if (this.ensurePreset) await this.ensurePreset();
    const workspace = this.workspaceFor(channelId);
    const value = await this.controller.create({
      cwd: workspace,
      agentPreset: this.presetId
    });

    if (value.agentPreset !== this.presetId) {
      throw new Error(
        `DSH created a session without the restricted preset (wanted "${this.presetId}", got "${value.agentPreset ?? 'default'}")`
      );
    }

    await this.applyTitle(value.sessionId, title, channelId);

    const record: SessionRecord = {
      sessionId: value.sessionId,
      preset: this.presetId,
      cwd: workspace,
      updatedAt: Date.now()
    };
    this.records.set(channelId, record);
    saveSessionState(this.statePath, this.records);
    this.logger.info('created DSH session', {
      channelId,
      sessionId: value.sessionId,
      preset: this.presetId
    });
    return record;
  }

  private failPending(channelId: string, error: unknown): void {
    const pending = this.pending.get(channelId);
    if (!pending) return;
    this.pending.delete(channelId);
    clearTimeout(pending.timer);
    pending.reject(error);
  }

  private retire(channelId: string): void {
    const connection = this.connections.get(channelId);
    if (connection) {
      connection.unsubscribe();
      this.connections.delete(channelId);
      this.onSessionRetired?.(connection.sessionId);
    }
    this.failPending(channelId, new Error('DSH session retired'));
    if (this.records.delete(channelId)) {
      saveSessionState(this.statePath, this.records);
    }
  }
}
