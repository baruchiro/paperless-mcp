import { PaperlessAPI } from "../api/PaperlessAPI";
import { chunkText, metadataText } from "./chunk";
import { EmbeddingUnavailable, OllamaEmbedder } from "./embedder";
import { SearchStore, StoredChunk } from "./store";
import { tracer } from "../tracing";
import {
  chunksIndexed,
  documentsIndexed,
  syncDuration,
  syncRuns,
} from "../metrics";

const METADATA_REFRESH_MS = 24 * 60 * 60 * 1000;
// Pages in the order of the id do not move when a document is added during the list. A delete can still move a row, so the sync compares the row count.
const DOCUMENT_LIST_PATH =
  "/documents/?fields=id,modified&page_size=1000&ordering=id";
const MAX_LIST_PAGES = 10_000;
// Without a limit, a Paperless that never answers would keep the run pending for ever.
const REQUEST_TIMEOUT_MS = 60_000;

export interface SyncReport {
  added: number;
  updated: number;
  deleted: number;
  metadataRefreshed: number;
  failed: number;
}

interface NameMaps {
  correspondents: Map<number, string>;
  documentTypes: Map<number, string>;
  tags: Map<number, string>;
}

interface DocumentDetail {
  title: string;
  content: string | null;
  created: string;
  modified: string;
  correspondent: number | null;
  document_type: number | null;
  tags: number[];
}

// The Paperless list answer gives `next` as a full URL; the API only takes the part after the /api segment.
function pathAfterApi(url: string): string {
  const { pathname, search } = new URL(url);
  return pathname.slice(pathname.indexOf("/api/") + "/api".length) + search;
}

