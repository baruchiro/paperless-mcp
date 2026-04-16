import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { convertDocsWithNames } from "./documentEnhancer";
import { Document, DocumentsResponse } from "./types";
import { PaperlessAPI } from "./PaperlessAPI";

/** Minimal document stub with only the fields the enhancer reads. */
function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 1,
    correspondent: null,
    document_type: null,
    storage_path: null,
    title: "Test",
    content: null,
    tags: [],
    created: "",
    created_date: "",
    modified: "",
    added: "",
    deleted_at: null,
    archive_serial_number: null,
    original_file_name: "",
    archived_file_name: "",
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

/**
 * Build a mock PaperlessAPI where getCorrespondents/getTags/etc. return
 * only items with IDs 1..pageSize (simulating the default first page).
 */
function mockApiWithPageSize(pageSize: number): PaperlessAPI {
  const correspondents = Array.from({ length: pageSize }, (_, i) => ({
    id: i + 1,
    slug: `corr-${i + 1}`,
    name: `Correspondent ${i + 1}`,
    match: "",
    matching_algorithm: 0 as const,
    is_insensitive: false,
    document_count: 0,
    owner: null,
    user_can_change: true,
  }));

  const docTypes = Array.from({ length: pageSize }, (_, i) => ({
    id: i + 1,
    slug: `type-${i + 1}`,
    name: `DocType ${i + 1}`,
    match: "",
    matching_algorithm: 0 as const,
    is_insensitive: false,
    document_count: 0,
    owner: null,
    user_can_change: true,
  }));

  const tags = Array.from({ length: pageSize }, (_, i) => ({
    id: i + 1,
    slug: `tag-${i + 1}`,
    name: `Tag ${i + 1}`,
    color: "#000",
    text_color: "#fff",
    match: "",
    matching_algorithm: 0 as const,
    is_insensitive: false,
    is_inbox_tag: false,
    document_count: 0,
    owner: null,
    user_can_change: true,
  }));

  const customFields = Array.from({ length: pageSize }, (_, i) => ({
    id: i + 1,
    name: `Field ${i + 1}`,
    data_type: "string",
    extra_data: {},
    document_count: 0,
  }));

  const paginate = <T>(results: T[]) => ({
    count: results.length,
    next: null,
    previous: null,
    all: results.map((_, i) => i + 1),
    results,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler: ProxyHandler<any> = {
    get(_target, prop: string) {
      if (prop === "getCorrespondents") return async () => paginate(correspondents);
      if (prop === "getDocumentTypes") return async () => paginate(docTypes);
      if (prop === "getTags") return async () => paginate(tags);
      if (prop === "getCustomFields") return async () => paginate(customFields);
      return () => { throw new Error(`Unmocked: ${prop}`); };
    },
  };
  return new Proxy({} as PaperlessAPI, handler);
}

describe("documentEnhancer", () => {
  test("resolves names for IDs beyond the default page size", async () => {
    // Regression: the enhancer must pass page_size=10000 to fetch all entities,
    // not just the default first page. Without it, IDs beyond page 1 resolve
    // to their numeric string (e.g. "65" instead of "Correspondent 65").
    const api = mockApiWithPageSize(100);

    const doc = makeDocument({
      correspondent: 65,
      document_type: 40,
      tags: [3, 50],
      custom_fields: [{ field: 99, value: "test" }],
    });

    const result = await convertDocsWithNames(doc, api);
    const parsed = JSON.parse(
      result.content.find((c) => c.type === "text" && "text" in c)!.text!
    );

    assert.deepEqual(parsed.correspondent, { id: 65, name: "Correspondent 65" });
    assert.deepEqual(parsed.document_type, { id: 40, name: "DocType 40" });
    assert.deepEqual(parsed.tags[0], { id: 3, name: "Tag 3" });
    assert.deepEqual(parsed.tags[1], { id: 50, name: "Tag 50" });
    assert.deepEqual(parsed.custom_fields[0], { field: 99, name: "Field 99", value: "test" });
  });

  test("resolves all names when full data is available", async () => {
    // API returns IDs 1-100 (covers all referenced IDs)
    const api = mockApiWithPageSize(100);

    const doc = makeDocument({
      correspondent: 65,
      document_type: 40,
      tags: [3, 50],
      custom_fields: [{ field: 99, value: "test" }],
    });

    const result = await convertDocsWithNames(doc, api);
    const parsed = JSON.parse(
      result.content.find((c) => c.type === "text" && "text" in c)!.text!
    );

    assert.deepEqual(parsed.correspondent, { id: 65, name: "Correspondent 65" });
    assert.deepEqual(parsed.document_type, { id: 40, name: "DocType 40" });
    assert.deepEqual(parsed.tags[0], { id: 3, name: "Tag 3" });
    assert.deepEqual(parsed.tags[1], { id: 50, name: "Tag 50" });
    assert.deepEqual(parsed.custom_fields[0], { field: 99, name: "Field 99", value: "test" });
  });

  test("strips document content from results", async () => {
    const api = mockApiWithPageSize(10);
    const doc = makeDocument({ content: "This is secret content" });

    const result = await convertDocsWithNames(doc, api);
    const parsed = JSON.parse(
      result.content.find((c) => c.type === "text" && "text" in c)!.text!
    );

    assert.equal(parsed.content, undefined);
  });
});
