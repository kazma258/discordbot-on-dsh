import { describe, expect, it } from 'vitest';

import {
  ACCESS_COMMAND_NAMES,
  buildAccessCommand,
  resolveAccessMode
} from '../src/commands.js';

describe('access slash commands', () => {
  it('uses on when the mode option is omitted', () => {
    expect(resolveAccessMode(undefined)).toBe('on');
    expect(resolveAccessMode(null)).toBe('on');
    expect(resolveAccessMode('on')).toBe('on');
    expect(resolveAccessMode('off')).toBe('off');
    expect(resolveAccessMode('invalid')).toBeNull();
  });

  it('builds /deeplook with an optional mode option', () => {
    const json = buildAccessCommand('deeplook').toJSON();
    expect(json.name).toBe('deeplook');
    expect(json.options).toHaveLength(1);
    expect(json.options?.[0]).toMatchObject({
      name: 'mode',
      required: false,
      type: 3
    });
    expect(ACCESS_COMMAND_NAMES).toEqual(['deeplook', '大肥魚']);
  });
});
