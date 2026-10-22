import type { MessageCreateOptions } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { ALLOWED_MENTIONS, sendReply, type SendableChannel } from '../src/sender.js';

class FakeChannel implements SendableChannel {
  readonly sent: MessageCreateOptions[] = [];
  readonly failures: unknown[] = [];
  readonly sleeps: number[] = [];
  typingCount = 0;
  typingFails = false;

  async send(options: MessageCreateOptions): Promise<unknown> {
    const failure = this.failures.shift();
    if (failure !== undefined) throw failure;
    this.sent.push(options);
    return {};
  }

  async sendTyping(): Promise<unknown> {
    this.typingCount += 1;
    if (this.typingFails) throw new Error('typing failed');
    return {};
  }
}

const sleep = async (ms: number): Promise<void> => {
  recordedSleeps.push(ms);
};

let recordedSleeps: number[] = [];

describe('sendReply', () => {
  it('sends nothing for an empty reply', async () => {
    const channel = new FakeChannel();
    const sent = await sendReply(channel, '   ', { sleep });
    expect(sent).toBe(0);
    expect(channel.sent).toHaveLength(0);
  });

  it('sends one short reply with mentions disabled', async () => {
    const channel = new FakeChannel();
    const sent = await sendReply(channel, 'hello', { sleep });

    expect(sent).toBe(1);
    expect(channel.typingCount).toBe(1);
    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0]).toEqual({
      content: 'hello',
      allowedMentions: ALLOWED_MENTIONS
    });
  });

  it('splits a long reply into multiple sends and types before each', async () => {
    const channel = new FakeChannel();
    const text = 'a'.repeat(4500);
    const sent = await sendReply(channel, text, { sleep });

    expect(sent).toBe(3);
    expect(channel.typingCount).toBe(3);
    expect(channel.sent.map((message) => String(message.content).length)).toEqual([2000, 2000, 500]);
  });

  it('retries a 429 with a bounded wait', async () => {
    recordedSleeps = [];
    const channel = new FakeChannel();
    channel.failures.push({ code: 429, retry_after: 0.01 });

    const sent = await sendReply(channel, 'hello', { sleep });

    expect(sent).toBe(1);
    expect(recordedSleeps).toEqual([100]);
    expect(channel.sent).toHaveLength(1);
  });

  it('rethrows after the retry budget is exhausted', async () => {
    const channel = new FakeChannel();
    channel.failures.push({ code: 429, retry_after: 0.01 });
    channel.failures.push({ code: 429, retry_after: 0.01 });

    await expect(sendReply(channel, 'hello', { sleep, maxRetries: 1 })).rejects.toEqual({
      code: 429,
      retry_after: 0.01
    });
    expect(channel.sent).toHaveLength(0);
  });

  it('propagates non-rate-limit errors', async () => {
    const channel = new FakeChannel();
    channel.failures.push(new Error('missing permissions'));

    await expect(sendReply(channel, 'hello', { sleep })).rejects.toThrow('missing permissions');
  });

  it('still sends when sendTyping fails', async () => {
    const channel = new FakeChannel();
    channel.typingFails = true;

    await expect(sendReply(channel, 'hello', { sleep })).resolves.toBe(1);
    expect(channel.sent).toHaveLength(1);
  });
});
