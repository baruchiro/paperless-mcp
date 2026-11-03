import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import express from "express";
import { z } from "zod";
import { PaperlessAPI } from "./api/PaperlessAPI";
import { httpTiming, register } from "./metrics";
import { createMcpServer, timeTools } from "./server";
import { histogramCount } from "./testMetrics";

async function withClient(
  server: McpServer,
  run: (client: Client) => Promise<void>
) {
  const client = new Client({ name: "timing-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

function timedServer() {
  const server = new McpServer({ name: "timing", version: "1.0.0" });
  timeTools(server);
  return server;
}

describe("tool timing", () => {
  test("a tool that returns normally records outcome=ok and gives the same result", async () => {
    const server = timedServer();
    server.tool(
      "timing_ok_tool",
      "A tool that works",
      { a: z.string() },
      async (args) => ({ content: [{ type: "text", text: `got ${args.a}` }] })
    );
    const before = await histogramCount("paperless_tool_duration_seconds", {
      tool: "timing_ok_tool",
      outcome: "ok",
    });
    await withClient(server, async (client) => {
      const result = (await client.callTool({
        name: "timing_ok_tool",
        arguments: { a: "x" },
      })) as CallToolResult;
      assert.deepEqual(result.content, [{ type: "text", text: "got x" }]);
      assert.ok(!result.isError);

      // The name, the description and the schema stay as the tool set them.
      const listed = (await client.listTools()).tools.find(
        (tool) => tool.name === "timing_ok_tool"
      );
      assert.equal(listed?.description, "A tool that works");
      assert.ok(listed?.inputSchema.properties?.a);
    });
    assert.equal(
      await histogramCount("paperless_tool_duration_seconds", {
        tool: "timing_ok_tool",
        outcome: "ok",
      }),
      before + 1
    );
  });

  test("a tool that throws records outcome=error", async () => {
    const server = timedServer();
    server.tool("timing_throw_tool", "Throws", {}, async () => {
      throw new Error("boom");
    });
    const labels = { tool: "timing_throw_tool", outcome: "error" };
    const before = await histogramCount(
      "paperless_tool_duration_seconds",
      labels
    );
    await withClient(server, async (client) => {
      const result = (await client.callTool({
        name: "timing_throw_tool",
        arguments: {},
      })) as CallToolResult;
      assert.equal(result.isError, true);
    });
    assert.equal(
      await histogramCount("paperless_tool_duration_seconds", labels),
      before + 1
    );
    assert.equal(
      await histogramCount("paperless_tool_duration_seconds", {
        tool: "timing_throw_tool",
        outcome: "ok",
      }),
      0
    );
  });

  test("a tool that returns isError: true records outcome=error and gives the same result", async () => {
    const server = timedServer();
    server.tool("timing_iserror_tool", "Returns an error", async () => ({
      isError: true,
      content: [{ type: "text", text: "refused" }],
    }));
    const labels = { tool: "timing_iserror_tool", outcome: "error" };
    const before = await histogramCount(
      "paperless_tool_duration_seconds",
      labels
    );
    await withClient(server, async (client) => {
      const result = (await client.callTool({
        name: "timing_iserror_tool",
        arguments: {},
      })) as CallToolResult;
      assert.equal(result.isError, true);
      assert.deepEqual(result.content, [{ type: "text", text: "refused" }]);
    });
    assert.equal(
      await histogramCount("paperless_tool_duration_seconds", labels),
      before + 1
    );
  });

  test("createMcpServer times its tools and the Paperless call under them", async () => {
    let status = 200;
    const paperless = createServer((_req, res) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ count: 0, next: null, results: [] }));
    });
    await new Promise<void>((resolve) => paperless.listen(0, resolve));
    const baseUrl = `http://127.0.0.1:${
      (paperless.address() as AddressInfo).port
    }`;
    const original = console.error;
    console.error = () => {};
    try {
      const callTags = (token: string) =>
        withClient(
          createMcpServer({
            baseUrl,
            token,
            version: "1",
            publicUrl: baseUrl,
          }),
          async (client) => {
            await client.callTool({ name: "list_tags", arguments: {} });
          }
        );

      const okTool = { tool: "list_tags", outcome: "ok" };
      const errorTool = { tool: "list_tags", outcome: "error" };
      const ok200 = { method: "GET", status: "200" };
      const err500 = { method: "GET", status: "500" };
      const before = {
        okTool: await histogramCount("paperless_tool_duration_seconds", okTool),
        errorTool: await histogramCount(
          "paperless_tool_duration_seconds",
          errorTool
        ),
        ok200: await histogramCount("paperless_api_duration_seconds", ok200),
        err500: await histogramCount("paperless_api_duration_seconds", err500),
      };

      await callTags("t");
      status = 500;
      await callTags("t");

      assert.equal(
        await histogramCount("paperless_tool_duration_seconds", okTool),
        before.okTool + 1
      );
      assert.equal(
        await histogramCount("paperless_tool_duration_seconds", errorTool),
        before.errorTool + 1
      );
      assert.equal(
        await histogramCount("paperless_api_duration_seconds", ok200),
        before.ok200 + 1
      );
      assert.equal(
        await histogramCount("paperless_api_duration_seconds", err500),
        before.err500 + 1
      );
    } finally {
      console.error = original;
      paperless.closeAllConnections();
      paperless.close();
    }
  });
});

