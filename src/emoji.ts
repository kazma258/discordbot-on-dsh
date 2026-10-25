export interface ApplicationEmojiInfo {
  readonly id: string;
  readonly name: string;
  readonly animated: boolean;
}

export const MAX_PROMPT_EMOJIS = 80;

/**
 * Build a name-keyed catalog. Application emoji names are the only model-facing
 * handle; the bridge never lets the model invent emoji IDs.
 */
export function buildApplicationEmojiMap(
  emojis: Iterable<{ id: string; name: string | null; animated?: boolean | null }>
): Map<string, ApplicationEmojiInfo> {
  const map = new Map<string, ApplicationEmojiInfo>();
  for (const emoji of emojis) {
    const name = emoji.name?.trim();
    if (!name) continue;
    map.set(name, {
      id: emoji.id,
      name,
      animated: emoji.animated === true
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
