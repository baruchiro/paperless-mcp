import assert from "node:assert/strict";
import { test } from "node:test";
import { parseToolText, ToolResult } from "./client";

// --- parseToolText ---

test("parseToolText returns parsed JSON object from text content", () => {
  const result: ToolResult = {
    content: [{ type: "text", text: '{"id":1,"name":"foo"}' }],
  };
  const parsed = parseToolText(result) as { id: number; name: string };
  assert.deepEqual(parsed, { id: 1, name: "foo" });
});

test("parseToolText returns parsed JSON array from text content", () => {
  const result: ToolResult = {
    content: [{ type: "text", text: '[1,2,3]' }],
  };
  const parsed = parseToolText(result);
  assert.deepEqual(parsed, [1, 2, 3]);
});

test("parseToolText returns parsed JSON number from text content", () => {
  const result: ToolResult = {
    content: [{ type: "text", text: '42' }],
  };
  assert.strictEqual(parseToolText(result), 42);
});

test("parseToolText uses the first text-type content item when multiple items are present", () => {
  const result: ToolResult = {
    content: [
      { type: "resource", resource: { uri: "paperless://documents/1" } },
      { type: "text", text: '{"id":7}' },
    ],
  };
  const parsed = parseToolText(result) as { id: number };
  assert.strictEqual(parsed.id, 7);
});

test("parseToolText throws when isError=true with an error message", () => {
  const result: ToolResult = {
    content: [{ type: "text", text: "Something went wrong" }],
    isError: true,
  };
  assert.throws(
    () => parseToolText(result),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(
        err.message.includes("isError=true"),
        `message should mention isError=true, got: ${err.message}`
      );
      assert.ok(
        err.message.includes("Something went wrong"),
        `message should include tool error text, got: ${err.message}`
      );
      return true;
    }
  );
});

test("parseToolText throws with '(no message)' when isError=true and content has no text", () => {
  const result: ToolResult = {
    content: [{ type: "resource", resource: { uri: "paperless://documents/1" } }],
    isError: true,
  };
  assert.throws(
    () => parseToolText(result),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(
        err.message.includes("(no message)"),
        `message should contain '(no message)', got: ${err.message}`
      );
      return true;
    }
  );
});

test("parseToolText throws when content array is empty", () => {
  const result: ToolResult = { content: [] };
  assert.throws(
    () => parseToolText(result),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(
        err.message.includes("No text content"),
        `message should mention missing text content, got: ${err.message}`
      );
      return true;
    }
  );
});

test("parseToolText throws when the only content item is a resource (no text type)", () => {
  const result: ToolResult = {
    content: [{ type: "resource", resource: { uri: "paperless://documents/5" } }],
  };
  assert.throws(
    () => parseToolText(result),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes("No text content"));
      return true;
    }
  );
});

test("parseToolText throws when text content item has an empty string", () => {
  const result: ToolResult = {
    content: [{ type: "text", text: "" }],
  };
  // Empty string is falsy, so parseToolText treats it as missing text
  assert.throws(
    () => parseToolText(result),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes("No text content"));
      return true;
    }
  );
});

test("parseToolText throws a SyntaxError when text content is not valid JSON", () => {
  const result: ToolResult = {
    content: [{ type: "text", text: "not-json{" }],
  };
  assert.throws(
    () => parseToolText(result),
    SyntaxError
  );
});

test("parseToolText returns null for JSON null", () => {
  const result: ToolResult = {
    content: [{ type: "text", text: "null" }],
  };
  assert.strictEqual(parseToolText(result), null);
});

test("parseToolText returns false when isError is explicitly false", () => {
  const result: ToolResult = {
    content: [{ type: "text", text: "false" }],
    isError: false,
  };
  assert.strictEqual(parseToolText(result), false);
});