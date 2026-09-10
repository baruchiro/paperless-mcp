import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../server";

// Strict MCP clients and gateways reject an array-valued `type` and silently drop
// the whole tool (#138). A JSON Schema converter reaches that form by collapsing a
// union of unchecked primitives: `zod-to-json-schema` (the zod v3 path) always does
// it, and zod's own converter did it again from 4.5.0 on. The tools are only free
// of it because the server is on the zod v4 path with zod pinned to 4.4.x, so this
// walks every advertised schema rather than a field list: bumping that pin, moving
// off zod v4, or adding a construct that reintroduces the form fails here.

function arrayFormTypes(node: unknown, path = ""): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((item, i) => arrayFormTypes(item, `${path}[${i}]`));
  }
  if (!node || typeof node !== "object") {
    return [];
  }
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    key === "type" && Array.isArray(value)
      ? [`${path}.type = ${JSON.stringify(value)}`]
      : arrayFormTypes(value, `${path}.${key}`)
  );
}

test("no tool advertises an array-form `type` (#138)", async () => {
  const server = createMcpServer({
    baseUrl: "http://paperless.test",
    token: "test-token",
    version: "0.0.0-test",
    publicUrl: "http://paperless.test",
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "schema-compat-test", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const { tools } = await client.listTools();
    const found = tools
      .flatMap((tool) =>
        arrayFormTypes(tool.inputSchema).map((hit) => `${tool.name} ${hit}`)
      )
      .sort();

    assert.deepEqual(found, []);
  } finally {
    await client.close();
    await server.close();
  }
});
