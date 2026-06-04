import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { MATCHING_ALGORITHM_DESCRIPTION } from "../api/types";
import {
  enhanceMatchingAlgorithm,
  enhanceMatchingAlgorithmArray,
} from "../api/utils";
import { withErrorHandling } from "./utils/middlewares";
import { buildQueryString } from "./utils/queryString";

export function registerStoragePathTools(
  server: McpServer,
  api: PaperlessAPI
) {
  server.tool(
    "list_storage_paths",
    "List all storage paths with optional filtering and pagination. Storage paths define how documents are organized in the filesystem (e.g. '02_Privat/{{ created_year }}/{{ title }}').",
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
      const response = await api.getStoragePaths(queryString);
      const enhancedResults = enhanceMatchingAlgorithmArray(
        response.results || []
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ...response,
              results: enhancedResults,
            }),
          },
        ],
      };
    })
  );

  server.tool(
    "get_storage_path",
    "Get a specific storage path by ID with full details including the path template and matching rules.",
    { id: z.number() },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.getStoragePath(args.id);
      const enhancedStoragePath = enhanceMatchingAlgorithm(response);
      return {
        content: [
          { type: "text", text: JSON.stringify(enhancedStoragePath) },
        ],
      };
    })
  );

  server.tool(
    "create_storage_path",
    "Create a new storage path. The 'path' field is a template string using Django template syntax (e.g. '{{ correspondent }}/{{ created_year }}/{{ title }}'). See the Paperless-NGX docs for available placeholders.",
    {
      name: z.string(),
      path: z
        .string()
        .describe(
          "Storage path template, e.g. '{{ correspondent }}/{{ created_year }}/{{ title }}'"
        ),
      match: z.string().optional(),
      matching_algorithm: z
        .number()
        .int()
        .min(0)
        .max(6)
        .optional()
        .describe(MATCHING_ALGORITHM_DESCRIPTION),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.createStoragePath(args);
      const enhancedStoragePath = enhanceMatchingAlgorithm(response);
      return {
        content: [
          { type: "text", text: JSON.stringify(enhancedStoragePath) },
        ],
      };
    })
  );

  server.tool(
    "update_storage_path",
    "Update an existing storage path's name, path template, matching pattern, or matching algorithm.",
    {
      id: z.number(),
      name: z.string(),
      path: z
        .string()
        .optional()
        .describe(
          "Storage path template, e.g. '{{ correspondent }}/{{ created_year }}/{{ title }}'"
        ),
      match: z.string().optional(),
      matching_algorithm: z
        .number()
        .int()
        .min(0)
        .max(6)
        .optional()
        .describe(MATCHING_ALGORITHM_DESCRIPTION),
    },
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const { id, ...data } = args;
      const response = await api.updateStoragePath(id, data);
      const enhancedStoragePath = enhanceMatchingAlgorithm(response);
      return {
        content: [
          { type: "text", text: JSON.stringify(enhancedStoragePath) },
        ],
      };
    })
  );

  server.tool(
    "delete_storage_path",
    "⚠️ DESTRUCTIVE: Permanently delete a storage path from the entire system. Documents assigned to this storage path will lose the assignment.",
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
      await api.deleteStoragePath(args.id);
      return {
        content: [
          { type: "text", text: JSON.stringify({ status: "deleted" }) },
        ],
      };
    })
  );

  server.tool(
    "bulk_edit_storage_paths",
    "Bulk edit storage paths. ⚠️ WARNING: 'delete' operation permanently removes storage paths from the entire system.",
    {
      storage_path_ids: z.array(z.number()),
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
        args.storage_path_ids,
        "storage_paths",
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
