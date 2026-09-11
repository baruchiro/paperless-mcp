import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpSessionStore, ClosableTransport } from "./httpSessionStore";

type FakeTransport = ClosableTransport & { closed: number };

test("canCreate enforces the concurrent-session cap", () => {
  const store = new HttpSessionStore<FakeTransport>({ maxSessions: 2 });
  assert.equal(store.canCreate(), true);
  store.register("a", { closed: 0, close() { this.closed += 1; } });
  assert.equal(store.canCreate(), true);
  store.register("b", { closed: 0, close() { this.closed += 1; } });
  assert.equal(store.canCreate(), false);
  store.delete("a");
  assert.equal(store.canCreate(), true);
});

test("register rejects a new session at the cap and retains nothing", () => {
  const store = new HttpSessionStore<FakeTransport>({ maxSessions: 1 });
  assert.equal(store.register("a", { closed: 0, close() { this.closed += 1; } }), true);

  assert.equal(store.register("b", { closed: 0, close() { this.closed += 1; } }), false);
  assert.equal(store.size, 1);
  assert.equal(store.get("b"), undefined);

  assert.equal(store.register("a", { closed: 0, close() { this.closed += 1; } }), true);
  assert.equal(store.size, 1);
});

test("get returns the registered transport", () => {
  const store = new HttpSessionStore<FakeTransport>();
  const transport: FakeTransport = { closed: 0, close() { this.closed += 1; } };
  store.register("a", transport);
  assert.equal(store.get("a"), transport);
});

test("get returns undefined for an unknown session", () => {
  const store = new HttpSessionStore<FakeTransport>();
  assert.equal(store.get("missing"), undefined);
});

test("delete is a no-op for an unknown session", () => {
  const store = new HttpSessionStore<FakeTransport>();
  store.register("a", { closed: 0, close() { this.closed += 1; } });
  store.delete("nope");
  assert.equal(store.size, 1);
});

test("sweepIdle keeps a session still within its timeout", () => {
  const store = new HttpSessionStore<FakeTransport>({ idleTimeoutMs: 60_000 });
  const transport: FakeTransport = { closed: 0, close() { this.closed += 1; } };
  store.register("a", transport);
  assert.deepEqual(store.sweepIdle(), []);
  assert.equal(store.size, 1);
  assert.equal(transport.closed, 0);
});

test("sweepIdle evicts and closes a session past its timeout", async () => {
  const store = new HttpSessionStore<FakeTransport>({ idleTimeoutMs: 0 });
  const transport: FakeTransport = { closed: 0, close() { this.closed += 1; } };
  store.register("a", transport);

  assert.deepEqual(store.sweepIdle(), ["a"]);
  assert.equal(store.size, 0, "eviction from the map is synchronous");
  assert.equal(store.get("a"), undefined);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(transport.closed, 1, "transport closed after the deferred close settles");
});

test("sweepIdle evicts a session whose close() rejects, without an unhandled rejection", async () => {
  const store = new HttpSessionStore<ClosableTransport>({ idleTimeoutMs: 0 });
  const original = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    store.register("a", { close: () => Promise.reject(new Error("boom")) });
    assert.deepEqual(store.sweepIdle(), ["a"]);
    assert.equal(store.size, 0);

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(logged.length, 1, "the rejection was caught and logged");
    assert.match(String(logged[0][1]), /boom/);
  } finally {
    console.error = original;
  }
});

test("startSweeper reaps idle sessions until stopSweeper halts it", async () => {
  const store = new HttpSessionStore<FakeTransport>({ idleTimeoutMs: 0 });
  const first: FakeTransport = { closed: 0, close() { this.closed += 1; } };
  store.register("a", first);
  store.startSweeper();
  store.startSweeper(); // idempotent

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(store.size, 0, "the running sweeper reaped the idle session");
  assert.equal(first.closed, 1);

  store.stopSweeper();
  const second: FakeTransport = { closed: 0, close() { this.closed += 1; } };
  store.register("b", second);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(store.size, 1, "no sweeps after stopSweeper");
});
