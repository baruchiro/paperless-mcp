import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { Annotations } from "./utils/annotations";
import { arrayNotEmpty } from "./utils/empty";
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
    Annotations.READ,
    withErrorHandling(async (args = {}) => {
      if (!api) throw new Error("Please configure API connection first");
      const queryString = buildQueryString(args);
      const response = await api.getSavedViews(queryString || undefined);
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "get_saved_view",
    "Get a specific saved view by ID with full details including filter rules.",
    { id: z.number() },
    Annotations.READ,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.getSavedView(args.id);
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
        .optional()
        .transform(arrayNotEmpty),
    },
    Annotations.CREATE,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.createSavedView(args);
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
        .optional()
        .transform(arrayNotEmpty),
    },
    Annotations.UPDATE,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const { id, ...data } = args;
      const response = await api.updateSavedView(id, data);
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
    Annotations.DELETE,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      if (!args.confirm) {
        throw new Error(
          "Confirmation required for destructive operation. Set confirm: true to proceed."
        );
      }
      await api.deleteSavedView(args.id);
      return {
        content: [
          { type: "text", text: JSON.stringify({ status: "deleted" }) },
        ],
      };
    })
  );
}
