import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { MATCHING_ALGORITHM_DESCRIPTION } from "../api/types";
import {
  enhanceMatchingAlgorithm,
  enhanceMatchingAlgorithmArray,
} from "../api/utils";
import { Annotations } from "./utils/annotations";
import { withErrorHandling } from "./utils/middlewares";
import { buildQueryString } from "./utils/queryString";

export function registerStoragePathTools(
  server: McpServer,
  api: PaperlessAPI
) {
  server.tool(
    "list_storage_paths",
    "List all storage paths with optional filtering and pagination. Storage paths define where documents are stored on disk.",
    {
      page: z.number().optional(),
      page_size: z.number().optional(),
      name__icontains: z.string().optional(),
      name__iendswith: z.string().optional(),
      name__iexact: z.string().optional(),
      name__istartswith: z.string().optional(),
      ordering: z.string().optional(),
    },
    Annotations.READ,
    withErrorHandling(async (args = {}) => {
      if (!api) throw new Error("Please configure API connection first");
      const queryString = buildQueryString(args);
      const response = await api.getStoragePaths(queryString || undefined);
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
    "Get a specific storage path by ID with full details including matching rules.",
    { id: z.number() },
    Annotations.READ,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.getStoragePath(args.id);
      const enhanced = enhanceMatchingAlgorithm(response);
      return {
        content: [{ type: "text", text: JSON.stringify(enhanced) }],
      };
    })
  );

  server.tool(
    "create_storage_path",
    "Create a new storage path with a name, path template, and optional matching rules.",
    {
      name: z.string(),
      path: z.string().describe("The path template, e.g. '{{ created_year }}/{{ correspondent }}/{{ title }}'"),
      match: z.string().optional(),
      matching_algorithm: z
        .number()
        .int()
        .min(0)
        .max(6)
        .optional()
        .describe(MATCHING_ALGORITHM_DESCRIPTION),
      is_insensitive: z.boolean().optional().describe("Whether matching is case-insensitive"),
    },
    Annotations.CREATE,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.createStoragePath(args);
      const enhanced = enhanceMatchingAlgorithm(response);
      return {
        content: [{ type: "text", text: JSON.stringify(enhanced) }],
      };
    })
  );

  server.tool(
    "update_storage_path",
    "Update an existing storage path. Only specified fields are updated (PATCH).",
    {
      id: z.number(),
      name: z.string().optional(),
      path: z.string().optional().describe("The path template"),
      match: z.string().optional(),
      matching_algorithm: z
        .number()
        .int()
        .min(0)
        .max(6)
        .optional()
        .describe(MATCHING_ALGORITHM_DESCRIPTION),
      is_insensitive: z.boolean().optional().describe("Whether matching is case-insensitive"),
    },
    Annotations.UPDATE,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const { id, ...data } = args;
      const response = await api.updateStoragePath(id, data);
      const enhanced = enhanceMatchingAlgorithm(response);
      return {
        content: [{ type: "text", text: JSON.stringify(enhanced) }],
      };
    })
  );

  server.tool(
    "delete_storage_path",
    "⚠️ DESTRUCTIVE: Permanently delete a storage path from the entire system. This will affect ALL documents that use this storage path.",
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
      await api.deleteStoragePath(args.id);
      return {
        content: [
          { type: "text", text: JSON.stringify({ status: "deleted" }) },
        ],
      };
    })
  );

  server.tool(
    "test_storage_path",
    "Test a storage path template to see how it would resolve for documents. Useful for validating path templates before creating or updating storage paths.",
    {
      name: z.string().describe("Storage path name"),
      path: z
        .string()
        .describe(
          "The path template to test, e.g. '{{ created_year }}/{{ correspondent }}/{{ title }}'"
        ),
      match: z.string().optional(),
      matching_algorithm: z
        .number()
        .int()
        .min(0)
        .max(6)
        .optional()
        .describe(MATCHING_ALGORITHM_DESCRIPTION),
      is_insensitive: z.boolean().optional(),
    },
    Annotations.READ,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request("/storage_paths/test/", {
        method: "POST",
        body: JSON.stringify(args),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );
}
