/** Event-driven queue for background video analysis. */

import type { Message } from 'discord.js';

import type { Logger } from '../logger.js';
import type { VideoAnalysis, VideoAnalyzerLike } from './analyzer.js';
import type { VideoLink } from './links.js';

export interface VideoJob {
  readonly id: string;
  readonly message: Message;
  readonly link: VideoLink;
  /** Formatted bridge line, retained for the completion prompt. */
  readonly normalizedText: string;
  /** Raw Discord content, with the URL replaced before it reaches the model. */
  readonly originalContent: string;
  readonly authorName: string;
  readonly guildName: string;
  readonly channelName: string;
  readonly createdAt: Date;
}

export interface VideoJobManagerOptions {
  readonly analyzer: VideoAnalyzerLike;
  readonly logger: Logger;
  readonly onComplete: (job: VideoJob, result: VideoAnalysis) => Promise<void>;
  readonly maxConcurrent?: number;
  readonly maxQueue?: number;
}

function failedAnalysis(url: string, error: unknown): VideoAnalysis {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    url,
    source: 'none',
    transcript: [],
    ocr: [],
    frames: [],
    warnings: [],
    error: message,
    evidenceText: `[影片分析失敗] ${message}`
  };
}

/**
 * Runs analysis off the Discord turn. Ordinary messages keep flowing through
 * the session queue while this manager works; completion calls onComplete,
 * which creates a new prompt for the original video message.
 */
export class VideoJobManager {
  private readonly analyzer: VideoAnalyzerLike;
  private readonly logger: Logger;
  private readonly onComplete: VideoJobManagerOptions['onComplete'];
  private readonly maxConcurrent: number;
  private readonly maxQueue: number;
  private readonly queue: VideoJob[] = [];
  private readonly seen = new Set<string>();
  private readonly abort = new AbortController();
  private active = 0;
  private disposed = false;

  constructor(options: VideoJobManagerOptions) {
    this.analyzer = options.analyzer;
    this.logger = options.logger;
    this.onComplete = options.onComplete;
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 1);
    this.maxQueue = Math.max(1, options.maxQueue ?? 8);
  }

  enqueue(job: VideoJob): 'queued' | 'duplicate' | 'full' {
    if (this.disposed) return 'full';
    if (this.seen.has(job.id)) return 'duplicate';
    if (this.active + this.queue.length >= this.maxQueue) return 'full';

    this.seen.add(job.id);
    this.queue.push(job);
    this.logger.info('video job queued', {
      messageId: job.id,
      site: job.link.site,
      url: job.link.url
    });
    this.drain();
    return 'queued';
  }

  dispose(): void {
    this.disposed = true;
    this.abort.abort();
    this.queue.length = 0;
  }

  private drain(): void {
    while (!this.disposed && this.active < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift();
      if (job === undefined) return;
      this.active += 1;
      void this.run(job).finally(() => {
        this.active -= 1;
        this.drain();
      });
    }
  }

  private async run(job: VideoJob): Promise<void> {
    try {
      const result = await this.analyzer.analyze(job.link.url, this.abort.signal);
      if (this.disposed) return;
      await this.onComplete(job, result);
    } catch (error) {
      if (this.disposed) return;
      this.logger.warn('video job failed', { messageId: job.id, error });
      try {
        await this.onComplete(job, failedAnalysis(job.link.url, error));
      } catch (completionError) {
        this.logger.error('video job completion failed', {
          messageId: job.id,
          error: completionError
        });
      }
    }
  }
}
