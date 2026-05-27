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

test("buildDocumentResourceUri is canonical without filenames", () => {
  const uri = buildDocumentResourceUri(1, "invoice 2026.pdf");
  assert.equal(uri, "paperless://documents/1/download");
});

test("buildDocumentResourceUri ignores reserved chars in legacy filename input", () => {
  const uri = buildDocumentResourceUri(42, "weird ?#&=+name.pdf");
  const url = new URL(uri);
  assert.equal(url.pathname, "/42/download");
  assert.equal(url.search, "");
});

test("buildDocumentResourceUri ignores path separators in legacy filename input", () => {
  // A filename containing a slash must not become an extra path segment.
  const uri = buildDocumentResourceUri(7, "sub/dir/file.pdf");
  const url = new URL(uri);
  assert.equal(url.pathname, "/7/download");
  assert.equal(url.search, "");
});

test("buildDocumentResourceUri keeps unicode filenames out of the URI", () => {
  const original = "Rechnüng — März.pdf";
  const uri = buildDocumentResourceUri(1, original);
  const url = new URL(uri);
  assert.equal(url.pathname, "/1/download");
  assert.equal(url.search, "");
});

test("buildDocumentResourceUri preserves original download intent", () => {
  assert.equal(
    buildDocumentResourceUri(1, { original: true }),
    "paperless://documents/1/download?original=true"
  );
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
