import { describe, expect, it } from 'vitest';

import { apply } from '../src/container-tools.js';
import type { ContainerToolService } from '../src/container/service.js';

interface FakeDefinition {
  name: string;
  execute(args: unknown, exec: { name: string; agent?: { id: string } }): Promise<unknown>;
}

interface FakeRegistry {
  names: string[];
  definitions: Map<string, FakeDefinition>;
  guard?: (exec: { name: string }) => string | undefined;
}

function fakeService(available: boolean): ContainerToolService {
  return {
    ready: Promise.resolve(),
    available,
    status: () => ({ available }),
    runBash: async () => ({ stdout: 'pwd\n', stderr: '', exitCode: 0, timedOut: false }),
    runFs: async () => ({})
  } as unknown as ContainerToolService;
}

function setup(available: boolean) {
  const registry: FakeRegistry = { names: [], definitions: new Map() };
  const ctx = {
    discordBotContainers: fakeService(available),
    tools: {
      register(definition: FakeDefinition) {
        registry.names.push(definition.name);
        registry.definitions.set(definition.name, definition);
        return () => undefined;
      },
      guard(guard: (exec: { name: string }) => string | undefined) {
        registry.guard = guard;
        return () => undefined;
      }
    },
    logger: { info() {}, warn() {}, error() {} }
  };
  return { ctx, registry };
}

describe('container tools preset', () => {
  it('registers only the expected container tools and creates an allowlist guard', async () => {
    const { ctx, registry } = setup(true);
    await apply(ctx as never);
    expect(registry.names.sort()).toEqual([
      'container_bash',
      'container_edit',
      'container_glob',
      'container_grep',
      'container_list',
      'container_read',
      'container_write'
    ]);
    expect(registry.guard?.({ name: 'web_fetch' })).toBeUndefined();
    expect(registry.guard?.({ name: 'container_bash' })).toBeUndefined();
    expect(registry.guard?.({ name: 'bash' })).toMatch(/not allowed/);

    const bash = registry.definitions.get('container_bash');
    await expect(
      bash?.execute({ command: 'pwd' }, { name: 'container_bash', agent: { id: 'session-1' } })
    ).resolves.toMatchObject({ stdout: 'pwd\n', exitCode: 0 });
  });

  it('registers no container tools when no engine is available', async () => {
    const { ctx, registry } = setup(false);
    await apply(ctx as never);
    expect(registry.names).toEqual([]);
    expect(registry.guard?.({ name: 'web_search' })).toBeUndefined();
    expect(registry.guard?.({ name: 'container_bash' })).toMatch(/not allowed/);
  });
});
