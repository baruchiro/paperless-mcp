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

test("sweepIdle closes and evicts only sessions past the timeout", async () => {
  const clock = fakeClock();
  const store = new HttpSessionStore<FakeTransport>({ idleTimeoutMs: 100, now: clock.now });
  const stale = fakeTransport();
  const fresh = fakeTransport();
  store.register("stale", stale);

  clock.advance(150); // "stale" is now 150ms idle
  store.register("fresh", fresh); // registered at t=150

  const evicted = store.sweepIdle(); // cutoff = 150 - 100 = 50
  assert.deepEqual(evicted, ["stale"]);
  assert.equal(store.size, 1, "eviction from the map is synchronous");
  assert.equal(store.get("stale"), undefined, "stale session evicted");

  await new Promise((resolve) => setImmediate(resolve)); // close() is deferred
  assert.equal(stale.closed, 1, "stale transport was closed");
  assert.equal(fresh.closed, 0, "fresh transport untouched");
});

test("delete is a no-op for an unknown session", () => {
  const store = new HttpSessionStore<FakeTransport>();
  store.register("a", fakeTransport());
  store.delete("nope");
  assert.equal(store.size, 1);
});

test("register rejects a new session at the cap and retains nothing", () => {
  const store = new HttpSessionStore<FakeTransport>({ maxSessions: 1 });
  assert.equal(store.register("a", fakeTransport()), true);

  const rejected = fakeTransport();
  assert.equal(store.register("b", rejected), false, "new id rejected at cap");
  assert.equal(store.size, 1);
  assert.equal(store.get("b"), undefined, "rejected session not stored");

  // Re-registering an existing id is an update, allowed even at the cap.
  assert.equal(store.register("a", fakeTransport()), true);
  assert.equal(store.size, 1);
});

test("sweepIdle routes a rejecting close() to onSweepError, no unhandled rejection", async () => {
  const clock = fakeClock();
  const errors: unknown[] = [];
  const store = new HttpSessionStore<ClosableTransport>({
    idleTimeoutMs: 10,
    now: clock.now,
    onSweepError: (e) => errors.push(e),
  });
  store.register("a", { close: () => Promise.reject(new Error("boom")) });

  clock.advance(20);
  assert.deepEqual(store.sweepIdle(), ["a"], "evicted despite failing close");
  assert.equal(store.size, 0);

  await new Promise((resolve) => setImmediate(resolve)); // let the rejection settle
  assert.equal(errors.length, 1, "close rejection captured");
  assert.match(String((errors[0] as Error).message), /boom/);
});

test("startSweeper schedules one recurring sweep; stopSweeper halts it", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const store = new HttpSessionStore<FakeTransport>({ sweepIntervalMs: 1000 });
  const sweep = t.mock.method(store, "sweepIdle");

  store.startSweeper();
  store.startSweeper(); // idempotent: must not schedule a second interval

  t.mock.timers.tick(1000);
  assert.equal(sweep.mock.callCount(), 1, "one sweep per interval despite double start");
  t.mock.timers.tick(1000);
  assert.equal(sweep.mock.callCount(), 2);

  store.stopSweeper();
  t.mock.timers.tick(5000);
  assert.equal(sweep.mock.callCount(), 2, "no sweeps after stop");
});
