import { describe, expect, it } from 'vitest';

import { containerRunArgs, rankCandidates } from '../src/container/engine.js';

describe('container engine selection', () => {
  it('prefers rootless Podman, then rootless Docker, then rootful engines', () => {
    const ranked = rankCandidates([
      { kind: 'docker', rootless: false },
      { kind: 'podman', rootless: false },
      { kind: 'docker', rootless: true },
      { kind: 'podman', rootless: true }
    ]);
    expect(ranked.map((candidate) => `${candidate.kind}:${candidate.rootless}`)).toEqual([
      'podman:true',
      'docker:true',
      'podman:false',
      'docker:false'
    ]);
  });

  it('builds a hardened container command', () => {
    const args = containerRunArgs({
      name: 'dsh-discord-123456789',
      image: 'local/dsh-discord-sandbox:0.5.0',
      workspace: '/tmp/workspace',
      uid: 1000,
      gid: 1000,
      memory: '512m',
      pids: 256,
      cpus: 1,
      tmpfsSize: '64m'
    });
    expect(args).toContain('--read-only');
    expect(args).toContain('--cap-drop');
    expect(args).toContain('ALL');
    expect(args).toContain('--security-opt');
    expect(args).toContain('no-new-privileges');
    expect(args).toContain('--network');
    expect(args).toContain('none');
    expect(args).toContain('--init');
    expect(args.join(' ')).toContain('src=/tmp/workspace,dst=/workspace');
    expect(args).not.toContain('--privileged');
    expect(args.join(' ')).not.toContain('docker.sock');
  });
});
