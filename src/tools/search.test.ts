import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport";
import type {
  CallToolResult,
  JSONRPCMessage,
} from "@modelcontextprotocol/sdk/types";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { EmbeddingUnavailable } from "../search/embedder";
import { Hit, SearchStore } from "../search/store";
import { registerSearchTools } from "./search";

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

function parseToolText(result: CallToolResult) {
  const item = result.content?.[0];
  if (!item || item.type !== "text")
    throw new Error("Expected text tool response");
  return JSON.parse(item.text);
}

function hit(
  documentId: number,
  score: number,
  text = `passage ${documentId}`
): Hit {
  return { documentId, position: 0, text, score };
}

function fakeStore(opts: { vector?: Hit[]; text?: Hit[] }): SearchStore {
  return {
    vectorHits: async () => opts.vector ?? [],
    textHits: async () => opts.text ?? [],
  } as unknown as SearchStore;
}

function fakeEmbedder(opts: { fail?: boolean; embedding?: number[] }) {
  return {
    embedQuery: async () => {
      if (opts.fail) throw new EmbeddingUnavailable("Ollama did not answer");
      return opts.embedding ?? [0.1, 0.2, 0.3];
    },
  } as any;
}

// The caller's token: documents() answers only with what the token can view.
function fakeApi(documents: Array<Record<string, unknown>>): {
  api: PaperlessAPI;
  paths: string[];
} {
  const paths: string[] = [];
  const api = {
    request: async (path: string) => {
      paths.push(path);
      return { results: documents };
    },
  } as unknown as PaperlessAPI;
  return { api, paths };
}

