export interface MessageScope {
  /** null for direct messages, which this stage ignores. */
  readonly guildId: string | null;
  readonly channelId: string;
  readonly authorIsBot: boolean;
  readonly mentionedBot: boolean;
  readonly repliedToBot: boolean;
  /** Per-channel read toggle controlled by the administrator slash command. */
  readonly accessEnabled: boolean;
}

export type MessageAction = 'ignore' | 'process';

export interface MessageDecision {
  readonly action: MessageAction;
  readonly replyRequired: boolean;
}

/**
 * Discord role permissions decide which channels the bot can see; the bridge
 * adds an explicit per-channel read toggle on top. A disabled channel is
 * ignored entirely. Enabled channels forward every human message to DSH;
 * only an @mention or a reply to the bot forces a Discord reply.
 */
export function classifyMessage(scope: MessageScope): MessageDecision {
  if (scope.authorIsBot) return { action: 'ignore', replyRequired: false };
  if (scope.guildId === null) return { action: 'ignore', replyRequired: false };
  if (!scope.accessEnabled) return { action: 'ignore', replyRequired: false };

  return {
    action: 'process',
    replyRequired: scope.mentionedBot || scope.repliedToBot
  };
}
