import type { Logger } from '../logger.js';

export type EngineKind = 'podman' | 'docker';

export interface EngineInfo {
  readonly kind: EngineKind;
  readonly rootless: boolean;
  readonly version?: string;
}

export interface EngineCandidate extends EngineInfo {
  readonly rank: number;
}

export interface ExecOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly input?: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface ExecResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
}

export interface ContainerSpec {
  readonly name: string;
  readonly image: string;
  readonly workspace: string;
  readonly uid: number;
  readonly gid: number;
  readonly memory: string;
  readonly pids: number;
  readonly cpus: number;
  readonly tmpfsSize: string;
}

export interface ContainerLimits {
  readonly memory: string;
  readonly pids: number;
  readonly cpus: number;
  readonly tmpfsSize: string;
}

export interface ContainerEngineLike {
  readonly info: EngineInfo;
  imageExists(tag: string): Promise<boolean>;
  buildImage(tag: string, contextDir: string, dockerfile: string): Promise<void>;
  ensureContainer(spec: ContainerSpec): Promise<void>;
  exec(containerName: string, argv: readonly string[], options: ExecOptions): Promise<ExecResult>;
  stop(containerName: string): Promise<void>;
  remove(containerName: string): Promise<void>;
}

export interface ContainerManagerOptions {
  readonly workspaceRoot: string;
  readonly image: string;
  readonly containerDir: string;
  readonly uid: number;
  readonly gid: number;
  readonly idleMs: number;
  readonly limits: ContainerLimits;
  readonly logger: Logger;
  readonly quotaBytes: number;
}

export interface SessionBinding {
  readonly channelId: string;
  readonly workspace: string;
}
