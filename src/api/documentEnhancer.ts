import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { PaperlessAPI } from "./PaperlessAPI";
import { Document, DocumentsResponse, PaginationResponse } from "./types";
import { NamedItem } from "./utils";

// paperless-ngx's StandardPagination clamps page_size to this value (it does not
// reject a larger request), and it is the most rows paperless returns in one
// page. One request this size covers any realistic instance; beyond it,
// fetchAllRows walks the remaining pages.
const PAPERLESS_MAX_PAGE_SIZE = 100000;

/**
 * Fetch every row of a paginated Paperless list endpoint.
 *
 * The default Paperless page size is 25, so building an id->name map from a bare
 * list call only covers the first 25 rows (ordered by name) and every other id
 * silently falls back to its stringified number. Request the whole set in one
 * page, then walk further pages only if the reported `count` somehow exceeds the
 * server's page_size ceiling.
 */
async function fetchAllRows<T>(
  fetchPage: (queryString?: string) => Promise<PaginationResponse<T>>
): Promise<T[]> {
  const firstPage = await fetchPage(`page_size=${PAPERLESS_MAX_PAGE_SIZE}`);
  const rows = firstPage.results ? [...firstPage.results] : [];
  const total = firstPage.count ?? rows.length;

  for (let page = 2; rows.length < total; page++) {
    const { results } = await fetchPage(
      `page=${page}&page_size=${PAPERLESS_MAX_PAGE_SIZE}`
    );
    if (!results?.length) {
      break;
    }
    rows.push(...results);
  }

  return rows;
}

interface CustomField {
  field: number;
  name: string;
  value: string | number | boolean | object | null;
}

export interface EnhancedDocument
  extends Omit<
    Document,
    "correspondent" | "document_type" | "tags" | "custom_fields"
  > {
  correspondent: NamedItem | null;
  document_type: NamedItem | null;
  tags: NamedItem[];
  custom_fields: CustomField[];
}

export async function convertDocsWithNames(
  document: Document,
  api: PaperlessAPI
): Promise<CallToolResult>;
export async function convertDocsWithNames(
  documentsResponse: DocumentsResponse,
  api: PaperlessAPI
): Promise<CallToolResult>;
export async function convertDocsWithNames(
  input: Document | DocumentsResponse,
  api: PaperlessAPI
): Promise<CallToolResult> {
  if ("results" in input) {
    const { all, results, ...paginationMeta } = input;
    const enhancedResults = await enhanceDocumentsArray(results || [], api);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ...paginationMeta,
            results: enhancedResults,
          }),
        },
      ],
    };
  }

  if (!input) {
    return {
      content: [
        {
          type: "text",
          text: "No document found",
        },
      ],
    };
  }
  const [enhanced] = await enhanceDocumentsArray([input], api);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(enhanced),
      },
    ],
  };
}

async function enhanceDocumentsArray(
  documents: Document[],
  api: PaperlessAPI
): Promise<Omit<EnhancedDocument, 'content'>[]> {
  if (!documents?.length) {
    return [];
  }

  const [correspondents, documentTypes, tags, customFields] = await Promise.all([
    fetchAllRows((queryString) => api.getCorrespondents(queryString)),
    fetchAllRows((queryString) => api.getDocumentTypes(queryString)),
    fetchAllRows((queryString) => api.getTags(queryString)),
    fetchAllRows((queryString) => api.getCustomFields(queryString)),
  ]);

  const correspondentMap = new Map(correspondents.map((c) => [c.id, c.name]));
  const documentTypeMap = new Map(documentTypes.map((dt) => [dt.id, dt.name]));
  const tagMap = new Map(tags.map((tag) => [tag.id, tag.name]));
  const customFieldMap = new Map(customFields.map((cf) => [cf.id, cf.name]));

  return documents
    .map((doc) => {
      const { content, ...docWithoutContent } = doc;
      return docWithoutContent;
    })
    .map((doc) => ({
      ...doc,
      correspondent: doc.correspondent
        ? {
            id: doc.correspondent,
            name:
              correspondentMap.get(doc.correspondent) ||
              String(doc.correspondent),
          }
        : null,
      document_type: doc.document_type
        ? {
            id: doc.document_type,
            name:
              documentTypeMap.get(doc.document_type) || String(doc.document_type),
          }
        : null,
      tags: Array.isArray(doc.tags)
        ? doc.tags.map((tagId) => ({
            id: tagId,
            name: tagMap.get(tagId) || String(tagId),
          }))
        : doc.tags,
      custom_fields: Array.isArray(doc.custom_fields)
        ? doc.custom_fields.map((field) => ({
            field: field.field,
            name: customFieldMap.get(field.field) || String(field.field),
            value: field.value,
          }))
        : doc.custom_fields,
    }));
}
