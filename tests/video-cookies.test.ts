import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { writeYtDlpCookies } from '../src/video/cookies.js';

describe('yt-dlp cookies file', () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
    directories.length = 0;
  });

  it('writes mode 0600 and deletes the file when cleared', () => {
    const directory = mkdtempSync(join(tmpdir(), 'yt-cookies-'));
    directories.push(directory);
    const file = join(directory, 'nested', 'cookies.txt');

    expect(writeYtDlpCookies(file, '# Netscape HTTP Cookie File\n.youtube.com\tTRUE')).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(writeYtDlpCookies(file, '  ')).toBe(false);
    expect(() => statSync(file)).toThrow();
  });
});
