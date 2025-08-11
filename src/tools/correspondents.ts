import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { withErrorHandling } from "./utils/middlewares";
import { buildQueryString } from "./utils/queryString";

export function registerCorrespondentTools(server: McpServer, api) {
  server.tool(
    "list_correspondents",
    {
      page: z.number().optional(),
      page_size: z.number().optional(),
      name__icontains: z.string().optional(),
      name__iendswith: z.string().optional(),
      name__iexact: z.string().optional(),
      name__istartswith: z.string().optional(),
      ordering: z.string().optional(),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const queryString = buildQueryString(args);
      const response = await api.request(
        `/correspondents/${queryString ? `?${queryString}` : ""}`
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response),
          },
        ],
      };
    })
  );

  server.tool(
    "get_correspondent",
    { id: z.number() },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request(`/correspondents/${args.id}/`);
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "create_correspondent",
    {
      name: z.string(),
      match: z.string().optional(),
      matching_algorithm: z.number().int().min(0).max(6).optional().describe(
        "Matching algorithm: 0=None, 1=Any word, 2=All words, 3=Exact match, 4=Regular expression, 5=Fuzzy word, 6=Automatic"
      )
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.createCorrespondent(args);
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "update_correspondent",
    {
      id: z.number(),
      name: z.string(),
      match: z.string().optional(),
      matching_algorithm: z.number().int().min(0).max(6).optional().describe(
        "Matching algorithm: 0=None, 1=Any word, 2=All words, 3=Exact match, 4=Regular expression, 5=Fuzzy word, 6=Automatic"
      )
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request(`/correspondents/${args.id}/`, {
        method: "PUT",
        body: JSON.stringify(args),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "delete_correspondent",
    "⚠️ DESTRUCTIVE: Permanently delete a correspondent from the entire system. This will affect ALL documents that use this correspondent.",
    {
      id: z.number(),
      confirm: z
        .boolean()
        .describe("Must be true to confirm this destructive operation"),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      if (!args.confirm) {
        throw new Error(
          "Confirmation required for destructive operation. Set confirm: true to proceed."
        );
      }
      await api.request(`/correspondents/${args.id}/`, { method: "DELETE" });
      return {
        content: [
          { type: "text", text: JSON.stringify({ status: "deleted" }) },
        ],
      };
    })
  );

  server.tool(
    "bulk_edit_correspondents",
    "Bulk edit correspondents. ⚠️ WARNING: 'delete' operation permanently removes correspondents from the entire system.",
    {
      correspondent_ids: z.array(z.number()),
      operation: z.enum(["set_permissions", "delete"]),
      confirm: z
        .boolean()
        .optional()
        .describe(
          "Must be true when operation is 'delete' to confirm destructive operation"
        ),
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
        throw new Error(
          "Confirmation required for destructive operation. Set confirm: true to proceed."
        );
      }
      return api.bulkEditObjects(
        args.correspondent_ids,
        "correspondents",
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
