import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Logger } from './logger.js';

interface StoredAccess {
  readonly version?: number;
  readonly enabledChannels?: unknown;
}

const CHANNEL_ID = /^\d{17,20}$/;

/**
 * Per-channel read toggle. A new channel is disabled until an administrator
 * runs `/deeplook`; the state survives DSH restarts.
 */
export class ChannelAccessStore {
  private readonly path: string;
  private readonly logger: Logger;
  private enabled = new Set<string>();

  constructor(path: string, logger: Logger) {
    this.path = path;
    this.logger = logger;
  }

  load(): void {
    this.enabled = new Set<string>();
    if (!existsSync(this.path)) return;
    let parsed: StoredAccess;
    try {
      parsed = JSON.parse(readFileSync(this.path, 'utf8')) as StoredAccess;
    } catch (error) {
      this.logger.warn('channel access state is not valid JSON; starting closed', {
        path: this.path,
        error
      });
      return;
    }
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      !Array.isArray(parsed.enabledChannels)
    ) {
      this.logger.warn('channel access state has an unexpected shape; starting closed', {
        path: this.path
      });
      return;
    }
    for (const channelId of parsed.enabledChannels) {
      if (typeof channelId === 'string' && CHANNEL_ID.test(channelId)) {
        this.enabled.add(channelId);
      }
    }
  }

  isEnabled(channelId: string): boolean {
    return this.enabled.has(channelId);
  }

  enabledChannels(): ReadonlySet<string> {
    return this.enabled;
  }

  setEnabled(channelId: string, enabled: boolean): void {
    if (enabled) this.enabled.add(channelId);
    else this.enabled.delete(channelId);
    this.save();
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(
      temporary,
      `${JSON.stringify(
        { version: 1, enabledChannels: [...this.enabled].sort() },
        null,
        2
      )}\n`,
      { encoding: 'utf8', mode: 0o600 }
    );
    renameSync(temporary, this.path);
  }
}
