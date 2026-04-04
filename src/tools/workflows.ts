import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { MATCHING_ALGORITHM_DESCRIPTION } from "../api/types";
import { Annotations } from "./utils/annotations";
import { withErrorHandling } from "./utils/middlewares";
import { buildQueryString } from "./utils/queryString";

const workflowActionFields = {
  assign_title: z.string().max(256).nullable().optional(),
  assign_tags: z.array(z.number()).nullable().optional(),
  assign_correspondent: z.number().nullable().optional(),
  assign_document_type: z.number().nullable().optional(),
  assign_storage_path: z.number().nullable().optional(),
  assign_owner: z.number().nullable().optional(),
  assign_view_users: z.array(z.number()).optional(),
  assign_view_groups: z.array(z.number()).optional(),
  assign_change_users: z.array(z.number()).optional(),
  assign_change_groups: z.array(z.number()).optional(),
  assign_custom_fields: z.array(z.number()).optional(),
  remove_all_tags: z.boolean().optional(),
  remove_tags: z.array(z.number()).optional(),
  remove_all_correspondents: z.boolean().optional(),
  remove_all_document_types: z.boolean().optional(),
  remove_all_storage_paths: z.boolean().optional(),
  remove_custom_fields: z.array(z.number()).optional(),
  remove_all_custom_fields: z.boolean().optional(),
  remove_all_owners: z.boolean().optional(),
  remove_all_permissions: z.boolean().optional(),
  email: z
    .object({
      subject: z.string(),
      body: z.string(),
      to: z.string().describe("Comma-separated email addresses"),
      include_document: z.boolean().optional(),
    })
    .nullable()
    .optional()
    .describe("Email configuration for email-type actions"),
  webhook: z
    .object({
      url: z.string(),
      use_params: z.boolean().optional(),
      params: z.record(z.string()).optional(),
      headers: z.record(z.string()).optional(),
      body: z.string().optional(),
    })
    .nullable()
    .optional()
    .describe("Webhook configuration for webhook-type actions"),
};

const workflowTriggerFields = {
  sources: z
    .array(z.number())
    .optional()
    .describe(
      "Source types: 1=consume_folder, 2=api_upload, 3=mail_fetch, 4=ui_upload (default: [1,2,3])"
    ),
  filter_path: z.string().max(256).nullable().optional(),
  filter_filename: z
    .string()
    .max(256)
    .nullable()
    .optional()
    .describe("Filename pattern to match"),
  filter_mailrule: z.number().nullable().optional(),
  matching_algorithm: z
    .number()
    .int()
    .min(0)
    .max(6)
    .optional()
    .describe(MATCHING_ALGORITHM_DESCRIPTION),
  match: z.string().max(256).optional(),
  is_insensitive: z.boolean().optional(),
  filter_has_tags: z.array(z.number()).optional(),
  filter_has_correspondent: z.number().nullable().optional(),
  filter_has_document_type: z.number().nullable().optional(),
  schedule_offset_days: z.number().optional(),
  schedule_is_recurring: z.boolean().optional(),
  schedule_recurring_interval_days: z.number().min(1).optional(),
  schedule_date_field: z.string().optional(),
  schedule_date_custom_field: z.number().nullable().optional(),
};

export function registerWorkflowTools(server: McpServer, api: PaperlessAPI) {
  server.tool(
    "list_workflow_actions",
    "List all workflow actions with optional pagination.",
    {
      page: z.number().optional(),
      page_size: z.number().optional(),
    },
    Annotations.READ,
    withErrorHandling(async (args = {}) => {
      if (!api) throw new Error("Please configure API connection first");
      const queryString = buildQueryString(args);
      const response = await api.request(
        `/workflow_actions/${queryString ? `?${queryString}` : ""}`
      );
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "get_workflow_action",
    "Get a specific workflow action by ID.",
    { id: z.number() },
    Annotations.READ,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request(`/workflow_actions/${args.id}/`);
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "create_workflow_action",
    "Create a new workflow action. Actions define what happens when a workflow is triggered (e.g., assign tags, set correspondent, send email).",
    {
      type: z
        .number()
        .describe("Action type: 1=assignment, 2=removal, 3=email, 4=webhook"),
      ...workflowActionFields,
    },
    Annotations.CREATE,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request("/workflow_actions/", {
        method: "POST",
        body: JSON.stringify(args),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "update_workflow_action",
    "Update an existing workflow action. Only specified fields are updated (PATCH).",
    {
      id: z.number(),
      type: z.number().optional(),
      ...workflowActionFields,
    },
    Annotations.UPDATE,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const { id, ...data } = args;
      const response = await api.request(`/workflow_actions/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "delete_workflow_action",
    "⚠️ DESTRUCTIVE: Permanently delete a workflow action.",
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
      await api.request(`/workflow_actions/${args.id}/`, {
        method: "DELETE",
      });
      return {
        content: [
          { type: "text", text: JSON.stringify({ status: "deleted" }) },
        ],
      };
    })
  );

  server.tool(
    "list_workflow_triggers",
    "List all workflow triggers with optional pagination.",
    {
      page: z.number().optional(),
      page_size: z.number().optional(),
    },
    Annotations.READ,
    withErrorHandling(async (args = {}) => {
      if (!api) throw new Error("Please configure API connection first");
      const queryString = buildQueryString(args);
      const response = await api.request(
        `/workflow_triggers/${queryString ? `?${queryString}` : ""}`
      );
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "get_workflow_trigger",
    "Get a specific workflow trigger by ID.",
    { id: z.number() },
    Annotations.READ,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request(`/workflow_triggers/${args.id}/`);
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "create_workflow_trigger",
    "Create a new workflow trigger. Triggers define when a workflow executes (e.g., on document consumption, on update, on a schedule).",
    {
      type: z
        .number()
        .describe(
          "Trigger type: 1=consumption, 2=document_added, 3=document_updated, 4=scheduled"
        ),
      ...workflowTriggerFields,
    },
    Annotations.CREATE,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.request("/workflow_triggers/", {
        method: "POST",
        body: JSON.stringify(args),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "update_workflow_trigger",
    "Update an existing workflow trigger. Only specified fields are updated (PATCH).",
    {
      id: z.number(),
      type: z.number().optional(),
      ...workflowTriggerFields,
    },
    Annotations.UPDATE,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const { id, ...data } = args;
      const response = await api.request(`/workflow_triggers/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "delete_workflow_trigger",
    "⚠️ DESTRUCTIVE: Permanently delete a workflow trigger.",
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
      await api.request(`/workflow_triggers/${args.id}/`, {
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
