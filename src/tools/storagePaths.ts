import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { withErrorHandling } from "./utils/middlewares";
import { buildQueryString } from "./utils/queryString";

export function registerStoragePathTools(server: McpServer, api: PaperlessAPI) {
  server.tool(
    "list_storage_paths",
    "List storage paths with optional filtering and pagination. Returns one page of path IDs, names, path templates and matching rules without modifying storage paths or documents.",
    {
      page: z.number().int().positive().optional(),
      page_size: z.number().int().positive().optional(),
      id: z.number().int().optional(),
      id__in: z.array(z.number().int()).optional(),
      full_perms: z.boolean().optional(),
      name__icontains: z.string().optional(),
      name__iendswith: z.string().optional(),
      name__iexact: z.string().optional(),
      name__istartswith: z.string().optional(),
      path__icontains: z.string().optional(),
      path__iendswith: z.string().optional(),
      path__iexact: z.string().optional(),
      path__istartswith: z.string().optional(),
      ordering: z.string().optional(),
    },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.getStoragePaths(buildQueryString(args));
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );
}
