import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport";
import type { CallToolResult, JSONRPCMessage } from "@modelcontextprotocol/sdk/types";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { Note } from "../api/types";
import { registerNoteTools } from "./notes";

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

interface NoteApiCalls {
  getDocumentNotes: number[];
  createDocumentNote: Array<[number, string]>;
  deleteDocumentNote: Array<[number, number]>;
}

function createNoteApi(notes: Note[] = []) {
  const calls: NoteApiCalls = {
    getDocumentNotes: [],
    createDocumentNote: [],
    deleteDocumentNote: [],
  };
  const api = {
    getDocumentNotes: async (id: number) => {
      calls.getDocumentNotes.push(id);
      return notes;
    },
    createDocumentNote: async (id: number, note: string) => {
      calls.createDocumentNote.push([id, note]);
      return notes;
    },
    deleteDocumentNote: async (id: number, noteId: number) => {
      calls.deleteDocumentNote.push([id, noteId]);
      return notes;
    },
  } as unknown as PaperlessAPI;
  return { api, calls };
}

async function withNoteClient(
  api: PaperlessAPI,
  run: (client: Client) => Promise<void>
) {
  const server = new McpServer({ name: "paperless-note-test", version: "1.0.0" });
  registerNoteTools(server, api);

  const client = new Client({
    name: "paperless-note-test-client",
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

describe("document note tools", () => {
  const sampleNotes: Note[] = [
    {
      id: 5,
      note: "Paid 2026-06-30",
      created: "2026-06-30T10:00:00Z",
      user: { id: 3, username: "nick" },
    },
  ];

  test("create_document_note posts the note text to the document", async () => {
    const { api, calls } = createNoteApi(sampleNotes);

    await withNoteClient(api, async (client) => {
      const result = (await client.callTool({
        name: "create_document_note",
        arguments: { id: 1740, note: "Antwort an Finanzamt versendet" },
      })) as CallToolResult;
      assert.ok(!result.isError, parseToolText(result)?.error);
      assert.deepEqual(parseToolText(result), sampleNotes);
    });

    assert.deepEqual(calls.createDocumentNote, [
      [1740, "Antwort an Finanzamt versendet"],
    ]);
  });

  test("list_document_notes fetches notes for the document", async () => {
    const { api, calls } = createNoteApi(sampleNotes);

    await withNoteClient(api, async (client) => {
      const result = (await client.callTool({
        name: "list_document_notes",
        arguments: { id: 42 },
      })) as CallToolResult;
      assert.ok(!result.isError, parseToolText(result)?.error);
      assert.deepEqual(parseToolText(result), sampleNotes);
    });

    assert.deepEqual(calls.getDocumentNotes, [42]);
  });

  test("delete_document_note removes a note by its note ID", async () => {
    const { api, calls } = createNoteApi([]);

    await withNoteClient(api, async (client) => {
      const result = (await client.callTool({
        name: "delete_document_note",
        arguments: { id: 42, note_id: 5 },
      })) as CallToolResult;
      assert.ok(!result.isError, parseToolText(result)?.error);
    });

    assert.deepEqual(calls.deleteDocumentNote, [[42, 5]]);
  });

  test("create_document_note rejects an empty note", async () => {
    const { api, calls } = createNoteApi(sampleNotes);

    await withNoteClient(api, async (client) => {
      await assert.rejects(
        client.callTool({
          name: "create_document_note",
          arguments: { id: 1, note: "" },
        }),
        "expected a validation error for an empty note"
      );
    });

    assert.equal(
      calls.createDocumentNote.length,
      0,
      "no note should be created when validation fails"
    );
  });
});
