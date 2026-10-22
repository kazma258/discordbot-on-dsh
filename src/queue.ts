/**
 * Serialize work per key (one Discord channel) without letting a rejected
 * task block the next one.
 */
export class KeyedQueue {
  private readonly tails = new Map<string, Promise<void>>();

  enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const run = previous.then(task);
    const settled = run.then(
      () => undefined,
      () => undefined
    );

    this.tails.set(key, settled);
    void settled.finally(() => {
      if (this.tails.get(key) === settled) this.tails.delete(key);
    });

    return run;
  }
}
