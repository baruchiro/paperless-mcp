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

test("resources/list does not enumerate documents at startup", async () => {
  // Documents are dynamic DMS data and must not be pre-registered as MCP
  // resources: enumerating them floods `resources/list` and the LLM context
  // window (issue #112). The list must stay empty even when documents exist;
  // documents are reached on demand via tools + the `resources/read` template.
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

    assert.deepEqual(result.resources, []);
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
