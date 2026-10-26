import { describe, expect, it } from 'vitest';

import { extractVideoLink } from '../src/video/links.js';

describe('extractVideoLink', () => {
  it('canonicalizes YouTube links', () => {
    expect(extractVideoLink('look https://youtu.be/jNQXAC9IVRw?t=3')).toEqual({
      site: 'youtube',
      id: 'jNQXAC9IVRw',
      url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw'
    });
    expect(extractVideoLink('<https://www.youtube.com/shorts/jNQXAC9IVRw>')).toMatchObject({
      site: 'youtube',
      id: 'jNQXAC9IVRw'
    });
  });

  it('keeps Bilibili page numbers', () => {
    expect(extractVideoLink('https://www.bilibili.com/video/BV1GJ411x7h7/?p=2')).toEqual({
      site: 'bilibili',
      id: 'BV1GJ411x7h7',
      url: 'https://www.bilibili.com/video/BV1GJ411x7h7?p=2'
    });
  });

  it('accepts direct video files', () => {
    expect(extractVideoLink('https://cdn.example.test/clip.mp4')).toEqual({
      site: 'direct',
      url: 'https://cdn.example.test/clip.mp4'
    });
  });

  it('ignores ordinary links and empty messages', () => {
    expect(extractVideoLink('https://example.test/article')).toBeNull();
    expect(extractVideoLink('no links')).toBeNull();
  });
});
