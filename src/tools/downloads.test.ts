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
import { Downloads } from "../downloads";
import { registerDownloadTools } from "./downloads";

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

function fakeApi(opts: { fail?: boolean }): {
  api: PaperlessAPI;
  paths: string[];
} {
  const paths: string[] = [];
  const api = {
    request: async (path: string) => {
      paths.push(path);
      if (opts.fail) throw new Error("the caller cannot view this document");
      return { id: 42 };
    },
  } as unknown as PaperlessAPI;
  return { api, paths };
}

function fakeDownloads(): { downloads: Downloads; calls: Array<unknown[]> } {
  const calls: Array<unknown[]> = [];
  const downloads = {
    request: (...args: unknown[]) => {
      calls.push(args);
      return {
        download_id: "dl-1",
        url: "https://download.example.test/download/tok",
        expires_at: "2026-01-01T00:15:00.000Z",
      };
    },
  } as unknown as Downloads;
  return { downloads, calls };
}

async function withClient(
  api: PaperlessAPI,
  downloads: Downloads,
  callerToken: string,
  run: (client: Client) => Promise<void>
) {
  const server = new McpServer({ name: "downloads-test", version: "1.0.0" });
  registerDownloadTools(server, api, downloads, callerToken);
  const client = new Client({
    name: "downloads-test-client",
    version: "1.0.0",
  });
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
  "request_download checks the caller can view the document, then mints a link",
  { timeout: 5000 },
  async () => {
    const { api, paths } = fakeApi({});
    const { downloads, calls } = fakeDownloads();

    await withClient(api, downloads, "caller-token", async (client) => {
      const result = (await client.callTool({
        name: "request_download",
        arguments: { document_id: 42 },
      })) as CallToolResult;
      assert.ok(!result.isError, JSON.stringify(result));
      const body = parseToolText(result);
      assert.equal(body.download_id, "dl-1");
      assert.equal(body.url, "https://download.example.test/download/tok");
      assert.equal(body.expires_at, "2026-01-01T00:15:00.000Z");
      assert.match(body.note, /once/);
      assert.match(body.note, /15 minutes/);
    });

    assert.deepEqual(paths, ["/documents/42/?fields=id"]);
    assert.deepEqual(calls, [[42, "caller-token", false]]);
  }
);

test(
  "original=true is passed through to Downloads.request",
  { timeout: 5000 },
  async () => {
    const { api } = fakeApi({});
    const { downloads, calls } = fakeDownloads();

    await withClient(api, downloads, "caller-token", async (client) => {
      await client.callTool({
        name: "request_download",
        arguments: { document_id: 42, original: true },
      });
    });

    assert.deepEqual(calls, [[42, "caller-token", true]]);
  }
);

test(
  "a document the caller cannot view gives a tool error and no link",
  { timeout: 5000 },
  async () => {
    const { api } = fakeApi({ fail: true });
    const { downloads, calls } = fakeDownloads();

    await withClient(api, downloads, "caller-token", async (client) => {
      const result = (await client.callTool({
        name: "request_download",
        arguments: { document_id: 42 },
      })) as CallToolResult;
      assert.ok(result.isError);
    });

    assert.equal(calls.length, 0, "no link is minted");
  }
);
