export type AutonomyEvent = {
  id: string;
  type: string;
  timestamp: string;
  payload?: Record<string, unknown>;
};

export type EventHandler = (event: AutonomyEvent) => void | Promise<void>;

/**
 * Lightweight in-memory event bus for autonomy triggers (Phase 7)
 */
export class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  subscribe(type: string, handler: EventHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  async emit(event: AutonomyEvent): Promise<void> {
    const listeners = this.handlers.get(event.type);
    if (!listeners || listeners.size === 0) return;
    const tasks = Array.from(listeners).map(async (handler) => {
      try {
        await handler(event);
      } catch (err) {
        // Best-effort: autonomy bus should not crash on handler error
        console.warn('[EventBus] handler failed', err);
      }
    });
    await Promise.all(tasks);
  }
}
