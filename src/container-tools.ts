import type { ContainerToolService } from './container/service.js';

interface ToolExec {
  readonly name: string;
  readonly agent?: { readonly id: string };
  readonly signal?: AbortSignal;
}

interface ToolOutput {
  readonly schema: unknown;
  render(args: unknown, value: unknown): Array<{ type: 'text'; text: string }>;
}

interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: unknown;
  readonly output: ToolOutput;
  readonly timeoutMs?: number;
  readonly isConcurrencySafe?: (args: unknown) => boolean;
  execute(args: unknown, exec: ToolExec): Promise<unknown>;
}

interface ToolRegistry {
  register(definition: ToolDefinition): () => void;
  guard(guard: (exec: ToolExec) => string | undefined): () => void;
}

interface ToolLogger {
  info(message: string, fields?: unknown): void;
  warn(message: string, fields?: unknown): void;
  error(message: string, fields?: unknown): void;
}

interface ContainerToolsContext {
  readonly tools: ToolRegistry;
  readonly discordBotContainers: ContainerToolService;
  readonly logger: ToolLogger;
}

export const name = 'discord-container-tools';
export const inject = ['tools', 'discordBotContainers'];

const CONTAINER_TOOLS = [
  'container_bash',
  'container_read',
  'container_write',
  'container_edit',
  'container_list',
  'container_glob',
  'container_grep'
] as const;
const WEB_TOOLS = ['web_fetch', 'web_search'] as const;
const ALL_TOOLS = new Set<string>([...CONTAINER_TOOLS, ...WEB_TOOLS]);

function sessionId(exec: ToolExec): string {
  const id = exec.agent?.id;
  if (!id) throw new Error('container tools require an agent session');
  return id;
}

function renderJson(value: unknown): Array<{ type: 'text'; text: string }> {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return [{ type: 'text', text: text.slice(0, 64 * 1024) }];
}

