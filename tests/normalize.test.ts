import { describe, expect, it } from 'vitest';

import { formatDiscordMessage, type NormalizableMessage } from '../src/normalize.js';

const AUTHOR_ID = '111111111111111111';
const MESSAGE_ID = '222222222222222222';
const REPLY_AUTHOR_ID = '333333333333333333';
const TIME = new Date('2026-01-02T03:04:05.000Z');

const BASE: NormalizableMessage = {
  authorName: 'Alice',
  authorId: AUTHOR_ID,
  createdAt: TIME,
  messageId: MESSAGE_ID,
  content: 'hello'
};

function format(overrides: Partial<NormalizableMessage> = {}): string {
  return formatDiscordMessage({ ...BASE, ...overrides });
}

describe('formatDiscordMessage', () => {
  it('formats the required single-line prefix and content', () => {
    expect(format()).toBe(`[Alice|${AUTHOR_ID}|2026-01-02T03:04:05.000Z|${MESSAGE_ID}|-] hello`);
  });

  it('accepts a numeric timestamp', () => {
    expect(format({ createdAt: TIME.getTime() })).toBe(
      `[Alice|${AUTHOR_ID}|2026-01-02T03:04:05.000Z|${MESSAGE_ID}|-] hello`
    );
  });

  it('includes the reply target name and ID', () => {
    expect(
      format({
        replyTo: { authorName: 'Bob', authorId: REPLY_AUTHOR_ID }
      })
    ).toBe(
      `[Alice|${AUTHOR_ID}|2026-01-02T03:04:05.000Z|${MESSAGE_ID}|Bob(${REPLY_AUTHOR_ID})] hello`
    );
  });

  it('flattens newlines and repeated whitespace', () => {
    expect(format({ content: 'line one\nline two\t\tline three' })).toBe(
      `[Alice|${AUTHOR_ID}|2026-01-02T03:04:05.000Z|${MESSAGE_ID}|-] line one line two line three`
    );
  });

  it('keeps custom emoji names and drops their IDs', () => {
    expect(format({ content: 'look <:thinking:123456789> <a:party_blob:987654321>' })).toBe(
      `[Alice|${AUTHOR_ID}|2026-01-02T03:04:05.000Z|${MESSAGE_ID}|-] look :thinking: :party_blob:`
    );
  });

  it('resolves known user mentions and leaves unknown ones intact', () => {
    const mentions = new Map<string, string>([['333333333333333333', 'Bob']]);
    expect(
      format({ content: 'hi <@!333333333333333333> and <@444444444444444444>', mentions })
    ).toBe(
      `[Alice|${AUTHOR_ID}|2026-01-02T03:04:05.000Z|${MESSAGE_ID}|-] hi @Bob and <@444444444444444444>`
    );
  });

  it('appends sticker, image, and file placeholders in order', () => {
    expect(
      format({
        content: 'look',
        media: { stickers: 1, images: 2, files: 1 }
      })
    ).toBe(
      `[Alice|${AUTHOR_ID}|2026-01-02T03:04:05.000Z|${MESSAGE_ID}|-] look [貼圖] [圖片] [圖片] [檔案]`
    );
  });

  it('exposes video attachment URLs so the model can pass them to a video tool', () => {
    expect(
      format({
        content: '',
        media: { videos: ['https://cdn.discordapp.com/attachments/1/2/clip.mp4'], files: 1 }
      })
    ).toBe(
      `[Alice|${AUTHOR_ID}|2026-01-02T03:04:05.000Z|${MESSAGE_ID}|-] [影片] https://cdn.discordapp.com/attachments/1/2/clip.mp4 [檔案]`
    );
  });

  it('uses a media placeholder when text is empty', () => {
    expect(format({ content: '', media: { stickers: 1 } })).toBe(
      `[Alice|${AUTHOR_ID}|2026-01-02T03:04:05.000Z|${MESSAGE_ID}|-] [貼圖]`
    );
    expect(format({ content: '', media: { images: 1 } })).toBe(
      `[Alice|${AUTHOR_ID}|2026-01-02T03:04:05.000Z|${MESSAGE_ID}|-] [圖片]`
    );
  });

  it('uses [空訊息] when there is no text or media', () => {
    expect(format({ content: '   ' })).toBe(
      `[Alice|${AUTHOR_ID}|2026-01-02T03:04:05.000Z|${MESSAGE_ID}|-] [空訊息]`
    );
  });

  it('ignores negative or non-finite media counts', () => {
    expect(format({ content: 'x', media: { stickers: -1, images: Number.NaN } })).toBe(
      `[Alice|${AUTHOR_ID}|2026-01-02T03:04:05.000Z|${MESSAGE_ID}|-] x`
    );
  });

  it('escapes prefix delimiters in author and reply fields', () => {
    expect(
      format({
        authorName: 'A|B [C]',
        replyTo: { authorName: 'D|E', authorId: REPLY_AUTHOR_ID }
      })
    ).toBe(
      `[A｜B ［C］|${AUTHOR_ID}|2026-01-02T03:04:05.000Z|${MESSAGE_ID}|D｜E(${REPLY_AUTHOR_ID})] hello`
    );
  });

  it('falls back for empty author and reply fields', () => {
    expect(
      format({
        authorName: '   ',
        replyTo: { authorName: '', authorId: '' }
      })
    ).toBe(
      `[未知使用者|${AUTHOR_ID}|2026-01-02T03:04:05.000Z|${MESSAGE_ID}|未知使用者(unknown)] hello`
    );
  });

  it('rejects an invalid timestamp', () => {
    expect(() => format({ createdAt: Number.NaN })).toThrow('createdAt is not a valid date');
  });
});
