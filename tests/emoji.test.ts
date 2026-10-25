import { describe, expect, it } from 'vitest';

import { APPLICATION_EMOJI_NOTES } from '../src/emoji-catalog.js';
import {
  applicationEmojiPrompt,
  applicationEmojiPromptNames,
  buildApplicationEmojiMap,
  MAX_PROMPT_EMOJIS,
  renderApplicationEmojis
} from '../src/emoji.js';

describe('application emojis', () => {
  it('renders known static and animated emojis', () => {
    const catalog = buildApplicationEmojiMap([
      { id: '111', name: 'wave', animated: false },
      { id: '222', name: 'party', animated: true }
    ]);
    expect(renderApplicationEmojis('hi :wave: :party:', catalog)).toBe(
      'hi <:wave:111> <a:party:222>'
    );
  });

  it('leaves unknown and malformed tokens unchanged', () => {
    const catalog = buildApplicationEmojiMap([{ id: '111', name: 'wave' }]);
    expect(renderApplicationEmojis(':unknown: :: :wave', catalog)).toBe(
      ':unknown: :: :wave'
    );
  });

  it('merges local notes by emoji id and includes usage in the prompt', () => {
    const catalog = buildApplicationEmojiMap(
      [
        { id: '1563794176162660412', name: 'smug', animated: false },
        { id: '999', name: 'unannotated', animated: false }
      ],
      APPLICATION_EMOJI_NOTES
    );
    const prompt = applicationEmojiPrompt(catalog);
    expect(prompt).toContain(':smug:');
    expect(prompt).toContain('知道些什麼');
    expect(prompt).toContain('用法：');
    expect(prompt).toContain(':unannotated:');
  });

  it('sorts and caps the prompt list', () => {
    const entries = Array.from({ length: MAX_PROMPT_EMOJIS + 5 }, (_, index) => ({
      id: String(index),
      name: `emoji_${String(index).padStart(3, '0')}`
    }));
    const names = applicationEmojiPromptNames(buildApplicationEmojiMap(entries));
    expect(names).toHaveLength(MAX_PROMPT_EMOJIS);
    expect(names[0]).toBe('emoji_000');
  });
});
