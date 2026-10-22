import type { MessageCreateOptions, MessageMentionOptions } from 'discord.js';

import type { Logger } from './logger.js';
import { splitMessage } from './split.js';

/**
 * Stage 1 never pings anyone: no @everyone, no roles, no users, and no reply
 * ping. This is applied to every outgoing message.
 */
export const ALLOWED_MENTIONS: MessageMentionOptions = {
  // parse: [] disables @everyone, roles, and user mentions entirely.
  parse: [],
  roles: [],
  users: [],
  repliedUser: false
};

export interface SendableChannel {
  send(options: MessageCreateOptions): Promise<unknown>;
  sendTyping(): Promise<unknown>;
}

export interface SendReplyOptions {
  readonly logger?: Logger;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly maxRetries?: number;
}

interface RateLimitLike {
  readonly code?: unknown;
  readonly status?: unknown;
  readonly retry_after?: unknown;
  readonly retryAfter?: unknown;
}

function isRateLimit(error: unknown): error is RateLimitLike {
  if (error === null || typeof error !== 'object') return false;
  const record = error as RateLimitLike;
  return record.code === 429 || record.status === 429;
}

function retryDelayMs(error: RateLimitLike, attempt: number): number {
  if (typeof error.retry_after === 'number') {
    return Math.max(100, Math.ceil(error.retry_after * 1000));
  }
  if (typeof error.retryAfter === 'number') {
    // discord.js has exposed this both as seconds and milliseconds; treat
    // small values as seconds and large values as milliseconds.
    const milliseconds = error.retryAfter > 1000 ? error.retryAfter : error.retryAfter * 1000;
    return Math.max(100, Math.ceil(milliseconds));
  }
  return Math.min(30_000, 500 * 2 ** attempt);
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Send one final reply, splitting it to Discord's 2000-character limit.
 * Typing is refreshed before each chunk. A 429 is retried with a bounded
 * backoff; other errors propagate to the caller.
 */
export async function sendReply(
  channel: SendableChannel,
  text: string,
  options: SendReplyOptions = {}
): Promise<number> {
  const chunks = splitMessage(text);
  const sleep = options.sleep ?? defaultSleep;
  const maxRetries = options.maxRetries ?? 3;
  let sent = 0;

  for (const chunk of chunks) {
    try {
      await channel.sendTyping();
    } catch (error) {
      options.logger?.debug('sendTyping failed', { error });
    }

    let attempt = 0;
    for (;;) {
      try {
        await channel.send({
          content: chunk,
          allowedMentions: ALLOWED_MENTIONS
        });
        sent += 1;
        break;
      } catch (error) {
        if (isRateLimit(error) && attempt < maxRetries) {
          const delayMs = retryDelayMs(error, attempt);
          attempt += 1;
          options.logger?.warn('Discord rate limit; retrying', { attempt, delayMs });
          await sleep(delayMs);
          continue;
        }
        throw error;
      }
    }
  }

  return sent;
}
