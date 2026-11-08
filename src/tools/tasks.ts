import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { withErrorHandling } from "./utils/middlewares";
import { buildQueryString } from "./utils/queryString";

export function registerTaskTools(server: McpServer, api: PaperlessAPI) {
  server.tool(
    "list_tasks",
    "List Paperless consumer-queue tasks, including failed uploads (unsupported file type, duplicate of an existing document, unreadable file). Each task has its status, file name, result message (the failure reason) and related document. Use status FAILURE with acknowledged false to find failures nobody has handled yet.",
    {
      acknowledged: z.boolean().optional(),
      status: z
        .enum([
          "FAILURE",
          "PENDING",
          "RECEIVED",
          "RETRY",
          "REVOKED",
          "STARTED",
          "SUCCESS",
        ])
        .optional(),
      task_name: z
        .enum([
          "consume_file",
          "train_classifier",
          "check_sanity",
          "index_optimize",
        ])
        .optional(),
      type: z.enum(["auto_task", "scheduled_task", "manual_task"]).optional(),
    },
    withErrorHandling(async (args) => {
      if (!api) throw new Error("Please configure API connection first");
      const tasks = await api.getTasks(buildQueryString(args));
      return {
        content: [{ type: "text", text: JSON.stringify(tasks) }],
      };
    })
  );

  server.tool(
    "acknowledge_tasks",
    "Mark tasks as acknowledged (seen and handled) by their numeric task IDs from list_tasks. This only sets the acknowledged flag; it does not delete tasks or retry them. Returns the number of tasks acknowledged.",
    {
      tasks: z.array(z.number().int()).min(1),
    },
    withErrorHandling(async ({ tasks }) => {
      if (!api) throw new Error("Please configure API connection first");
      const result = await api.acknowledgeTasks(tasks);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    })
  );
}
