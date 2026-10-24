import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ChannelAccessStore } from '../src/access.js';
import { createLogger } from '../src/logger.js';

const logger = createLogger({ level: 'error', sink: () => undefined });
const CHANNEL = '222222222222222222';

describe('ChannelAccessStore', () => {
  it('starts closed, toggles one channel, and persists across reloads', () => {
    const dir = mkdtempSync(join(tmpdir(), 'discord-access-'));
    try {
      const path = join(dir, 'access.json');
      const first = new ChannelAccessStore(path, logger);
      first.load();
      expect(first.isEnabled(CHANNEL)).toBe(false);

      first.setEnabled(CHANNEL, true);
      expect(first.isEnabled(CHANNEL)).toBe(true);
      expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
        version: 1,
        enabledChannels: [CHANNEL]
      });

      const second = new ChannelAccessStore(path, logger);
      second.load();
      expect(second.isEnabled(CHANNEL)).toBe(true);

      second.setEnabled(CHANNEL, false);
      const third = new ChannelAccessStore(path, logger);
      third.load();
      expect(third.isEnabled(CHANNEL)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
