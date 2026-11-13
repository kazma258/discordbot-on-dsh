import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createEmojiIndexReader, defaultEmojiIndexPath } from '../src/system-prompt.js';

const temporaryDirs: string[] = [];

function temporaryDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-emoji-index-'));
  temporaryDirs.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('emoji index reader', () => {
  it('returns the trimmed catalog text', () => {
    const path = join(temporaryDir(), 'emoji-index.txt');
    writeFileSync(path, '\n[可用應用表情]\n- :smug: 得意\n', 'utf8');

    expect(createEmojiIndexReader(path)()).toBe('[可用應用表情]\n- :smug: 得意');
  });

  it('returns an empty string when the catalog is missing', () => {
    const path = join(temporaryDir(), 'sessions.json', 'emoji-index.txt');

    expect(createEmojiIndexReader(path)()).toBe('');
  });

  it('re-reads the catalog after the file changes', () => {
    const path = join(temporaryDir(), 'emoji-index.txt');
    writeFileSync(path, '[可用應用表情]\n- :old: 舊', 'utf8');
    const read = createEmojiIndexReader(path);
    expect(read()).toContain(':old:');

    writeFileSync(path, '[可用應用表情]\n- :new: 新內容', 'utf8');
    expect(read()).toContain(':new:');
  });
});

describe('emoji index path', () => {
  it('honours the DSH_DISCORD_EMOJI_INDEX override', () => {
    const previous = process.env.DSH_DISCORD_EMOJI_INDEX;
    process.env.DSH_DISCORD_EMOJI_INDEX = '/tmp/custom-emoji-index.txt';
    try {
      expect(defaultEmojiIndexPath()).toBe('/tmp/custom-emoji-index.txt');
    } finally {
      if (previous === undefined) delete process.env.DSH_DISCORD_EMOJI_INDEX;
      else process.env.DSH_DISCORD_EMOJI_INDEX = previous;
    }
  });
});
