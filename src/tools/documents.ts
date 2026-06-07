import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { convertDocsWithNames } from "../api/documentEnhancer";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { arrayNotEmpty, objectNotEmpty } from "./utils/empty";
import { withErrorHandling } from "./utils/middlewares";
import { validateCustomFields } from "./utils/monetary";
import { CUSTOM_FIELD_VALUE_DESCRIPTION } from "./utils/descriptions";
import {
  buildDocumentResourceUri,
  buildThumbnailResourceUri,
} from "./utils/resourceUri";

export type BulkCustomFieldValue = string | number | boolean | number[] | null;

export type BulkCustomFieldUpdate = {
  field: number;
  value: BulkCustomFieldValue;
};

export type BulkCustomFieldParameters = {
  add_custom_fields?: Record<string, BulkCustomFieldValue>;
  remove_custom_fields?: number[];
};

/**
 * Builds Paperless-NGX bulk edit parameters from base parameters plus optional
 * custom field updates.
 *
 * Paperless-NGX expects custom field bulk updates as an `add_custom_fields`
 * record keyed by custom field id. `addCustomFields` is accepted as an array for
 * the MCP tool schema and transformed into that id-to-value record while
 * preserving supported value types, including `number[]` document links and
 * `null` resets. Passing an empty `addCustomFields` array intentionally produces
 * an empty `add_custom_fields` record.
 *
 * When `includeCustomFieldDefaults` is true, the function also initializes
 * `add_custom_fields` and `remove_custom_fields` with empty defaults using
 * nullish coalescing (`??=`). This keeps the `modify_custom_fields` method's
 * payload shape acceptable to Paperless even when no field values are supplied.
 *
 * @param parameters - Base bulk edit parameters to include in the result.
 * @param addCustomFields - Optional custom field updates to map by field id.
 * @param includeCustomFieldDefaults - Whether to include empty custom field
 * defaults required by `modify_custom_fields`.
 * @returns The merged API parameters with custom field updates transformed into
 * Paperless-NGX's `add_custom_fields` record shape.
 */
export function buildBulkEditParameters<T extends Record<string, unknown>>(
  parameters: T,
  addCustomFields?: BulkCustomFieldUpdate[],
  includeCustomFieldDefaults = false,
  includeTagDefaults = false
): T & BulkCustomFieldParameters {
  const apiParameters: T & BulkCustomFieldParameters = {
    ...parameters,
  };

  if (addCustomFields) {
    apiParameters.add_custom_fields = Object.fromEntries(
      addCustomFields.map((customField) => [
        String(customField.field),
        customField.value,
      ])
    );
  }

  if (includeCustomFieldDefaults) {
    apiParameters.add_custom_fields ??= {};
    apiParameters.remove_custom_fields ??= [];
  }

  if (includeTagDefaults) {
    (apiParameters as Record<string, unknown>).add_tags ??= [];
    (apiParameters as Record<string, unknown>).remove_tags ??= [];
  }

  return apiParameters;
}

