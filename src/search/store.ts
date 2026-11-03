import { Pool, PoolClient } from "pg";

export interface IndexedDocument {
  id: number;
  modified: string;
  title: string;
  truncated: boolean;
  metadataAt: string;
}

export interface StoredChunk {
  kind: "metadata" | "content";
  text: string;
  embedding: number[];
}

export interface Hit {
  documentId: number;
  position: number;
  text: string;
  score: number;
}

const VECTOR_DIMENSIONS = 1024;
// A document has at most 1001 rows: one metadata chunk and 1000 text chunks. Take more nearest chunks than that, so that one document cannot fill the list.
const CANDIDATE_CHUNKS = 1100;

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export class SearchStore {
  constructor(private readonly pool: Pool) {}

  // The extensions are in the schema public. Qualify their names, because the test search_path has one schema only and hides them.
  async migrate(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id integer PRIMARY KEY, modified timestamptz NOT NULL, title text NOT NULL,
        truncated boolean NOT NULL DEFAULT false, metadata_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS chunks (
        document_id integer NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        position integer NOT NULL, kind text NOT NULL CHECK (kind IN ('metadata', 'content')),
        text text NOT NULL, tsv tsvector NOT NULL, embedding public.vector(${VECTOR_DIMENSIONS}) NOT NULL,
        PRIMARY KEY (document_id, position));
      CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw ON chunks USING hnsw ((embedding::public.halfvec(${VECTOR_DIMENSIONS})) public.halfvec_cosine_ops);
      CREATE INDEX IF NOT EXISTS chunks_tsv_gin ON chunks USING gin (tsv);
    `);
  }

  async indexed(): Promise<
    Map<number, { modified: string; metadataAt: string }>
  > {
    const result = await this.pool.query(
      "SELECT id, modified, metadata_at FROM documents"
    );
    const map = new Map<number, { modified: string; metadataAt: string }>();
    for (const row of result.rows) {
      map.set(row.id, {
        modified: row.modified.toISOString(),
        metadataAt: row.metadata_at.toISOString(),
      });
    }
    return map;
  }

  async replaceDocument(
    doc: IndexedDocument,
    chunks: StoredChunk[]
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO documents (id, modified, title, truncated, metadata_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           modified = excluded.modified, title = excluded.title,
           truncated = excluded.truncated, metadata_at = excluded.metadata_at`,
        [doc.id, doc.modified, doc.title, doc.truncated, doc.metadataAt]
      );
      await client.query("DELETE FROM chunks WHERE document_id = $1", [doc.id]);
      for (let position = 0; position < chunks.length; position++) {
        await this.insertChunk(client, doc.id, position, chunks[position]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async replaceMetadata(
    documentId: number,
    chunk: StoredChunk,
    metadataAt: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM chunks WHERE document_id = $1 AND position = 0",
        [documentId]
      );
      await this.insertChunk(client, documentId, 0, chunk);
      await client.query(
        "UPDATE documents SET metadata_at = $2 WHERE id = $1",
        [documentId, metadataAt]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  private async insertChunk(
    client: PoolClient,
    documentId: number,
    position: number,
    chunk: StoredChunk
  ): Promise<void> {
    await client.query(
      `INSERT INTO chunks (document_id, position, kind, text, tsv, embedding)
       VALUES ($1, $2, $3, $4, to_tsvector('simple', public.unaccent($4)), $5::public.vector(${VECTOR_DIMENSIONS}))`,
      [
        documentId,
        position,
        chunk.kind,
        chunk.text,
        toVectorLiteral(chunk.embedding),
      ]
    );
  }

  async deleteDocuments(ids: number[]): Promise<void> {
    await this.pool.query("DELETE FROM documents WHERE id = ANY($1)", [ids]);
  }

  // Both searches give the best chunk of each document. Chunk lists let one
  // long document fill the list, and a document that matches only by meaning
  // would drop out.
  async vectorHits(embedding: number[], limit: number): Promise<Hit[]> {
    const distance = `embedding::public.halfvec(${VECTOR_DIMENSIONS}) OPERATOR(public.<=>) $1::public.halfvec(${VECTOR_DIMENSIONS})`;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // The index scan gives 40 rows by default. The iterative scan goes on until it has all the candidates.
      await client.query("SET LOCAL hnsw.iterative_scan = relaxed_order");
      const result = await client.query(
        `WITH nearest AS MATERIALIZED (
           SELECT document_id, position, text, ${distance} AS distance
           FROM chunks
           ORDER BY ${distance}
           LIMIT ${CANDIDATE_CHUNKS}
         ), best AS (
           SELECT DISTINCT ON (document_id) document_id, position, text, distance
           FROM nearest
           ORDER BY document_id, distance
         )
         SELECT document_id, position, text, 1 - distance AS score
         FROM best
         ORDER BY distance
         LIMIT $2`,
        [toVectorLiteral(embedding), limit]
      );
      await client.query("COMMIT");
      return result.rows.map(toHit);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async textHits(query: string, limit: number): Promise<Hit[]> {
    const result = await this.pool.query(
      `SELECT document_id, position, text, score FROM (
         SELECT DISTINCT ON (document_id) document_id, position, text,
                ts_rank_cd(tsv, websearch_to_tsquery('simple', public.unaccent($1))) AS score
         FROM chunks
         WHERE tsv @@ websearch_to_tsquery('simple', public.unaccent($1))
         ORDER BY document_id, score DESC
       ) AS best
       ORDER BY score DESC
       LIMIT $2`,
      [query, limit]
    );
    return result.rows.map(toHit);
  }
}

function toHit(row: {
  document_id: number;
  position: number;
  text: string;
  score: number;
}): Hit {
  return {
    documentId: row.document_id,
    position: row.position,
    text: row.text,
    score: row.score,
  };
}
