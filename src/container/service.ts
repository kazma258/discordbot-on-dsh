import { join } from 'node:path';

import type { Logger } from '../logger.js';
import { detectEngine, LocalContainerEngine } from './engine.js';
import { ContainerManager } from './manager.js';
import type {
  ContainerEngineLike,
  ContainerLimits,
  EngineInfo,
  ExecResult,
  SessionBinding
} from './types.js';

export interface ContainerServiceOptions {
  readonly baseDir: string;
  readonly containerDir: string;
  readonly image: string;
  readonly uid: number;
  readonly gid: number;
  readonly idleMs: number;
  readonly limits: ContainerLimits;
  readonly quotaBytes: number;
  readonly logger: Logger;
  /** Test seam; production resolves rootless Podman/Docker. */
  readonly engine?: ContainerEngineLike;
}

export interface ContainerStatus {
  readonly available: boolean;
  readonly engine?: EngineInfo;
  readonly image: string;
  readonly error?: string;
}

const MAX_TIMEOUT_SECONDS = 600;

export class ContainerToolService {
  readonly ready: Promise<void>;
  private managerValue?: ContainerManager;
  private readonly bindings = new Map<string, SessionBinding>();
  private engineInfo?: EngineInfo;
  private error?: string;
  private disposed = false;

  constructor(private readonly options: ContainerServiceOptions) {
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const engine =
        this.options.engine ??
        (await (async () => {
          const info = await detectEngine(this.options.logger);
          if (!info) return undefined;
          return new LocalContainerEngine(
            info,
            this.options.logger,
            this.options.uid,
            this.options.gid
          );
        })());
      if (!engine) {
        this.error = 'no usable Podman or Docker engine';
        return;
      }
      this.engineInfo = engine.info;
      this.managerValue = new ContainerManager(engine, {
        workspaceRoot: join(this.options.baseDir, 'workspaces'),
        image: this.options.image,
        containerDir: this.options.containerDir,
        uid: this.options.uid,
        gid: this.options.gid,
        idleMs: this.options.idleMs,
        limits: this.options.limits,
        logger: this.options.logger,
        quotaBytes: this.options.quotaBytes
      });
      for (const [sessionId, binding] of this.bindings) {
        this.managerValue.bindSession(sessionId, binding);
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.options.logger.warn('container tools disabled', { error });
    }
  }

  get available(): boolean {
    return this.managerValue !== undefined;
  }

  status(): ContainerStatus {
    return {
      available: this.available,
      ...(this.engineInfo ? { engine: this.engineInfo } : {}),
      image: this.options.image,
      ...(this.error ? { error: this.error } : {})
    };
  }

  bindSession(sessionId: string, binding: SessionBinding): void {
    this.bindings.set(sessionId, binding);
    this.managerValue?.bindSession(sessionId, binding);
  }

  unbindSession(sessionId: string): void {
    this.bindings.delete(sessionId);
    this.managerValue?.unbindSession(sessionId);
  }

  private manager(): ContainerManager {
    if (!this.managerValue) {
      throw new Error(
        this.error ?? 'container tools are unavailable; install rootless Podman or Docker'
      );
    }
    return this.managerValue;
  }

  private binding(sessionId: string): SessionBinding {
    const binding = this.bindings.get(sessionId);
    if (!binding) {
      throw new Error('this session is not bound to a Discord channel workspace');
    }
    return binding;
  }

  private workspacePath(sessionId: string, input: string): string {
    const binding = this.binding(sessionId);
    const workspace = binding.workspace;
    if (input === workspace) return '/workspace';
    if (input.startsWith(`${workspace}/`)) {
      return `/workspace/${input.slice(workspace.length + 1)}`;
    }
    return input;
  }

  async runBash(
    sessionId: string,
    command: string,
    timeoutMs = 120_000,
    signal?: AbortSignal
  ): Promise<ExecResult> {
    if (command.trim() === '') throw new Error('command must not be empty');
    const seconds = Math.max(
      1,
      Math.min(MAX_TIMEOUT_SECONDS, Math.ceil(timeoutMs / 1000))
    );
    const result = await this.manager().exec(
      sessionId,
      ['timeout', '-k', '5', String(seconds), 'bash', '-lc', command],
      { timeoutMs: (seconds + 10) * 1000, signal }
    );
    if (result.exitCode === 124) {
      const binding = this.binding(sessionId);
      await this.manager().restart(binding.channelId);
      throw new Error('container command timed out; the channel container was restarted');
    }
    return result;
  }

  async runFs(
    sessionId: string,
    action: 'read' | 'write' | 'edit' | 'list' | 'glob' | 'grep',
    payload: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> {
    const binding = this.binding(sessionId);
    const path = payload.path;
    const mapped: Record<string, unknown> = {
      ...payload,
      ...(typeof path === 'string' ? { path: this.workspacePath(sessionId, path) } : {})
    };
    if (action === 'write' || action === 'edit') {
      const estimate =
        typeof mapped.content === 'string'
          ? Buffer.byteLength(mapped.content, 'utf8')
          : typeof mapped.newText === 'string'
            ? Buffer.byteLength(mapped.newText, 'utf8')
            : 0;
      await this.manager().assertQuota(binding.workspace, estimate);
    }
    const result = await this.manager().exec(
      sessionId,
      ['node', '/usr/local/bin/dsh-fs.mjs', action],
      { input: JSON.stringify(mapped), timeoutMs: 30_000, signal }
    );
    let value: Record<string, unknown> | undefined;
    try {
      value = JSON.parse(result.stdout) as Record<string, unknown>;
    } catch {
      value = undefined;
    }
    if (value?.ok !== true) {
      throw new Error(
        String(value?.error ?? result.stderr.trim() ?? `container fs ${action} failed`)
      );
    }
    const { ok: _ok, ...rest } = value;
    return rest;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.managerValue?.dispose();
    this.managerValue = undefined;
    this.bindings.clear();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}

export function containerImageTag(version: string): string {
  return `local/dsh-discord-sandbox:${version}`;
}
