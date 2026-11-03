import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { searchConfig } from "./config";

describe("searchConfig", () => {
  const all = {
    DATABASE_URL: "postgres://db/paperless_mcp",
    OLLAMA_URL: "http://ollama:11434",
    EMBEDDING_MODEL: "qwen3-embedding:0.6b",
    PAPERLESS_SYNC_API_KEY: "sync-token",
  };

  test("gives the four values in HTTP mode", () => {
    assert.deepEqual(searchConfig(all, true), {
      databaseUrl: "postgres://db/paperless_mcp",
      ollamaUrl: "http://ollama:11434",
      model: "qwen3-embedding:0.6b",
      syncToken: "sync-token",
    });
  });

  test("gives nothing when no value is set", () => {
    assert.equal(searchConfig({}, true), undefined);
  });

  test("gives nothing in stdio mode, which has no index", () => {
    assert.equal(searchConfig(all, false), undefined);
  });

  test("refuses three of the four values", () => {
    const { EMBEDDING_MODEL: _model, ...three } = all;
    assert.throws(() => searchConfig(three, true), /all four/);
  });
});
