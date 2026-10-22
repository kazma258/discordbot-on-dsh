export interface WhitelistConfig {
  readonly allowedGuildIds: ReadonlySet<string>;
  readonly allowedChannelIds: ReadonlySet<string>;
}

export interface MessageScope {
  /** null for direct messages, which stage 1 ignores. */
  readonly guildId: string | null;
  readonly channelId: string;
  readonly authorIsBot: boolean;
  readonly mentionedBot: boolean;
  readonly repliedToBot: boolean;
}

export type MessageAction = 'ignore' | 'process';

export interface MessageDecision {
  readonly action: MessageAction;
  readonly replyRequired: boolean;
}

export function isAllowedGuild(guildId: string | null, config: WhitelistConfig): boolean {
  return guildId !== null && config.allowedGuildIds.has(guildId);
}

export function isAllowedChannel(channelId: string, config: WhitelistConfig): boolean {
  return config.allowedChannelIds.has(channelId);
}

/**
 * Decide whether a message belongs to the bridge at all, and whether it must
 * produce a Discord reply. Under plan A every whitelisted human message is
 * forwarded to DSH; only an @mention or a reply to the bot forces a reply.
 */
export function classifyMessage(scope: MessageScope, config: WhitelistConfig): MessageDecision {
  if (scope.authorIsBot) return { action: 'ignore', replyRequired: false };
  if (scope.guildId === null) return { action: 'ignore', replyRequired: false };
  if (!isAllowedGuild(scope.guildId, config)) return { action: 'ignore', replyRequired: false };
  if (!isAllowedChannel(scope.channelId, config)) return { action: 'ignore', replyRequired: false };

  return {
    action: 'process',
    replyRequired: scope.mentionedBot || scope.repliedToBot
  };
}

/** Any guild outside the allowlist must be left as soon as it is seen. */
export function shouldLeaveGuild(guildId: string, config: WhitelistConfig): boolean {
  return !config.allowedGuildIds.has(guildId);
}
