/**
 * Agent-scope prompt contribution: the Discord application-emoji catalog.
 *
 * The bridge renders the catalog with `applicationEmojiPrompt()` and writes it
 * to `emoji-index.txt` after it fetches the application emojis. This row
 * registers a prompt variable that reads that file at assembly time, so each
 * model request carries exactly one copy in the system prompt. The catalog no
 * longer rides on every user message, where it accumulated in session history.
 */

import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const name = 'discord-emoji-index';

/** The prompt registry this row contributes to. */
export const inject = ['systemPrompt'];

/** Prompt variable the persona template references. */
export const EMOJI_INDEX_VARIABLE = 'discord_emoji_index';

interface PromptVariableRegistry {
  variable(name: string, provider: () => string | undefined): () => void;
}

interface PluginContext {
  readonly systemPrompt: PromptVariableRegistry;
  effect(execute: () => () => void, label?: string): void;
}

/** Default catalog path; `DSH_DISCORD_EMOJI_INDEX` overrides it. */
export function defaultEmojiIndexPath(): string {
  const override = process.env.DSH_DISCORD_EMOJI_INDEX?.trim();
  if (override !== undefined && override !== '') return override;
  const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
  return join(home, 'discord-bot', 'emoji-index.txt');
}

/**
 * Read the catalog, reusing the last text while the file's identity is stable.
 * A missing or unreadable file yields an empty string: prompt interpolation
 * treats an undefined variable as an assembly error, while empty text simply
 * contributes nothing.
 */
export function createEmojiIndexReader(path: string): () => string {
  let cache: { mtimeMs: number; size: number; text: string } | undefined;

  return () => {
    try {
      const info = statSync(path);
      if (cache !== undefined && cache.mtimeMs === info.mtimeMs && cache.size === info.size) {
        return cache.text;
      }
      const text = readFileSync(path, 'utf8').trim();
      cache = { mtimeMs: info.mtimeMs, size: info.size, text };
      return text;
    } catch {
      cache = undefined;
      return '';
    }
  };
}

/**
 * Register the catalog variable for the mounting agent scope. The variable is
 * evaluated for each assembly, so a rewritten catalog applies on the next
 * model step without restarting DSH.
 */
export function apply(ctx: PluginContext): void {
  const read = createEmojiIndexReader(defaultEmojiIndexPath());
  ctx.effect(
    () => ctx.systemPrompt.variable(EMOJI_INDEX_VARIABLE, () => read()),
    'emojiIndex.variable()'
  );
}
