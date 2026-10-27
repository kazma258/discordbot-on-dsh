/** Persist Netscape cookies for yt-dlp. The secret stays in DSH credentials. */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Write `content` as a 0600 cookies file, or delete it when empty. */
export function writeYtDlpCookies(file: string, content: string | null): boolean {
  if (content === null || content.trim() === '') {
    rmSync(file, { force: true });
    return false;
  }
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`, { mode: 0o600 });
  return true;
}
