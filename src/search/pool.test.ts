import assert from "node:assert/strict";
import { test } from "node:test";
import { createSearchPool } from "./pool";

test("the pool survives an idle-client error and times out a connect", async () => {
  const pool = createSearchPool("postgres://127.0.0.1:1/none");
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logged.push(args.join(" "));
  try {
    // Without a listener, EventEmitter throws on "error" and kills the process.
    assert.doesNotThrow(() => pool.emit("error", new Error("connection lost")));
  } finally {
    console.error = original;
    await pool.end();
  }
  assert.equal(logged.length, 1);
  assert.match(logged[0], /^\[paperless-mcp\].*connection lost/);
  assert.equal((pool as any).options.connectionTimeoutMillis, 10_000);
});
