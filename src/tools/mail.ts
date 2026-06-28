import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { READ_ONLY, WRITE, DESTRUCTIVE } from "./utils/annotations";
import { withErrorHandling } from "./utils/middlewares";
import { buildQueryString } from "./utils/queryString";

const MAIL_RULE_ACTION_DESCRIPTION =
  "Mail rule action: 1=Delete, 2=Move to specified folder, 3=Mark as read/don't process read mails, 4=Flag/don't process flagged mails, 5=Tag/don't process tagged mails";
const ASSIGN_TITLE_FROM_DESCRIPTION =
  "Title assignment: 1=Use subject as title, 2=Use attachment filename as title, 3=Do not assign title from rule";
const ASSIGN_CORRESPONDENT_FROM_DESCRIPTION =
  "Correspondent assignment: 1=Do not assign, 2=Use mail address, 3=Use sender name or address, 4=Use assign_correspondent";
const ATTACHMENT_TYPE_DESCRIPTION =
  "Attachment type: 1=Only process attachments, 2=Process all files including inline attachments";
const CONSUMPTION_SCOPE_DESCRIPTION =
  "Consumption scope: 1=Only process attachments, 2=Process full mail as .eml, 3=Process full mail and attachments separately";
const PDF_LAYOUT_DESCRIPTION =
  "PDF layout for full-mail consumption: 0=System default, 1=Text then HTML, 2=HTML then text, 3=HTML only, 4=Text only";

const mailRuleFields = {
  name: z.string().optional(),
  account: z.number().int().optional(),
  enabled: z.boolean().optional(),
  folder: z.string().optional(),
  filter_from: z.string().nullable().optional(),
  filter_to: z.string().nullable().optional(),
  filter_subject: z.string().nullable().optional(),
  filter_body: z.string().nullable().optional(),
  filter_attachment_filename_include: z.string().nullable().optional(),
  filter_attachment_filename_exclude: z.string().nullable().optional(),
  maximum_age: z.number().int().min(0).optional(),
  action: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe(MAIL_RULE_ACTION_DESCRIPTION),
  action_parameter: z.string().nullable().optional(),
  assign_title_from: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .describe(ASSIGN_TITLE_FROM_DESCRIPTION),
  assign_tags: z.array(z.number().int().nullable()).optional(),
  assign_correspondent_from: z
    .number()
    .int()
    .min(1)
    .max(4)
    .optional()
    .describe(ASSIGN_CORRESPONDENT_FROM_DESCRIPTION),
  assign_correspondent: z.number().int().nullable().optional(),
  assign_document_type: z.number().int().nullable().optional(),
  assign_owner_from_rule: z.boolean().optional(),
  order: z.number().int().optional(),
  attachment_type: z
    .number()
    .int()
    .min(1)
    .max(2)
    .optional()
    .describe(ATTACHMENT_TYPE_DESCRIPTION),
  consumption_scope: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .describe(CONSUMPTION_SCOPE_DESCRIPTION),
  pdf_layout: z
    .number()
    .int()
    .min(0)
    .max(4)
    .optional()
    .describe(PDF_LAYOUT_DESCRIPTION),
  owner: z.number().int().nullable().optional(),
} as const;

export function registerMailTools(server: McpServer, api: PaperlessAPI) {
  server.tool(
    "list_mail_accounts",
    "List Paperless mail accounts for selecting the account ID needed by mail rules. Does not expose account passwords.",
    {
      page: z.number().optional(),
      page_size: z.number().optional(),
    },
    READ_ONLY,
    withErrorHandling(async (args = {}) => {
      if (!api) throw new Error("Please configure API connection first");
      const queryString = buildQueryString(args);
      const response = await api.getMailAccounts(queryString);
      const sanitizedResults = (response.results || []).map((account) => ({
        ...account,
        password: undefined,
      }));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ...response, results: sanitizedResults }),
          },
        ],
      };
    })
  );

  server.tool(
    "get_mail_account",
    "Get one Paperless mail account by ID. Password/token fields are redacted if the server returns them.",
    { id: z.number().int() },
    READ_ONLY,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const { password, ...account } = await api.getMailAccount(args.id);
      return {
        content: [{ type: "text", text: JSON.stringify(account) }],
      };
    })
  );

  server.tool(
    "process_mail_account",
    "Manually run Paperless mail processing for one account. This can consume matching mails according to enabled Paperless mail rules.",
    { id: z.number().int() },
    WRITE,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      await api.processMailAccount(args.id);
      return {
        content: [
          { type: "text", text: JSON.stringify({ status: "processed" }) },
        ],
      };
    })
  );

  server.tool(
    "list_mail_rules",
    "List Paperless mail rules with optional pagination.",
    {
      page: z.number().optional(),
      page_size: z.number().optional(),
    },
    READ_ONLY,
    withErrorHandling(async (args = {}) => {
      if (!api) throw new Error("Please configure API connection first");
      const queryString = buildQueryString(args);
      const response = await api.getMailRules(queryString);
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "get_mail_rule",
    "Get one Paperless mail rule by ID.",
    { id: z.number().int() },
    READ_ONLY,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.getMailRule(args.id);
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "create_mail_rule",
    "Create a Paperless mail rule. Use list_mail_accounts first to choose account. Prefer attachment-only rules for invoices unless the full mail must be archived.",
    {
      ...mailRuleFields,
      name: z.string(),
      account: z.number().int(),
      folder: z.string(),
    },
    WRITE,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.createMailRule(args);
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "update_mail_rule",
    "Patch an existing Paperless mail rule. Only supplied fields are changed.",
    {
      id: z.number().int(),
      ...mailRuleFields,
    },
    WRITE,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const { id, ...data } = args;
      const response = await api.updateMailRule(id, data);
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    })
  );

  server.tool(
    "delete_mail_rule",
    "Delete one Paperless mail rule. This changes future mail ingestion behavior but does not delete documents.",
    {
      id: z.number().int(),
      confirm: z
        .boolean()
        .describe("Must be true to confirm deleting the rule"),
    },
    DESTRUCTIVE,
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      if (!args.confirm) {
        throw new Error(
          "Confirmation required. Set confirm: true to delete the mail rule."
        );
      }
      await api.deleteMailRule(args.id);
      return {
        content: [
          { type: "text", text: JSON.stringify({ status: "deleted" }) },
        ],
      };
    })
  );
}
