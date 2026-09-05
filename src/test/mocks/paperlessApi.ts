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
}

type RequestLog = {
  correspondents: string[];
  documentTypes: string[];
  tags: string[];
  customFields: string[];
};

export type PaperlessApiMock = PaperlessAPI & { __requests: RequestLog };

function readPageSize(
  queryString: string | undefined,
  fallback: number
): number {
  if (!queryString) return fallback;
  const raw = new URLSearchParams(queryString).get("page_size");
  const parsed = raw == null ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Minimal PaperlessAPI stand-in for document-enrichment tests.
 *
 * With no seed it behaves like an empty instance. Given seed data it paginates
 * the way paperless-ngx does: the first page returns `defaultPageSize` rows and
 * the full set is only returned once the caller asks for a large enough
 * `page_size`. Every lookup query string is recorded on `__requests`.
 */
export function createPaperlessApiMock(
  seed: PaperlessApiMockSeed = {}
): PaperlessApiMock {
  const defaultPageSize = seed.defaultPageSize ?? 25;
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
    const pageSize = readPageSize(queryString, defaultPageSize);
    return {
      count: items.length,
      next: items.length > pageSize ? "http://mock.local/next" : null,
      previous: null,
      all: items.map((item) => item.id),
      results: items.slice(0, pageSize),
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
