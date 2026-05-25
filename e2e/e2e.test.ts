import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, ChildProcess } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { connectMcpClient, parseToolText, ToolResult } from "./client";

const PAPERLESS_URL = process.env.PAPERLESS_URL ?? "http://localhost:8000";
const PAPERLESS_TOKEN = process.env.PAPERLESS_TOKEN ?? "";
const MCP_PORT = process.env.MCP_PORT ?? "3001";
const MCP_URL = process.env.MCP_URL ?? `http://localhost:${MCP_PORT}/mcp`;

const RUN_TAG = `e2e-tag-${Date.now()}`;
const RUN_CORRESPONDENT = `E2E Corp ${Date.now()}`;
const RUN_DOCUMENT_TYPE = `E2E Type ${Date.now()}`;
const RUN_STORAGE_PATH = `E2E Storage ${Date.now()}`;
const RUN_STORAGE_PATH_RENAMED = `E2E Storage Renamed ${Date.now()}`;
const RUN_STORAGE_PATH_TEMPLATE = "e2e/{{ created_year }}/{{ title }}";
const RUN_DOCUMENT_TITLE = `E2E Document ${Date.now()}`;

// Paperless rejects duplicate uploads by checksum. When the same suite runs
// twice against one Paperless instance (e.g. CLI then Docker in one CI job),
// a constant PDF body would silently fail the second time as a duplicate.
// Append the per-run title as a trailing PDF comment so the checksum differs.
const MINIMAL_PDF = Buffer.concat([
  Buffer.from(
    "%PDF-1.4\n" +
      "1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n" +
      "2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n" +
      "3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]>>\nendobj\n" +
      "xref\n0 4\n" +
      "0000000000 65535 f \n" +
      "0000000009 00000 n \n" +
      "0000000056 00000 n \n" +
      "0000000111 00000 n \n" +
      "trailer\n<</Size 4 /Root 1 0 R>>\n" +
      "startxref\n180\n%%EOF\n"
  ),
  Buffer.from(`%${RUN_DOCUMENT_TITLE}\n`),
]);

let mcpProcess: ChildProcess | undefined;
let client: Client;

const state: {
  tagId?: number;
  correspondentId?: number;
  documentTypeId?: number;
  storagePathId?: number;
  documentId?: number;
} = {};

async function waitForMcp(url: string, maxAttempts = 30): Promise<void> {
  const base = url.replace(/\/mcp$/, "");
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(base + "/mcp", { method: "GET" });
      if (res.status === 405) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("MCP server did not start in time");
}

