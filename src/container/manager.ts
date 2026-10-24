import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { Logger } from '../logger.js';
import type {
  ContainerEngineLike,
  ContainerManagerOptions,
  ExecResult,
  SessionBinding
} from './types.js';

interface ChannelState {
  readonly name: string;
  readonly workspace: string;
  timer?: NodeJS.Timeout;
}

const CHANNEL_ID = /^\d{5,}$/;

function channelContainerName(channelId: string): string {
  if (!CHANNEL_ID.test(channelId)) throw new Error('invalid Discord channel id');
  return `dsh-discord-${channelId}`;
}

function directoryBytes(path: string): number {
  let total = 0;
  let entries: string[];
  try {
    entries = readdirSync(path);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = join(path, entry);
    try {
      const info = statSync(full);
      if (info.isDirectory()) total += directoryBytes(full);
      else total += info.size;
    } catch {
      // A concurrent delete should not fail the whole quota check.
    }
  }
  return total;
}

export class ContainerManager {
  private readonly channels = new Map<string, ChannelState>();
  private readonly locks = new Map<string, Promise<void>>();
  private readonly sessions = new Map<string, SessionBinding>();
  private imageReady = false;
  private disposed = false;

  constructor(
    private readonly engine: ContainerEngineLike,
    private readonly options: ContainerManagerOptions
  ) {}

  private workspaceFor(channelId: string): string {
    const workspace = join(this.options.workspaceRoot, channelId);
    mkdirSync(workspace, { recursive: true, mode: 0o700 });
    return workspace;
  }

  bindSession(sessionId: string, binding: SessionBinding): void {
    this.sessions.set(sessionId, binding);
  }

  unbindSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  bindingFor(sessionId: string): SessionBinding {
    const binding = this.sessions.get(sessionId);
    if (!binding) {
      throw new Error('this session has no Discord channel binding for container tools');
    }
    return binding;
  }

  private async ensureImage(): Promise<void> {
    if (this.imageReady) return;
    if (await this.engine.imageExists(this.options.image)) {
      this.imageReady = true;
      return;
    }
    const dockerfile = join(this.options.containerDir, 'Dockerfile');
    await this.engine.buildImage(
      this.options.image,
      this.options.containerDir,
      dockerfile
    );
    this.imageReady = true;
  }

  private async ensureChannel(
    channelId: string,
    workspace: string
  ): Promise<ChannelState> {
    const name = channelContainerName(channelId);
    let state = this.channels.get(channelId);
    if (state) {
      this.resetIdleTimer(state);
      return state;
    }
    await this.ensureImage();
    mkdirSync(workspace, { recursive: true, mode: 0o700 });
    await this.engine.ensureContainer({
      name,
      image: this.options.image,
      workspace,
      uid: this.options.uid,
      gid: this.options.gid,
      memory: this.options.limits.memory,
      pids: this.options.limits.pids,
      cpus: this.options.limits.cpus,
      tmpfsSize: this.options.limits.tmpfsSize
    });
    state = { name, workspace };
    this.channels.set(channelId, state);
    this.resetIdleTimer(state);
    this.options.logger.info('Discord container ready', {
      channelId,
      container: name
    });
    return state;
  }

  private resetIdleTimer(state: ChannelState): void {
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      void this.stopChannel(state);
    }, this.options.idleMs);
    state.timer.unref();
  }

  private async stopChannel(state: ChannelState): Promise<void> {
    if (state.timer) clearTimeout(state.timer);
    state.timer = undefined;
    for (const [channelId, current] of this.channels) {
      if (current === state) this.channels.delete(channelId);
    }
    try {
      await this.engine.stop(state.name);
    } catch (error) {
      this.options.logger.warn('failed to stop idle Discord container', {
        container: state.name,
        error
      });
    }
  }

  private async withChannelLock<T>(
    channelId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const previous = this.locks.get(channelId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.locks.set(channelId, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(channelId) === tail) this.locks.delete(channelId);
    }
  }

  async exec(
    sessionId: string,
    argv: readonly string[],
    options: { input?: string; timeoutMs?: number; signal?: AbortSignal } = {}
  ): Promise<ExecResult> {
    const binding = this.bindingFor(sessionId);
    if (this.disposed) throw new Error('container manager is disposed');
    const workspace = binding.workspace || this.workspaceFor(binding.channelId);
    return this.withChannelLock(binding.channelId, async () => {
      const state = await this.ensureChannel(binding.channelId, workspace);
      let result: ExecResult;
      try {
        result = await this.engine.exec(state.name, argv, options);
      } catch (error) {
        await this.restart(binding.channelId);
        throw error;
      }
      this.resetIdleTimer(state);
      if (result.timedOut) {
        await this.restart(binding.channelId);
        throw new Error('container command timed out; the channel container was restarted');
      }
      return result;
    });
  }

  async restart(channelId: string): Promise<void> {
    const state = this.channels.get(channelId);
    this.channels.delete(channelId);
    if (!state) return;
    if (state.timer) clearTimeout(state.timer);
    try {
      await this.engine.remove(state.name);
    } catch (error) {
      this.options.logger.warn('failed to remove Discord container', {
        container: state.name,
        error
      });
    }
  }

  async assertQuota(workspace: string, incomingBytes: number): Promise<void> {
    const current = directoryBytes(workspace);
    if (current + incomingBytes > this.options.quotaBytes) {
      throw new Error(
        `workspace quota exceeded (${current + incomingBytes} > ${this.options.quotaBytes} bytes)`
      );
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const state of this.channels.values()) {
      if (state.timer) clearTimeout(state.timer);
      try {
        await this.engine.stop(state.name);
      } catch {
        // Best effort during shutdown.
      }
    }
    this.channels.clear();
    this.sessions.clear();
  }
}
