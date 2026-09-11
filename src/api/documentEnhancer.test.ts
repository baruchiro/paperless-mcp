import assert from "node:assert/strict";
import { test } from "node:test";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { convertDocsWithNames } from "./documentEnhancer";
import { DocumentsResponse } from "./types";
import { createDocument, createPaperlessApiMock } from "../test/mocks/paperlessApi";

const LARGE_DOCUMENT_COUNT = 709;
const MAX_RESPONSE_SIZE_BYTES = 2000;

function getTextContent(result: CallToolResult): string {
  const item = result.content?.[0];
  if (!item || item.type !== "text") {
    throw new Error("Expected text content");
  }
  return item.text;
}

interface EnhancedResults {
  results: Array<{
    correspondent: { id: number; name: string } | null;
    tags: Array<{ id: number; name: string }>;
  }>;
}

function parseEnhancedResults(result: CallToolResult): EnhancedResults {
  return JSON.parse(getTextContent(result)) as EnhancedResults;
}

test("convertDocsWithNames omits `all` and keeps paginated JSON shape", async () => {
  const docsResponse: DocumentsResponse = {
    count: 2,
    next: null,
    previous: null,
    all: [1, 2],
    results: [createDocument(), createDocument({ id: 2, title: "Document 2" })],
  };

  const result = await convertDocsWithNames(docsResponse, createPaperlessApiMock());
  const parsed = JSON.parse(getTextContent(result));

  assert.ok(!("all" in parsed));
  assert.deepEqual(parsed.results.map((doc: { id: number }) => doc.id), [1, 2]);
  assert.ok(!("content" in parsed.results[0]));
});

test("convertDocsWithNames keeps responses small when source has large `all` arrays", async () => {
  const docsResponse: DocumentsResponse = {
    count: LARGE_DOCUMENT_COUNT,
    next: "http://localhost:8000/api/documents/?page=2",
    previous: null,
    all: Array.from({ length: LARGE_DOCUMENT_COUNT }, (_, index) => index + 1),
    results: [
      createDocument({
        id: 123,
        title: "Large all payload case",
        content: "x".repeat(2700),
      }),
    ],
  };

  const result = await convertDocsWithNames(docsResponse, createPaperlessApiMock());
  const responseText = getTextContent(result);

  assert.ok(responseText.length < MAX_RESPONSE_SIZE_BYTES);
  const parsed = JSON.parse(responseText);
  assert.ok(!("all" in parsed));
  assert.ok(!("content" in parsed.results[0]));
});

test("convertDocsWithNames returns paginated JSON for empty multi-document results", async () => {
  const docsResponse: DocumentsResponse = {
    count: 0,
    next: null,
    previous: null,
    all: [],
    results: [],
  };

  const result = await convertDocsWithNames(docsResponse, createPaperlessApiMock());
  const parsed = JSON.parse(getTextContent(result));

  assert.deepEqual(parsed, {
    count: 0,
    next: null,
    previous: null,
    results: [],
  });
});

test("convertDocsWithNames resolves correspondent and tag names that fall beyond the first API page", async () => {
  const correspondents = Array.from({ length: 40 }, (_, index) => ({
    id: index + 1,
    name: `First page correspondent ${index}`,
  }));
  // Deliberately outside the default 25-row first page, mirroring the live
  // instance where correspondent 246 ("Brown") came back named "246".
  correspondents.push({ id: 246, name: "Brown" });

  const tags = Array.from({ length: 30 }, (_, index) => ({
    id: index + 1,
    name: `first-page-tag-${index}`,
  }));
  tags.push({ id: 49, name: "paperless-gpt-failed" });

  const api = createPaperlessApiMock({ correspondents, tags });
  const docsResponse: DocumentsResponse = {
    count: 1,
    next: null,
    previous: null,
    all: [1],
    results: [createDocument({ id: 1, correspondent: 246, tags: [49] })],
  };

  const result = await convertDocsWithNames(docsResponse, api);
  const parsed = parseEnhancedResults(result);

  assert.equal(parsed.results[0].correspondent?.name, "Brown");
  assert.equal(parsed.results[0].tags[0].name, "paperless-gpt-failed");
});

test("convertDocsWithNames fetches every lookup row in a single widened request", async () => {
  const correspondents = Array.from({ length: 60 }, (_, index) => ({
    id: index + 1,
    name: `Correspondent ${index}`,
  }));
  const api = createPaperlessApiMock({ correspondents });
  const docsResponse: DocumentsResponse = {
    count: 1,
    next: null,
    previous: null,
    all: [1],
    results: [createDocument({ id: 1, correspondent: 55 })],
  };

  const result = await convertDocsWithNames(docsResponse, api);
  const parsed = parseEnhancedResults(result);

  // id 55 is past the default 25-row page; one page_size=max request covers it.
  assert.equal(parsed.results[0].correspondent?.name, "Correspondent 54");
  assert.deepEqual(api.__requests.correspondents, ["page_size=100000"]);
});

test("convertDocsWithNames walks further pages when the row count exceeds the server page_size ceiling", async () => {
  const correspondents = Array.from({ length: 30 }, (_, index) => ({
    id: index + 1,
    name: `Correspondent ${index}`,
  }));
  // maxPageSize forces the fake server to cap page_size below `count`, so the
  // first widened request cannot return every row.
  const api = createPaperlessApiMock({ correspondents, maxPageSize: 10 });
  const docsResponse: DocumentsResponse = {
    count: 1,
    next: null,
    previous: null,
    all: [1],
    results: [createDocument({ id: 1, correspondent: 28 })],
  };

  const result = await convertDocsWithNames(docsResponse, api);
  const parsed = parseEnhancedResults(result);

  // id 28 sits on the final page; without the page walk it resolves to "28".
  assert.equal(parsed.results[0].correspondent?.name, "Correspondent 27");
  assert.deepEqual(api.__requests.correspondents, [
    "page_size=100000",
    "page=2&page_size=100000",
    "page=3&page_size=100000",
  ]);
});
