import assert from "node:assert/strict";
import { test } from "node:test";
import { createMcpServer } from "../server";

// Enforce that every registered MCP tool declares annotations. If this fails,
// a tool was added without an annotation argument at its server.tool(...) call.
test("every registered tool declares MCP annotations", () => {
  const server = createMcpServer({
    baseUrl: "http://localhost",
    token: "test-token",
    version: "0.0.0-test",
    publicUrl: "http://localhost",
  });

  const registered = (server as unknown as {
    _registeredTools: Record<string, { annotations?: Record<string, unknown> }>;
  })._registeredTools;

  const names = Object.keys(registered);
  assert.ok(names.length > 0, "expected at least one registered tool");

  for (const [name, tool] of Object.entries(registered)) {
    const annotations = tool.annotations;
    assert.ok(annotations, `tool "${name}" is missing annotations`);
    assert.equal(
      typeof annotations.readOnlyHint,
      "boolean",
      `tool "${name}" is missing a readOnlyHint`
    );
    assert.equal(
      typeof annotations.openWorldHint,
      "boolean",
      `tool "${name}" is missing an openWorldHint`
    );
    if (annotations.readOnlyHint === false) {
      assert.equal(
        typeof annotations.destructiveHint,
        "boolean",
        `writable tool "${name}" is missing a destructiveHint`
      );
    }
  }
});
