import { describe, expect, it } from 'vitest';

import { buildEvidence, durationSeconds, resolveVideoPackage } from '../src/video/analyzer.js';

describe('video analyzer helpers', () => {
  it('maps settings-card package names to safe npx specs', () => {
    expect(resolveVideoPackage('')).toBeNull();
    expect(resolveVideoPackage('guimatheus92/mcp-video-analyzer')).toBe('mcp-video-analyzer');
    expect(resolveVideoPackage(' mcp-video-analyzer@0.11.0 ')).toBe('mcp-video-analyzer@0.11.0');
    expect(resolveVideoPackage('@scope/pkg@^1.2.0')).toBe('@scope/pkg@^1.2.0');
    expect(resolveVideoPackage('--yes')).toBeNull();
    expect(resolveVideoPackage('pkg; rm -rf /')).toBeNull();
    expect(resolveVideoPackage('github:a/b')).toBeNull();
  });

  it('parses numeric and formatted durations', () => {
    expect(durationSeconds({ duration: 19 })).toBe(19);
    expect(durationSeconds({ durationFormatted: '0:19' })).toBe(19);
    expect(durationSeconds({ durationFormatted: '1:02:03' })).toBe(3723);
    expect(durationSeconds({})).toBeUndefined();
  });

  it('keeps the complete subtitle list instead of truncating at 60 rows', () => {
    const transcript = Array.from({ length: 120 }, (_, index) => ({
      time: `${String(index).padStart(2, '0')}:00`,
      text: `line ${String(index)}`
    }));
    const evidence = buildEvidence('Long video', '2:00:00', transcript, [], [], 500_000);
    expect(evidence).toContain('[00:00] line 0');
    expect(evidence).toContain('line 119');
    expect(evidence).not.toContain('另有');
    expect(evidence).toContain('完整字幕');
  });

  it('labels the no-subtitle OCR path', () => {
    const evidence = buildEvidence(
      'Clip',
      '0:05',
      [],
      [{ time: '0:01', text: 'HELLO' }],
      ['ocr warning'],
      500_000
    );
    expect(evidence).toContain('沒有可用字幕');
    expect(evidence).toContain('[0:01] HELLO');
    expect(evidence).toContain('ocr warning');
  });
});
