import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { Logger } from './logger.js';

export interface SessionRecord {
  readonly sessionId: string;
  readonly preset: string;
  readonly cwd: string;
  readonly updatedAt: number;
}

interface StoredState {
  readonly version?: number;
  readonly sessions?: Record<string, unknown>;
}

const CHANNEL_ID = /^\d{17,20}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseRecord(value: unknown): SessionRecord | null {
  if (!isRecord(value)) return null;
  const { sessionId, preset, cwd, updatedAt } = value;
  if (
    typeof sessionId !== 'string' ||
    sessionId === '' ||
    typeof preset !== 'string' ||
    preset === '' ||
    typeof cwd !== 'string' ||
    cwd === '' ||
    typeof updatedAt !== 'number' ||
    !Number.isFinite(updatedAt)
  ) {
    return null;
  }
  return { sessionId, preset, cwd, updatedAt };
}

/**
 * Load the channel -> session mapping. Corrupt files are reported and treated
 * as empty so the bridge can recreate sessions instead of failing to boot.
 */
export function loadSessionState(path: string, logger?: Logger): Map<string, SessionRecord> {
  const records = new Map<string, SessionRecord>();
  if (!existsSync(path)) return records;

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    logger?.warn('could not read session state', { path, error });
    return records;
  }

  let parsed: StoredState;
  try {
    parsed = JSON.parse(raw) as StoredState;
  } catch {
    logger?.warn('session state is not valid JSON; starting empty', { path });
    return records;
  }

  if (!isRecord(parsed) || !isRecord(parsed.sessions)) {
    logger?.warn('session state has an unexpected shape; starting empty', { path });
    return records;
  }

  for (const [channelId, value] of Object.entries(parsed.sessions)) {
    if (!CHANNEL_ID.test(channelId)) continue;
    const record = parseRecord(value);
    if (record) records.set(channelId, record);
  }

  return records;
}

/** Atomically replace the session state file. */
export function saveSessionState(path: string, records: ReadonlyMap<string, SessionRecord>): void {
  mkdirSync(dirname(path), { recursive: true });
  const sessions: Record<string, SessionRecord> = Object.create(null);
  for (const [channelId, record] of records) {
    sessions[channelId] = record;
  }

  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ version: 1, sessions }, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });
  renameSync(temporary, path);
}
