import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types";
import type { AxiosResponse } from "axios";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { createDocument } from "../test/mocks/paperlessApi";
import { registerDocumentResources } from "./documents";

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

function emptyPaginationResponse<T>(results: T[] = [], all: number[] = []) {
  return {
    count: results.length,
    next: null,
    previous: null,
    all,
    results,
  };
}

function createBinaryResponse(
  body: string,
  contentType: string
): AxiosResponse<ArrayBuffer> {
  return {
    data: Buffer.from(body),
    status: 200,
    statusText: "OK",
    headers: {
      "content-type": contentType,
    },
    config: {},
  } as unknown as AxiosResponse<ArrayBuffer>;
}

async function withResourceClient(
  api: PaperlessAPI,
  run: (client: Client) => Promise<void>
) {
  const server = new McpServer({ name: "paperless-test", version: "1.0.0" });
  registerDocumentResources(server, api);

  const client = new Client({ name: "paperless-test-client", version: "1.0.0" });
  const { clientTransport, serverTransport } = createTransportPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

test("resources/list exposes download and thumbnail resources for the first page only", async () => {
  // `all` lists IDs across every page (potentially tens of thousands of
  // documents) — `resources/list` must not expand that or it will produce
  // an unbounded payload. Only the documents on the fetched page should
  // appear; the rest are still reachable via the resource template.
  const api = {
    getDocuments: async () =>
      emptyPaginationResponse(
        [
          createDocument({
            id: 1,
            title: "Invoice",
            mime_type: "application/pdf",
          }),
          createDocument({
            id: 2,
            title: "Receipt",
            mime_type: "image/png",
          }),
        ],
        [1, 2, 3]
      ),
  } as unknown as PaperlessAPI;

  await withResourceClient(api, async (client) => {
    const result = await client.listResources();

    assert.deepEqual(
      result.resources.map((resource) => resource.uri),
      [
        "paperless://documents/1/download",
        "paperless://documents/1/thumb",
        "paperless://documents/2/download",
        "paperless://documents/2/thumb",
      ]
    );
    assert.equal(result.resources[0].name, "Invoice download");
    assert.equal(result.resources[0].mimeType, "application/pdf");
    assert.equal(result.resources[3].name, "Receipt thumbnail");
    // Document 3 lives in `all` but not on this page — it must not leak in.
    for (const resource of result.resources) {
      assert.ok(
        !resource.uri.includes("/3/"),
        `unexpected page-3 resource in list: ${resource.uri}`
      );
    }
  });
});

test("resources/read fetches document downloads as lazy binary resources", async () => {
  const calls: Array<{ id: number; original: boolean }> = [];
  const api = {
    getDocuments: async () => emptyPaginationResponse(),
    downloadDocument: async (id: number, original: boolean) => {
      calls.push({ id, original });
      return createBinaryResponse("%PDF test", "application/pdf");
    },
  } as unknown as PaperlessAPI;

  await withResourceClient(api, async (client) => {
    const result = await client.readResource({
      uri: "paperless://documents/2/download",
    });

    assert.deepEqual(calls, [{ id: 2, original: false }]);
    assert.deepEqual(result.contents, [
      {
        uri: "paperless://documents/2/download",
        mimeType: "application/pdf",
        blob: Buffer.from("%PDF test").toString("base64"),
      },
    ]);
  });
});

test("resources/read preserves original download query intent", async () => {
  const calls: Array<{ id: number; original: boolean }> = [];
  const api = {
    getDocuments: async () => emptyPaginationResponse(),
    downloadDocument: async (id: number, original: boolean) => {
      calls.push({ id, original });
      return createBinaryResponse("original file", "application/octet-stream");
    },
  } as unknown as PaperlessAPI;

  await withResourceClient(api, async (client) => {
    await client.readResource({
      uri: "paperless://documents/7/download?original=true",
    });

    assert.deepEqual(calls, [{ id: 7, original: true }]);
  });
});

test("resources/read fetches document thumbnails as lazy binary resources", async () => {
  const calls: number[] = [];
  const api = {
    getDocuments: async () => emptyPaginationResponse(),
    getThumbnail: async (id: number) => {
      calls.push(id);
      return createBinaryResponse("webp image", "image/webp");
    },
  } as unknown as PaperlessAPI;

  await withResourceClient(api, async (client) => {
    const result = await client.readResource({
      uri: "paperless://documents/3/thumb",
    });

    assert.deepEqual(calls, [3]);
    assert.deepEqual(result.contents, [
      {
        uri: "paperless://documents/3/thumb",
        mimeType: "image/webp",
        blob: Buffer.from("webp image").toString("base64"),
      },
    ]);
  });
});

test("resources/read returns text contents for text responses", async () => {
  const api = {
    getDocuments: async () => emptyPaginationResponse(),
    downloadDocument: async () =>
      createBinaryResponse("plain text", "text/plain; charset=utf-8"),
  } as unknown as PaperlessAPI;

  await withResourceClient(api, async (client) => {
    const result = await client.readResource({
      uri: "paperless://documents/4/download",
    });

    assert.deepEqual(result.contents, [
      {
        uri: "paperless://documents/4/download",
        mimeType: "text/plain; charset=utf-8",
        text: "plain text",
      },
    ]);
  });
});
