import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ContainerManager } from '../src/container/manager.js';
import type {
  ContainerEngineLike,
  ContainerSpec,
  ExecOptions,
  ExecResult
} from '../src/container/types.js';
import { createLogger } from '../src/logger.js';

const logger = createLogger({ level: 'error', sink: () => undefined });

class FakeEngine implements ContainerEngineLike {
  readonly info = { kind: 'docker' as const, rootless: false };
  imageExistsCalls = 0;
  ensureCalls = 0;
  execCalls = 0;
  removeCalls = 0;
  maxConcurrent = 0;
  active = 0;
  timedOut = false;
  delayMs = 0;

  async imageExists(): Promise<boolean> {
    this.imageExistsCalls += 1;
    return true;
  }

  async buildImage(): Promise<void> {}

  async ensureContainer(_spec: ContainerSpec): Promise<void> {
    this.ensureCalls += 1;
  }

  async exec(_name: string, _argv: readonly string[], _options?: ExecOptions): Promise<ExecResult> {
    this.execCalls += 1;
    this.active += 1;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.active);
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    this.active -= 1;
    return { stdout: 'ok', stderr: '', exitCode: 0, timedOut: this.timedOut };
  }

  async stop(): Promise<void> {}
  async remove(): Promise<void> {
    this.removeCalls += 1;
  }
}

function withManager(run: (manager: ContainerManager, dir: string) => Promise<void>): Promise<void> {
  return (async () => {
    const dir = mkdtempSync(join(tmpdir(), 'discord-container-'));
    try {
      const manager = new ContainerManager(new FakeEngine(), {
        workspaceRoot: join(dir, 'workspaces'),
        image: 'image',
        containerDir: join(dir, 'container'),
        uid: 1000,
        gid: 1000,
        idleMs: 60_000,
        limits: { memory: '512m', pids: 256, cpus: 1, tmpfsSize: '64m' },
        logger,
        quotaBytes: 1024
      });
      await run(manager, dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  })();
}

describe('ContainerManager', () => {
  it('creates one container and serializes commands for a channel', async () => {
    await withManager(async (manager) => {
      const engine = (manager as unknown as { engine: FakeEngine }).engine;
      engine.delayMs = 10;
      manager.bindSession('session-1', {
        channelId: '123456789',
        workspace: join(tmpdir(), 'unused-workspace')
      });
      const results = await Promise.all([
        manager.exec('session-1', ['true']),
        manager.exec('session-1', ['true'])
      ]);
      expect(results.map((result) => result.exitCode)).toEqual([0, 0]);
      expect(engine.ensureCalls).toBe(1);
      expect(engine.maxConcurrent).toBe(1);
    });
  });

  it('restarts the channel container after a timeout', async () => {
    await withManager(async (manager) => {
      const engine = (manager as unknown as { engine: FakeEngine }).engine;
      engine.timedOut = true;
      manager.bindSession('session-1', {
        channelId: '123456789',
        workspace: join(tmpdir(), 'unused-workspace')
      });
      await expect(manager.exec('session-1', ['slow'])).rejects.toThrow(/timed out/);
      expect(engine.removeCalls).toBe(1);
    });
  });

  it('rejects a write that exceeds the workspace quota', async () => {
    await withManager(async (manager, dir) => {
      const workspace = join(dir, 'quota');
      mkdirSync(workspace);
      writeFileSync(join(workspace, 'base'), 'x'.repeat(600));
      await expect(manager.assertQuota(workspace, 100)).resolves.toBeUndefined();
      await expect(manager.assertQuota(workspace, 600)).rejects.toThrow(/quota/);
    });
  });

  it('rejects an unbound session', async () => {
    await withManager(async (manager) => {
      await expect(manager.exec('missing', ['true'])).rejects.toThrow(/not bound|no Discord/);
    });
  });
});