function toNameMap(rows: { id: number; name: string }[]): Map<number, string> {
  return new Map(rows.map((row) => [row.id, row.name]));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class IndexSync {
  private readonly api: PaperlessAPI;
  private readonly store: SearchStore;
  private readonly embedder: OllamaEmbedder;
  private readonly now: () => number;
  private readonly requestTimeoutMs: number;
  private readonly maxListPages: number;
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<SyncReport>;

  constructor(opts: {
    api: PaperlessAPI;
    store: SearchStore;
    embedder: OllamaEmbedder;
    now?: () => number;
    requestTimeoutMs?: number;
    maxListPages?: number;
  }) {
    this.api = opts.api;
    this.store = opts.store;
    this.embedder = opts.embedder;
    this.now = opts.now ?? Date.now;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
    this.maxListPages = opts.maxListPages ?? MAX_LIST_PAGES;
  }

  run(): Promise<SyncReport> {
    if (!this.running) {
      this.running = this.doRun().finally(() => {
        this.running = undefined;
      });
    }
    return this.running;
  }

  start(intervalMs = 600_000): void {
    const scheduled = () =>
      this.run().catch((err) =>
        console.error(`[paperless-mcp] index: run failed: ${errorMessage(err)}`)
      );
    void scheduled();
    this.timer = setInterval(scheduled, intervalMs).unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async doRun(): Promise<SyncReport> {
    const endTimer = syncDuration.startTimer();
    return tracer.startActiveSpan("sync", async (span) => {
    const report: SyncReport = {
      added: 0,
      updated: 0,
      deleted: 0,
      metadataRefreshed: 0,
      failed: 0,
    };

    const remote = new Map<number, string>();
    const { rows, count } = await this.listAll<{
      id: number;
      modified: string;
    }>(DOCUMENT_LIST_PATH);
    for (const row of rows) {
      remote.set(row.id, row.modified);
    }

    const indexed = await this.store.indexed();

    // A list whose rows differ from its count changed during the run. Delete nothing, because a missing row would remove a document from the index.
    const listComplete = rows.length === count;
    if (!listComplete) {
      console.error(
        `[paperless-mcp] index: the list has ${rows.length} documents, but Paperless counts ${count}; the delete step is skipped`
      );
    }
    const toDelete = listComplete
      ? [...indexed.keys()].filter((id) => !remote.has(id))
      : [];
    if (toDelete.length > 0) {
      await this.store.deleteDocuments(toDelete);
      report.deleted = toDelete.length;
      console.error(
        `[paperless-mcp] index: deleted ${
          toDelete.length
        } documents: ${toDelete.join(",")}`
      );
    }

    const toSync = [...remote.entries()].filter(
      ([id, modified]) =>
        !indexed.has(id) ||
        new Date(modified).getTime() !==
          new Date(indexed.get(id)!.modified).getTime()
    );

    let names: NameMaps | undefined;
    const reindexed = new Set<number>();

    for (const [id] of toSync) {
      try {
        names ??= await this.loadNames();
        await this.syncDocument(id, names);
        reindexed.add(id);
        if (indexed.has(id)) report.updated++;
        else report.added++;
      } catch (err) {
        if (err instanceof EmbeddingUnavailable) {
          console.error(
            `[paperless-mcp] index: Ollama is unavailable, stopping the run`
          );
          throw err;
        }
        report.failed++;
        console.error(
          `[paperless-mcp] index: document ${id} failed: ${errorMessage(err)}`
        );
      }
    }

    const refreshBefore = this.now() - METADATA_REFRESH_MS;
    for (const [id, info] of indexed) {
      if (reindexed.has(id) || !remote.has(id)) continue;
      if (new Date(info.metadataAt).getTime() >= refreshBefore) continue;
      try {
        names ??= await this.loadNames();
        await this.refreshMetadata(id, names);
        report.metadataRefreshed++;
      } catch (err) {
        if (err instanceof EmbeddingUnavailable) {
          console.error(
            `[paperless-mcp] index: Ollama is unavailable, stopping the run`
          );
          throw err;
        }
        report.failed++;
        console.error(
          `[paperless-mcp] index: document ${id} failed: ${errorMessage(err)}`
        );
      }
    }

    syncRuns.inc({ outcome: "success" });
    try {
      documentsIndexed.set(await this.store.countDocuments());
      chunksIndexed.set(await this.store.countChunks());
    } catch { /* gauge update is best-effort */ }
    return report;
    } catch (err) {
    syncRuns.inc({ outcome: "failure" });
    span.recordException(err as Error);
    throw err;
    } finally {
    endTimer();
    span.end();
    }
    });
  }

  // A Paperless list can have several pages, and `next` gives the next page.
  // Track the pages that you already got, and stop with an error after
  // `MAX_LIST_PAGES` pages, because a repeated or endless `next` would stop the sync.
  private async listAll<T>(
    path: string
  ): Promise<{ rows: T[]; count: number }> {
    const rows: T[] = [];
    const seen = new Set<string>();
    let count = 0;
    let next: string | null = path;
    while (next) {
      if (seen.has(next)) {
        throw new Error(`Paperless gave the same next page two times: ${next}`);
      }
      if (seen.size >= this.maxListPages) {
        throw new Error(
          `Paperless gave more than ${this.maxListPages} pages for ${path}`
        );
      }
      seen.add(next);
      const page = await this.get(next);
      if (seen.size === 1) count = page.count;
      rows.push(...(page.results as T[]));
      next = page.next ? pathAfterApi(page.next) : null;
    }
    return { rows, count };
  }

  private get(path: string) {
    return this.api.request(path, {
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
  }

  private async loadNames(): Promise<NameMaps> {
    const [correspondents, documentTypes, tags] = await Promise.all([
      this.listAll<{ id: number; name: string }>(
        "/correspondents/?page_size=1000"
      ),
      this.listAll<{ id: number; name: string }>(
        "/document_types/?page_size=1000"
      ),
      this.listAll<{ id: number; name: string }>("/tags/?page_size=1000"),
    ]);
    return {
      correspondents: toNameMap(correspondents.rows),
      documentTypes: toNameMap(documentTypes.rows),
      tags: toNameMap(tags.rows),
    };
  }

  private metadataTextFor(doc: DocumentDetail, names: NameMaps): string {
    const tags = doc.tags
      .map((id) => names.tags.get(id))
      .filter((name): name is string => !!name);
    return metadataText(
      { title: doc.title, created: doc.created },
      {
        correspondent: doc.correspondent
          ? names.correspondents.get(doc.correspondent)
          : undefined,
        documentType: doc.document_type
          ? names.documentTypes.get(doc.document_type)
          : undefined,
        tags,
      }
    );
  }

  private async syncDocument(id: number, names: NameMaps): Promise<void> {
    const doc: DocumentDetail = await this.get(`/documents/${id}/`);
    const metaText = this.metadataTextFor(doc, names);
    const { chunks, truncated } = chunkText(doc.content ?? "");
    const texts = [metaText, ...chunks];
    const embeddings = await this.embedder.embedDocuments(texts);

    const storedChunks: StoredChunk[] = embeddings.map((embedding, i) => ({
      kind: i === 0 ? "metadata" : "content",
      text: texts[i],
      embedding,
    }));

    await this.store.replaceDocument(
      {
        id,
        modified: doc.modified,
        title: doc.title,
        truncated,
        metadataAt: new Date(this.now()).toISOString(),
      },
      storedChunks
    );
  }

  private async refreshMetadata(id: number, names: NameMaps): Promise<void> {
    const doc: DocumentDetail = await this.get(`/documents/${id}/`);
    const metaText = this.metadataTextFor(doc, names);
    const [embedding] = await this.embedder.embedDocuments([metaText]);
    await this.store.replaceMetadata(
      id,
      { kind: "metadata", text: metaText, embedding },
      new Date(this.now()).toISOString()
    );
  }
}
