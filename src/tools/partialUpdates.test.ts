import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { registerTagTools } from "./tags";
import { registerCorrespondentTools } from "./correspondents";
import { registerDocumentTypeTools } from "./documentTypes";

for (const [tool, register] of [
  ["tag", registerTagTools], ["correspondent", registerCorrespondentTools],
  ["document_type", registerDocumentTypeTools],
] as const) {
  test(`update_${tool} changes matching without renaming, while create still requires a name`, async () => {
    const entity = { id: 7, name: "Original name", match: "old", matching_algorithm: 1 };
    const http = createServer(async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.method !== "PATCH") {
        res.writeHead(405).end("{}"); return;
      }
      let body = "";
      for await (const part of req) body += part;
      Object.assign(entity, JSON.parse(body));
      res.end(JSON.stringify(entity));
    });
    await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
    const address = http.address();
    if (!address || typeof address === "string") throw new Error("Missing port");
    const server = new McpServer({ name: "partial-update-test", version: "1" });
    const client = new Client({ name: "partial-update-client", version: "1" });
    register(server, new PaperlessAPI(`http://127.0.0.1:${address.port}`, "test"));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport); await client.connect(clientTransport);
      const result = await client.callTool({ name: `update_${tool}`, arguments: { id: 7, match: "new" } });
      assert.notEqual(result.isError, true);
      assert.deepEqual(entity, { id: 7, name: "Original name", match: "new", matching_algorithm: 1 });
      const createResult = await client.callTool({ name: `create_${tool}`, arguments: { match: "new" } });
      assert.equal(createResult.isError, true);
      assert.deepEqual(entity, { id: 7, name: "Original name", match: "new", matching_algorithm: 1 });
    } finally {
      await client.close(); await server.close();
      await new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
    }
  });
}
