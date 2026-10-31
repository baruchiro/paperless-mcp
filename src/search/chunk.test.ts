import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkText, metadataText } from "./chunk";

test("chunkText of an empty string gives no chunks", () => {
  assert.deepEqual(chunkText(""), { chunks: [], truncated: false });
});

test("chunkText normalizes whitespace", () => {
  assert.deepEqual(chunkText("a  \n b"), { chunks: ["a b"], truncated: false });
});

test("chunkText cuts a long text into overlapping chunks", () => {
  const text = "x".repeat(4500);
  const result = chunkText(text);
  assert.equal(result.chunks.length, 3);
  assert.equal(result.truncated, false);
  assert.equal(
    result.chunks[1].slice(0, 200),
    result.chunks[0].slice(result.chunks[0].length - 200)
  );
});

test("chunkText does not emit a chunk that is already inside the previous one", () => {
  const text = "z".repeat(3700);
  const result = chunkText(text);
  assert.equal(result.chunks.length, 2);
  assert.equal(result.chunks[1].length, 1900);
  assert.equal(
    result.chunks[1],
    text.slice(text.length - result.chunks[1].length)
  );
});

test("chunkText stops at 1000 chunks and marks the result truncated", () => {
  const text = "y".repeat(1001 * 1800);
  const result = chunkText(text);
  assert.equal(result.chunks.length, 1000);
  assert.equal(result.truncated, true);
});

test("metadataText has the Spanish labels and leaves out ai- and via- tags", () => {
  const text = metadataText(
    { title: "Factura luz", created: "2026-01-15" },
    {
      correspondent: "Endesa",
      documentType: "Factura",
      tags: ["Contrato", "ai-processed", "via-mcp"],
    }
  );
  assert.match(text, /Título: Factura luz\./);
  assert.match(text, /Tipo: Factura\./);
  assert.match(text, /Remitente: Endesa\./);
  assert.match(text, /Etiquetas: Contrato\./);
  assert.match(text, /Fecha: 2026-01-15\./);
  assert.ok(!text.includes("ai-processed"));
  assert.ok(!text.includes("via-mcp"));
});

test("metadataText drops the label when the correspondent is missing", () => {
  const text = metadataText(
    { title: "Nota", created: "2026-02-01" },
    { documentType: "Nota", tags: [] }
  );
  assert.ok(!text.includes("Remitente"));
});