function startMcpServer(): ChildProcess {
  const proc = spawn(
    "node",
    [
      "build/index.js",
      "--http",
      "--port",
      MCP_PORT,
      "--baseUrl",
      PAPERLESS_URL,
      "--token",
      PAPERLESS_TOKEN,
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  proc.stderr?.on("data", (d) => process.stderr.write(d));
  return proc;
}

function errorText(result: ToolResult): string {
  return result.content.find((c) => c.type === "text")?.text ?? "(no text content)";
}

function assertOk(result: ToolResult, label: string): void {
  assert.ok(
    !result.isError,
    `${label} returned isError=true: ${errorText(result)}`
  );
}

before(async () => {
  try {
    assert.ok(PAPERLESS_TOKEN, "PAPERLESS_TOKEN env var is required");

    if (!process.env.MCP_URL) {
      mcpProcess = startMcpServer();
      await waitForMcp(MCP_URL);
    }

    client = await connectMcpClient(MCP_URL, PAPERLESS_TOKEN);
    console.log("MCP client connected; running scenario...");
  } catch (err) {
    console.error(
      "BEFORE HOOK FAILED:",
      err instanceof Error ? err.stack : String(err)
    );
    throw err;
  }
});

after(async () => {
  await client?.close?.();
  mcpProcess?.kill("SIGTERM");
});

describe("Paperless MCP E2E scenario", () => {
  it("create_tag creates a tag and returns it with an id", async () => {
    const result = (await client.callTool({
      name: "create_tag",
      arguments: { name: RUN_TAG },
    })) as ToolResult;
    assertOk(result, "create_tag");
    const tag = parseToolText(result) as { id: number; name: string };
    assert.ok(typeof tag.id === "number", `tag.id should be a number, got ${JSON.stringify(tag)}`);
    assert.strictEqual(tag.name, RUN_TAG);
    state.tagId = tag.id;
  });

  it("create_correspondent creates a correspondent and returns it with an id", async () => {
    const result = (await client.callTool({
      name: "create_correspondent",
      arguments: { name: RUN_CORRESPONDENT },
    })) as ToolResult;
    assertOk(result, "create_correspondent");
    const correspondent = parseToolText(result) as { id: number; name: string };
    assert.ok(typeof correspondent.id === "number");
    assert.strictEqual(correspondent.name, RUN_CORRESPONDENT);
    state.correspondentId = correspondent.id;
  });

  it("create_document_type creates a document type and returns it with an id", async () => {
    const result = (await client.callTool({
      name: "create_document_type",
      arguments: { name: RUN_DOCUMENT_TYPE },
    })) as ToolResult;
    assertOk(result, "create_document_type");
    const docType = parseToolText(result) as { id: number; name: string };
    assert.ok(typeof docType.id === "number");
    assert.strictEqual(docType.name, RUN_DOCUMENT_TYPE);
    state.documentTypeId = docType.id;
  });

  it("list_tags returns the tag created earlier in this run", async () => {
    assert.ok(state.tagId, "tag must be created before list_tags");
    const result = (await client.callTool({
      name: "list_tags",
      arguments: {},
    })) as ToolResult;
    assertOk(result, "list_tags");
    const data = parseToolText(result) as {
      results: { id: number; name: string }[];
    };
    assert.ok(Array.isArray(data.results), "results should be an array");
    const found = data.results.find((t) => t.id === state.tagId);
    assert.ok(found, `tag id=${state.tagId} not found in list_tags`);
    assert.strictEqual(found.name, RUN_TAG);
  });

  it("get_tag returns the tag by ID with full detail fields", async () => {
    assert.ok(state.tagId, "tag must be created before get_tag");
    const result = (await client.callTool({
      name: "get_tag",
      arguments: { id: state.tagId },
    })) as ToolResult;
    assertOk(result, "get_tag");
    const tag = parseToolText(result) as {
      id: number;
      name: string;
      slug: string;
      matching_algorithm: { id: number; name: string };
    };
    assert.strictEqual(tag.id, state.tagId);
    assert.strictEqual(tag.name, RUN_TAG);
    assert.ok(
      typeof tag.slug === "string" && tag.slug.length > 0,
      `slug should be a non-empty string, got ${JSON.stringify(tag.slug)}`
    );
    assert.ok(
      tag.matching_algorithm &&
        typeof tag.matching_algorithm === "object" &&
        typeof tag.matching_algorithm.name === "string",
      `matching_algorithm should be expanded to {id,name}, got ${JSON.stringify(
        tag.matching_algorithm
      )}`
    );
  });

  it("list_correspondents returns the correspondent created earlier in this run", async () => {
    assert.ok(state.correspondentId, "correspondent must be created first");
    const result = (await client.callTool({
      name: "list_correspondents",
      arguments: {},
    })) as ToolResult;
    assertOk(result, "list_correspondents");
    const data = parseToolText(result) as {
      results: { id: number; name: string }[];
    };
    const found = data.results.find((c) => c.id === state.correspondentId);
    assert.ok(found, `correspondent id=${state.correspondentId} not found`);
    assert.strictEqual(found.name, RUN_CORRESPONDENT);
  });

  it("list_document_types returns the document type created earlier in this run", async () => {
    assert.ok(state.documentTypeId, "document type must be created first");
    const result = (await client.callTool({
      name: "list_document_types",
      arguments: {},
    })) as ToolResult;
    assertOk(result, "list_document_types");
    const data = parseToolText(result) as {
      results: { id: number; name: string }[];
    };
    const found = data.results.find((dt) => dt.id === state.documentTypeId);
    assert.ok(found, `document type id=${state.documentTypeId} not found`);
    assert.strictEqual(found.name, RUN_DOCUMENT_TYPE);
  });

  it("create_storage_path creates a storage path and returns it with an id", async () => {
    const result = (await client.callTool({
      name: "create_storage_path",
      arguments: {
        name: RUN_STORAGE_PATH,
        path: RUN_STORAGE_PATH_TEMPLATE,
      },
    })) as ToolResult;
    assertOk(result, "create_storage_path");
    const storagePath = parseToolText(result) as {
      id: number;
      name: string;
      path: string;
    };
    assert.ok(
      typeof storagePath.id === "number",
      `storage_path.id should be a number, got ${JSON.stringify(storagePath)}`
    );
    assert.strictEqual(storagePath.name, RUN_STORAGE_PATH);
    assert.strictEqual(storagePath.path, RUN_STORAGE_PATH_TEMPLATE);
    state.storagePathId = storagePath.id;
  });

  it("get_storage_path returns the storage path by ID with full detail fields", async () => {
    assert.ok(state.storagePathId, "storage path must be created first");
    const result = (await client.callTool({
      name: "get_storage_path",
      arguments: { id: state.storagePathId },
    })) as ToolResult;
    assertOk(result, "get_storage_path");
    const storagePath = parseToolText(result) as {
      id: number;
      name: string;
      path: string;
      slug: string;
      matching_algorithm: { id: number; name: string };
    };
    assert.strictEqual(storagePath.id, state.storagePathId);
    assert.strictEqual(storagePath.name, RUN_STORAGE_PATH);
    assert.strictEqual(storagePath.path, RUN_STORAGE_PATH_TEMPLATE);
    assert.ok(
      typeof storagePath.slug === "string" && storagePath.slug.length > 0,
      "slug should be a non-empty string"
    );
    assert.ok(
      storagePath.matching_algorithm &&
        typeof storagePath.matching_algorithm.name === "string",
      "matching_algorithm should be expanded to {id,name}"
    );
  });

  it("list_storage_paths returns the storage path created earlier in this run", async () => {
    assert.ok(state.storagePathId, "storage path must be created first");
    const result = (await client.callTool({
      name: "list_storage_paths",
      arguments: {},
    })) as ToolResult;
    assertOk(result, "list_storage_paths");
    const data = parseToolText(result) as {
      results: { id: number; name: string }[];
    };
    assert.ok(Array.isArray(data.results), "results should be an array");
    const found = data.results.find((sp) => sp.id === state.storagePathId);
    assert.ok(
      found,
      `storage_path id=${state.storagePathId} not found in list_storage_paths`
    );
    assert.strictEqual(found.name, RUN_STORAGE_PATH);
  });

  it("update_storage_path renames the storage path and the change is visible via get", async () => {
    assert.ok(state.storagePathId, "storage path must be created first");
    const updateResult = (await client.callTool({
      name: "update_storage_path",
      arguments: {
        id: state.storagePathId,
        name: RUN_STORAGE_PATH_RENAMED,
      },
    })) as ToolResult;
    assertOk(updateResult, "update_storage_path");

    const getResult = (await client.callTool({
      name: "get_storage_path",
      arguments: { id: state.storagePathId },
    })) as ToolResult;
    assertOk(getResult, "get_storage_path after update");
    const updated = parseToolText(getResult) as { name: string; path: string };
    assert.strictEqual(updated.name, RUN_STORAGE_PATH_RENAMED);
    // path must be unchanged — update only sent `name`.
    assert.strictEqual(updated.path, RUN_STORAGE_PATH_TEMPLATE);
  });

  it("post_document uploads a PDF and resolves to a document id", async () => {
    const base64Pdf = MINIMAL_PDF.toString("base64");
    const result = (await client.callTool({
      name: "post_document",
      arguments: {
        file: base64Pdf,
        filename: "e2e-fixture.pdf",
        title: RUN_DOCUMENT_TITLE,
      },
    })) as ToolResult;
    assertOk(result, "post_document");
    const data = parseToolText(result) as { id?: number; status?: string };

    if (typeof data.id === "number") {
      state.documentId = data.id;
      return;
    }
    assert.ok(
      typeof data.status === "string",
      `post_document should return id or status, got ${JSON.stringify(data)}`
    );

    // Async ingestion: poll list_documents until our title appears.
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const listResult = (await client.callTool({
        name: "list_documents",
        arguments: { ordering: "-id", page_size: 20 },
      })) as ToolResult;
      if (!listResult.isError) {
        const list = parseToolText(listResult) as {
          results: Array<{ id: number; title: string }>;
        };
        const match = list.results.find((d) => d.title === RUN_DOCUMENT_TITLE);
        if (match) {
          state.documentId = match.id;
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(
      `Document with title "${RUN_DOCUMENT_TITLE}" not visible via list_documents after 60s (post_document status=${data.status})`
    );
  });

  it("list_documents returns pagination shape with count>=1", async () => {
    assert.ok(state.documentId, "document must be uploaded first");
    const result = (await client.callTool({
      name: "list_documents",
      arguments: {},
    })) as ToolResult;
    assertOk(result, "list_documents");
    const data = parseToolText(result) as {
      count: number;
      results: unknown[];
      next: unknown;
      previous: unknown;
    };
    assert.ok(typeof data.count === "number", "count should be a number");
    assert.ok(Array.isArray(data.results), "results should be an array");
    assert.ok(data.count >= 1, `expected count>=1, got ${data.count}`);
  });

  it("get_document returns the uploaded document by id", async () => {
    assert.ok(state.documentId, "document must be uploaded first");
    const result = (await client.callTool({
      name: "get_document",
      arguments: { id: state.documentId },
    })) as ToolResult;
    assertOk(result, "get_document");
    const doc = parseToolText(result) as {
      id: number;
      title: string;
      mime_type: string;
    };
    assert.strictEqual(doc.id, state.documentId);
    assert.strictEqual(doc.title, RUN_DOCUMENT_TITLE);
    assert.ok(typeof doc.mime_type === "string");
  });

  it("search_documents finds the uploaded document (with retry for Whoosh)", async () => {
    assert.ok(state.documentId, "document must be uploaded first");
    let data: { count: number; results: { id: number }[] } | undefined;
    let lastError = "";
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = (await client.callTool({
        name: "search_documents",
        arguments: { query: RUN_DOCUMENT_TITLE },
      })) as ToolResult;
      if (result.isError) {
        lastError = errorText(result);
      } else {
        data = parseToolText(result) as {
          count: number;
          results: { id: number }[];
        };
        if (data.results.some((d) => d.id === state.documentId)) break;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    assert.ok(data, `search_documents never returned a valid payload: ${lastError}`);
    assert.ok(
      data.results.some((d) => d.id === state.documentId),
      `uploaded document id=${state.documentId} not found in search results after retries`
    );
  });

  it("download_document returns a paperless:// resource with non-empty base64 blob", async () => {
    // Regression for #87 (resource URI scheme).
    assert.ok(state.documentId, "document must be uploaded first");
    const result = (await client.callTool({
      name: "download_document",
      arguments: { id: state.documentId, original: true },
    })) as ToolResult;
    assertOk(result, "download_document");
    const resource = result.content.find((c) => c.type === "resource");
    assert.ok(
      resource,
      `should return a resource content item: ${errorText(result)}`
    );
    const r = resource.resource as { uri: string; blob?: string; mimeType?: string };
    assert.ok(
      r.uri?.startsWith("paperless://documents/"),
      `resource URI should use paperless:// scheme, got ${r.uri}`
    );
    assert.ok(r.blob && r.blob.length > 0, "resource blob should be non-empty");
  });

  it("get_document_thumbnail returns a paperless:// resource with image mime type", async () => {
    assert.ok(state.documentId, "document must be uploaded first");
    const result = (await client.callTool({
      name: "get_document_thumbnail",
      arguments: { id: state.documentId },
    })) as ToolResult;
    assertOk(result, "get_document_thumbnail");
    const resource = result.content.find((c) => c.type === "resource");
    assert.ok(
      resource,
      `should return a resource content item: ${errorText(result)}`
    );
    const r = resource.resource as { mimeType?: string; uri?: string };
    assert.ok(
      r.uri?.startsWith("paperless://documents/"),
      `thumbnail URI should use paperless:// scheme, got ${r.uri}`
    );
    assert.ok(
      r.mimeType?.startsWith("image/"),
      `thumbnail MIME type should be image/*, got ${r.mimeType}`
    );
  });

  it("bulk_edit_documents add_tags assigns the tag and get_document reflects it", async () => {
    // Regression for #100 / #89 (bulk-edit tag wiring).
    assert.ok(state.documentId && state.tagId, "document and tag must exist");
    const addResult = (await client.callTool({
      name: "bulk_edit_documents",
      arguments: {
        documents: [state.documentId],
        method: "modify_tags",
        add_tags: [state.tagId],
        remove_tags: [],
      },
    })) as ToolResult;
    assertOk(addResult, "bulk_edit_documents add_tags");

    const docAfterAdd = (await client.callTool({
      name: "get_document",
      arguments: { id: state.documentId },
    })) as ToolResult;
    assertOk(docAfterAdd, "get_document after add_tags");
    type TagItem = number | { id: number; name?: string };
    const docData = parseToolText(docAfterAdd) as { tags: TagItem[] };
    const tagIds = (docData.tags ?? []).map((t) =>
      typeof t === "number" ? t : t.id
    );
    assert.ok(
      tagIds.includes(state.tagId),
      `tag ${state.tagId} should be on document after add_tags, got tags=${JSON.stringify(tagIds)}`
    );
  });

  it("bulk_edit_documents remove_tags removes the tag and get_document reflects it", async () => {
    assert.ok(state.documentId && state.tagId, "document and tag must exist");
    const removeResult = (await client.callTool({
      name: "bulk_edit_documents",
      arguments: {
        documents: [state.documentId],
        method: "modify_tags",
        add_tags: [],
        remove_tags: [state.tagId],
      },
    })) as ToolResult;
    assertOk(removeResult, "bulk_edit_documents remove_tags");

    const docAfterRemove = (await client.callTool({
      name: "get_document",
      arguments: { id: state.documentId },
    })) as ToolResult;
    assertOk(docAfterRemove, "get_document after remove_tags");
    type TagItem = number | { id: number; name?: string };
    const removedData = parseToolText(docAfterRemove) as { tags: TagItem[] };
    const removedTagIds = (removedData.tags ?? []).map((t) =>
      typeof t === "number" ? t : t.id
    );
    assert.ok(
      !removedTagIds.includes(state.tagId),
      `tag ${state.tagId} should be removed, got tags=${JSON.stringify(removedTagIds)}`
    );
  });

  it("bulk_edit_documents set_storage_path assigns the storage path and get_document reflects it", async () => {
    assert.ok(
      state.documentId && state.storagePathId,
      "document and storage path must exist"
    );
    const setResult = (await client.callTool({
      name: "bulk_edit_documents",
      arguments: {
        documents: [state.documentId],
        method: "set_storage_path",
        storage_path: state.storagePathId,
      },
    })) as ToolResult;
    assertOk(setResult, "bulk_edit_documents set_storage_path");

    const docAfterSet = (await client.callTool({
      name: "get_document",
      arguments: { id: state.documentId },
    })) as ToolResult;
    assertOk(docAfterSet, "get_document after set_storage_path");
    const setData = parseToolText(docAfterSet) as {
      storage_path: number | { id: number } | null;
    };
    const assignedId =
      typeof setData.storage_path === "number"
        ? setData.storage_path
        : setData.storage_path?.id;
    assert.strictEqual(
      assignedId,
      state.storagePathId,
      `document storage_path should be ${state.storagePathId}, got ${JSON.stringify(
        setData.storage_path
      )}`
    );
  });

  it("delete_storage_path requires confirm=true and then removes the storage path", async () => {
    assert.ok(state.storagePathId, "storage path must be created first");

    // Unconfirmed delete must surface an isError result.
    const unconfirmed = (await client.callTool({
      name: "delete_storage_path",
      arguments: { id: state.storagePathId, confirm: false },
    })) as ToolResult;
    assert.ok(
      unconfirmed.isError,
      "delete_storage_path without confirm=true should return isError"
    );

    // Confirmed delete succeeds.
    const deleted = (await client.callTool({
      name: "delete_storage_path",
      arguments: { id: state.storagePathId, confirm: true },
    })) as ToolResult;
    assertOk(deleted, "delete_storage_path");
    const payload = parseToolText(deleted) as { status: string };
    assert.strictEqual(payload.status, "deleted");

    // Subsequent get_storage_path must fail (404).
    const gone = (await client.callTool({
      name: "get_storage_path",
      arguments: { id: state.storagePathId },
    })) as ToolResult;
    assert.ok(
      gone.isError,
      `get_storage_path for deleted id should be isError, got ${errorText(
        gone
      )}`
    );
  });
});
