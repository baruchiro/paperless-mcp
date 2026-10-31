import assert from "node:assert/strict";
import { test } from "node:test";
import { testPool } from "./testDb";

test("the test database has pgvector and unaccent", async () => {
  const pool = await testPool();
  try {
    const result = await pool.query("SELECT extname FROM pg_extension");
    const extensions = result.rows.map((row) => row.extname);
    assert.ok(extensions.includes("vector"));
    assert.ok(extensions.includes("unaccent"));
  } finally {
    await pool.end();
  }
});