function textField(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function optionalInteger(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`);
  return value as number;
}

const stringPath = {
  type: 'string',
  description: 'Path relative to the channel workspace, or /workspace/...'
};

const outputObject = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required
});

function bashTool(service: ContainerToolService): ToolDefinition {
  return {
    name: 'container_bash',
    description:
      'Run one Bash command inside this Discord channel container. The container is workspace-only and has no network.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        command: { type: 'string', description: 'Bash command to run in /workspace' },
        timeoutMs: {
          type: 'integer',
          description: 'Timeout in milliseconds (1000-600000, default 120000)'
        }
      },
      required: ['command']
    },
    output: {
      schema: outputObject(
        {
          stdout: { type: 'string' },
          stderr: { type: 'string' },
          exitCode: { type: 'integer' },
          truncated: { type: 'boolean' }
        },
        ['stdout', 'stderr', 'exitCode']
      ),
      render: (_args, value) => renderJson(value)
    },
    timeoutMs: 610_000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const input = args as { command?: unknown; timeoutMs?: unknown };
      const command = textField(input.command, 'command');
      const timeoutMs = optionalInteger(input.timeoutMs, 'timeoutMs') ?? 120_000;
      const result = await service.runBash(
        sessionId(exec),
        command,
        Math.max(1_000, Math.min(timeoutMs, 600_000)),
        exec.signal
      );
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        truncated:
          result.stdout.length >= 64 * 1024 || result.stderr.length >= 64 * 1024
      };
    }
  };
}

function readTool(service: ContainerToolService): ToolDefinition {
  return {
    name: 'container_read',
    description: 'Read a UTF-8 file from this channel workspace.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: stringPath,
        offset: { type: 'integer', description: 'Byte offset' },
        limit: { type: 'integer', description: 'Maximum bytes (max 262144)' }
      },
      required: ['path']
    },
    output: {
      schema: outputObject(
        { content: { type: 'string' }, truncated: { type: 'boolean' }, bytes: { type: 'integer' } },
        ['content', 'truncated']
      ),
      render: (_args, value) => renderJson(value)
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const input = args as { path?: unknown; offset?: unknown; limit?: unknown };
      return service.runFs(sessionId(exec), 'read', {
        path: textField(input.path, 'path'),
        ...(input.offset !== undefined ? { offset: input.offset } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {})
      }, exec.signal);
    }
  };
}

function writeTool(service: ContainerToolService): ToolDefinition {
  return {
    name: 'container_write',
    description: 'Write a complete UTF-8 file inside this channel workspace.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: stringPath,
        content: { type: 'string', description: 'Complete file content' }
      },
      required: ['path', 'content']
    },
    output: {
      schema: outputObject({ bytes: { type: 'integer' } }, ['bytes']),
      render: (_args, value) => renderJson(value)
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const input = args as { path?: unknown; content?: unknown };
      if (typeof input.content !== 'string') throw new Error('content must be a string');
      return service.runFs(sessionId(exec), 'write', {
        path: textField(input.path, 'path'),
        content: input.content
      }, exec.signal);
    }
  };
}

function editTool(service: ContainerToolService): ToolDefinition {
  return {
    name: 'container_edit',
    description: 'Replace exactly one occurrence of oldText in a workspace file.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: stringPath,
        oldText: { type: 'string', description: 'Text to replace; must match exactly once' },
        newText: { type: 'string', description: 'Replacement text' }
      },
      required: ['path', 'oldText', 'newText']
    },
    output: {
      schema: outputObject({ bytes: { type: 'integer' } }, ['bytes']),
      render: (_args, value) => renderJson(value)
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const input = args as { path?: unknown; oldText?: unknown; newText?: unknown };
      if (typeof input.newText !== 'string') throw new Error('newText must be a string');
      return service.runFs(sessionId(exec), 'edit', {
        path: textField(input.path, 'path'),
        oldText: textField(input.oldText, 'oldText'),
        newText: input.newText
      }, exec.signal);
    }
  };
}

function listTool(service: ContainerToolService): ToolDefinition {
  return {
    name: 'container_list',
    description: 'List one directory inside this channel workspace.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { path: { ...stringPath, description: 'Directory relative to /workspace' } },
      required: ['path']
    },
    output: {
      schema: outputObject(
        {
          entries: { type: 'array', items: { type: 'object' } },
          truncated: { type: 'boolean' }
        },
        ['entries', 'truncated']
      ),
      render: (_args, value) => renderJson(value)
    },
    async execute(args, exec) {
      const input = args as { path?: unknown };
      return service.runFs(sessionId(exec), 'list', {
        path: textField(input.path, 'path')
      }, exec.signal);
    }
  };
}

function globTool(service: ContainerToolService): ToolDefinition {
  return {
    name: 'container_glob',
    description: 'Find files in this channel workspace using a simple glob pattern.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, for example **/*.ts' },
        path: { ...stringPath, description: 'Starting directory' }
      },
      required: ['pattern']
    },
    output: {
      schema: outputObject(
        {
          entries: { type: 'array', items: { type: 'string' } },
          truncated: { type: 'boolean' }
        },
        ['entries', 'truncated']
      ),
      render: (_args, value) => renderJson(value)
    },
    async execute(args, exec) {
      const input = args as { pattern?: unknown; path?: unknown };
      return service.runFs(sessionId(exec), 'glob', {
        pattern: textField(input.pattern, 'pattern'),
        ...(typeof input.path === 'string' ? { path: input.path } : { path: '.' })
      }, exec.signal);
    }
  };
}

function grepTool(service: ContainerToolService): ToolDefinition {
  return {
    name: 'container_grep',
    description: 'Search UTF-8 files in this channel workspace with a regular expression.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        pattern: { type: 'string', description: 'Regular expression' },
        path: { ...stringPath, description: 'Directory to search' }
      },
      required: ['pattern']
    },
    output: {
      schema: outputObject(
        {
          entries: { type: 'array', items: { type: 'string' } },
          truncated: { type: 'boolean' }
        },
        ['entries', 'truncated']
      ),
      render: (_args, value) => renderJson(value)
    },
    async execute(args, exec) {
      const input = args as { pattern?: unknown; path?: unknown };
      return service.runFs(sessionId(exec), 'grep', {
        pattern: textField(input.pattern, 'pattern'),
        ...(typeof input.path === 'string' ? { path: input.path } : { path: '.' })
      }, exec.signal);
    }
  };
}

export async function apply(ctx: ContainerToolsContext): Promise<void> {
  const service = ctx.discordBotContainers;
  await service.ready;
  const available = service.available;

  if (!available) {
    ctx.logger.warn('container tools disabled; only web tools remain', service.status());
  } else {
    for (const tool of [
      bashTool(service),
      readTool(service),
      writeTool(service),
      editTool(service),
      listTool(service),
      globTool(service),
      grepTool(service)
    ]) {
      ctx.tools.register(tool);
    }
  }

  const allowed = new Set<string>(available ? ALL_TOOLS : WEB_TOOLS);
  ctx.tools.guard((exec) =>
    allowed.has(exec.name)
      ? undefined
      : `tool "${exec.name}" is not allowed in the Discord bot preset`
  );
  ctx.logger.info('container tool registry ready', {
    available,
    expected: [...allowed]
  });
}
