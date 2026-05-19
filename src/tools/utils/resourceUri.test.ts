import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDocumentResourceUri,
  buildThumbnailResourceUri,
} from "./resourceUri";

test("buildDocumentResourceUri mirrors the REST download path", () => {
  const uri = buildDocumentResourceUri(1, "doc.pdf");
  assert.match(uri, /^paperless:\/\/documents\/1\/download(\?|$)/);
});

test("buildDocumentResourceUri puts the filename in a query parameter", () => {
  const uri = buildDocumentResourceUri(1, "invoice 2026.pdf");
  assert.equal(
    uri,
    "paperless://documents/1/download?filename=invoice%202026.pdf"
  );
});

test("buildDocumentResourceUri encodes RFC-3986 reserved chars in the filename", () => {
  const uri = buildDocumentResourceUri(42, "weird ?#&=+name.pdf");
  const url = new URL(uri);
  // The path stays canonical — only the literal `?` that separates
  // path from query is allowed; nothing from the filename should
  // bleed into the path or break query parsing.
  assert.equal(url.pathname, "/42/download");
  assert.equal(url.searchParams.get("filename"), "weird ?#&=+name.pdf");
});

test("buildDocumentResourceUri encodes path separators inside filename", () => {
  // A filename containing a slash must not become an extra path segment.
  const uri = buildDocumentResourceUri(7, "sub/dir/file.pdf");
  const url = new URL(uri);
  assert.equal(url.pathname, "/7/download");
  assert.equal(url.searchParams.get("filename"), "sub/dir/file.pdf");
});

test("buildDocumentResourceUri preserves unicode filenames", () => {
  const original = "Rechnüng — März.pdf";
  const uri = buildDocumentResourceUri(1, original);
  // Roundtrip via URL parsing should recover the original name.
  const url = new URL(uri);
  assert.equal(url.searchParams.get("filename"), original);
});

test("buildDocumentResourceUri produces a valid URL", () => {
  const uri = buildDocumentResourceUri(1, "Some File.pdf");
  assert.doesNotThrow(() => new URL(uri));
});

test("buildThumbnailResourceUri mirrors the REST thumb path", () => {
  assert.equal(buildThumbnailResourceUri(1), "paperless://documents/1/thumb");
  assert.equal(
    buildThumbnailResourceUri(123),
    "paperless://documents/123/thumb"
  );
});

test("buildThumbnailResourceUri produces a valid URL", () => {
  assert.doesNotThrow(() => new URL(buildThumbnailResourceUri(99)));
});
