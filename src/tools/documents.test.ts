import assert from "node:assert/strict";
import { test, describe, before, after } from "node:test";
import { writeFileSync, mkdtempSync, rmSync, symlinkSync, truncateSync, realpathSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport";
import type { CallToolResult, JSONRPCMessage } from "@modelcontextprotocol/sdk/types";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { CustomField } from "../api/types";
import { buildBulkEditParameters, registerDocumentTools, validateFilePath } from "./documents";

// ALLOWED_UPLOAD_PATHS is read from the environment at module load, so the
// allowlist can only be exercised by re-importing the module with the env set.
function validateFilePathWithAllowlist(
  allowedPaths: string
): typeof validateFilePath {
  const modulePath = require.resolve("./documents");
  const previous = process.env.PAPERLESS_MCP_UPLOAD_PATHS;
  process.env.PAPERLESS_MCP_UPLOAD_PATHS = allowedPaths;
  delete require.cache[modulePath];
  try {
    return require("./documents").validateFilePath;
  } finally {
    delete require.cache[modulePath];
    if (previous === undefined) {
      delete process.env.PAPERLESS_MCP_UPLOAD_PATHS;
    } else {
      process.env.PAPERLESS_MCP_UPLOAD_PATHS = previous;
    }
  }
}

test("buildBulkEditParameters sends Paperless bulk custom fields as id:value map", () => {
  const parameters = buildBulkEditParameters(
    { remove_custom_fields: [] },
    [
      { field: 9, value: "" },
      { field: 10, value: "2026-05-14" },
    ]
  );

  assert.deepEqual(parameters, {
    remove_custom_fields: [],
    add_custom_fields: {
      "9": "",
      "10": "2026-05-14",
    },
  });
  assert.ok(!("assign_custom_fields" in parameters));
  assert.ok(!("assign_custom_fields_values" in parameters));
});

test("buildBulkEditParameters preserves null custom field values", () => {
  const parameters = buildBulkEditParameters({}, [{ field: 9, value: null }]);

  assert.deepEqual(parameters, {
    add_custom_fields: {
      "9": null,
    },
  });
});

test("buildBulkEditParameters includes Paperless-required empty custom field keys", () => {
  const parameters = buildBulkEditParameters({}, undefined, true);

  assert.deepEqual(parameters, {
    add_custom_fields: {},
    remove_custom_fields: [],
  });
});

test("buildBulkEditParameters preserves an empty custom fields array", () => {
  const parameters = buildBulkEditParameters({}, []);

  assert.deepEqual(parameters, {
    add_custom_fields: {},
  });
  assert.ok(!("remove_custom_fields" in parameters));
});

test("buildBulkEditParameters preserves an empty custom fields array with defaults", () => {
  const parameters = buildBulkEditParameters({}, [], true);

  assert.deepEqual(parameters, {
    add_custom_fields: {},
    remove_custom_fields: [],
  });
});

test("buildBulkEditParameters combines base parameters with custom fields", () => {
  const parameters = buildBulkEditParameters(
    { add_tags: [3], remove_tags: [1, 2] },
    [{ field: 9, value: "pending" }]
  );

  assert.deepEqual(parameters, {
    add_tags: [3],
    remove_tags: [1, 2],
    add_custom_fields: {
      "9": "pending",
    },
  });
});

test("buildBulkEditParameters preserves supported custom field value types", () => {
  const parameters = buildBulkEditParameters({}, [
    { field: 1, value: 42 },
    { field: 2, value: true },
    { field: 3, value: "" },
    { field: 4, value: null },
    { field: 5, value: [123, 456] },
  ]);

  assert.deepEqual(parameters.add_custom_fields, {
    "1": 42,
    "2": true,
    "3": "",
    "4": null,
    "5": [123, 456],
  });
});

describe("validateFilePath", () => {
  let testDir: string;
  let testFile: string;
  let emptyFile: string;
  let symlinkPath: string;

  before(() => {
    testDir = mkdtempSync(join(tmpdir(), "paperless-mcp-test-"));
    testFile = join(testDir, "test.pdf");
    writeFileSync(testFile, "%PDF-1.4\ntest content");
    emptyFile = join(testDir, "empty.pdf");
    writeFileSync(emptyFile, "");
    symlinkPath = join(testDir, "link.pdf");
    try { symlinkSync(testFile, symlinkPath); } catch { /* skip if unsupported */ }
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("accepts a valid absolute file path", async () => {
    await assert.doesNotReject(() => validateFilePath(testFile));
  });

  test("rejects relative paths", async () => {
    await assert.rejects(() => validateFilePath("relative/path.pdf"), {
      message: "file_path must be an absolute path",
    });
  });

  test("rejects non-existent files", async () => {
    await assert.rejects(
      () => validateFilePath(join(testDir, "missing.pdf")),
      { message: "File not found" }
    );
  });

  test("rejects directories", async () => {
    await assert.rejects(() => validateFilePath(testDir), {
      message: "Path must point to a regular file",
    });
  });

  test("rejects empty files", async () => {
    await assert.rejects(() => validateFilePath(emptyFile), {
      message: "File is empty",
    });
  });

  test("resolves symlinks to the real file", async () => {
    try {
      await assert.doesNotReject(() => validateFilePath(symlinkPath));
    } catch {
      // Skip on systems without symlink support
    }
  });

  test("rejects files exceeding the maximum size", async () => {
    const largeFile = join(testDir, "large.pdf");
    writeFileSync(largeFile, "%PDF-1.4\n");
    truncateSync(largeFile, 101 * 1024 * 1024);
    await assert.rejects(() => validateFilePath(largeFile), {
      message: /exceeds maximum allowed size/,
    });
  });

  test("accepts files within allowed upload paths", async () => {
    const validate = validateFilePathWithAllowlist(realpathSync(testDir));
    await assert.doesNotReject(() => validate(testFile));
  });

  test("rejects files outside allowed upload paths", async () => {
    const validate = validateFilePathWithAllowlist("/some/other/path");
    await assert.rejects(() => validate(testFile), {
      message: /outside allowed upload directories/,
    });
  });
});

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

async function withDocumentClient(
  api: PaperlessAPI,
  run: (client: Client) => Promise<void>
) {
  const server = new McpServer({ name: "paperless-doc-test", version: "1.0.0" });
  registerDocumentTools(server, api);

  const client = new Client({
    name: "paperless-doc-test-client",
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

interface DocumentApiCalls {
  updateDocument: Array<[number, Record<string, unknown>]>;
  bulkEditDocuments: Array<[number[], string, Record<string, unknown>]>;
  getCustomField: number[];
}

function createDocumentApi(fields: CustomField[]) {
  const calls: DocumentApiCalls = {
    updateDocument: [],
    bulkEditDocuments: [],
    getCustomField: [],
  };
  const fieldMap = new Map(fields.map((field) => [field.id, field]));
  const api = {
    getCustomField: async (id: number) => {
      calls.getCustomField.push(id);
      const field = fieldMap.get(id);
      if (!field) throw new Error(`custom field ${id} not found`);
      return field;
    },
    updateDocument: async (id: number, data: Record<string, unknown>) => {
      calls.updateDocument.push([id, data]);
      return { id, custom_fields: data.custom_fields ?? [] };
    },
    bulkEditDocuments: async (
      documents: number[],
      method: string,
      parameters: Record<string, unknown>
    ) => {
      calls.bulkEditDocuments.push([documents, method, parameters]);
      return { result: "OK" };
    },
    getCorrespondents: async () => ({ results: [] }),
    getDocumentTypes: async () => ({ results: [] }),
    getTags: async () => ({ results: [] }),
    getCustomFields: async () => ({ results: [] }),
  } as unknown as PaperlessAPI;
  return { api, calls };
}

const LEGACY_SELECT_FIELD: CustomField = {
  id: 2,
  name: "כמה זמן לשמור",
  data_type: "select",
  extra_data: { select_options: ["שנה", "7 שנים", "שנתיים"], default_currency: null },
  document_count: 10,
};

const OBJECT_SELECT_FIELD: CustomField = {
  id: 3,
  name: "Priority",
  data_type: "select",
  extra_data: {
    select_options: [
      { id: "abc123", label: "Low" },
      { id: "def456", label: "High" },
    ],
  },
  document_count: 5,
};

describe("select custom field value resolution in document handlers", () => {
  test("update_document translates a select label to its zero-based index", async () => {
    const { api, calls } = createDocumentApi([LEGACY_SELECT_FIELD]);

    await withDocumentClient(api, async (client) => {
      const result = (await client.callTool({
        name: "update_document",
        arguments: { id: 42, custom_fields: [{ field: 2, value: "שנה" }] },
      })) as CallToolResult;
      assert.ok(!result.isError, parseToolText(result)?.error);
    });

    assert.equal(calls.updateDocument.length, 1);
    const [, data] = calls.updateDocument[0];
    assert.deepEqual(data.custom_fields, [{ field: 2, value: 0 }]);
  });

  test("update_document translates a select label to its option id (Paperless 2.17+)", async () => {
    const { api, calls } = createDocumentApi([OBJECT_SELECT_FIELD]);

    await withDocumentClient(api, async (client) => {
      const result = (await client.callTool({
        name: "update_document",
        arguments: { id: 7, custom_fields: [{ field: 3, value: "High" }] },
      })) as CallToolResult;
      assert.ok(!result.isError, parseToolText(result)?.error);
    });

    const [, data] = calls.updateDocument[0];
    assert.deepEqual(data.custom_fields, [{ field: 3, value: "def456" }]);
  });

  test("bulk_edit_documents translates a select label in add_custom_fields", async () => {
    const { api, calls } = createDocumentApi([LEGACY_SELECT_FIELD]);

    await withDocumentClient(api, async (client) => {
      const result = (await client.callTool({
        name: "bulk_edit_documents",
        arguments: {
          documents: [1, 2],
          method: "modify_custom_fields",
          add_custom_fields: [{ field: 2, value: "7 שנים" }],
        },
      })) as CallToolResult;
      assert.ok(!result.isError, parseToolText(result)?.error);
    });

    assert.equal(calls.bulkEditDocuments.length, 1);
    const [, , parameters] = calls.bulkEditDocuments[0];
    assert.deepEqual(parameters.add_custom_fields, { "2": 1 });
  });

  test("update_document rejects an unknown select option with a helpful error", async () => {
    const { api, calls } = createDocumentApi([LEGACY_SELECT_FIELD]);

    await withDocumentClient(api, async (client) => {
      const result = (await client.callTool({
        name: "update_document",
        arguments: { id: 42, custom_fields: [{ field: 2, value: "forever" }] },
      })) as CallToolResult;
      assert.ok(result.isError, "expected an error for an unknown select option");
      const message = parseToolText(result)?.error ?? "";
      assert.match(message, /forever/);
      assert.match(message, /שנה/);
    });

    assert.equal(
      calls.updateDocument.length,
      0,
      "no document update should be sent when the option is invalid"
    );
  });
});
