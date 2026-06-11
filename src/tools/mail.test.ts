import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport";
import type { CallToolResult, JSONRPCMessage } from "@modelcontextprotocol/sdk/types";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { registerMailTools } from "./mail";

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

function parseToolText(result: CallToolResult) {
  const item = result.content?.[0];
  if (!item || item.type !== "text") {
    throw new Error("Expected text tool response");
  }
  return JSON.parse(item.text);
}

async function withMailClient(
  api: PaperlessAPI,
  run: (client: Client) => Promise<void>
) {
  const server = new McpServer({ name: "paperless-mail-test", version: "1.0.0" });
  registerMailTools(server, api);

  const client = new Client({
    name: "paperless-mail-test-client",
    version: "1.0.0",
  });
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

test("mail tools are registered", async () => {
  await withMailClient({} as PaperlessAPI, async (client) => {
    const result = await client.listTools();
    const names = result.tools.map((tool) => tool.name).sort();

    assert.deepEqual(names, [
      "create_mail_rule",
      "delete_mail_rule",
      "get_mail_account",
      "get_mail_rule",
      "list_mail_accounts",
      "list_mail_rules",
      "process_mail_account",
      "update_mail_rule",
    ]);
  });
});

test("list_mail_accounts redacts returned passwords", async () => {
  const api = {
    getMailAccounts: async (queryString: string) => ({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          name: "Inbox",
          username: "paperless@example.test",
          password: "secret",
          queryString,
        },
      ],
    }),
  } as unknown as PaperlessAPI;

  await withMailClient(api, async (client) => {
    const result = (await client.callTool({
      name: "list_mail_accounts",
      arguments: { page: 2, page_size: 10 },
    })) as CallToolResult;
    const response = parseToolText(result);

    assert.equal(response.results[0].password, undefined);
    assert.equal(response.results[0].queryString, "page=2&page_size=10");
  });
});

test("get_mail_account redacts returned password", async () => {
  const api = {
    getMailAccount: async (id: number) => ({
      id,
      name: "Inbox",
      username: "paperless@example.test",
      password: "secret",
    }),
  } as unknown as PaperlessAPI;

  await withMailClient(api, async (client) => {
    const result = (await client.callTool({
      name: "get_mail_account",
      arguments: { id: 7 },
    })) as CallToolResult;
    const account = parseToolText(result);

    assert.deepEqual(account, {
      id: 7,
      name: "Inbox",
      username: "paperless@example.test",
    });
  });
});

test("process_mail_account reports success after processing", async () => {
  const calls: unknown[] = [];
  const api = {
    processMailAccount: async (id: number) => {
      calls.push(["process", id]);
    },
  } as unknown as PaperlessAPI;

  await withMailClient(api, async (client) => {
    const result = (await client.callTool({
      name: "process_mail_account",
      arguments: { id: 5 },
    })) as CallToolResult;
    const response = parseToolText(result);

    assert.deepEqual(response, { status: "processed" });
  });

  assert.deepEqual(calls, [["process", 5]]);
});

test("mail rule write tools pass through payloads", async () => {
  const calls: unknown[] = [];
  const api = {
    createMailRule: async (data: unknown) => {
      calls.push(["create", data]);
      return { id: 3, ...(data as object) };
    },
    updateMailRule: async (id: number, data: unknown) => {
      calls.push(["update", id, data]);
      return { id, ...(data as object) };
    },
    deleteMailRule: async (id: number) => {
      calls.push(["delete", id]);
    },
  } as unknown as PaperlessAPI;

  await withMailClient(api, async (client) => {
    await client.callTool({
      name: "create_mail_rule",
      arguments: {
        name: "Invoices",
        account: 1,
        folder: "INBOX",
        filter_from: "billing@example.test",
        assign_tags: [3, 15],
      },
    });
    await client.callTool({
      name: "update_mail_rule",
      arguments: {
        id: 3,
        enabled: false,
      },
    });
    await client.callTool({
      name: "delete_mail_rule",
      arguments: {
        id: 3,
        confirm: true,
      },
    });
  });

  assert.deepEqual(calls, [
    [
      "create",
      {
        name: "Invoices",
        account: 1,
        folder: "INBOX",
        filter_from: "billing@example.test",
        assign_tags: [3, 15],
      },
    ],
    ["update", 3, { enabled: false }],
    ["delete", 3],
  ]);
});
