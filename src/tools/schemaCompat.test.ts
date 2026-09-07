import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../server";

// Strict MCP clients and gateways reject an array-valued `type` and silently drop
// the whole tool (#138). zod-to-json-schema emits that form for any union of
// unchecked primitives, so a new `z.string().nullable()` on any tool brings the
// bug back with no visible symptom. This walks every advertised schema instead of
// a field list, so a new occurrence anywhere fails the build.
//
// The entries below are the occurrences still outstanding, waiting on the Zod v4
// migration. The assertion is an exact match, so fixing one fails here too: the
// list may only shrink, and reaches zero when that migration lands.
const KNOWN_ARRAY_FORM_TYPES = [
  'create_mail_rule .properties.action_parameter.type = ["string","null"]',
  'create_mail_rule .properties.filter_attachment_filename_exclude.type = ["string","null"]',
  'create_mail_rule .properties.filter_attachment_filename_include.type = ["string","null"]',
  'query_documents .properties.paperless_filters.additionalProperties.anyOf[0].type = ["string","number","boolean"]',
  'update_mail_rule .properties.action_parameter.type = ["string","null"]',
  'update_mail_rule .properties.filter_attachment_filename_exclude.type = ["string","null"]',
  'update_mail_rule .properties.filter_attachment_filename_include.type = ["string","null"]',
];

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

test("no tool advertises an array-form `type` beyond the known-outstanding set (#138)", async () => {
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

    assert.deepEqual(found, [...KNOWN_ARRAY_FORM_TYPES].sort());
  } finally {
    await client.close();
    await server.close();
  }
});
