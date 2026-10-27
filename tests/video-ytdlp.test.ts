import { describe, expect, it } from 'vitest';

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { checksumFor, installYtDlpWrapper, ytDlpAsset } from '../src/video/ytdlp.js';

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

  it('tries zh-TW subtitles before the analyzer default en.*', () => {
    const bin = mkdtempSync(join(tmpdir(), 'yt-wrap-'));
    const out = mkdtempSync(join(tmpdir(), 'yt-out-'));
    writeFileSync(
      join(bin, 'yt-dlp'),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$0.args"\ncase " $* " in *"zh-TW"* ) printf "WEBVTT\\n" > "$5.zh-TW.vtt";; esac\n',
      { mode: 0o755 }
    );
    installYtDlpWrapper(bin);
    execFileSync(join(bin, 'yt-dlp'), ['--skip-download', '--sub-langs', 'en.*', '-o', join(out, 'subs')]);
    const args = readFileSync(join(bin, 'yt-dlp.real.args'), 'utf8');
    expect(args).toContain('zh-TW,zh-Hans,zh-Hant,ja,ko');
    expect(args).not.toContain('en.*');
    rmSync(bin, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  });
});
