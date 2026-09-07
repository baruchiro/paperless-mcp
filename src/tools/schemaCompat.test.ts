import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../server";

// zod-to-json-schema collapses a nullable primitive that carries no checks into
// `type: ["T","null"]`. That is valid JSON Schema, but strict MCP clients and
// gateways reject an array-valued `type` and silently drop the entire tool (#138).
// The `.int()` / `.max(256)` constraints on the fields below come from
// Paperless_ngx_REST_API.yaml, and carrying them keeps the emitted `type` scalar.

async function listTools() {
  const server = createMcpServer({
    baseUrl: "http://paperless.test",
    token: "test-token",
    version: "0.0.0-test",
    publicUrl: "http://paperless.test",
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "schema-compat-test", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const { tools } = await client.listTools();
  await client.close();
  await server.close();
  return new Map(tools.map((tool) => [tool.name, tool]));
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

test("update_document advertises no array-form types (#138)", async () => {
  const tools = await listTools();
  const tool = tools.get("update_document");
  assert.ok(tool, "expected update_document to be registered");
  assert.deepEqual(arrayFormTypes(tool.inputSchema), []);
});

test("bulk_edit_documents advertises no array-form types (#138)", async () => {
  const tools = await listTools();
  const tool = tools.get("bulk_edit_documents");
  assert.ok(tool, "expected bulk_edit_documents to be registered");
  assert.deepEqual(arrayFormTypes(tool.inputSchema), []);
});

test("spec-constrained mail rule filters advertise no array-form type (#138)", async () => {
  const tools = await listTools();
  for (const name of ["create_mail_rule", "update_mail_rule"]) {
    const tool = tools.get(name);
    assert.ok(tool, `expected ${name} to be registered`);
    const properties = (tool.inputSchema as {
      properties: Record<string, unknown>;
    }).properties;
    for (const field of [
      "filter_from",
      "filter_to",
      "filter_subject",
      "filter_body",
    ]) {
      assert.deepEqual(
        arrayFormTypes(properties[field]),
        [],
        `${name}.${field} must not advertise an array-form type`
      );
    }
  }
});
