#!/usr/bin/env node
// Container-side file helper. Every path is resolved inside /workspace; this
// program never receives a host path and never runs on the host.
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';

const ROOT = '/workspace';
const MAX_READ = 256 * 1024;
const MAX_ENTRIES = 1000;

function inside(target) {
  return target === ROOT || target.startsWith(`${ROOT}${path.sep}`);
}

function toContainerPath(input) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error('path must be a non-empty string');
  }
  const target = path.isAbsolute(input)
    ? path.normalize(input)
    : path.resolve(ROOT, input);
  if (!inside(target)) throw new Error('path is outside /workspace');
  return target;
}

function resolveRead(input) {
  const target = toContainerPath(input);
  const resolved = realpathSync(target);
  if (!inside(resolved)) throw new Error('symlink resolves outside /workspace');
  return resolved;
}

function resolveWrite(input) {
  const target = toContainerPath(input);
  const parent = path.dirname(target);
  const parentReal = realpathSync(parent);
  if (!inside(parentReal)) throw new Error('parent resolves outside /workspace');
  if (existsSync(target)) {
    const info = lstatSync(target);
    if (info.isSymbolicLink()) throw new Error('refusing to write through a symlink');
    const real = realpathSync(target);
    if (!inside(real)) throw new Error('file resolves outside /workspace');
  }
  return target;
}

function readText(input) {
  const target = resolveRead(input.path);
  const info = statSync(target);
  if (!info.isFile()) throw new Error('not a regular file');
  const buffer = readFileSync(target);
  if (buffer.includes(0)) throw new Error('binary file');
  const offset = Number.isInteger(input.offset) ? Math.max(0, input.offset) : 0;
  const limit = Number.isInteger(input.limit)
    ? Math.max(1, Math.min(input.limit, MAX_READ))
    : MAX_READ;
  const slice = buffer.subarray(offset, offset + limit);
  return {
    content: slice.toString('utf8'),
    truncated: offset + limit < buffer.length,
    bytes: buffer.length
  };
}

function writeText(input) {
  const target = resolveWrite(input.path);
  if (typeof input.content !== 'string') throw new Error('content must be a string');
  writeFileSync(target, input.content, { encoding: 'utf8', mode: 0o600 });
  return { bytes: Buffer.byteLength(input.content, 'utf8') };
}

function editText(input) {
  const target = resolveWrite(input.path);
  const before = readFileSync(target, 'utf8');
  if (typeof input.oldText !== 'string' || input.oldText.length === 0) {
    throw new Error('oldText must be a non-empty string');
  }
  const first = before.indexOf(input.oldText);
  if (first < 0) throw new Error('oldText was not found');
  if (before.indexOf(input.oldText, first + 1) >= 0) {
    throw new Error('oldText matched more than once');
  }
  const after = before.slice(0, first) + input.newText + before.slice(first + input.oldText.length);
  writeFileSync(target, after, { encoding: 'utf8', mode: 0o600 });
  return { bytes: Buffer.byteLength(after, 'utf8') };
}

function listing(input) {
  const target = resolveRead(input.path ?? '.');
  const info = statSync(target);
  if (!info.isDirectory()) throw new Error('not a directory');
  const entries = [];
  for (const name of readdirSync(target).sort()) {
    const full = path.join(target, name);
    const item = lstatSync(full);
    entries.push({
      name,
      type: item.isDirectory() ? 'dir' : item.isFile() ? 'file' : item.isSymbolicLink() ? 'symlink' : 'other'
    });
    if (entries.length >= MAX_ENTRIES) break;
  }
  return { entries, truncated: entries.length >= MAX_ENTRIES };
}

function globToRegExp(pattern) {
  let out = '^';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i += 1;
        if (pattern[i + 1] === '/') i += 1;
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') out += '[^/]';
    else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`${out}$`);
}

function globFiles(input) {
  const base = resolveRead(input.path ?? '.');
  const matcher = globToRegExp(input.pattern ?? '*');
  const results = [];
  const walk = (dir) => {
    if (results.length >= MAX_ENTRIES) return;
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const item = lstatSync(full);
      if (item.isSymbolicLink()) continue;
      if (item.isDirectory()) {
        if (name === 'node_modules' || name === '.git') continue;
        walk(full);
      } else if (item.isFile()) {
        const rel = path.relative(ROOT, full);
        if (matcher.test(rel)) results.push(rel);
      }
      if (results.length >= MAX_ENTRIES) return;
    }
  };
  walk(base);
  return { entries: results, truncated: results.length >= MAX_ENTRIES };
}

function grepFiles(input) {
  const base = resolveRead(input.path ?? '.');
  const pattern = new RegExp(input.pattern, 'g');
  const results = [];
  const scan = (full) => {
    if (results.length >= MAX_ENTRIES) return;
    const info = lstatSync(full);
    if (info.isSymbolicLink()) return;
    if (info.isDirectory()) {
      for (const name of readdirSync(full).sort()) {
        if (name === 'node_modules' || name === '.git') continue;
        scan(path.join(full, name));
        if (results.length >= MAX_ENTRIES) return;
      }
      return;
    }
    if (!info.isFile() || info.size > 2 * 1024 * 1024) return;
    const buffer = readFileSync(full);
    if (buffer.includes(0)) return;
    const text = buffer.toString('utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length && results.length < MAX_ENTRIES; i += 1) {
      if (pattern.test(lines[i])) {
        results.push(`${path.relative(ROOT, full)}:${i + 1}:${lines[i].slice(0, 500)}`);
      }
      pattern.lastIndex = 0;
    }
  };
  scan(base);
  return { entries: results, truncated: results.length >= MAX_ENTRIES };
}

function output(value) {
  return JSON.stringify(value);
}

function main() {
  const action = process.argv[2];
  let input = {};
  try {
    const stdin = readFileSync(0, 'utf8').trim();
    if (stdin !== '') input = JSON.parse(stdin);
    let result;
    switch (action) {
      case 'read': result = readText(input); break;
      case 'write': result = writeText(input); break;
      case 'edit': result = editText(input); break;
      case 'list': result = listing(input); break;
      case 'glob': result = globFiles(input); break;
      case 'grep': result = grepFiles(input); break;
      default: throw new Error(`unknown action: ${action}`);
    }
    process.stdout.write(output({ ok: true, ...result }));
  } catch (error) {
    process.stdout.write(
      output({ ok: false, error: error instanceof Error ? error.message : String(error) })
    );
    process.exitCode = 1;
  }
}

main();
