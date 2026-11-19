import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { PaperlessAPI } from "./PaperlessAPI";
import { Document, DocumentsResponse, PaginationResponse } from "./types";
import { NamedItem } from "./utils";

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

async function collectPages<T>(
  firstPage: Promise<PaginationResponse<T>>,
  path: string,
  api: PaperlessAPI
): Promise<T[]> {
  let response = await firstPage;
  const results = [...(response.results || [])];
  let page = 1;
  while (response.next) {
    try {
      response = await api.request<PaginationResponse<T>>(`${path}?page=${++page}`);
      results.push(...(response.results || []));
    } catch {
      console.warn(`Could not fetch all ${path} names; unresolved names will use IDs`);
      break;
    }
  }
  return results;
}

async function enhanceDocumentsArray(
  documents: Document[],
  api: PaperlessAPI
): Promise<Omit<EnhancedDocument, 'content'>[]> {
  if (!documents?.length) {
    return [];
  }

  const [correspondents, documentTypes, tags, customFields] = await Promise.all(
    [
      collectPages(api.getCorrespondents(), "/correspondents/", api),
      collectPages(api.getDocumentTypes(), "/document_types/", api),
      collectPages(api.getTags(), "/tags/", api),
      collectPages(api.getCustomFields(), "/custom_fields/", api),
    ]
  );

  const correspondentMap = new Map(
    correspondents.map((c) => [c.id, c.name])
  );
  const documentTypeMap = new Map(
    documentTypes.map((dt) => [dt.id, dt.name])
  );
  const tagMap = new Map(tags.map((tag) => [tag.id, tag.name]));
  const customFieldMap = new Map(
    customFields.map((cf) => [cf.id, cf.name])
  );

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
