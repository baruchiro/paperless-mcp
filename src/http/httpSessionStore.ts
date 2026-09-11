import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// An interface (not the concrete transport) so the store can be tested with a
// stub that only implements close().
export interface ClosableTransport {
  close(): void | Promise<void>;
}

export interface HttpSessionStoreOptions {
  maxSessions?: number;
  idleTimeoutMs?: number;
}

interface SessionEntry<T> {
  transport: T;
  lastActivity: number;
}

/**
 * Bounded registry of stateful Streamable HTTP sessions.
 *
 * Without bounds the session map only shrinks when a transport closes cleanly
 * (a client sending `DELETE /mcp` or dropping in a way the SDK detects). A
 * client that abandons a session otherwise leaves its transport — and the
 * `McpServer` connected to it — in memory for the process lifetime, and every
 * initialize adds another. Under `--no-auth` that is an unauthenticated
 * memory-exhaustion vector. This store caps concurrent sessions and reaps idle
 * ones on an interval.
 */
export class HttpSessionStore<
  T extends ClosableTransport = StreamableHTTPServerTransport
> {
  private readonly entries = new Map<string, SessionEntry<T>>();
  private readonly maxSessions: number;
  private readonly idleTimeoutMs: number;
  private timer?: ReturnType<typeof setInterval>;

  constructor(options: HttpSessionStoreOptions = {}) {
    this.maxSessions = options.maxSessions ?? 256;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30 * 60 * 1000;
  }

  get size(): number {
    return this.entries.size;
  }

  canCreate(): boolean {
    return this.entries.size < this.maxSessions;
  }

  /**
   * Register a freshly-initialized session. Returns false (and stores nothing)
   * when the cap is already reached by *other* sessions: this synchronous check
   * is the authoritative cap gate, closing the race between {@link canCreate}
   * and the SDK's async session-initialized callback. Re-registering an existing
   * id is an update, always allowed.
   */
  register(sessionId: string, transport: T): boolean {
    if (!this.entries.has(sessionId) && this.entries.size >= this.maxSessions) {
      return false;
    }
    this.entries.set(sessionId, { transport, lastActivity: Date.now() });
    return true;
  }

  // Bumps lastActivity so an in-use session is never reaped by the idle sweep.
  get(sessionId: string): T | undefined {
    const entry = this.entries.get(sessionId);
    if (!entry) return undefined;
    entry.lastActivity = Date.now();
    return entry.transport;
  }

  delete(sessionId: string): void {
    this.entries.delete(sessionId);
  }

  /**
   * Close and evict every session idle beyond the timeout, returning the evicted
   * ids. close() triggers the transport's own `onclose`, which also calls
   * {@link delete}; evicting from the map first keeps that a harmless no-op.
   */
  sweepIdle(): string[] {
    const cutoff = Date.now() - this.idleTimeoutMs;
    const stale: string[] = [];
    for (const [sessionId, entry] of this.entries) {
      if (entry.lastActivity <= cutoff) stale.push(sessionId);
    }
    for (const sessionId of stale) {
      const entry = this.entries.get(sessionId);
      this.entries.delete(sessionId);
      if (!entry) continue;
      // Defer so a synchronous throw from close() also surfaces as a rejection
      // rather than escaping this loop.
      void Promise.resolve()
        .then(() => entry.transport.close())
        .catch((error) =>
          console.error("[paperless-mcp] error closing idle session", error)
        );
    }
    return stale;
  }

  // Idempotent; unref() keeps the interval from holding the process open.
  startSweeper(): void {
    if (this.timer) return;
    const intervalMs = Math.min(this.idleTimeoutMs, 60 * 1000);
    this.timer = setInterval(() => this.sweepIdle(), intervalMs);
    this.timer.unref?.();
  }

  stopSweeper(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
