import assert from "node:assert/strict";
import { test } from "node:test";
import { Pool } from "pg";
import { testPool } from "./testDb";
import { SearchStore, IndexedDocument, StoredChunk } from "./store";

const DIMENSIONS = 1024;

function basisVector(index: number): number[] {
  const vector = new Array(DIMENSIONS).fill(0);
  vector[index] = 1;
  return vector;
}

function document(id: number, metadataAt: string): IndexedDocument {
  return {
    id,
    modified: "2024-01-01T00:00:00.000Z",
    title: `Documento ${id}`,
    truncated: false,
    metadataAt,
  };
}

async function newStore(): Promise<{ pool: Pool; store: SearchStore }> {
  const pool = await testPool();
  const store = new SearchStore(pool);
  await store.migrate();
  return { pool, store };
}

test("migrate runs twice without error", async () => {
  const { pool, store } = await newStore();
  try {
    await store.migrate();
  } finally {
    await pool.end();
  }
});

test("replaceDocument indexes two documents for vector and text search", async () => {
  const { pool, store } = await newStore();
  try {
    const doc1Chunks: StoredChunk[] = [
      { kind: "metadata", text: "Documento 1", embedding: basisVector(0) },
      {
        kind: "content",
        text: "Tengo un préstamo hipotecario con el banco.",
        embedding: basisVector(0),
      },
    ];
    const doc2Chunks: StoredChunk[] = [
      { kind: "metadata", text: "Documento 2", embedding: basisVector(1) },
      {
        kind: "content",
        text: "Factura de electricidad del mes.",
        embedding: basisVector(1),
      },
    ];
    await store.replaceDocument(
      document(1, "2024-01-01T00:00:00.000Z"),
      doc1Chunks
    );
    await store.replaceDocument(
      document(2, "2024-01-01T00:00:00.000Z"),
      doc2Chunks
    );

    const vectorHits = await store.vectorHits(basisVector(0), 5);
    assert.equal(vectorHits[0].documentId, 1);
    assert.ok(
      vectorHits[0].score > 0.99,
      `expected score near 1, got ${vectorHits[0].score}`
    );

    const hipotecario = await store.textHits("hipotecario", 5);
    assert.ok(
      hipotecario.some((hit) => hit.text.includes("préstamo hipotecario"))
    );

    const prestamo = await store.textHits("prestamo", 5);
    assert.ok(
      prestamo.some((hit) => hit.text.includes("préstamo hipotecario")),
      "unaccent should match 'prestamo' against 'préstamo'"
    );

    const indexed = await store.indexed();
    assert.deepEqual(indexed.get(1), {
      modified: "2024-01-01T00:00:00.000Z",
      metadataAt: "2024-01-01T00:00:00.000Z",
    });
    assert.ok(indexed.has(2));
  } finally {
    await pool.end();
  }
});

test("textHits with only operator characters gives an empty list, no error", async () => {
  const { pool, store } = await newStore();
  try {
    await store.replaceDocument(document(1, "2024-01-01T00:00:00.000Z"), [
      { kind: "content", text: "algo de texto", embedding: basisVector(0) },
    ]);
    const hits = await store.textHits("\"&|!:*'", 5);
    assert.deepEqual(hits, []);
  } finally {
    await pool.end();
  }
});

test("deleteDocuments removes the document's chunks by cascade", async () => {
  const { pool, store } = await newStore();
  try {
    await store.replaceDocument(document(1, "2024-01-01T00:00:00.000Z"), [
      { kind: "content", text: "uno", embedding: basisVector(0) },
    ]);
    await store.deleteDocuments([1]);
    const result = await pool.query(
      "SELECT 1 FROM chunks WHERE document_id = $1",
      [1]
    );
    assert.equal(result.rows.length, 0);
  } finally {
    await pool.end();
  }
});

test("replaceDocument again leaves only the new chunks", async () => {
  const { pool, store } = await newStore();
  try {
    await store.replaceDocument(document(2, "2024-01-01T00:00:00.000Z"), [
      { kind: "content", text: "primero", embedding: basisVector(0) },
      { kind: "content", text: "segundo", embedding: basisVector(0) },
    ]);
    await store.replaceDocument(document(2, "2024-01-02T00:00:00.000Z"), [
      { kind: "content", text: "unico", embedding: basisVector(1) },
    ]);
    const result = await pool.query(
      "SELECT text FROM chunks WHERE document_id = $1 ORDER BY position",
      [2]
    );
    assert.deepEqual(result.rows, [{ text: "unico" }]);
  } finally {
    await pool.end();
  }
});

test("replaceMetadata replaces the position-0 chunk and the document's metadata_at", async () => {
  const { pool, store } = await newStore();
  try {
    await store.replaceDocument(document(3, "2024-01-01T00:00:00.000Z"), [
      { kind: "metadata", text: "vieja metadata", embedding: basisVector(0) },
      {
        kind: "content",
        text: "contenido sin cambios",
        embedding: basisVector(0),
      },
    ]);

    await store.replaceMetadata(
      3,
      { kind: "metadata", text: "metadata nueva", embedding: basisVector(2) },
      "2024-02-02T00:00:00.000Z"
    );

    const chunks = await pool.query(
      "SELECT position, text FROM chunks WHERE document_id = $1 ORDER BY position",
      [3]
    );
    assert.deepEqual(chunks.rows, [
      { position: 0, text: "metadata nueva" },
      { position: 1, text: "contenido sin cambios" },
    ]);

    const indexed = await store.indexed();
    assert.equal(indexed.get(3)?.metadataAt, "2024-02-02T00:00:00.000Z");
  } finally {
    await pool.end();
  }
});