export function registerDocumentTools(server: McpServer, api: PaperlessAPI) {
  server.tool(
    "bulk_edit_documents",
    "Perform bulk operations on multiple documents. Note: 'remove_tag' removes a tag from specific documents (tag remains in system), while 'delete_tag' permanently deletes a tag from the entire system. ⚠️ WARNING: 'delete' method permanently deletes documents and requires confirmation.",
    {
      documents: z.array(z.number()),
      method: z.enum([
        "set_correspondent",
        "set_document_type",
        "set_storage_path",
        "add_tag",
        "remove_tag",
        "modify_tags",
        "modify_custom_fields",
        "delete",
        "reprocess",
        "set_permissions",
        "merge",
        "split",
        "rotate",
        "delete_pages",
      ]),
      correspondent: z.number().optional(),
      document_type: z.number().optional(),
      storage_path: z.number().optional(),
      tag: z.number().optional(),
      add_tags: z.array(z.number()).optional().transform(arrayNotEmpty),
      remove_tags: z.array(z.number()).optional().transform(arrayNotEmpty),
      add_custom_fields: z
        .array(
          z.object({
            field: z.number(),
            value: z.union([
              z.string(),
              z.number(),
              z.boolean(),
              z.array(z.number()),
              z.null(),
            ]).describe(CUSTOM_FIELD_VALUE_DESCRIPTION),
          })
        )
        .optional()
        .transform(arrayNotEmpty),
      remove_custom_fields: z
        .array(z.number())
        .optional()
        .transform(arrayNotEmpty),
      permissions: z
        .object({
          owner: z.number().nullable().optional(),
          set_permissions: z
            .object({
              view: z.object({
                users: z.array(z.number()),
                groups: z.array(z.number()),
              }),
              change: z.object({
                users: z.array(z.number()),
                groups: z.array(z.number()),
              }),
            })
            .optional(),
          merge: z.boolean().optional(),
        })
        .optional()
        .transform(objectNotEmpty),
      metadata_document_id: z.number().optional(),
      delete_originals: z.boolean().optional(),
      pages: z.string().optional(),
      degrees: z.number().optional(),
      confirm: z
        .boolean()
        .optional()
        .describe(
          "Must be true when method is 'delete' to confirm destructive operation"
        ),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      if (args.method === "delete" && !args.confirm) {
        throw new Error(
          "Confirmation required for destructive operation. Set confirm: true to proceed."
        );
      }
      const { documents, method, add_custom_fields, confirm, ...parameters } = args;

      validateCustomFields(add_custom_fields);

      const response = await api.bulkEditDocuments(
        documents,
        method,
        method === "delete"
          ? {}
          : buildBulkEditParameters(
              parameters,
              add_custom_fields,
              method === "modify_custom_fields",
              method === "modify_tags"
            )
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ result: response.result || response }),
          },
        ],
      };
    })
  );

  server.tool(
    "post_document",
    "Upload a new document to Paperless-NGX with optional metadata like title, correspondent, document type, tags, and custom fields.",
    {
      file: z.string(),
      filename: z.string(),
      title: z.string().optional(),
      created: z.string().optional(),
      correspondent: z.number().optional(),
      document_type: z.number().optional(),
      storage_path: z.number().optional(),
      tags: z.array(z.number()).optional(),
      archive_serial_number: z.number().optional(),
      custom_fields: z.array(z.number()).optional(),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");

      // Validate base64 input
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(args.file)) {
        throw new Error(
          "Invalid base64-encoded file data. Please provide a valid base64 string."
        );
      }
      const { file, filename, ...metadata } = args;
      const document = Buffer.from(file, "base64");

      const response = await api.postDocument(document, filename, metadata);
      let result;
      if (typeof response === "string" && /^\d+$/.test(response)) {
        result = { id: Number(response) };
      } else {
        result = { status: response };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
      };
    })
  );

  server.tool(
    "list_documents",
    "List and filter documents by fields such as title, correspondent, document type, tag, storage path, creation date, archive serial number, custom fields, and more. IMPORTANT: For queries like 'the last 3 contributions' or when searching by tag, correspondent, document type, or storage path, you should FIRST use the relevant tool (e.g., 'list_tags', 'list_correspondents', 'list_document_types', 'list_storage_paths') to find the correct ID, and then use that ID as a filter here. Only use the 'search' argument for free-text search when no specific field applies. Using the correct ID filter will yield much more accurate results. Note: Document content is excluded from results by default. Use 'get_document_content' to retrieve content when needed.",
    {
      page: z.number().optional(),
      page_size: z.number().optional(),
      search: z.string().optional(),
      correspondent: z.number().optional(),
      document_type: z.number().optional(),
      tag: z.number().optional(),
      storage_path: z.number().optional(),
      created__date__gte: z.string().optional(),
      created__date__lte: z.string().optional(),
      ordering: z.string().optional(),
      archive_serial_number: z.number().optional(),
      archive_serial_number__isnull: z.boolean().optional(),
      custom_field_query: z.string().optional(),
      custom_fields__icontains: z.string().optional(),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const query = new URLSearchParams();
      if (args.page) query.set("page", args.page.toString());
      if (args.page_size) query.set("page_size", args.page_size.toString());
      if (args.search) query.set("search", args.search);
      if (args.correspondent)
        query.set("correspondent__id", args.correspondent.toString());
      if (args.document_type)
        query.set("document_type__id", args.document_type.toString());
      if (args.tag) query.set("tags__id", args.tag.toString());
      if (args.storage_path)
        query.set("storage_path__id", args.storage_path.toString());
      if (args.created__date__gte) query.set("created__date__gte", args.created__date__gte);
      if (args.created__date__lte) query.set("created__date__lte", args.created__date__lte);
      if (args.ordering) query.set("ordering", args.ordering);
      if (args.archive_serial_number !== undefined) query.set("archive_serial_number", args.archive_serial_number.toString());
      if (args.archive_serial_number__isnull !== undefined) query.set("archive_serial_number__isnull", args.archive_serial_number__isnull.toString());
      if (args.custom_field_query) query.set("custom_field_query", args.custom_field_query);
      if (args.custom_fields__icontains) query.set("custom_fields__icontains", args.custom_fields__icontains);

      const docsResponse = await api.getDocuments(
        query.toString() ? `?${query.toString()}` : ""
      );
      return convertDocsWithNames(docsResponse, api);
    })
  );

  server.tool(
    "get_document",
    "Get a specific document by ID with full details including correspondent, document type, tags, and custom fields. Note: Document content is excluded from results by default. Use 'get_document_content' to retrieve content when needed.",
    {
      id: z.number(),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const doc = await api.getDocument(args.id);
      return convertDocsWithNames(doc, api);
    })
  );

  server.tool(
    "get_document_content",
    "Get the text content of a specific document by ID. Use this when you need to read or analyze the actual document text.",
    {
      id: z.number(),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const doc = await api.getDocument(args.id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id: doc.id,
              title: doc.title,
              content: doc.content,
            }),
          },
        ],
      };
    })
  );

  server.tool(
    "search_documents",
    "Full text search for documents. This tool is for searching document content, title, and metadata using a full text query. For general document listing or filtering by fields, use 'list_documents' instead. Note: Document content is excluded from results by default. Use 'get_document_content' to retrieve content when needed.",
    {
      query: z.string(),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const docsResponse = await api.searchDocuments(args.query);
      return convertDocsWithNames(docsResponse, api);
    })
  );

  server.tool(
    "download_document",
    "Download a document file by ID. Returns a paperless:// resource URI; read the resource to fetch the file content.",
    {
      id: z.number().int().positive(),
      original: z.boolean().optional(),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const uri = buildDocumentResourceUri(args.id, {
        original: args.original,
      });
      return {
        content: [
          {
            type: "resource",
            resource: {
              uri,
              // MCP SDK 1.11 embedded resources require text or blob. Keep the
              // existing resource-shaped tool result while making resources/read
              // the canonical place for the large binary payload.
              text: "",
              mimeType: "application/octet-stream",
            },
          },
        ],
      };
    })
  );

  server.tool(
    "get_document_thumbnail",
    "Get a document thumbnail (image preview) by ID. Returns a paperless:// resource URI; read the resource to fetch the image content.",
    {
      id: z.number().int().positive(),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      return {
        content: [
          {
            type: "resource",
            resource: {
              uri: buildThumbnailResourceUri(args.id),
              // See download_document above: the binary thumbnail is fetched
              // lazily through resources/read instead of embedded here.
              text: "",
              mimeType: "image/webp",
            },
          },
        ],
      };
    })
  );

  server.tool(
    "update_document",
    "Update a specific document with new values. This tool allows you to modify any document field including title, correspondent, document type, storage path, tags, custom fields, and more. Only the fields you specify will be updated.",
    {
      id: z.number().describe("The ID of the document to update"),
      title: z
        .string()
        .max(128)
        .optional()
        .describe("The new title for the document (max 128 characters)"),
      correspondent: z
        .number()
        .nullable()
        .optional()
        .describe("The ID of the correspondent to assign"),
      document_type: z
        .number()
        .nullable()
        .optional()
        .describe("The ID of the document type to assign"),
      storage_path: z
        .number()
        .nullable()
        .optional()
        .describe("The ID of the storage path to assign"),
      tags: z
        .array(z.number())
        .optional()
        .describe("Array of tag IDs to assign to the document"),
      content: z
        .string()
        .optional()
        .describe("The raw text content of the document (used for searching)"),
      created: z
        .string()
        .optional()
        .describe("The creation date in YYYY-MM-DD format"),
      archive_serial_number: z
        .number()
        .optional()
        .describe("The archive serial number (0-4294967295)"),
      owner: z
        .number()
        .nullable()
        .optional()
        .describe("The ID of the user who owns the document"),
      custom_fields: z
        .array(
          z.object({
            field: z.number().describe("The custom field ID"),
            value: z
              .union([
                z.string(),
                z.number(),
                z.boolean(),
                z.array(z.number()),
                z.null(),
              ])
              .describe(CUSTOM_FIELD_VALUE_DESCRIPTION),
          })
        )
        .optional()
        .describe("Array of custom field values to assign"),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const { id, ...updateData } = args;

      validateCustomFields(updateData.custom_fields);

      const response = await api.updateDocument(id, updateData);

      return convertDocsWithNames(response, api);
    })
  );
}
