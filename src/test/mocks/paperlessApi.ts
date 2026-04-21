import { PaperlessAPI } from "../../api/PaperlessAPI";
import { Document } from "../../api/types";

function emptyPaginationResponse<T>(results: T[] = []) {
  return {
    count: results.length,
    next: null,
    previous: null,
    all: [],
    results,
  };
}

export function createPaperlessApiMock(): PaperlessAPI {
  return {
    getCorrespondents: async () => emptyPaginationResponse(),
    getDocumentTypes: async () => emptyPaginationResponse(),
    getTags: async () => emptyPaginationResponse(),
    getCustomFields: async () => emptyPaginationResponse(),
  } as unknown as PaperlessAPI;
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
