/**
 * Minimal typed event emitter for WebSocket lifecycle events.
 *
 * Generic over an event map `M` so the compiler enforces correct
 * payload types per event name. `on()` returns an unsubscribe
 * function for ergonomic cleanup in `useEffect`-style contexts.
 */

type Listener<T> = (data: T) => void;

// biome-ignore lint/suspicious/noExplicitAny: generic event map
export class MiniEmitter<M extends { [K in keyof M]: any }> {
  private listeners = new Map<keyof M, Set<Listener<never>>>();

  on<K extends keyof M>(event: K, fn: Listener<M[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as Listener<never>);
    return () => {
      set!.delete(fn as Listener<never>);
    };
  }

  off<K extends keyof M>(event: K, fn: Listener<M[K]>): void {
    this.listeners.get(event)?.delete(fn as Listener<never>);
  }

  /** @internal Fire all listeners for `event`. */
  emit<K extends keyof M>(event: K, data: M[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      (fn as Listener<M[K]>)(data);
    }
  }

  /** @internal Remove all listeners. */
  clear(): void {
    this.listeners.clear();
  }
}
