import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { GetStoragePathsResponse } from "../api/types";
import { createMcpServer } from "../server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerStoragePathTools } from "./storagePaths";

const response: GetStoragePathsResponse = {
  count: 3,
  next: "http://paperless.test/api/storage_paths/?page=3",
  previous: "http://paperless.test/api/storage_paths/?page=1",
  all: [1, 2, 3],
  results: [{
    id: 2, slug: "invoices", name: "Invoices", path: "Invoices/{created_year}",
    match: "invoice", matching_algorithm: 1, is_insensitive: true,
    document_count: 4, owner: null, user_can_change: true,
  }],
};

async function withClient(server: McpServer, run: (client: Client) => Promise<void>) {
  const client = new Client({ name: "storage-path-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

function serverFor(baseUrl = "http://paperless.test") {
  return createMcpServer({ baseUrl, token: "test-token", version: "0.0.0-test", publicUrl: baseUrl });
}

function text(result: CallToolResult): string {
  const item = result.content[0];
  assert.equal(item.type, "text");
  return item.text;
}

test("server discovers list_storage_paths and forwards filters in a GET request", async () => {
  const requests: Array<{ method?: string; url?: string }> = [];
  const backend = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  });
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  try {
    const address = backend.address();
    assert.ok(address && typeof address !== "string");
    await withClient(serverFor(`http://127.0.0.1:${address.port}`), async (client) => {
      const { tools } = await client.listTools();
      assert.equal(tools.filter((tool) => tool.name === "list_storage_paths").length, 1);
      assert.equal(tools.some((tool) => /^(create|update|delete)_storage_path/.test(tool.name)), false);
      const args = {
        page: 2, page_size: 1, id: 2, id__in: [1, 2], full_perms: false,
        name__icontains: "Tax & invoices", name__iendswith: "s", name__iexact: "Invoices",
        name__istartswith: "Inv", path__icontains: "{created_year}", path__iendswith: "}",
        path__iexact: "Invoices/{created_year}", path__istartswith: "Invoices/", ordering: "-name",
      };
      const result = await client.callTool({ name: "list_storage_paths", arguments: args }) as CallToolResult;
      assert.equal(result.isError, undefined);
      assert.deepEqual(JSON.parse(text(result)), response);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].method, "GET");
      const url = new URL(requests[0].url!, "http://paperless.test");
      assert.equal(url.pathname, "/api/storage_paths/");
      assert.deepEqual(Object.fromEntries(url.searchParams),
        Object.fromEntries(Object.entries(args).map(([key, value]) => [key, String(value)])));
    });
  } finally {
    await new Promise<void>((resolve, reject) => backend.close((err) => err ? reject(err) : resolve()));
  }
});

test("default list preserves an empty pagination envelope and omits query delimiter", async (t) => {
  const empty: GetStoragePathsResponse = { count: 0, next: null, previous: null, all: [], results: [] };
  const request = t.mock.method(PaperlessAPI.prototype, "request", async () => empty);
  await withClient(serverFor(), async (client) => {
    const result = await client.callTool({ name: "list_storage_paths", arguments: {} }) as CallToolResult;
    assert.deepEqual(JSON.parse(text(result)), empty);
    assert.deepEqual(request.mock.calls.map((call) => call.arguments), [["/storage_paths/"]]);
  });
});

test("invalid list arguments are rejected before an API request", async (t) => {
  const request = t.mock.method(PaperlessAPI.prototype, "request", async () => response);
  await withClient(serverFor(), async (client) => {
    for (const args of [{ page: 0 }, { page: 1.5 }, { page_size: -1 }, { page_size: "2" }, { id__in: [1.5] }, { full_perms: "true" }]) {
      const result = await client.callTool({ name: "list_storage_paths", arguments: args }) as CallToolResult;
      assert.equal(result.isError, true);
      assert.match(text(result), /validation|invalid/i);
    }
    assert.equal(request.mock.callCount(), 0);
  });
});

test("list returns a backend failure as an MCP error", async (t) => {
  t.mock.method(PaperlessAPI.prototype, "request", async () => { throw new Error("Backend unavailable"); });
  await withClient(serverFor(), async (client) => {
    const result = await client.callTool({ name: "list_storage_paths", arguments: {} }) as CallToolResult;
    assert.equal(result.isError, true);
    assert.match(text(result), /Backend unavailable/);
  });
});

test("list reports a missing API connection", async () => {
  const server = new McpServer({ name: "unconfigured", version: "1.0.0" });
  registerStoragePathTools(server, undefined as unknown as PaperlessAPI);
  await withClient(server, async (client) => {
    const result = await client.callTool({ name: "list_storage_paths", arguments: {} }) as CallToolResult;
    assert.equal(result.isError, true);
    assert.match(text(result), /Please configure API connection first/);
  });
});
