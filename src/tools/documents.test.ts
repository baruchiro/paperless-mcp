import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeBase64File } from "./documents";

test("decodeBase64File decodes plain base64", () => {
  const encoded = Buffer.from("paperless").toString("base64");
  assert.equal(decodeBase64File(encoded).toString(), "paperless");
});

test("decodeBase64File supports data URLs and whitespace", () => {
  const encoded = Buffer.from("n8n").toString("base64");
  const value = `data:application/pdf;base64,\n${encoded}\n`;
  assert.equal(decodeBase64File(value).toString(), "n8n");
});

test("decodeBase64File supports URL-safe base64", () => {
  const encoded = Buffer.from("telegram image").toString("base64");
  const urlSafe = encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  assert.equal(decodeBase64File(urlSafe).toString(), "telegram image");
});

test("decodeBase64File rejects invalid base64", () => {
  assert.throws(
    () => decodeBase64File("not-a-valid-base64!"),
    /Invalid base64-encoded file data/
  );
});
