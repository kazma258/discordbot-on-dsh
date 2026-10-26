import type { Message } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { createLogger } from '../src/logger.js';
import type { VideoAnalysis, VideoAnalyzerLike } from '../src/video/analyzer.js';
import type { VideoJob } from '../src/video/jobs.js';
import { VideoJobManager } from '../src/video/jobs.js';

const logger = createLogger({ level: 'error', sink: () => undefined });

function analysis(url: string): VideoAnalysis {
  return {
    ok: true,
    url,
    source: 'subtitles',
    transcript: [{ time: '0:01', text: 'hello' }],
    ocr: [],
    frames: [],
    warnings: [],
    evidenceText: '[影片分析] hello'
  };
}

function job(id: string): VideoJob {
  return {
    id,
    message: {
      id,
      channelId: 'channel-1',
      guildId: 'guild-1',
      author: { id: 'author-1' },
      channel: {}
    } as unknown as Message,
    link: { site: 'youtube', id: 'jNQXAC9IVRw', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' },
    normalizedText: '[Alice|1|time|id|-] video',
    originalContent: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    authorName: 'Alice',
    guildName: 'Guild',
    channelName: 'general',
    createdAt: new Date(0)
  };
}

function fakeAnalyzer(delayMs = 0): VideoAnalyzerLike {
  return {
    analyze: async (url) => {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return analysis(url);
    }
  };
}

describe('VideoJobManager', () => {
  it('runs jobs off the caller turn and calls onComplete in order', async () => {
    const completed: string[] = [];
    let resolveDone: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    const manager = new VideoJobManager({
      analyzer: fakeAnalyzer(),
      logger,
      maxConcurrent: 1,
      maxQueue: 4,
      onComplete: async (item) => {
        completed.push(item.id);
        if (completed.length === 2) resolveDone();
      }
    });

    expect(manager.enqueue(job('m1'))).toBe('queued');
    expect(manager.enqueue(job('m2'))).toBe('queued');
    expect(manager.enqueue(job('m1'))).toBe('duplicate');
    await done;
    expect(completed).toEqual(['m1', 'm2']);
    manager.dispose();
  });

  it('reports a full queue without dropping the existing jobs', async () => {
    const manager = new VideoJobManager({
      analyzer: fakeAnalyzer(20),
      logger,
      maxConcurrent: 1,
      maxQueue: 1,
      onComplete: async () => undefined
    });

    expect(manager.enqueue(job('m1'))).toBe('queued');
    expect(manager.enqueue(job('m2'))).toBe('full');
    manager.dispose();
  });
});
