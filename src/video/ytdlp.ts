/** Install the official standalone yt-dlp binary into the plugin's bin dir. */

import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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
  const target = join(binDir, 'yt-dlp');
  const temp = `${target}.download`;
  try {
    writeFileSync(temp, bytes, { mode: 0o755 });
    chmodSync(temp, 0o755);
    renameSync(temp, target);
  } finally {
    rmSync(temp, { force: true });
  }
  return asset;
}
