import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { Logger } from '../logger.js';
import type {
  ContainerEngineLike,
  ContainerSpec,
  EngineCandidate,
  EngineInfo,
  ExecOptions,
  ExecResult
} from './types.js';

const MAX_CAPTURE = 1024 * 1024;

interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
  readonly timedOut: boolean;
}

function appendCapped(current: string, chunk: string): string {
  if (current.length >= MAX_CAPTURE) return current;
  return (current + chunk).slice(0, MAX_CAPTURE);
}

export function runProcess(
  command: string,
  args: readonly string[],
  options: ExecOptions = {}
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const child = spawn(command, [...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: options.env ?? { ...process.env },
      windowsHide: true
    });

    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut });
    };

    const kill = (): void => {
      try {
        child.kill('SIGKILL');
      } catch {
        // The process may already have exited.
      }
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = appendCapped(stdout, chunk.toString('utf8'));
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = appendCapped(stderr, chunk.toString('utf8'));
    });
    child.on('error', (error) => {
      stderr = appendCapped(stderr, `\n[spawn error] ${error.message}`);
      finish(127);
    });
    child.on('close', (code) => finish(code ?? 1));

    if (options.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        timedOut = true;
        kill();
      }, options.timeoutMs);
      timer.unref();
    }

    const abort = (): void => {
      kill();
    };
    if (options.signal) {
      if (options.signal.aborted) abort();
      else options.signal.addEventListener('abort', abort, { once: true });
    }

    if (options.input !== undefined) child.stdin?.end(options.input);
    else child.stdin?.end();
  });
}

export function rankCandidates(candidates: readonly EngineInfo[]): EngineCandidate[] {
  const rank = (info: EngineInfo): number => {
    if (info.kind === 'podman' && info.rootless) return 0;
    if (info.kind === 'docker' && info.rootless) return 1;
    if (info.kind === 'podman') return 2;
    return 3;
  };
  return candidates
    .map((info) => ({ ...info, rank: rank(info) }))
    .sort((a, b) => a.rank - b.rank);
}

async function probePodman(): Promise<EngineInfo | undefined> {
  const result = await runProcess('podman', [
    'info',
    '--format',
    '{{.Host.Security.Rootless}}'
  ]);
  if (result.code !== 0) return undefined;
  const output = result.stdout.trim().toLowerCase();
  if (output !== 'true' && output !== 'false') return undefined;
  return { kind: 'podman', rootless: output === 'true' };
}

async function probeDocker(): Promise<EngineInfo | undefined> {
  const result = await runProcess('docker', [
    'info',
    '--format',
    '{{json .SecurityOptions}}'
  ]);
  if (result.code !== 0) return undefined;
  let options: unknown;
  try {
    options = JSON.parse(result.stdout.trim());
  } catch {
    options = result.stdout;
  }
  const text = Array.isArray(options) ? options.join(' ') : String(options);
  return { kind: 'docker', rootless: /rootless/i.test(text) };
}

export async function detectEngine(logger: Logger): Promise<EngineInfo | undefined> {
  const candidates: EngineInfo[] = [];
  const podman = await probePodman();
  if (podman) candidates.push(podman);
  const docker = await probeDocker();
  if (docker) candidates.push(docker);
  const ranked = rankCandidates(candidates);
  const selected = ranked[0];
  if (!selected) {
    logger.warn('no container engine found; container tools will be disabled', {
      hint: 'install rootless Podman (recommended) or make a Docker daemon available'
    });
    return undefined;
  }
  if (!selected.rootless) {
    logger.warn('using a rootful container engine; broker access is root-equivalent', {
      engine: selected.kind
    });
  }
  return {
    kind: selected.kind,
    rootless: selected.rootless
  };
}

export function containerRunArgs(spec: ContainerSpec): string[] {
  return [
    'run',
    '-d',
    '--name',
    spec.name,
    '--init',
    '--user',
    `${spec.uid}:${spec.gid}`,
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--network',
    'none',
    '--pids-limit',
    String(spec.pids),
    '--memory',
    spec.memory,
    '--cpus',
    String(spec.cpus),
    '--tmpfs',
    `/tmp:rw,noexec,nosuid,size=${spec.tmpfsSize}`,
    '--ulimit',
    'nofile=1024:1024',
    '--mount',
    `type=bind,src=${spec.workspace},dst=/workspace`,
    '--workdir',
    '/workspace',
    spec.image,
    'sleep',
    'infinity'
  ];
}

export class LocalContainerEngine implements ContainerEngineLike {
  constructor(
    readonly info: EngineInfo,
    private readonly logger: Logger,
    private readonly uid = 1000,
    private readonly gid = 1000
  ) {}

  private async run(
    args: readonly string[],
    options: ExecOptions = {}
  ): Promise<ProcessResult> {
    return runProcess(this.info.kind, args, options);
  }

  async imageExists(tag: string): Promise<boolean> {
    const result = await this.run(['image', 'inspect', tag]);
    return result.code === 0;
  }

  async buildImage(tag: string, contextDir: string, dockerfile: string): Promise<void> {
    const dockerConfig = join(tmpdir(), 'dsh-discord-docker-config');
    mkdirSync(dockerConfig, { recursive: true });
    const result = await this.run(
      ['build', '-t', tag, '-f', dockerfile, contextDir],
      {
        timeoutMs: 10 * 60_000,
        env: {
          ...process.env,
          DOCKER_CONFIG: dockerConfig,
          DOCKER_BUILDKIT: '0'
        }
      }
    );
    if (result.code !== 0 || result.timedOut) {
      throw new Error(
        `failed to build sandbox image ${tag}: ${result.stderr || result.stdout || `exit ${result.code}`}`
      );
    }
    this.logger.info('built sandbox image', { engine: this.info.kind, tag });
  }

  async ensureContainer(spec: ContainerSpec): Promise<void> {
    const inspected = await this.run([
      'inspect',
      '--format',
      '{{.State.Running}}',
      spec.name
    ]);
    if (inspected.code === 0) {
      if (inspected.stdout.trim() !== 'true') {
        const started = await this.run(['start', spec.name]);
        if (started.code !== 0) {
          throw new Error(`failed to start container ${spec.name}: ${started.stderr}`);
        }
      }
      return;
    }

    const created = await this.run(containerRunArgs(spec));
    if (created.code !== 0) {
      throw new Error(`failed to create container ${spec.name}: ${created.stderr}`);
    }
  }

  async exec(
    containerName: string,
    argv: readonly string[],
    options: ExecOptions = {}
  ): Promise<ExecResult> {
    const result = await this.run(
      [
        'exec',
        '-i',
        '--user',
        `${this.uid}:${this.gid}`,
        '--workdir',
        '/workspace',
        '--env',
        'HOME=/tmp',
        containerName,
        ...argv
      ],
      options
    );
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
      timedOut: result.timedOut
    };
  }

  async stop(containerName: string): Promise<void> {
    await this.run(['stop', '-t', '2', containerName]);
  }

  async remove(containerName: string): Promise<void> {
    await this.run(['rm', '-f', containerName]);
  }
}
