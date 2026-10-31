import assert from "node:assert/strict";
import { test } from "node:test";
import { Pool } from "pg";
import { testPool } from "./testDb";
import { SearchStore } from "./store";
import { EmbeddingUnavailable, OllamaEmbedder } from "./embedder";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { IndexSync } from "./sync";

const DIMENSIONS = 1024;

function vectorFor(text: string): number[] {
  const v = new Array(DIMENSIONS).fill(0);
  v[0] = text.length;
  return v;
}

interface FakeDoc {
  id: number;
  modified: string;
  title: string;
  content: string;
  created: string;
  correspondent: number | null;
  document_type: number | null;
  tags: number[];
}

function paginated<T>(
  items: T[],
  basePath: string,
  pageSize: number,
  page: number
) {
  const start = (page - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  const hasNext = start + pageSize < items.length;
  const join = basePath.includes("?") ? "&" : "?";
  return {
    count: items.length,
    next: hasNext ? `/api${basePath}${join}page=${page + 1}` : null,
    previous: null,
    results: slice,
  };
}

function fakePaperless(opts: {
  documents: FakeDoc[];
  correspondents?: { id: number; name: string }[];
  documentTypes?: { id: number; name: string }[];
  tags?: { id: number; name: string }[];
  pageSize?: number;
  tagPageSize?: number;
}) {
  const {
    documents,
    correspondents = [],
    documentTypes = [],
    tags = [],
    pageSize = 1000,
    tagPageSize,
  } = opts;
  const detail = new Map(documents.map((d) => [d.id, d]));
  let listCalls = 0;

  const request = async (path: string) => {
    if (path.startsWith("/documents/?fields=id,modified&page_size=1000")) {
      listCalls++;
      const url = new URL(path, "http://x");
      const page = Number(url.searchParams.get("page") ?? "1");
      const result = paginated(
        documents,
        "/documents/?fields=id,modified&page_size=1000",
        pageSize,
        page
      );
      return {
        ...result,
        results: result.results.map((d) => ({
          id: d.id,
          modified: d.modified,
        })),
      };
    }
    if (path.startsWith("/correspondents/")) {
      return {
        count: correspondents.length,
        next: null,
        previous: null,
        results: correspondents,
      };
    }
    if (path.startsWith("/document_types/")) {
      return {
        count: documentTypes.length,
        next: null,
        previous: null,
        results: documentTypes,
      };
    }
    if (path.startsWith("/tags/")) {
      if (tagPageSize) {
        const url = new URL(path, "http://x");
        const page = Number(url.searchParams.get("page") ?? "1");
        return paginated(tags, "/tags/", tagPageSize, page);
      }
      return { count: tags.length, next: null, previous: null, results: tags };
    }
    const match = path.match(/^\/documents\/(\d+)\/$/);
    if (match) {
      const doc = detail.get(Number(match[1]));
      if (!doc) throw new Error(`document ${match[1]} not found`);
      return doc;
    }
    throw new Error(`unexpected request ${path}`);
  };

  return {
    api: { request } as unknown as PaperlessAPI,
    listCalls: () => listCalls,
  };
}

function fakeEmbedder(
  opts: {
    failFor?: (texts: string[]) => boolean;
    failWith?: () => Error;
  } = {}
) {
  const calls: string[][] = [];
  const embedder = {
    embedDocuments: async (texts: string[]) => {
      calls.push(texts);
      if (opts.failFor?.(texts)) {
        throw (opts.failWith ?? (() => new Error("embedding failed")))();
      }
      return texts.map(vectorFor);
    },
    embedQuery: async (query: string) => vectorFor(query),
  } as unknown as OllamaEmbedder;
  return { embedder, calls };
}

function doc(overrides: Partial<FakeDoc> & { id: number }): FakeDoc {
  return {
    modified: "2024-01-01T00:00:00.000Z",
    title: `Documento ${overrides.id}`,
    content: `Contenido del documento ${overrides.id}.`,
    created: "2024-01-01T00:00:00.000Z",
    correspondent: null,
    document_type: null,
    tags: [],
    ...overrides,
  };
}

async function newStore(): Promise<{ pool: Pool; store: SearchStore }> {
  const pool = await testPool();
  const store = new SearchStore(pool);
  await store.migrate();
  return { pool, store };
}

test("a new document is added", async () => {
  const { pool, store } = await newStore();
  try {
    const { api } = fakePaperless({ documents: [doc({ id: 1 })] });
    const { embedder } = fakeEmbedder();
    const sync = new IndexSync({ api, store, embedder });

    const report = await sync.run();

    assert.deepEqual(report, {
      added: 1,
      updated: 0,
      deleted: 0,
      metadataRefreshed: 0,
      failed: 0,
    });
    const indexed = await store.indexed();
    assert.ok(indexed.has(1));
  } finally {
    await pool.end();
  }
});

test("a changed modified updates the document", async () => {
  const { pool, store } = await newStore();
  try {
    const first = fakePaperless({ documents: [doc({ id: 1 })] });
    const { embedder } = fakeEmbedder();
    await new IndexSync({ api: first.api, store, embedder }).run();

    const changed = fakePaperless({
      documents: [
        doc({
          id: 1,
          modified: "2024-02-02T00:00:00.000Z",
          content: "Contenido nuevo.",
        }),
      ],
    });
    const report = await new IndexSync({
      api: changed.api,
      store,
      embedder,
    }).run();

    assert.deepEqual(report, {
      added: 0,
      updated: 1,
      deleted: 0,
      metadataRefreshed: 0,
      failed: 0,
    });
    const indexed = await store.indexed();
    assert.equal(indexed.get(1)?.modified, "2024-02-02T00:00:00.000Z");
  } finally {
    await pool.end();
  }
});

test("a document missing from Paperless is deleted, also its chunks", async () => {
  const { pool, store } = await newStore();
  try {
    const first = fakePaperless({ documents: [doc({ id: 1 })] });
    const { embedder } = fakeEmbedder();
    await new IndexSync({ api: first.api, store, embedder }).run();

    const empty = fakePaperless({ documents: [] });
    const report = await new IndexSync({
      api: empty.api,
      store,
      embedder,
    }).run();

    assert.deepEqual(report, {
      added: 0,
      updated: 0,
      deleted: 1,
      metadataRefreshed: 0,
      failed: 0,
    });
    const indexed = await store.indexed();
    assert.equal(indexed.has(1), false);
    const chunks = await pool.query(
      "SELECT 1 FROM chunks WHERE document_id = $1",
      [1]
    );
    assert.equal(chunks.rows.length, 0);
  } finally {
    await pool.end();
  }
});

test('a document with content: "" gets only its metadata chunk', async () => {
  const { pool, store } = await newStore();
  try {
    const { api } = fakePaperless({
      documents: [doc({ id: 1, content: "" })],
    });
    const { embedder } = fakeEmbedder();
    await new IndexSync({ api, store, embedder }).run();

    const chunks = await pool.query(
      "SELECT kind FROM chunks WHERE document_id = $1 ORDER BY position",
      [1]
    );
    assert.deepEqual(
      chunks.rows.map((r) => r.kind),
      ["metadata"]
    );
  } finally {
    await pool.end();
  }
});

test("an embedder that throws for document 2 only leaves document 2 with its old chunks and gives failed: 1", async () => {
  const { pool, store } = await newStore();
  try {
    const first = fakePaperless({
      documents: [
        doc({ id: 1, content: "uno" }),
        doc({ id: 2, content: "dos" }),
      ],
    });
    const { embedder: okEmbedder } = fakeEmbedder();
    await new IndexSync({ api: first.api, store, embedder: okEmbedder }).run();
    const before = await store.indexed();

    const changed = fakePaperless({
      documents: [
        doc({ id: 1, modified: "2024-02-02T00:00:00.000Z", content: "uno" }),
        doc({
          id: 2,
          modified: "2024-02-02T00:00:00.000Z",
          content: "dos cambiado",
        }),
        doc({ id: 3, content: "tres" }),
      ],
    });
    const { embedder: flakyEmbedder } = fakeEmbedder({
      failFor: (texts) => texts.some((t) => t.includes("Documento 2")),
    });
    const report = await new IndexSync({
      api: changed.api,
      store,
      embedder: flakyEmbedder,
    }).run();

    assert.deepEqual(report, {
      added: 1,
      updated: 1,
      deleted: 0,
      metadataRefreshed: 0,
      failed: 1,
    });
    const after = await store.indexed();
    assert.deepEqual(after.get(2), before.get(2));
    assert.equal(after.get(1)?.modified, "2024-02-02T00:00:00.000Z");
    assert.ok(after.has(3));
  } finally {
    await pool.end();
  }
});

test("EmbeddingUnavailable on the first document stops the run, and the index is unchanged", async () => {
  const { pool, store } = await newStore();
  try {
    const { api } = fakePaperless({
      documents: [doc({ id: 1 }), doc({ id: 2 })],
    });
    const { embedder } = fakeEmbedder({
      failFor: () => true,
      failWith: () => new EmbeddingUnavailable("Ollama is down"),
    });
    const sync = new IndexSync({ api, store, embedder });

    await assert.rejects(() => sync.run(), EmbeddingUnavailable);
    const indexed = await store.indexed();
    assert.equal(indexed.size, 0);
  } finally {
    await pool.end();
  }
});

test("after 25 hours the metadata chunks are made again with a renamed tag", async () => {
  const { pool, store } = await newStore();
  try {
    let now = Date.parse("2024-01-01T00:00:00.000Z");
    const first = fakePaperless({
      documents: [doc({ id: 1, tags: [9] })],
      tags: [{ id: 9, name: "factura" }],
    });
    const { embedder } = fakeEmbedder();
    await new IndexSync({
      api: first.api,
      store,
      embedder,
      now: () => now,
    }).run();

    now += 25 * 60 * 60 * 1000;
    const renamed = fakePaperless({
      documents: [doc({ id: 1, tags: [9] })],
      tags: [{ id: 9, name: "recibo" }],
    });
    const report = await new IndexSync({
      api: renamed.api,
      store,
      embedder,
      now: () => now,
    }).run();

    assert.deepEqual(report, {
      added: 0,
      updated: 0,
      deleted: 0,
      metadataRefreshed: 1,
      failed: 0,
    });
    const chunk = await pool.query(
      "SELECT text FROM chunks WHERE document_id = $1 AND position = 0",
      [1]
    );
    assert.match(chunk.rows[0].text, /recibo/);
    const indexed = await store.indexed();
    assert.equal(indexed.get(1)?.metadataAt, new Date(now).toISOString());
  } finally {
    await pool.end();
  }
});

test("two run() at the same time call the fake Paperless list one time", async () => {
  const { pool, store } = await newStore();
  try {
    const { api, listCalls } = fakePaperless({ documents: [doc({ id: 1 })] });
    const { embedder } = fakeEmbedder();
    const sync = new IndexSync({ api, store, embedder });

    const [a, b] = await Promise.all([sync.run(), sync.run()]);

    assert.equal(listCalls(), 1);
    assert.deepEqual(a, b);
  } finally {
    await pool.end();
  }
});

test("the document list follows next across pages", async () => {
  const { pool, store } = await newStore();
  try {
    const { api } = fakePaperless({
      documents: [doc({ id: 1 }), doc({ id: 2 })],
      pageSize: 1,
    });
    const { embedder } = fakeEmbedder();
    const report = await new IndexSync({ api, store, embedder }).run();

    assert.equal(report.added, 2);
    const indexed = await store.indexed();
    assert.equal(indexed.size, 2);
  } finally {
    await pool.end();
  }
});

test("a tag on page 2 of /tags/ still appears in the metadata chunk", async () => {
  const { pool, store } = await newStore();
  try {
    const { api } = fakePaperless({
      documents: [doc({ id: 1, tags: [2] })],
      tags: [
        { id: 1, name: "primera" },
        { id: 2, name: "segunda" },
      ],
      tagPageSize: 1,
    });
    const { embedder } = fakeEmbedder();
    await new IndexSync({ api, store, embedder }).run();

    const chunk = await pool.query(
      "SELECT text FROM chunks WHERE document_id = $1 AND position = 0",
      [1]
    );
    assert.match(chunk.rows[0].text, /segunda/);
  } finally {
    await pool.end();
  }
});
