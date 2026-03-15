import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { withErrorHandling } from "./utils/middlewares";
import { buildQueryString } from "./utils/queryString";

export function registerSavedViewTools(server: McpServer, api: PaperlessAPI) {
  server.tool(
    "list_saved_views",
    "List all saved views with optional pagination. Saved views store filter/sort configurations for quick access.",
    {
      page: z.number().optional(),
      page_size: z.number().optional(),
    },
    withErrorHandling(async (args = {}) => {
      if (!api) throw new Error("Please configure API connection first");
      const queryString = buildQueryString(args);
      const response = await api.request(
        `/saved_views/${queryString ? `?${queryString}` : ""}`
      );
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "get_saved_view",
    "Get a specific saved view by ID with full details including filter rules.",
    { id: z.number() },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request(`/saved_views/${args.id}/`);
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "create_saved_view",
    "Create a new saved view with filter rules and sort configuration.",
    {
      name: z.string(),
      show_on_dashboard: z.boolean().optional(),
      show_in_sidebar: z.boolean().optional(),
      sort_field: z.string().optional().describe("Field to sort by, e.g. 'created', 'title', 'correspondent__name'"),
      sort_reverse: z.boolean().optional(),
      filter_rules: z
        .array(
          z.object({
            rule_type: z.number().describe("The filter rule type ID"),
            value: z.string().describe("The filter value"),
          })
        )
        .optional(),
    },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request("/saved_views/", {
        method: "POST",
        body: JSON.stringify(args),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "update_saved_view",
    "Update an existing saved view. Only specified fields are updated (PATCH).",
    {
      id: z.number(),
      name: z.string().optional(),
      show_on_dashboard: z.boolean().optional(),
      show_in_sidebar: z.boolean().optional(),
      sort_field: z.string().optional(),
      sort_reverse: z.boolean().optional(),
      filter_rules: z
        .array(
          z.object({
            rule_type: z.number(),
            value: z.string(),
          })
        )
        .optional(),
    },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const { id, ...data } = args;
      const response = await api.request(`/saved_views/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "delete_saved_view",
    "⚠️ DESTRUCTIVE: Permanently delete a saved view.",
    {
      id: z.number(),
      confirm: z.boolean().describe("Must be true to confirm this destructive operation"),
    },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      if (!args.confirm) {
        throw new Error(
          "Confirmation required for destructive operation. Set confirm: true to proceed."
        );
      }
      await api.request(`/saved_views/${args.id}/`, {
        method: "DELETE",
      });
      return {
        content: [
          { type: "text", text: JSON.stringify({ status: "deleted" }) },
        ],
      };
    })
  );
}
