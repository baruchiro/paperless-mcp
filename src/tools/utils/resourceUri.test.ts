import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDocumentResourceUri,
  buildThumbnailResourceUri,
} from "./resourceUri";

test("buildDocumentResourceUri uses the paperless:// scheme", () => {
  const uri = buildDocumentResourceUri(1, "doc.pdf");
  assert.match(uri, /^paperless:\/\/document\//);
});

test("buildDocumentResourceUri encodes filenames with spaces", () => {
  const uri = buildDocumentResourceUri(1, "invoice 2026.pdf");
  assert.equal(uri, "paperless://document/1/invoice%202026.pdf");
});

test("buildDocumentResourceUri encodes RFC-3986 reserved characters", () => {
  const uri = buildDocumentResourceUri(42, "weird ?#&=+name.pdf");
  // encodeURIComponent encodes ?, #, &, =, +, and spaces — none of these
  // should leak through and be mis-parsed as URI structure.
  assert.doesNotMatch(uri, /[?#]/);
  assert.match(uri, /^paperless:\/\/document\/42\//);
});

test("buildDocumentResourceUri encodes path separators inside filename", () => {
  // If Paperless ever returned a filename containing a slash, it must
  // not become an extra path segment.
  const uri = buildDocumentResourceUri(7, "sub/dir/file.pdf");
  assert.equal(uri, "paperless://document/7/sub%2Fdir%2Ffile.pdf");
});

test("buildDocumentResourceUri preserves unicode filenames", () => {
  const uri = buildDocumentResourceUri(1, "Rechnüng — März.pdf");
  // Roundtrip via decodeURIComponent should recover the original name.
  const path = uri.replace("paperless://document/1/", "");
  assert.equal(decodeURIComponent(path), "Rechnüng — März.pdf");
});

test("buildDocumentResourceUri produces a valid URL", () => {
  // Sanity: the constructed URI must parse via WHATWG URL.
  const uri = buildDocumentResourceUri(1, "Some File.pdf");
  assert.doesNotThrow(() => new URL(uri));
});

test("buildThumbnailResourceUri uses the paperless:// scheme with id and .webp", () => {
  assert.equal(buildThumbnailResourceUri(1), "paperless://thumbnail/1.webp");
  assert.equal(buildThumbnailResourceUri(123), "paperless://thumbnail/123.webp");
});

test("buildThumbnailResourceUri produces a valid URL", () => {
  assert.doesNotThrow(() => new URL(buildThumbnailResourceUri(99)));
});
