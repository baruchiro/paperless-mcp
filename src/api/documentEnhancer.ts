import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { PaperlessAPI } from "./PaperlessAPI";
import { Document, DocumentsResponse } from "./types";
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

export interface FieldFilterOptions {
  fields?: string[];
}

export async function convertDocsWithNames(
  document: Document,
  api: PaperlessAPI,
  options?: FieldFilterOptions
): Promise<CallToolResult>;
export async function convertDocsWithNames(
  documentsResponse: DocumentsResponse,
  api: PaperlessAPI,
  options?: FieldFilterOptions
): Promise<CallToolResult>;
export async function convertDocsWithNames(
  input: Document | DocumentsResponse,
  api: PaperlessAPI,
  options?: FieldFilterOptions
): Promise<CallToolResult> {
  if ("results" in input) {
    const enhancedResults = await enhanceDocumentsArray(
      input.results || [],
      api,
      options
    );

    return {
      content: [
        {
          type: "text",
          text: enhancedResults?.length
            ? JSON.stringify({
                ...input,
                results: enhancedResults,
              })
            : "No documents found",
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
  const [enhanced] = await enhanceDocumentsArray([input], api, options);
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
  api: PaperlessAPI,
  options?: FieldFilterOptions
): Promise<EnhancedDocument[]> {
  if (!documents?.length) {
    return [];
  }

  const [correspondents, documentTypes, tags, customFields] = await Promise.all(
    [
      api.getCorrespondents(),
      api.getDocumentTypes(),
      api.getTags(),
      api.getCustomFields(),
    ]
  );

  const correspondentMap = new Map(
    (correspondents.results || []).map((c) => [c.id, c.name])
  );
  const documentTypeMap = new Map(
    (documentTypes.results || []).map((dt) => [dt.id, dt.name])
  );
  const tagMap = new Map((tags.results || []).map((tag) => [tag.id, tag.name]));
  const customFieldMap = new Map(
    (customFields.results || []).map((cf) => [cf.id, cf.name])
  );

  return documents.map((doc) => {
    const enhanced: EnhancedDocument = {
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
    };

    // Apply field filtering
    if (options?.fields && options.fields.length > 0) {
      // If fields are specified, only include those fields
      const filtered: any = {};
      for (const field of options.fields) {
        if (field in enhanced) {
          filtered[field] = enhanced[field as keyof EnhancedDocument];
        }
      }
      return filtered as EnhancedDocument;
    } else {
      // Default behavior: exclude 'content' field
      const { content, ...withoutContent } = enhanced;
      return withoutContent as EnhancedDocument;
    }
  });
}
