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

// A draft-07 `$schema` dialect label anywhere in an advertised schema makes
// 2020-12-only clients (Claude Code / Claude Desktop) silently drop the whole
// tool (#170). The SDK's zod->JSON-Schema conversion stamps it, so createMcpServer
// strips it from the tools/list response; this walks every advertised schema to
// prove none survives and fails if the strip ever regresses.
function schemaDialectKeys(node: unknown, path = ""): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((item, i) => schemaDialectKeys(item, `${path}[${i}]`));
  }
  if (!node || typeof node !== "object") {
    return [];
  }
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    key === "$schema"
      ? [`${path}.$schema = ${JSON.stringify(value)}`]
      : schemaDialectKeys(value, `${path}.${key}`)
  );
}

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

async function listAdvertisedTools() {
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
    return tools;
  } finally {
    await client.close();
    await server.close();
  }
}

test("no tool advertises a draft-07 `$schema` dialect (#170)", async () => {
  const tools = await listAdvertisedTools();
  const found = tools
    .flatMap((tool) =>
      schemaDialectKeys(tool.inputSchema).map((hit) => `${tool.name} ${hit}`)
    )
    .sort();

  assert.deepEqual(found, []);
});

test("no tool advertises an array-form `type` (#138)", async () => {
  const tools = await listAdvertisedTools();
  const found = tools
    .flatMap((tool) =>
      arrayFormTypes(tool.inputSchema).map((hit) => `${tool.name} ${hit}`)
    )
    .sort();

  assert.deepEqual(found, []);
});
