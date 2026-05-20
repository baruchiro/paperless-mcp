import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, ChildProcess } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  connectMcpClient,
  parseToolText,
  ToolResult,
} from "./client";
import { PaperlessClient, MINIMAL_PDF } from "./paperless";

const PAPERLESS_URL = process.env.PAPERLESS_URL ?? "http://localhost:8000";
const PAPERLESS_TOKEN = process.env.PAPERLESS_TOKEN ?? "";
const MCP_PORT = process.env.MCP_PORT ?? "3001";
const MCP_URL = process.env.MCP_URL ?? `http://localhost:${MCP_PORT}/mcp`;

let mcpProcess: ChildProcess | undefined;
let client: Client;
let paperless: PaperlessClient;

let seedTag: { id: number; name: string };
let seedCorrespondent: { id: number; name: string };
let seedDocumentType: { id: number; name: string };
let seedDocumentId: number;

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

function startMcpServer(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
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
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code !== null && code !== 0) {
        reject(new Error(`MCP process exited with code ${code}`));
      }
    });
    resolve(proc);
  });
}

before(async () => {
  assert.ok(PAPERLESS_TOKEN, "PAPERLESS_TOKEN env var is required");

  paperless = new PaperlessClient(PAPERLESS_URL, PAPERLESS_TOKEN);

  console.log("Seeding test data in Paperless...");
  seedTag = await paperless.createTag("e2e-test-tag");
  console.log(`  created tag id=${seedTag.id}`);
  seedCorrespondent = await paperless.createCorrespondent("E2E Test Corp");
  console.log(`  created correspondent id=${seedCorrespondent.id}`);
  seedDocumentType = await paperless.createDocumentType("E2E Invoice");
  console.log(`  created document type id=${seedDocumentType.id}`);

  console.log("Uploading seed document...");
  const taskId = await paperless.uploadDocument(
    MINIMAL_PDF,
    "e2e-fixture.pdf",
    "E2E Fixture Document"
  );
  console.log(`  upload task id: ${taskId}`);
  if (/^\d+$/.test(taskId)) {
    seedDocumentId = Number(taskId);
    console.log(`  document id (direct): ${seedDocumentId}`);
  } else {
    seedDocumentId = await paperless.waitForDocument(taskId, 90000);
    console.log(`  document id (from task): ${seedDocumentId}`);
  }

  console.log("Waiting for document to appear in search index...");
  await paperless.waitUntilSearchable(seedDocumentId, "E2E Fixture", 60000);
  console.log("  document is searchable");

  // Start MCP server if not already running externally
  if (!process.env.MCP_URL) {
    mcpProcess = await startMcpServer();
    await waitForMcp(MCP_URL);
  }

  client = await connectMcpClient(MCP_URL, PAPERLESS_TOKEN);
  console.log("MCP client connected, running tests...");
});

after(async () => {
  await client?.close?.();
  mcpProcess?.kill("SIGTERM");
});

describe("list_tags", () => {
  it("returns results array containing seeded tag", async () => {
    const result = (await client.callTool({
      name: "list_tags",
      arguments: {},
    })) as ToolResult;
    const data = parseToolText(result) as { results: { id: number; name: string }[] };
    assert.ok(Array.isArray(data.results), "results should be an array");
    const found = data.results.find((t) => t.id === seedTag.id);
    assert.ok(found, `seeded tag id=${seedTag.id} not found in list_tags`);
    assert.strictEqual(found.name, seedTag.name);
  });
});

describe("create_tag", () => {
  it("creates a tag and returns it with an id", async () => {
    const name = `e2e-created-${Date.now()}`;
    const result = (await client.callTool({
      name: "create_tag",
      arguments: { name },
    })) as ToolResult;
    const tag = parseToolText(result) as { id: number; name: string };
    assert.ok(typeof tag.id === "number", "id should be a number");
    assert.strictEqual(tag.name, name);
  });
});

describe("list_correspondents", () => {
  it("returns results array containing seeded correspondent", async () => {
    const result = (await client.callTool({
      name: "list_correspondents",
      arguments: {},
    })) as ToolResult;
    const data = parseToolText(result) as {
      results: { id: number; name: string }[];
    };
    assert.ok(Array.isArray(data.results));
    const found = data.results.find((c) => c.id === seedCorrespondent.id);
    assert.ok(found, `seeded correspondent not found`);
    assert.strictEqual(found.name, seedCorrespondent.name);
  });
});

describe("create_correspondent", () => {
  it("creates a correspondent and returns it with an id", async () => {
    const name = `E2E Corp ${Date.now()}`;
    const result = (await client.callTool({
      name: "create_correspondent",
      arguments: { name },
    })) as ToolResult;
    const correspondent = parseToolText(result) as { id: number; name: string };
    assert.ok(typeof correspondent.id === "number");
    assert.strictEqual(correspondent.name, name);
  });
});

describe("list_document_types", () => {
  it("returns results array containing seeded document type", async () => {
    const result = (await client.callTool({
      name: "list_document_types",
      arguments: {},
    })) as ToolResult;
    const data = parseToolText(result) as {
      results: { id: number; name: string }[];
    };
    assert.ok(Array.isArray(data.results));
    const found = data.results.find((dt) => dt.id === seedDocumentType.id);
    assert.ok(found, `seeded document type not found`);
    assert.strictEqual(found.name, seedDocumentType.name);
  });
});

