import { describe, expect, it } from 'vitest';

import { SessionEventBus } from '../src/events.js';

describe('SessionEventBus', () => {
  it('subscribe works after the method is detached', () => {
    const bus = new SessionEventBus();
    const subscribe = bus.subscribe;
    let seen = 0;
    const unsubscribe = subscribe('session-1', () => {
      seen += 1;
    });

    bus.dispatch('session-1', { type: 'turn/end', data: { turn: 1 } });
    expect(seen).toBe(1);

    unsubscribe();
    bus.dispatch('session-1', { type: 'turn/end', data: { turn: 2 } });
    expect(seen).toBe(1);
  });
});
