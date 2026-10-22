export interface ReplyTarget {
  readonly authorName: string;
  readonly authorId: string;
}

export interface MessageMedia {
  readonly stickers?: number;
  readonly images?: number;
  readonly files?: number;
}

export interface NormalizableMessage {
  readonly authorName: string;
  readonly authorId: string;
  readonly createdAt: Date | number;
  readonly messageId: string;
  readonly content: string;
  readonly replyTo?: ReplyTarget | null;
  readonly media?: MessageMedia;
  /** Discord user ID -> display name, used to resolve <@id> mentions. */
  readonly mentions?: ReadonlyMap<string, string>;
}

function formatTimestamp(value: Date | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('createdAt is not a valid date');
  }
  return date.toISOString();
}

function escapePrefixField(value: string, fallback: string): string {
  const normalized = value.trim();
  if (normalized === '') return fallback;
  return normalized
    .replaceAll('|', '｜')
    .replaceAll('[', '［')
    .replaceAll(']', '］')
    .replace(/\s+/g, ' ');
}

function countOf(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function formatReply(replyTo: ReplyTarget | null | undefined): string {
  if (!replyTo) return '-';
  const name = escapePrefixField(replyTo.authorName, '未知使用者');
  const id = escapePrefixField(replyTo.authorId, 'unknown');
  return `${name}(${id})`;
}

function formatContent(message: NormalizableMessage): string {
  let text = message.content;

  if (message.mentions && message.mentions.size > 0) {
    text = text.replace(/<@!?(\d+)>/g, (match, id: string) => {
      const name = message.mentions?.get(id);
      return name ? `@${name}` : match;
    });
  }

  text = text
    // Keep custom emoji names instead of their opaque IDs.
    .replace(/<a?:([^:>]+):\d+>/g, (_match, name: string) => `:${name}:`)
    .replace(/\r\n?/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();

  const parts: string[] = [];
  if (text !== '') parts.push(text);
  for (let index = 0; index < countOf(message.media?.stickers); index += 1) {
    parts.push('[貼圖]');
  }
  for (let index = 0; index < countOf(message.media?.images); index += 1) {
    parts.push('[圖片]');
  }
  for (let index = 0; index < countOf(message.media?.files); index += 1) {
    parts.push('[檔案]');
  }

  return parts.length > 0 ? parts.join(' ') : '[空訊息]';
}

/**
 * Turn one Discord message into the bridge's single-line format:
 *   [author|authorId|time|messageId|replyTarget] content
 *
 * Discord media is represented as text placeholders; the DSH chat agent does
 * not receive images or stickers in stage 1.
 */
export function formatDiscordMessage(message: NormalizableMessage): string {
  const author = escapePrefixField(message.authorName, '未知使用者');
  const authorId = escapePrefixField(message.authorId, 'unknown');
  const time = formatTimestamp(message.createdAt);
  const messageId = escapePrefixField(message.messageId, 'unknown');
  const reply = formatReply(message.replyTo);
  const content = formatContent(message);

  return `[${author}|${authorId}|${time}|${messageId}|${reply}] ${content}`;
}
