import assert from "node:assert/strict";
import { test } from "node:test";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { convertDocsWithNames } from "./documentEnhancer";
import { DocumentsResponse } from "./types";
import { createDocument, createPaperlessApiMock } from "../test/mocks/paperlessApi";

function getTextContent(result: CallToolResult): string {
  const item = result.content?.[0];
  if (!item || item.type !== "text") {
    throw new Error("Expected text content");
  }
  return item.text;
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
    count: 709,
    next: "http://localhost:8000/api/documents/?page=2",
    previous: null,
    all: Array.from({ length: 709 }, (_, index) => index + 1),
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

  assert.ok(responseText.length < 2000);
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
