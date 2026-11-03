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
    next: hasNext
      ? `http://paperless.test/api${basePath}${join}page=${page + 1}`
      : null,
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
  /** The count that the first page of the document list claims. */
  count?: number;
  /** Documents whose detail request fails. */
  failDetail?: number[];
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
  const listPaths: string[] = [];

  const request = async (path: string) => {
    if (path.startsWith("/documents/?fields=id,modified&page_size=1000")) {
      listCalls++;
      listPaths.push(path);
      const url = new URL(path, "http://x");
      const page = Number(url.searchParams.get("page") ?? "1");
      const result = paginated(
        documents,
        "/documents/?fields=id,modified&page_size=1000&ordering=id",
        pageSize,
        page
      );
      return {
        ...result,
        count: opts.count ?? result.count,
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
      if (opts.failDetail?.includes(Number(match[1]))) {
        throw new Error(`detail of ${match[1]} failed`);
      }
      const doc = detail.get(Number(match[1]));
      if (!doc) throw new Error(`document ${match[1]} not found`);
      return doc;
    }
    throw new Error(`unexpected request ${path}`);
  };

  return {
    api: { request } as unknown as PaperlessAPI,
    listCalls: () => listCalls,
    listPaths,
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

function loopingDocumentsApi(normal: boolean): PaperlessAPI {
  const page = {
    count: 1,
    next: "http://paperless.test/api/documents/?fields=id,modified&page_size=1000&ordering=id",
    previous: null,
    results: [{ id: 1, modified: "2024-01-01T00:00:00.000Z" }],
  };
  const detail = {
    title: "Documento 1",
    content: "contenido",
    created: "2024-01-01T00:00:00.000Z",
    modified: "2024-01-01T00:00:00.000Z",
    correspondent: null,
    document_type: null,
    tags: [],
  };
  return {
    request: async (path: string) => {
      // A real HTTP call always yields a macrotask; without this, a
      // runaway loop of synchronously-resolved promises would starve
      // node:test's own timeout timer and hang the test for real.
      await new Promise((resolve) => setImmediate(resolve));
      if (path.startsWith("/documents/?fields=id,modified&page_size=1000")) {
        return normal ? { ...page, next: null } : page;
      }
      if (path === "/documents/1/") return detail;
      if (
        path.startsWith("/correspondents/") ||
        path.startsWith("/document_types/") ||
        path.startsWith("/tags/")
      ) {
        return { count: 0, next: null, previous: null, results: [] };
      }
      throw new Error(`unexpected request ${path}`);
    },
  } as unknown as PaperlessAPI;
}

test(
  "a next that points back to an earlier page makes run() reject, index unchanged",
  { timeout: 5000 },
  async () => {
    const { pool, store } = await newStore();
    try {
      const api = loopingDocumentsApi(false);
      const { embedder } = fakeEmbedder();
      const sync = new IndexSync({ api, store, embedder });

      await assert.rejects(() => sync.run(), /same next page two times/);
      const indexed = await store.indexed();
      assert.equal(indexed.size, 0);
    } finally {
      await pool.end();
    }
  }
);

test(
  "after a rejected run, a later run() on the same sync starts fresh and succeeds",
  { timeout: 5000 },
  async () => {
    const { pool, store } = await newStore();
    try {
      let normal = false;
      const api = {
        request: (path: string) => loopingDocumentsApi(normal).request(path),
      } as unknown as PaperlessAPI;
      const { embedder } = fakeEmbedder();
      const sync = new IndexSync({ api, store, embedder });

      await assert.rejects(() => sync.run());

      normal = true;
      const report = await sync.run();
      assert.deepEqual(report, {
        added: 1,
        updated: 0,
        deleted: 0,
        metadataRefreshed: 0,
        failed: 0,
      });
    } finally {
      await pool.end();
    }
  }
);

async function captureErrors<T>(run: () => Promise<T>) {
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logged.push(args.join(" "));
  try {
    return { value: await run(), logged };
  } finally {
    console.error = original;
  }
}

test("the document list is ordered by id, so a page does not move during the run", async () => {
  const { pool, store } = await newStore();
  try {
    const { api, listPaths } = fakePaperless({ documents: [doc({ id: 1 })] });
    const { embedder } = fakeEmbedder();
    await new IndexSync({ api, store, embedder }).run();
    assert.match(listPaths[0], /[?&]ordering=id(&|$)/);
  } finally {
    await pool.end();
  }
});

test("a list with fewer rows than its count deletes nothing and logs it", async () => {
  const { pool, store } = await newStore();
  try {
    const first = fakePaperless({
      documents: [doc({ id: 1 }), doc({ id: 2 })],
    });
    const { embedder } = fakeEmbedder();
    await new IndexSync({ api: first.api, store, embedder }).run();

    // Paperless says 2 documents, but the pages gave only document 1.
    const moved = fakePaperless({ documents: [doc({ id: 1 })], count: 2 });
    const { value: report, logged } = await captureErrors(() =>
      new IndexSync({ api: moved.api, store, embedder }).run()
    );

    assert.equal(report.deleted, 0);
    assert.ok((await store.indexed()).has(2));
    assert.equal(logged.length, 1);
    assert.match(logged[0], /index: .*delete/);
  } finally {
    await pool.end();
  }
});

test(
  "a Paperless request that never answers makes run() reject, and the next run() asks again",
  { timeout: 5000 },
  async () => {
    const { pool, store } = await newStore();
    try {
      let calls = 0;
      const api = {
        request: (_path: string, options?: RequestInit) => {
          calls++;
          return new Promise((_resolve, reject) => {
            options?.signal?.addEventListener("abort", () =>
              reject(new Error("canceled"))
            );
          });
        },
      } as unknown as PaperlessAPI;
      const { embedder } = fakeEmbedder();
      const sync = new IndexSync({
        api,
        store,
        embedder,
        requestTimeoutMs: 20,
      });

      await assert.rejects(() => sync.run(), /canceled/);
      await assert.rejects(() => sync.run(), /canceled/);
      assert.equal(calls, 2);
    } finally {
      await pool.end();
    }
  }
);

test("start() runs one time at once, logs a failed run and stops with stop()", async () => {
  let calls = 0;
  const api = {
    request: async () => {
      calls++;
      throw new Error("Paperless is down");
    },
  } as unknown as PaperlessAPI;
  const { embedder } = fakeEmbedder();
  const sync = new IndexSync({
    api,
    store: {} as unknown as SearchStore,
    embedder,
  });

  const { logged } = await captureErrors(async () => {
    sync.start(60_000);
    for (let i = 0; i < 10; i++) await new Promise(setImmediate);
    sync.stop();
  });

  assert.equal(calls, 1);
  assert.equal(logged.length, 1);
  assert.match(
    logged[0],
    /^\[paperless-mcp\] index: run failed: .*Paperless is down/
  );
});

test("a metadata refresh that fails for one document counts as failed and goes on", async () => {
  const { pool, store } = await newStore();
  try {
    let now = Date.parse("2024-01-01T00:00:00.000Z");
    const documents = [doc({ id: 1 }), doc({ id: 2 })];
    const { embedder } = fakeEmbedder();
    await new IndexSync({
      api: fakePaperless({ documents }).api,
      store,
      embedder,
      now: () => now,
    }).run();

    now += 25 * 60 * 60 * 1000;
    const broken = fakePaperless({ documents, failDetail: [1] });
    const { value: report, logged } = await captureErrors(() =>
      new IndexSync({ api: broken.api, store, embedder, now: () => now }).run()
    );

    assert.deepEqual(report, {
      added: 0,
      updated: 0,
      deleted: 0,
      metadataRefreshed: 1,
      failed: 1,
    });
    assert.equal(logged.length, 1);
    assert.match(logged[0], /document 1 failed/);
  } finally {
    await pool.end();
  }
});

test("EmbeddingUnavailable in a metadata refresh stops the run", async () => {
  const { pool, store } = await newStore();
  try {
    let now = Date.parse("2024-01-01T00:00:00.000Z");
    let ollamaDown = false;
    const documents = [doc({ id: 1 })];
    const { api } = fakePaperless({ documents });
    const { embedder } = fakeEmbedder({
      failFor: () => ollamaDown,
      failWith: () => new EmbeddingUnavailable("Ollama is down"),
    });
    await new IndexSync({ api, store, embedder, now: () => now }).run();

    now += 25 * 60 * 60 * 1000;
    ollamaDown = true;
    const sync = new IndexSync({ api, store, embedder, now: () => now });
    const { value } = await captureErrors(() =>
      sync.run().then(
        () => undefined,
        (err) => err
      )
    );

    assert.ok(value instanceof EmbeddingUnavailable);
  } finally {
    await pool.end();
  }
});

test("a next that never ends makes run() reject after the page limit", async () => {
  const { pool, store } = await newStore();
  try {
    const api = {
      request: async (path: string) => {
        const page = Number(
          new URL(path, "http://x").searchParams.get("page") ?? "1"
        );
        return {
          count: 1,
          next: `http://paperless.test/api/documents/?fields=id,modified&page_size=1000&ordering=id&page=${
            page + 1
          }`,
          previous: null,
          results: [{ id: page, modified: "2024-01-01T00:00:00.000Z" }],
        };
      },
    } as unknown as PaperlessAPI;
    const { embedder } = fakeEmbedder();
    const sync = new IndexSync({ api, store, embedder, maxListPages: 3 });

    await assert.rejects(() => sync.run(), /more than 3 pages/);
  } finally {
    await pool.end();
  }
});

test("the host of the next URL does not matter, also when it starts with api", async () => {
  const { pool, store } = await newStore();
  try {
    const paths: string[] = [];
    const api = {
      request: async (path: string) => {
        paths.push(path);
        if (path.startsWith("/documents/?")) {
          return path.includes("page=2")
            ? {
                count: 2,
                next: null,
                previous: null,
                results: [{ id: 2, modified: "2024-01-01T00:00:00.000Z" }],
              }
            : {
                count: 2,
                next: "https://api.paperless.test/api/documents/?fields=id,modified&page_size=1000&ordering=id&page=2",
                previous: null,
                results: [{ id: 1, modified: "2024-01-01T00:00:00.000Z" }],
              };
        }
        return { count: 0, next: null, previous: null, results: [] };
      },
    } as unknown as PaperlessAPI;
    const sync = new IndexSync({
      api,
      store,
      embedder: fakeEmbedder().embedder,
    });
    // The document details are not the point of this test; the sync logs their failure.
    await captureErrors(() => sync.run());

    assert.ok(
      paths.includes(
        "/documents/?fields=id,modified&page_size=1000&ordering=id&page=2"
      ),
      paths.join("\n")
    );
  } finally {
    await pool.end();
  }
});
