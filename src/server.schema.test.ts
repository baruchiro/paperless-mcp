import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types";
import { createMcpServer } from "./server";

class TestTransport implements Transport {
  peer?: TestTransport;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  async start(): Promise<void> {}

  async send(message: JSONRPCMessage): Promise<void> {
    queueMicrotask(() => this.peer?.onmessage?.(message));
  }

  async close(): Promise<void> {
    this.onclose?.();
  }
}

function createTransportPair() {
  const clientTransport = new TestTransport();
  const serverTransport = new TestTransport();
  clientTransport.peer = serverTransport;
  serverTransport.peer = clientTransport;
  return { clientTransport, serverTransport };
}

// A property `type` must never be advertised as a `["T","null"]` union — see #138.
function assertNoNullableUnions(schema: unknown, path: string): void {
  if (Array.isArray(schema)) {
    schema.forEach((item, i) => assertNoNullableUnions(item, `${path}[${i}]`));
    return;
  }
  if (schema === null || typeof schema !== "object") {
    return;
  }
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === "type" && Array.isArray(value)) {
      assert.ok(
        !value.includes("null"),
        `${path}.type advertises a nullable union ${JSON.stringify(value)}`
      );
    } else {
      assertNoNullableUnions(value, `${path}.${key}`);
    }
  }
}

test("createMcpServer advertises scalar types for nullable fields (#138)", async () => {
  const server = createMcpServer({
    baseUrl: "http://paperless.test",
    token: "test-token",
    version: "0.0.0-test",
    publicUrl: "http://paperless.test",
  });

  const client = new Client({ name: "schema-test-client", version: "1.0.0" });
  const { clientTransport, serverTransport } = createTransportPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const { tools } = await client.listTools();

    // Every tool schema must be free of nullable unions.
    for (const tool of tools) {
      assertNoNullableUnions(tool.inputSchema, tool.name);
    }

    // Spot-check the tools that regressed in #138.
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    for (const name of ["update_document", "create_mail_rule", "update_mail_rule"]) {
      const tool = byName.get(name);
      assert.ok(tool, `expected tool ${name} to be registered`);
    }

    const updateDocument = byName.get("update_document")!;
    const props = (updateDocument.inputSchema as {
      properties: Record<string, { type?: unknown }>;
    }).properties;
    assert.equal(props.owner.type, "number");
    assert.equal(props.correspondent.type, "number");
    assert.equal(props.document_type.type, "number");
    assert.equal(props.storage_path.type, "number");
  } finally {
    await client.close();
    await server.close();
  }
});
