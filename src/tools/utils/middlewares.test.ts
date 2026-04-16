import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { withErrorHandling } from "./middlewares";

describe("withErrorHandling", () => {
  test("passes through successful results", async () => {
    const handler = withErrorHandling(async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));

    const result = await handler({} as any, {} as any);
    assert.deepEqual(result, {
      content: [{ type: "text", text: "ok" }],
    });
  });

  test("preserves Error instances (keeps stack trace)", async () => {
    const originalError = new Error("something broke");
    const handler = withErrorHandling(async () => {
      throw originalError;
    });

    await assert.rejects(
      async () => handler({} as any, {} as any),
      (err: Error) => {
        // Should be the exact same Error instance, not a new wrapper
        assert.equal(err, originalError);
        assert.equal(err.message, "something broke");
        return true;
      }
    );
  });

  test("wraps non-Error throws into Error objects", async () => {
    const handler = withErrorHandling(async () => {
      throw "string error";
    });

    await assert.rejects(
      async () => handler({} as any, {} as any),
      (err: Error) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, "string error");
        return true;
      }
    );
  });

  test("wraps number throws into Error objects", async () => {
    const handler = withErrorHandling(async () => {
      throw 42;
    });

    await assert.rejects(
      async () => handler({} as any, {} as any),
      (err: Error) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, "42");
        return true;
      }
    );
  });
});