describe("create_document_type", () => {
  it("creates a document type and returns it with an id", async () => {
    const name = `E2E Type ${Date.now()}`;
    const result = (await client.callTool({
      name: "create_document_type",
      arguments: { name },
    })) as ToolResult;
    const docType = parseToolText(result) as { id: number; name: string };
    assert.ok(typeof docType.id === "number");
    assert.strictEqual(docType.name, name);
  });
});

describe("list_documents", () => {
  it("returns pagination shape with count and results", async () => {
    const result = (await client.callTool({
      name: "list_documents",
      arguments: {},
    })) as ToolResult;
    const data = parseToolText(result) as {
      count: number;
      results: unknown[];
      next: unknown;
      previous: unknown;
    };
    assert.ok(typeof data.count === "number", "count should be a number");
    assert.ok(Array.isArray(data.results), "results should be an array");
    assert.ok(data.count >= 1, "at least one document expected");
  });
});

describe("get_document", () => {
  it("returns the seeded document by id", async () => {
    const result = (await client.callTool({
      name: "get_document",
      arguments: { id: seedDocumentId },
    })) as ToolResult;
    const doc = parseToolText(result) as {
      id: number;
      title: string;
      mime_type: string;
    };
    assert.strictEqual(doc.id, seedDocumentId);
    assert.ok(typeof doc.title === "string");
    assert.ok(typeof doc.mime_type === "string");
  });
});

describe("search_documents", () => {
  it("finds the seeded document with a matching query", async () => {
    const result = (await client.callTool({
      name: "search_documents",
      arguments: { query: "E2E Fixture" },
    })) as ToolResult;
    const data = parseToolText(result) as {
      count: number;
      results: { id: number }[];
    };
    assert.ok(Array.isArray(data.results));
    assert.ok(
      data.results.some((d) => d.id === seedDocumentId),
      `seeded document id=${seedDocumentId} not found in search results`
    );
  });
});

describe("download_document", () => {
  it("returns a resource with a URI and non-empty base64 blob", async () => {
    const result = (await client.callTool({
      name: "download_document",
      arguments: { id: seedDocumentId, original: true },
    })) as ToolResult;
    assert.ok(result.content.length > 0, "content should not be empty");
    const resource = result.content.find((c) => c.type === "resource");
    assert.ok(resource, "should return a resource content item");
    const r = resource.resource as { uri: string; blob?: string; mimeType?: string };
    assert.ok(r.uri?.startsWith("paperless://documents/"), "resource URI should use paperless:// scheme");
    assert.ok(r.blob && r.blob.length > 0, "resource blob should be non-empty");
  });
});

describe("get_document_thumbnail", () => {
  it("returns a resource with image mime type", async () => {
    const result = (await client.callTool({
      name: "get_document_thumbnail",
      arguments: { id: seedDocumentId },
    })) as ToolResult;
    assert.ok(result.content.length > 0);
    const resource = result.content.find((c) => c.type === "resource");
    assert.ok(resource, "should return a resource content item");
    const r = resource.resource as { mimeType?: string; uri?: string };
    assert.ok(
      r.uri?.startsWith("paperless://documents/"),
      "thumbnail URI should use paperless:// scheme"
    );
    assert.ok(
      r.mimeType?.startsWith("image/"),
      "thumbnail MIME type should be image/*"
    );
  });
});

describe("bulk_edit_documents", () => {
  it("adds and removes a tag via modify_tags", async () => {
    // Assign the seeded tag
    const addResult = (await client.callTool({
      name: "bulk_edit_documents",
      arguments: {
        documents: [seedDocumentId],
        method: "modify_tags",
        add_tags: [seedTag.id],
        remove_tags: [],
      },
    })) as ToolResult;
    assert.ok(!addResult.isError, "bulk_edit add_tags should not error");

    // Verify tag was added
    const docAfterAdd = (await client.callTool({
      name: "get_document",
      arguments: { id: seedDocumentId },
    })) as ToolResult;
    type TagItem = { id: number; name: string };
    const docData = parseToolText(docAfterAdd) as { tags: TagItem[] };
    const tagIds = docData.tags?.map((t) => t.id);
    assert.ok(
      tagIds?.includes(seedTag.id),
      `tag ${seedTag.id} should be on document after modify_tags add`
    );

    // Remove the tag
    await client.callTool({
      name: "bulk_edit_documents",
      arguments: {
        documents: [seedDocumentId],
        method: "modify_tags",
        add_tags: [],
        remove_tags: [seedTag.id],
      },
    });

    // Verify tag was removed
    const docAfterRemove = (await client.callTool({
      name: "get_document",
      arguments: { id: seedDocumentId },
    })) as ToolResult;
    const removedData = parseToolText(docAfterRemove) as { tags: TagItem[] };
    const removedTagIds = (removedData.tags ?? []).map((t) => t.id);
    assert.ok(
      !removedTagIds.includes(seedTag.id),
      `tag ${seedTag.id} should be removed after modify_tags remove`
    );
  });
});

describe("post_document", () => {
  it("uploads a document and returns an id or task status", async () => {
    const base64Pdf = MINIMAL_PDF.toString("base64");
    const result = (await client.callTool({
      name: "post_document",
      arguments: {
        file: base64Pdf,
        filename: "e2e-upload.pdf",
        title: "E2E Upload Test",
      },
    })) as ToolResult;
    assert.ok(!result.isError, "post_document should not error");
    const data = parseToolText(result) as { id?: number; status?: string };
    assert.ok(
      typeof data.id === "number" || typeof data.status === "string",
      "response should have id or status"
    );
  });
});
