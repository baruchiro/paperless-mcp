import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { withErrorHandling } from "./utils/middlewares";
import { buildQueryString } from "./utils/queryString";

export function registerSystemTools(server: McpServer, api: PaperlessAPI) {
  // Statistics
  server.tool(
    "get_statistics",
    "Get system statistics including document counts, inbox status, file type breakdown, and storage information.",
    {},
    withErrorHandling(async () => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request("/statistics/");
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  // Document Suggestions
  server.tool(
    "get_document_suggestions",
    "Get AI-powered suggestions for a document's correspondent, tags, and document type based on its content.",
    { id: z.number().describe("The document ID to get suggestions for") },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request(`/documents/${args.id}/suggestions/`);
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  // Document Metadata
  server.tool(
    "get_document_metadata",
    "Get file metadata for a document including checksums, file sizes, and archival information.",
    { id: z.number().describe("The document ID") },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request(`/documents/${args.id}/metadata/`);
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  // Document Notes
  server.tool(
    "list_document_notes",
    "List all notes for a specific document.",
    { id: z.number().describe("The document ID") },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request(`/documents/${args.id}/notes/`);
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "create_document_note",
    "Add a note to a document.",
    {
      id: z.number().describe("The document ID"),
      note: z.string().describe("The note text to add"),
    },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request(`/documents/${args.id}/notes/`, {
        method: "POST",
        body: JSON.stringify({ note: args.note }),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "delete_document_note",
    "⚠️ DESTRUCTIVE: Delete a note from a document.",
    {
      id: z.number().describe("The document ID"),
      note_id: z.number().describe("The note ID to delete"),
      confirm: z.boolean().describe("Must be true to confirm this destructive operation"),
    },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      if (!args.confirm) {
        throw new Error(
          "Confirmation required for destructive operation. Set confirm: true to proceed."
        );
      }
      await api.request(`/documents/${args.id}/notes/?id=${args.note_id}`, {
        method: "DELETE",
      });
      return {
        content: [
          { type: "text", text: JSON.stringify({ status: "deleted" }) },
        ],
      };
    })
  );

  // Trash management
  server.tool(
    "list_trash",
    "List documents in the trash (soft-deleted documents).",
    {
      page: z.number().optional(),
      page_size: z.number().optional(),
    },
    withErrorHandling(async (args = {}) => {
      if (!api) throw new Error("Please configure API connection first");
      const queryString = buildQueryString(args);
      const response = await api.request(
        `/trash/${queryString ? `?${queryString}` : ""}`
      );
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "restore_from_trash",
    "Restore documents from the trash back to the system.",
    {
      documents: z.array(z.number()).describe("Array of document IDs to restore"),
    },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request("/trash/", {
        method: "POST",
        body: JSON.stringify({
          documents: args.documents,
          action: "restore",
        }),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "empty_trash",
    "⚠️ DESTRUCTIVE: Permanently delete documents from the trash. This action is irreversible.",
    {
      documents: z.array(z.number()).describe("Array of document IDs to permanently delete"),
      confirm: z.boolean().describe("Must be true to confirm this destructive operation"),
    },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      if (!args.confirm) {
        throw new Error(
          "Confirmation required for destructive operation. Set confirm: true to proceed."
        );
      }
      const response = await api.request("/trash/", {
        method: "POST",
        body: JSON.stringify({
          documents: args.documents,
          action: "delete",
        }),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  // Search Autocomplete
  server.tool(
    "search_autocomplete",
    "Get search term autocomplete suggestions based on the document index.",
    {
      term: z.string().describe("The partial search term to autocomplete"),
      limit: z.number().optional().describe("Maximum number of suggestions (default 10)"),
    },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const params = new URLSearchParams({ term: args.term });
      if (args.limit) params.set("limit", args.limit.toString());
      const response = await api.request(
        `/search/autocomplete/?${params.toString()}`
      );
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  // Next ASN
  server.tool(
    "get_next_asn",
    "Get the next available Archive Serial Number (ASN) for document filing.",
    {},
    withErrorHandling(async () => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request("/documents/next_asn/");
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  // Tasks
  server.tool(
    "list_tasks",
    "List background tasks with their status, progress, and results. Useful for monitoring document consumption and other async operations.",
    {
      task_id: z.string().optional().describe("Filter by specific task UUID"),
    },
    withErrorHandling(async (args = {}) => {
      if (!api) throw new Error("Please configure API connection first");
      const params = new URLSearchParams();
      if (args.task_id) params.set("task_id", args.task_id);
      const query = params.toString();
      const response = await api.request(
        `/tasks/${query ? `?${query}` : ""}`
      );
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "acknowledge_tasks",
    "Acknowledge/dismiss completed tasks to clear them from the task list.",
    {
      tasks: z.array(z.number()).describe("Array of task IDs to acknowledge"),
    },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request("/tasks/acknowledge/", {
        method: "POST",
        body: JSON.stringify({ tasks: args.tasks }),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  // Bulk Download
  server.tool(
    "bulk_download",
    "Download multiple documents as a ZIP archive. Returns base64-encoded ZIP file.",
    {
      documents: z.array(z.number()).describe("Array of document IDs to download"),
      content: z
        .enum(["both", "originals", "archive"])
        .optional()
        .describe("Which file versions to include (default: both)"),
      compression: z
        .enum(["none", "lzma", "bzip2", "deflated"])
        .optional()
        .describe("ZIP compression method (default: none)"),
      follow_formatting: z
        .boolean()
        .optional()
        .describe("Use document storage path formatting for filenames"),
    },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const { documents, ...options } = args;
      const response = await api.requestRaw("/documents/bulk_download/", {
        method: "POST",
        body: JSON.stringify({ documents, ...options }),
        responseType: "arraybuffer",
      });
      return {
        content: [
          {
            type: "resource",
            resource: {
              uri: "bulk-download.zip",
              blob: Buffer.from(response.data).toString("base64"),
              mimeType: "application/zip",
            },
          },
        ],
      };
    })
  );
}
