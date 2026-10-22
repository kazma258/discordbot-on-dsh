import type { SessionEventHandler, SessionEventLike } from './types.js';

/** One global session/event listener fans out to per-session subscribers. */
export class SessionEventBus {
  private readonly handlers = new Map<string, Set<SessionEventHandler>>();

  subscribe(sessionId: string, handler: SessionEventHandler): () => void {
    let set = this.handlers.get(sessionId);
    if (!set) {
      set = new Set();
      this.handlers.set(sessionId, set);
    }
    set.add(handler);
    return () => {
      const current = this.handlers.get(sessionId);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) this.handlers.delete(sessionId);
    };
  }

  dispatch(sessionId: string, event: SessionEventLike): void {
    for (const handler of this.handlers.get(sessionId) ?? []) handler(event);
  }

  clear(): void {
    this.handlers.clear();
  }
}
