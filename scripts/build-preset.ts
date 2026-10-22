import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDiscordPresetPatch } from './preset.js';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, '..');
const persona = readFileSync(join(pluginRoot, 'persona', 'character.md'), 'utf8');
const output = join(pluginRoot, 'presets', 'discord-whale.patch.yml');

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, buildDiscordPresetPatch(persona), 'utf8');
process.stdout.write(`Wrote ${output}\n`);
