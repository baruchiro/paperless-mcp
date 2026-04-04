import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { Annotations } from "./utils/annotations";
import { withErrorHandling } from "./utils/middlewares";
import { buildQueryString } from "./utils/queryString";

export function registerShareLinkTools(server: McpServer, api: PaperlessAPI) {
  server.tool(
    "list_share_links",
    "List all share links with optional filtering by creation date, expiration date, and pagination.",
    {
      page: z.number().optional(),
      page_size: z.number().optional(),
      ordering: z.string().optional(),
    },
    Annotations.READ,
    withErrorHandling(async (args = {}) => {
      if (!api) throw new Error("Please configure API connection first");
      const queryString = buildQueryString(args);
      const response = await api.request(
        `/share_links/${queryString ? `?${queryString}` : ""}`
      );
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "get_share_link",
    "Get a specific share link by ID with full details.",
    { id: z.number() },
    Annotations.READ,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request(`/share_links/${args.id}/`);
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "create_share_link",
    "Create a share link for a document. Optionally set an expiration date and file version (archive or original).",
    {
      document: z.number().describe("The document ID to share"),
      expiration: z
        .string()
        .nullable()
        .optional()
        .describe("Expiration date-time in ISO format, or null for no expiry"),
      file_version: z
        .enum(["archive", "original"])
        .optional()
        .describe("Which file version to share (default: archive)"),
    },
    Annotations.CREATE,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request("/share_links/", {
        method: "POST",
        body: JSON.stringify(args),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "update_share_link",
    "Update an existing share link's expiration or file version.",
    {
      id: z.number(),
      expiration: z
        .string()
        .nullable()
        .optional()
        .describe("Expiration date-time in ISO format, or null for no expiry"),
      file_version: z
        .enum(["archive", "original"])
        .optional()
        .describe("Which file version to share"),
    },
    Annotations.UPDATE,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const { id, ...data } = args;
      const response = await api.request(`/share_links/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "delete_share_link",
    "⚠️ DESTRUCTIVE: Permanently delete a share link. The shared URL will stop working.",
    {
      id: z.number(),
      confirm: z
        .boolean()
        .describe("Must be true to confirm this destructive operation"),
    },
    Annotations.DELETE,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      if (!args.confirm) {
        throw new Error(
          "Confirmation required for destructive operation. Set confirm: true to proceed."
        );
      }
      await api.request(`/share_links/${args.id}/`, { method: "DELETE" });
      return {
        content: [
          { type: "text", text: JSON.stringify({ status: "deleted" }) },
        ],
      };
    })
  );

  server.tool(
    "list_document_share_links",
    "List all share links for a specific document.",
    {
      id: z.number().describe("The document ID"),
    },
    Annotations.READ,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request(
        `/documents/${args.id}/share_links/`
      );
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );
}
