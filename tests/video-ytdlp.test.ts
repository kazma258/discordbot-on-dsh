import { describe, expect, it } from 'vitest';

import { checksumFor, ytDlpAsset } from '../src/video/ytdlp.js';

describe('yt-dlp installer', () => {
  it('picks the standalone asset per platform', () => {
    expect(ytDlpAsset('linux', 'x64')).toBe('yt-dlp_linux');
    expect(ytDlpAsset('linux', 'arm64')).toBe('yt-dlp_linux_aarch64');
    expect(ytDlpAsset('darwin', 'arm64')).toBe('yt-dlp_macos');
    expect(ytDlpAsset('win32', 'x64')).toBeNull();
  });

  it('reads the exact asset line from SHA2-256SUMS', () => {
    const hash = 'a'.repeat(64);
    const sums = `${'b'.repeat(64)}  yt-dlp_linux_aarch64\n${hash}  yt-dlp_linux\n`;
    expect(checksumFor(sums, 'yt-dlp_linux')).toBe(hash);
    expect(checksumFor(sums, 'yt-dlp_macos')).toBeNull();
  });
});
