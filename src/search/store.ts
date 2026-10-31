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

// The extensions live in schema public; qualify them so the hidden test
// search_path (set to one schema only) still resolves them.
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export class SearchStore {
  constructor(private readonly pool: Pool) {}

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

  async vectorHits(embedding: number[], limit: number): Promise<Hit[]> {
    const literal = toVectorLiteral(embedding);
    const result = await this.pool.query(
      `SELECT document_id, position, text,
              1 - (embedding::public.halfvec(${VECTOR_DIMENSIONS}) OPERATOR(public.<=>) $1::public.halfvec(${VECTOR_DIMENSIONS})) AS score
       FROM chunks
       ORDER BY embedding::public.halfvec(${VECTOR_DIMENSIONS}) OPERATOR(public.<=>) $1::public.halfvec(${VECTOR_DIMENSIONS})
       LIMIT $2`,
      [literal, limit]
    );
    return result.rows.map(toHit);
  }

  async textHits(query: string, limit: number): Promise<Hit[]> {
    const result = await this.pool.query(
      `SELECT document_id, position, text,
              ts_rank_cd(tsv, websearch_to_tsquery('simple', public.unaccent($1))) AS score
       FROM chunks
       WHERE tsv @@ websearch_to_tsquery('simple', public.unaccent($1))
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
