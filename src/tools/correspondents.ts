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

export function registerCorrespondentTools(
  server: McpServer,
  api: PaperlessAPI
) {
  server.tool(
    "list_correspondents",
    "List all correspondents with optional filtering and pagination. Correspondents represent entities that send or receive documents.",
    {
      page: z.number().int().min(1).optional().describe("Page number (1-based)"),
      page_size: z.number().int().min(1).optional().describe("Number of items per page"),
      name__icontains: z.string().optional(),
      name__iendswith: z.string().optional(),
      name__iexact: z.string().optional(),
      name__istartswith: z.string().optional(),
      ordering: z.string().optional(),
      is_empty: z.boolean().optional().describe("Client-side filter: true = only correspondents with 0 documents, false = only with documents"),
    },
    Annotations.READ,
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const { is_empty, ...apiArgs } = args;
      const queryString = buildQueryString(apiArgs);
      const response = await api.getCorrespondents(queryString);
      let results = response.results || [];
      if (is_empty !== undefined) {
        results = results.filter((c) =>
          is_empty ? c.document_count === 0 : c.document_count > 0
        );
      }
      const enhancedResults = enhanceMatchingAlgorithmArray(results);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ...response,
              count: enhancedResults.length,
              results: enhancedResults,
            }),
          },
        ],
      };
    })
  );

  server.tool(
    "get_correspondent",
    "Get a specific correspondent by ID with full details including matching rules.",
    { id: z.number() },
    Annotations.READ,
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.getCorrespondent(args.id);
      const enhancedCorrespondent = enhanceMatchingAlgorithm(response);
      return {
        content: [
          { type: "text", text: JSON.stringify(enhancedCorrespondent) },
        ],
      };
    })
  );

  server.tool(
    "create_correspondent",
    "Create a new correspondent with optional matching pattern and algorithm for automatic document assignment.",
    {
      name: z.string(),
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
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.createCorrespondent(args);
      const enhancedCorrespondent = enhanceMatchingAlgorithm(response);
      return {
        content: [
          { type: "text", text: JSON.stringify(enhancedCorrespondent) },
        ],
      };
    })
  );

  server.tool(
    "update_correspondent",
    "Update an existing correspondent's name, matching pattern, or matching algorithm. Only specified fields are updated (PATCH).",
    {
      id: z.number(),
      name: z.string().optional(),
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
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const { id, ...data } = args;
      const response = await api.updateCorrespondent(id, data);
      const enhancedCorrespondent = enhanceMatchingAlgorithm(response);
      return {
        content: [
          { type: "text", text: JSON.stringify(enhancedCorrespondent) },
        ],
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
    Annotations.DELETE,
    withErrorHandling(async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      if (!args.confirm) {
        throw new Error(
          "Confirmation required for destructive operation. Set confirm: true to proceed."
        );
      }
      await api.deleteCorrespondent(args.id);
      return {
        content: [
          { type: "text", text: JSON.stringify({ status: "deleted" }) },
        ],
      };
    })
  );

  server.tool(
    "bulk_edit_correspondents",
    "Manage correspondent objects themselves (permissions, delete). ⚠️ This does NOT assign correspondents to documents — use bulk_edit_documents with method 'set_correspondent' for that. WARNING: 'delete' permanently removes correspondents from the entire system.",
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
    Annotations.BULK_EDIT,
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
