export interface IncomingDiscordMessage {
  readonly guildId: string;
  readonly guildName: string;
  readonly channelId: string;
  readonly channelName: string;
  readonly messageId: string;
  readonly authorId: string;
  readonly authorName: string;
  readonly createdAt: Date;
  readonly text: string;
  readonly replyRequired: boolean;
  /** Optional messages are recorded during cooldown without producing a reply. */
  readonly cooldownActive?: boolean;
}

export interface MessageHandler {
  /** Returns the final reply text, or null/empty when no reply should be sent. */
  onMessage(message: IncomingDiscordMessage): Promise<string | null>;
}

export interface ModelSelection {
  readonly provider: string;
  readonly model: string;
  readonly reasoningEffort?: string;
}

/** The subset of DSH's sessionController service the Discord plugin needs. */
export interface SessionControllerLike {
  create(request: { cwd: string; agentPreset: string }): Promise<{
    sessionId: string;
    agentPreset?: string;
  }>;

  prompt(
    request: {
      requestId: string;
      sessionId: string;
      mode: 'queue';
      content: readonly { type: 'text'; text: string }[];
    },
    signal?: AbortSignal
  ): Promise<unknown>;

  selectModel?(request: {
    sessionId: string;
    provider: string;
    model: string;
    reasoningEffort?: string;
  }): Promise<unknown>;

  rename?(request: { sessionId: string; title: string }): Promise<unknown>;

  cancel?(request: { sessionId: string }): Promise<unknown>;

  modelCatalog?(): Promise<unknown>;
}

export interface SessionEventLike {
  readonly type: string;
  readonly data?: {
    readonly turn?: number;
    readonly reason?: string;
    readonly message?: {
      readonly content?: readonly { readonly type?: string; readonly text?: string }[];
    };
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
}

export type SessionEventHandler = (event: SessionEventLike) => void;

/** Subscribe to live session/event traffic for one session; returns an unsubscribe. */
export type SessionEventSubscriber = (
  sessionId: string,
  handler: SessionEventHandler
) => () => void;
