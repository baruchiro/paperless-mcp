import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { convertDocsWithNames } from "../api/documentEnhancer";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { arrayNotEmpty, objectNotEmpty } from "./utils/empty";
import { withErrorHandling } from "./utils/middlewares";

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
              z.record(z.unknown()),
              z.null(),
            ]),
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
      const { documents, method, add_custom_fields, ...parameters } = args;

      // Transform add_custom_fields into the two separate API parameters
      const apiParameters = { ...parameters };
      if (add_custom_fields && add_custom_fields.length > 0) {
        apiParameters.assign_custom_fields = add_custom_fields.map(
          (cf) => cf.field
        );
        apiParameters.assign_custom_fields_values = add_custom_fields;
      }

      const response = await api.bulkEditDocuments(
        documents,
        method,
        apiParameters
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
      archive_serial_number: z.string().optional(),
      custom_fields: z.array(z.number()).optional(),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const binaryData = Buffer.from(args.file, "base64");
      const blob = new Blob([binaryData]);
      const file = new File([blob], args.filename);
      const { file: _, filename: __, ...metadata } = args;
      const response = await api.postDocument(file, metadata);
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
    "List and filter documents by fields such as title, correspondent, document type, tag, storage path, creation date, and more. IMPORTANT: For queries like 'the last 3 contributions' or when searching by tag, correspondent, document type, or storage path, you should FIRST use the relevant tool (e.g., 'list_tags', 'list_correspondents', 'list_document_types', 'list_storage_paths') to find the correct ID, and then use that ID as a filter here. Only use the 'search' argument for free-text search when no specific field applies. Using the correct ID filter will yield much more accurate results.",
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

      const docsResponse = await api.getDocuments(
        query.toString() ? `?${query.toString()}` : ""
      );
      return convertDocsWithNames(docsResponse, api);
    })
  );

  server.tool(
    "get_document",
    "Get a specific document by ID with full details including correspondent, document type, tags, and custom fields.",
    {
      id: z.number(),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const doc = await api.getDocument(args.id);
      const [correspondents, documentTypes, tags, customFields] =
        await Promise.all([
          api.getCorrespondents(),
          api.getDocumentTypes(),
          api.getTags(),
          api.getCustomFields(),
        ]);
      const correspondentMap = new Map(
        (correspondents.results || []).map((c) => [c.id, c.name])
      );
      const documentTypeMap = new Map(
        (documentTypes.results || []).map((dt) => [dt.id, dt.name])
      );
      const tagMap = new Map(
        (tags.results || []).map((tag) => [tag.id, tag.name])
      );
      const customFieldMap = new Map(
        (customFields.results || []).map((cf) => [cf.id, cf.name])
      );
      const docWithNames = {
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
                documentTypeMap.get(doc.document_type) ||
                String(doc.document_type),
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
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(docWithNames),
          },
        ],
      };
    })
  );

  server.tool(
    "search_documents",
    "Full text search for documents. This tool is for searching document content, title, and metadata using a full text query. For general document listing or filtering by fields, use 'list_documents' instead.",
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
    "Download a document file by ID. Returns the document as a base64-encoded resource.",
    {
      id: z.number(),
      original: z.boolean().optional(),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.downloadDocument(args.id, args.original);
      const filename =
        (typeof response.headers.get === "function"
          ? response.headers.get("content-disposition")
          : response.headers["content-disposition"]
        )
          ?.split("filename=")[1]
          ?.replace(/"/g, "") || `document-${args.id}`;
      return {
        content: [
          {
            type: "resource",
            resource: {
              uri: filename,
              blob: Buffer.from(response.data).toString("base64"),
              mimeType: "application/pdf",
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
                z.record(z.unknown()),
                z.null(),
              ])
              .describe(
                "The value for the custom field. For documentlink fields, use a single document ID (e.g., 123) or an array of document IDs (e.g., [123, 456])."
              ),
          })
        )
        .optional()
        .describe("Array of custom field values to assign"),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const { id, ...updateData } = args;
      const response = await api.updateDocument(id, updateData);

      return convertDocsWithNames(response, api);
    })
  );
}
