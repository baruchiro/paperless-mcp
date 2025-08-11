import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { withErrorHandling } from "./utils/middlewares";
import { buildQueryString } from "./utils/queryString";

export function registerTagTools(server: McpServer, api: PaperlessAPI) {
  server.tool(
    "list_tags",
    "List all tags. IMPORTANT: When a user query may refer to a tag or document type, you should fetch all tags and all document types up front (with a large enough page_size), cache them for the session, and search locally for matches by name or slug before making further API calls. This reduces redundant requests and handles ambiguity between tags and document types efficiently.",
    {
      page: z.number().optional(),
      page_size: z.number().optional(),
      name__icontains: z.string().optional(),
      name__iendswith: z.string().optional(),
      name__iexact: z.string().optional(),
      name__istartswith: z.string().optional(),
      ordering: z.string().optional(),
    },
    withErrorHandling(async (args = {}) => {
      if (!api) throw new Error("Please configure API connection first");
      const queryString = buildQueryString(args);
      const tagsResponse = await api.request(
        `/tags/${queryString ? `?${queryString}` : ""}`
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(tagsResponse),
          },
        ],
      };
    })
  );

  server.tool(
    "create_tag",
    {
      name: z.string(),
      color: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .optional(),
      match: z.string().optional(),
      matching_algorithm: z.number().int().min(0).max(6).optional().describe(
        "Matching algorithm: 0=None, 1=Any word, 2=All words, 3=Exact match, 4=Regular expression, 5=Fuzzy word, 6=Automatic"
      )
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const tag = await api.createTag(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(tag),
          },
        ],
      };
    })
  );

  server.tool(
    "update_tag",
    {
      id: z.number(),
      name: z.string(),
      color: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .optional(),
      match: z.string().optional(),
      matching_algorithm: z.number().int().min(0).max(6).optional().describe(
        "Matching algorithm: 0=None, 1=Any word, 2=All words, 3=Exact match, 4=Regular expression, 5=Fuzzy word, 6=Automatic"
      )
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const tag = await api.updateTag(args.id, args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(tag),
          },
        ],
      };
    })
  );

  server.tool(
    "delete_tag",
    "⚠️ DESTRUCTIVE: Permanently delete a tag from the entire system. This will remove the tag from ALL documents that use it. Use with extreme caution.",
    {
      id: z.number(),
      confirm: z.boolean().describe("Must be true to confirm this destructive operation"),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      if (!args.confirm) {
        throw new Error("Confirmation required for destructive operation. Set confirm: true to proceed.");
      }
      await api.deleteTag(args.id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status: "deleted" }),
          },
        ],
      };
    })
  );

  server.tool(
    "bulk_edit_tags",
    "Bulk edit tags. ⚠️ WARNING: 'delete' operation permanently removes tags from the entire system. Use with caution.",
    {
      tag_ids: z.array(z.number()),
      operation: z.enum(["set_permissions", "delete"]),
      confirm: z.boolean().optional().describe("Must be true when operation is 'delete' to confirm destructive operation"),
      owner: z.number().optional(),
      permissions: z
        .object({
          view: z.object({
            users: z.array(z.number()).optional(),
            groups: z.array(z.number()).optional(),
          }),
          change: z.object({
            users: z.array(z.number()).optional(),
            groups: z.array(z.number()).optional(),
          }),
        })
        .optional(),
      merge: z.boolean().optional(),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      if (args.operation === "delete" && !args.confirm) {
        throw new Error("Confirmation required for destructive operation. Set confirm: true to proceed.");
      }
      return api.bulkEditObjects(
        args.tag_ids,
        "tags",
        args.operation,
        args.operation === "set_permissions"
          ? {
              owner: args.owner,
              permissions: args.permissions,
              merge: args.merge,
            }
          : {}
      );
    })
  );
}
