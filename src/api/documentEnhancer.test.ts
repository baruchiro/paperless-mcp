import assert from "node:assert/strict";
import { test } from "node:test";
import { PaperlessAPI } from "./PaperlessAPI";
import { convertDocsWithNames } from "./documentEnhancer";
import { Document, DocumentsResponse } from "./types";

function createDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 1,
    correspondent: null,
    document_type: null,
    storage_path: null,
    title: "Document 1",
    content: "OCR content",
    tags: [],
    created: "2026-01-01T00:00:00.000Z",
    created_date: "2026-01-01",
    modified: "2026-01-01T00:00:00.000Z",
    added: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    archive_serial_number: null,
    original_file_name: "doc1.pdf",
    archived_file_name: "2026/doc1.pdf",
    owner: null,
    user_can_change: true,
    is_shared_by_requester: false,
    notes: [],
    custom_fields: [],
    page_count: 1,
    mime_type: "application/pdf",
    ...overrides,
  };
}

function createMockApi(): PaperlessAPI {
  return {
    getCorrespondents: async () => ({ results: [] }),
    getDocumentTypes: async () => ({ results: [] }),
    getTags: async () => ({ results: [] }),
    getCustomFields: async () => ({ results: [] }),
  } as unknown as PaperlessAPI;
}

test("convertDocsWithNames omits all and content for multi-document responses", async () => {
  const docsResponse: DocumentsResponse = {
    count: 2,
    next: null,
    previous: null,
    all: [1, 2],
    results: [createDocument(), createDocument({ id: 2, title: "Document 2" })],
  };

  const result = await convertDocsWithNames(docsResponse, createMockApi());
  const text = result.content?.[0];

  assert.ok(text && text.type === "text");
  const parsed = JSON.parse(text.text);

  assert.equal(parsed.count, 2);
  assert.equal(parsed.next, null);
  assert.equal(parsed.previous, null);
  assert.ok(!("all" in parsed));
  assert.equal(parsed.results.length, 2);
  assert.ok(!("content" in parsed.results[0]));
  assert.ok(!("content" in parsed.results[1]));
});
