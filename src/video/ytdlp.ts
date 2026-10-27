/** Install the official standalone yt-dlp binary into the plugin's bin dir. */

import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RELEASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';

/** Standalone (no Python) release asset for this host, or null when unsupported. */
export function ytDlpAsset(platform: string = process.platform, arch: string = process.arch): string | null {
  if (platform === 'linux' && arch === 'x64') return 'yt-dlp_linux';
  if (platform === 'linux' && arch === 'arm64') return 'yt-dlp_linux_aarch64';
  if (platform === 'darwin') return 'yt-dlp_macos';
  return null;
}

/** Find `asset`'s hash in a SHA2-256SUMS file (`<hex>  <name>` per line). */
export function checksumFor(sums: string, asset: string): string | null {
  for (const line of sums.split('\n')) {
    const match = /^([0-9a-f]{64})\s+\*?(\S+)$/i.exec(line.trim());
    if (match?.[2] === asset) return match[1]!.toLowerCase();
  }
  return null;
}

async function download(url: string, signal: AbortSignal): Promise<Buffer> {
  const response = await fetch(url, { signal, redirect: 'follow' });
  if (!response.ok) throw new Error(`下載失敗 HTTP ${String(response.status)}：${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Download the latest release, verify it against the release's SHA2-256SUMS,
 * and atomically replace `<binDir>/yt-dlp`. Returns the installed asset name.
 */
export async function installYtDlp(binDir: string, signal: AbortSignal): Promise<string> {
  const asset = ytDlpAsset();
  if (asset === null) {
    throw new Error(`不支援的平台 ${process.platform}/${process.arch}；請自行安裝 yt-dlp 到 PATH`);
  }
  const sums = (await download(`${RELEASE}/SHA2-256SUMS`, signal)).toString('utf8');
  const expected = checksumFor(sums, asset);
  if (expected === null) throw new Error(`SHA2-256SUMS 沒有 ${asset}`);

  const bytes = await download(`${RELEASE}/${asset}`, signal);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) throw new Error(`${asset} 雜湊不符，已拒絕安裝`);

  mkdirSync(binDir, { recursive: true, mode: 0o700 });
  const real = join(binDir, 'yt-dlp.real');
  const temp = `${real}.download`;
  try {
    writeFileSync(temp, bytes, { mode: 0o755 });
    chmodSync(temp, 0o755);
    renameSync(temp, real);
  } finally {
    rmSync(temp, { force: true });
  }
  installYtDlpWrapper(binDir);
  return asset;
}

const WRAPPER_MARK = 'ytdlp-sub-lang-wrapper';

/**
 * mcp-video-analyzer asks yt-dlp for `en.*` only. A zh-TW auto-caption is then
 * skipped, and the frame pass keeps the first scene cuts (often under a minute).
 * The wrapper tries zh/ja/ko first and falls back to the original request.
 */
const WRAPPER = `#!/usr/bin/env node
// ${WRAPPER_MARK}
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const real = fileURLToPath(new URL('./yt-dlp.real', import.meta.url));
const args = process.argv.slice(2);
const langAt = args.indexOf('--sub-langs');
if (langAt === -1 || args[langAt + 1] !== 'en.*') {
  const run = spawnSync(real, args, { stdio: 'inherit' });
  process.exit(run.status ?? 1);
}
const preferred = args.slice();
preferred[langAt + 1] = 'zh-TW,zh-Hans,zh-Hant,ja,ko';
const first = spawnSync(real, preferred, { stdio: 'inherit' });
const out = args[args.indexOf('-o') + 1];
let got = false;
if (typeof out === 'string') {
  try {
    got = readdirSync(dirname(out)).some((name) => name.endsWith('.vtt'));
  } catch {
    got = false;
  }
}
if (got) process.exit(first.status ?? 0);
const second = spawnSync(real, args, { stdio: 'inherit' });
process.exit(second.status ?? 1);
`;

/** Point `bin/yt-dlp` at the wrapper. An existing official binary is kept as `yt-dlp.real`. */
export function installYtDlpWrapper(binDir: string): void {
  const link = join(binDir, 'yt-dlp');
  const real = join(binDir, 'yt-dlp.real');
  let current: Buffer;
  try {
    current = readFileSync(link);
  } catch {
    return;
  }
  if (!current.includes(WRAPPER_MARK)) renameSync(link, real);
  writeFileSync(link, WRAPPER, { mode: 0o755 });
  chmodSync(link, 0o755);
}