describe("Paperless API timing", () => {
  test("a refused connection records status=error, and the path is not a label", async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((resolve) => closed.close(() => resolve()));

    const labels = { method: "GET", status: "error" };
    const before = await histogramCount(
      "paperless_api_duration_seconds",
      labels
    );
    const original = console.error;
    console.error = () => {};
    try {
      const api = new PaperlessAPI(`http://127.0.0.1:${port}`, "token");
      await assert.rejects(() => api.request("/documents/4242/"));
    } finally {
      console.error = original;
    }
    assert.equal(
      await histogramCount("paperless_api_duration_seconds", labels),
      before + 1
    );
    assert.ok(!(await register.metrics()).includes("4242"));
  });
});

describe("HTTP route timing", () => {
  async function get(base: string, path: string): Promise<number> {
    const response = await fetch(`${base}${path}`);
    await response.text();
    return response.status;
  }

  // The finish event can come just after the client has the answer.
  async function waitForCount(
    labels: Record<string, string>,
    expected: number
  ): Promise<number> {
    let count = 0;
    for (let i = 0; i < 50; i++) {
      count = await histogramCount(
        "paperless_http_request_duration_seconds",
        labels
      );
      if (count >= expected) return count;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return count;
  }

  test("a route template is the label, and a token never is", async () => {
    const app = express();
    app.use(httpTiming);
    app.get("/download/:token", (_req, res) => {
      res.send("file");
    });
    app.get("/upload/:token", (_req, res) => {
      res.send("form");
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const download = {
        route: "/download/:token",
        method: "GET",
        status: "200",
      };
      const upload = { route: "/upload/:token", method: "GET", status: "200" };
      const other = { route: "other", method: "GET", status: "404" };
      const before = {
        download: await histogramCount(
          "paperless_http_request_duration_seconds",
          download
        ),
        upload: await histogramCount(
          "paperless_http_request_duration_seconds",
          upload
        ),
        other: await histogramCount(
          "paperless_http_request_duration_seconds",
          other
        ),
      };

      assert.equal(await get(base, "/download/abc123"), 200);
      assert.equal(await get(base, "/upload/secretToken9?x=queryToken7"), 200);
      assert.equal(await get(base, "/nothing/here/pathToken5"), 404);

      assert.equal(
        await waitForCount(download, before.download + 1),
        before.download + 1
      );
      assert.equal(
        await waitForCount(upload, before.upload + 1),
        before.upload + 1
      );
      assert.equal(
        await waitForCount(other, before.other + 1),
        before.other + 1
      );

      const text = await register.metrics();
      for (const secret of [
        "abc123",
        "secretToken9",
        "queryToken7",
        "pathToken5",
      ]) {
        assert.ok(!text.includes(secret), `${secret} is in the metrics`);
      }
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});

describe("search timing", () => {
  test("semantic_search records its own duration with the semantic label", async () => {
    const { registerSearchTools } = await import("./tools/search");
    const { EmbeddingUnavailable } = await import("./search/embedder");
    const server = new McpServer({ name: "search-timing", version: "1.0.0" });
    let embedFails = false;
    registerSearchTools(
      server,
      { request: async () => ({ results: [] }) } as unknown as PaperlessAPI,
      {
        store: {
          vectorHits: async () => [],
          textHits: async () => [],
        } as any,
        embedder: {
          embedQuery: async () => {
            if (embedFails) throw new EmbeddingUnavailable("down");
            return [0.1];
          },
        } as any,
        publicUrl: "https://p.test",
      }
    );
    const ok = { semantic: "ok" };
    const unavailable = { semantic: "unavailable" };
    const before = {
      ok: await histogramCount("paperless_search_duration_seconds", ok),
      unavailable: await histogramCount(
        "paperless_search_duration_seconds",
        unavailable
      ),
    };
    await withClient(server, async (client) => {
      await client.callTool({
        name: "semantic_search",
        arguments: { query: "a" },
      });
      embedFails = true;
      await client.callTool({
        name: "semantic_search",
        arguments: { query: "b" },
      });
    });
    assert.equal(
      await histogramCount("paperless_search_duration_seconds", ok),
      before.ok + 1
    );
    assert.equal(
      await histogramCount("paperless_search_duration_seconds", unavailable),
      before.unavailable + 1
    );
  });
});
