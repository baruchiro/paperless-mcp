import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

/**
 * Minimal shape the store needs from a transport: something it can close when a
 * session is evicted. Kept as an interface so the store is unit-testable with a
 * fake transport (no real HTTP server required).
 */
export interface ClosableTransport {
  close(): void | Promise<void>;
}

export interface HttpSessionStoreOptions {
  /** Hard cap on concurrent sessions; new initialize requests are rejected above it. */
  maxSessions?: number;
  /** Sessions with no activity for this long (ms) are closed and evicted. */
  idleTimeoutMs?: number;
  /** How often (ms) the idle sweep runs. Defaults to min(idleTimeoutMs, 60s). */
  sweepIntervalMs?: number;
  /** Injectable clock, for tests. */
  now?: () => number;
  /** Called when a transport's close() rejects during an idle sweep. Defaults to console.error. */
  onSweepError?: (error: unknown) => void;
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
  private readonly sweepIntervalMs: number;
  private readonly now: () => number;
  private readonly onSweepError: (error: unknown) => void;
  private timer?: ReturnType<typeof setInterval>;

  constructor(options: HttpSessionStoreOptions = {}) {
    this.maxSessions = options.maxSessions ?? 256;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30 * 60 * 1000;
    this.sweepIntervalMs =
      options.sweepIntervalMs ?? Math.min(this.idleTimeoutMs, 60 * 1000);
    this.now = options.now ?? Date.now;
    this.onSweepError =
      options.onSweepError ??
      ((error) =>
        console.error("[paperless-mcp] error closing idle session", error));
  }

  get size(): number {
    return this.entries.size;
  }

  /** True when a new session may be created (concurrent cap not yet reached). */
  canCreate(): boolean {
    return this.entries.size < this.maxSessions;
  }

  /**
   * Register a freshly-initialized session, stamping it active now. Returns
   * false (and stores nothing) when the cap is already reached by *other*
   * sessions — this is the authoritative, synchronous cap gate that closes the
   * race between {@link canCreate} and the SDK's async session-initialized
   * callback. Re-registering an existing session id is always allowed (it is an
   * update, not growth).
   */
  register(sessionId: string, transport: T): boolean {
    if (!this.entries.has(sessionId) && this.entries.size >= this.maxSessions) {
      return false;
    }
    this.entries.set(sessionId, { transport, lastActivity: this.now() });
    return true;
  }

  /**
   * Return the transport for a session, bumping its activity timestamp so an
   * in-use session is never reaped by the idle sweep.
   */
  get(sessionId: string): T | undefined {
    const entry = this.entries.get(sessionId);
    if (!entry) return undefined;
    entry.lastActivity = this.now();
    return entry.transport;
  }

  /** Drop a session from the store. Safe to call for an unknown id. */
  delete(sessionId: string): void {
    this.entries.delete(sessionId);
  }

  /**
   * Close and evict every session idle beyond the timeout. Returns the evicted
   * session ids. Closing triggers the transport's own `onclose`, which also
   * calls {@link delete}; deleting first here keeps that a harmless no-op.
   */
  sweepIdle(): string[] {
    const cutoff = this.now() - this.idleTimeoutMs;
    const stale: string[] = [];
    for (const [sessionId, entry] of this.entries) {
      if (entry.lastActivity <= cutoff) stale.push(sessionId);
    }
    for (const sessionId of stale) {
      const entry = this.entries.get(sessionId);
      this.entries.delete(sessionId);
      if (!entry) continue;
      // Defer the call so a synchronous throw also surfaces as a rejection, and
      // route any failure to onSweepError rather than leaving it unhandled.
      void Promise.resolve()
        .then(() => entry.transport.close())
        .catch((error) => this.onSweepError(error));
    }
    return stale;
  }

  /** Start the periodic idle sweep. Idempotent; the timer never blocks exit. */
  startSweeper(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.sweepIdle(), this.sweepIntervalMs);
    this.timer.unref?.();
  }

  /** Stop the periodic idle sweep. */
  stopSweeper(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
