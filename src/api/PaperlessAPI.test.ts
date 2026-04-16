import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PaperlessAPI } from "./PaperlessAPI";

describe("PaperlessAPI", () => {
  const api = new PaperlessAPI("http://localhost:8000", "test-token");

  describe("error handling against a non-existent server", () => {
    test("request throws on connection refused", async () => {
      await assert.rejects(
        () => api.request("/test/"),
        (err: Error) => {
          // Should get a connection error, not "(HTTP undefined)"
          assert.ok(!err.message.includes("HTTP undefined"));
          return true;
        }
      );
    });

    test("requestRaw throws on connection refused", async () => {
      await assert.rejects(
        () => api.requestRaw("/test/"),
        (err: Error) => {
          assert.ok(!err.message.includes("HTTP undefined"));
          return true;
        }
      );
    });

    test("deleteDocument throws on connection refused", async () => {
      await assert.rejects(() => api.deleteDocument(999));
    });
  });
});
