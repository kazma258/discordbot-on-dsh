import type { ApplicationEmojiNote } from './emoji-catalog.js';

export interface ApplicationEmojiInfo {
  readonly id: string;
  readonly name: string;
  readonly animated: boolean;
  readonly localNote?: string;
  readonly usage?: string;
}

export const MAX_PROMPT_EMOJIS = 80;
export const MAX_PROMPT_EMOJI_CHARS = 8_000;

/**
 * Build a name-keyed catalog. Application emoji names are the only model-facing
 * handle; the bridge never lets the model invent emoji IDs.
 */
export function buildApplicationEmojiMap(
  emojis: Iterable<{ id: string; name: string | null; animated?: boolean | null }>,
  notes: readonly ApplicationEmojiNote[] = []
): Map<string, ApplicationEmojiInfo> {
  const notesById = new Map<string, ApplicationEmojiNote>();
  const notesByName = new Map<string, ApplicationEmojiNote>();
  for (const note of notes) {
    notesById.set(note.id, note);
    notesByName.set(note.name, note);
  }

  const map = new Map<string, ApplicationEmojiInfo>();
  for (const emoji of emojis) {
    const name = emoji.name?.trim();
    if (!name) continue;
    const note = notesById.get(emoji.id) ?? notesByName.get(name);
    map.set(name, {
      id: emoji.id,
      name,
      animated: emoji.animated === true,
      ...(note?.localNote ? { localNote: note.localNote } : {}),
      ...(note?.usage ? { usage: note.usage } : {})
    });
  }
  return map;
}

/** Resolve model-written `:name:` tokens against application emojis only. */
export function renderApplicationEmojis(
  text: string,
  emojis: ReadonlyMap<string, ApplicationEmojiInfo>
): string {
  if (emojis.size === 0) return text;
  return text.replace(/:([A-Za-z0-9_]+):/g, (token, name: string) => {
    const emoji = emojis.get(name);
    if (!emoji) return token;
    return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
  });
}

export function applicationEmojiPromptNames(
  emojis: ReadonlyMap<string, ApplicationEmojiInfo>
): string[] {
  return [...emojis.keys()].sort().slice(0, MAX_PROMPT_EMOJIS);
}

/**
 * The model needs the local meaning and usage, not only the emoji name.
 * Keep this block bounded so a large application catalog cannot dominate the
 * prompt.
 */
export function applicationEmojiPrompt(
  emojis: ReadonlyMap<string, ApplicationEmojiInfo>
): string | undefined {
  if (emojis.size === 0) return undefined;
  const all = [...emojis.values()].sort((a, b) => a.name.localeCompare(b.name));
  const selected = all.slice(0, MAX_PROMPT_EMOJIS);
  const lines: string[] = [];
  let used = 0;
  let truncated = selected.length < all.length;

  for (const emoji of selected) {
    const note = emoji.localNote ? `：${emoji.localNote}` : '';
    const usage = emoji.usage ? ` 用法：${emoji.usage}` : '';
    const line = `- :${emoji.name}:${note}${usage}`;
    if (used + line.length > MAX_PROMPT_EMOJI_CHARS) {
      truncated = true;
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }

  if (lines.length === 0) return undefined;
  return [
    '[可用應用表情]',
    ...lines,
    ...(truncated ? ['（只列出部分 application emoji；需要其他名稱時查看使用者訊息。）'] : []),
    '使用 :name: 形式輸出；bridge 會轉成實際 application emoji。'
  ].join('\n');
}