async function withClient(
  api: PaperlessAPI,
  search: { store: SearchStore; embedder: any; publicUrl: string },
  run: (client: Client) => Promise<void>
) {
  const server = new McpServer({ name: "search-test", version: "1.0.0" });
  registerSearchTools(server, api, search);
  const client = new Client({ name: "search-test-client", version: "1.0.0" });
  const clientTransport = new TestTransport();
  const serverTransport = new TestTransport();
  clientTransport.peer = serverTransport;
  serverTransport.peer = clientTransport;
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

test(
  "the caller filter drops a document the caller's id__in answer does not have",
  { timeout: 5000 },
  async () => {
    const store = fakeStore({
      vector: [hit(1, 0.9), hit(2, 0.8)],
    });
    const embedder = fakeEmbedder({});
    // The caller's token cannot view document 2: Paperless leaves it out.
    const { api, paths } = fakeApi([
      {
        id: 1,
        title: "Doc 1",
        created: "2026-01-01",
        correspondent: 5,
        document_type: 2,
        tags: [1],
      },
    ]);

    await withClient(
      api,
      { store, embedder, publicUrl: "https://paperless.example.test" },
      async (client) => {
        const result = (await client.callTool({
          name: "semantic_search",
          arguments: { query: "invoice" },
        })) as CallToolResult;
        const body = parseToolText(result);
        assert.deepEqual(
          body.results.map((r: any) => r.id),
          [1]
        );
      }
    );
    assert.ok(
      paths[0].includes("id__in=1,2") || paths[0].includes("id__in=2,1")
    );
  }
);

test(
  "an embedder that throws EmbeddingUnavailable falls back to text hits with semantic unavailable",
  { timeout: 5000 },
  async () => {
    const store = fakeStore({ text: [hit(5, 1.1, "paper trail")] });
    const embedder = fakeEmbedder({ fail: true });
    const { api } = fakeApi([
      {
        id: 5,
        title: "Doc 5",
        created: "2026-01-02",
        correspondent: null,
        document_type: null,
        tags: [],
      },
    ]);

    await withClient(
      api,
      { store, embedder, publicUrl: "https://paperless.example.test" },
      async (client) => {
        const result = (await client.callTool({
          name: "semantic_search",
          arguments: { query: "invoice" },
        })) as CallToolResult;
        const body = parseToolText(result);
        assert.equal(body.semantic, "unavailable");
        assert.equal(body.results[0].matched, "words");
      }
    );
  }
);

test(
  "a best similarity below STRONG_MATCH with no text hit is not a strong match",
  { timeout: 5000 },
  async () => {
    const store = fakeStore({ vector: [hit(1, 0.3)] });
    const embedder = fakeEmbedder({});
    const { api } = fakeApi([
      {
        id: 1,
        title: "Doc 1",
        created: "2026-01-01",
        correspondent: null,
        document_type: null,
        tags: [],
      },
    ]);

    await withClient(
      api,
      { store, embedder, publicUrl: "https://paperless.example.test" },
      async (client) => {
        const result = (await client.callTool({
          name: "semantic_search",
          arguments: { query: "invoice" },
        })) as CallToolResult;
        const body = parseToolText(result);
        assert.equal(body.strong_match, false);
      }
    );
  }
);

test(
  "the passage of a result is at most 600 characters",
  { timeout: 5000 },
  async () => {
    const longText = "x".repeat(2000);
    const store = fakeStore({ vector: [hit(1, 0.9, longText)] });
    const embedder = fakeEmbedder({});
    const { api } = fakeApi([
      {
        id: 1,
        title: "Doc 1",
        created: "2026-01-01",
        correspondent: null,
        document_type: null,
        tags: [],
      },
    ]);

    await withClient(
      api,
      { store, embedder, publicUrl: "https://paperless.example.test" },
      async (client) => {
        const result = (await client.callTool({
          name: "semantic_search",
          arguments: { query: "invoice" },
        })) as CallToolResult;
        const body = parseToolText(result);
        assert.ok(body.results[0].passage.length <= 600);
      }
    );
  }
);

test("the link of a result uses publicUrl", { timeout: 5000 }, async () => {
  const store = fakeStore({ vector: [hit(1, 0.9)] });
  const embedder = fakeEmbedder({});
  const { api } = fakeApi([
    {
      id: 1,
      title: "Doc 1",
      created: "2026-01-01",
      correspondent: null,
      document_type: null,
      tags: [],
    },
  ]);

  await withClient(
    api,
    { store, embedder, publicUrl: "https://paperless.example.test" },
    async (client) => {
      const result = (await client.callTool({
        name: "semantic_search",
        arguments: { query: "invoice" },
      })) as CallToolResult;
      const body = parseToolText(result);
      assert.equal(
        body.results[0].link,
        "https://paperless.example.test/documents/1/details"
      );
    }
  );
});

test(
  "with no candidates at all, the tool does not call Paperless",
  { timeout: 5000 },
  async () => {
    const store = fakeStore({});
    const embedder = fakeEmbedder({});
    const { api, paths } = fakeApi([]);

    await withClient(
      api,
      { store, embedder, publicUrl: "https://paperless.example.test" },
      async (client) => {
        const result = (await client.callTool({
          name: "semantic_search",
          arguments: { query: "invoice" },
        })) as CallToolResult;
        const body = parseToolText(result);
        assert.deepEqual(body.results, []);
        assert.equal(body.strong_match, false);
        assert.equal(body.semantic, "ok");
      }
    );
    assert.deepEqual(paths, []);
  }
);

test(
  "a limit over 50 is clamped to 50 results instead of an error",
  { timeout: 5000 },
  async () => {
    const vector = Array.from({ length: 60 }, (_, i) =>
      hit(i + 1, 0.9 - i / 1000)
    );
    const store = fakeStore({ vector });
    const embedder = fakeEmbedder({});
    const documents = vector.map((h) => ({
      id: h.documentId,
      title: `Doc ${h.documentId}`,
      created: "2026-01-01",
      correspondent: null,
      document_type: null,
      tags: [],
    }));
    const { api } = fakeApi(documents);

    await withClient(
      api,
      { store, embedder, publicUrl: "https://paperless.example.test" },
      async (client) => {
        const result = (await client.callTool({
          name: "semantic_search",
          arguments: { query: "invoice", limit: 100 },
        })) as CallToolResult;
        assert.ok(!result.isError);
        const body = parseToolText(result);
        assert.equal(body.results.length, 50);
      }
    );
  }
);
