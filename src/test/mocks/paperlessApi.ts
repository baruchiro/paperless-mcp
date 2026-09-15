import { PaperlessAPI } from "../../api/PaperlessAPI";
import { Document } from "../../api/types";

export interface NamedRecord {
  id: number;
  name: string;
}

export interface PaperlessApiMockSeed {
  correspondents?: NamedRecord[];
  documentTypes?: NamedRecord[];
  tags?: NamedRecord[];
  customFields?: NamedRecord[];
  /**
   * Page size the fake server applies when the caller does not pass one.
   * Mirrors paperless-ngx's StandardPagination.page_size (25).
   */
  defaultPageSize?: number;
  /**
   * Upper bound the fake server enforces on a requested `page_size`.
   * Mirrors paperless-ngx's StandardPagination.max_page_size (100000).
   */
  maxPageSize?: number;
}

type RequestLog = {
  correspondents: string[];
  documentTypes: string[];
  tags: string[];
  customFields: string[];
};

export type PaperlessApiMock = PaperlessAPI & { __requests: RequestLog };

/**
 * Minimal PaperlessAPI stand-in for document-enrichment tests.
 *
 * With no seed it behaves like an empty instance. Given seed data it paginates
 * the way paperless-ngx does: `page`/`page_size` query params are honoured,
 * `page_size` is clamped to `maxPageSize`, and every lookup query string is
 * recorded on `__requests`.
 */
export function createPaperlessApiMock(
  seed: PaperlessApiMockSeed = {}
): PaperlessApiMock {
  const defaultPageSize = seed.defaultPageSize ?? 25;
  const maxPageSize = seed.maxPageSize ?? 100000;
  const requests: RequestLog = {
    correspondents: [],
    documentTypes: [],
    tags: [],
    customFields: [],
  };

  const paginate = <T extends NamedRecord>(
    items: T[],
    queryString: string | undefined,
    bucket: keyof RequestLog
  ) => {
    requests[bucket].push(queryString ?? "");
    const params = new URLSearchParams(queryString ?? "");
    const requestedSize = Number(params.get("page_size"));
    const pageSize = Math.min(
      Number.isFinite(requestedSize) && requestedSize > 0
        ? requestedSize
        : defaultPageSize,
      maxPageSize
    );
    const page = Math.max(1, Number(params.get("page")) || 1);
    const start = (page - 1) * pageSize;
    return {
      count: items.length,
      next: start + pageSize < items.length ? "http://mock.local/next" : null,
      previous: page > 1 ? "http://mock.local/prev" : null,
      all: items.map((item) => item.id),
      results: items.slice(start, start + pageSize),
    };
  };

  const api = {
    getCorrespondents: async (queryString?: string) =>
      paginate(seed.correspondents ?? [], queryString, "correspondents"),
    getDocumentTypes: async (queryString?: string) =>
      paginate(seed.documentTypes ?? [], queryString, "documentTypes"),
    getTags: async (queryString?: string) =>
      paginate(seed.tags ?? [], queryString, "tags"),
    getCustomFields: async (queryString?: string) =>
      paginate(seed.customFields ?? [], queryString, "customFields"),
  } as unknown as PaperlessApiMock;

  api.__requests = requests;
  return api;
}

export function createDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 1,
    correspondent: null,
    document_type: null,
    storage_path: null,
    title: "Document 1",
    content: "OCR content",
    tags: [],
    created: "2026-01-01T00:00:00.000Z",
    created_date: "2026-01-01",
    modified: "2026-01-01T00:00:00.000Z",
    added: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    archive_serial_number: null,
    original_file_name: "doc1.pdf",
    archived_file_name: "2026/doc1.pdf",
    owner: null,
    user_can_change: true,
    is_shared_by_requester: false,
    notes: [],
    custom_fields: [],
    page_count: 1,
    mime_type: "application/pdf",
    ...overrides,
  };
}
