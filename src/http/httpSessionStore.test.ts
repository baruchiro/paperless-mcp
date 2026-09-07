import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpSessionStore, ClosableTransport } from "./httpSessionStore";

type FakeTransport = ClosableTransport & { closed: number };

/** Fake transport that records close() calls. */
function fakeTransport(): FakeTransport {
  return {
    closed: 0,
    close() {
      this.closed += 1;
    },
  };
}

/** Controllable clock so idle behaviour is deterministic. */
function fakeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

test("canCreate enforces the concurrent-session cap", () => {
  const store = new HttpSessionStore<FakeTransport>({ maxSessions: 2 });
  assert.equal(store.canCreate(), true);
  store.register("a", fakeTransport());
  assert.equal(store.canCreate(), true);
  store.register("b", fakeTransport());
  assert.equal(store.canCreate(), false, "cap reached");
  store.delete("a");
  assert.equal(store.canCreate(), true, "freed a slot");
});

test("get returns the transport and bumps activity", () => {
  const clock = fakeClock();
  const store = new HttpSessionStore<FakeTransport>({ idleTimeoutMs: 100, now: clock.now });
  const t = fakeTransport();
  store.register("a", t);

  clock.advance(90);
  assert.equal(store.get("a"), t, "returns the registered transport");

  // Activity was bumped at t=90, so at t=180 (90ms later) it is still fresh.
  clock.advance(90);
  assert.deepEqual(store.sweepIdle(), [], "recently-used session survives");
  assert.equal(t.closed, 0);
});

test("get returns undefined for an unknown session", () => {
  const store = new HttpSessionStore<FakeTransport>();
  assert.equal(store.get("missing"), undefined);
});

test("sweepIdle closes and evicts only sessions past the timeout", () => {
  const clock = fakeClock();
  const store = new HttpSessionStore<FakeTransport>({ idleTimeoutMs: 100, now: clock.now });
  const stale = fakeTransport();
  const fresh = fakeTransport();
  store.register("stale", stale);

  clock.advance(150); // "stale" is now 150ms idle
  store.register("fresh", fresh); // registered at t=150

  const evicted = store.sweepIdle(); // cutoff = 150 - 100 = 50
  assert.deepEqual(evicted, ["stale"]);
  assert.equal(stale.closed, 1, "stale transport was closed");
  assert.equal(fresh.closed, 0, "fresh transport untouched");
  assert.equal(store.size, 1);
  assert.equal(store.get("stale"), undefined, "stale session evicted");
});

test("delete is a no-op for an unknown session", () => {
  const store = new HttpSessionStore<FakeTransport>();
  store.register("a", fakeTransport());
  store.delete("nope");
  assert.equal(store.size, 1);
});

test("startSweeper is idempotent and stopSweeper clears it", () => {
  const store = new HttpSessionStore<FakeTransport>({ sweepIntervalMs: 10_000 });
  store.startSweeper();
  store.startSweeper(); // must not throw or double-schedule
  store.stopSweeper();
  store.stopSweeper(); // safe to call when already stopped
  assert.ok(true);
});
