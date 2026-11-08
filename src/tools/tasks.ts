import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { withErrorHandling } from "./utils/middlewares";
import { buildQueryString } from "./utils/queryString";

// Paperless 3.x validates the status filter against lowercase values, while
// 2.x only accepts uppercase ones.
function isStatusChoiceError(err: unknown): boolean {
  const data = (err as any)?.response?.data;
  return (
    (err as any)?.response?.status === 400 &&
    Array.isArray(data?.status) &&
    data.status.some((m: unknown) =>
      String(m).includes("is not one of the available choices")
    )
  );
}

export function registerTaskTools(server: McpServer, api: PaperlessAPI) {
  server.tool(
    "list_tasks",
    "List Paperless consumer-queue tasks, including failed uploads (unsupported file type, duplicate of an existing document, unreadable file). Each task has its status, result message (the failure reason), and, for uploads, the file name and related document; these two can be null for other tasks. Use status failure with acknowledged false to find failures nobody has handled yet.",
    {
      acknowledged: z.boolean().optional(),
      status: z
        .enum([
          "failure",
          "pending",
          "received",
          "retry",
          "revoked",
          "started",
          "success",
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
    withErrorHandling(async ({ status, ...filters }) => {
      if (!api) throw new Error("Please configure API connection first");
      const getTasks = (statusValue?: string) =>
        api.getTasks(buildQueryString({ ...filters, status: statusValue }));
      let tasks;
      try {
        tasks = await getTasks(status);
      } catch (err) {
        if (!status || !isStatusChoiceError(err)) throw err;
        tasks = await getTasks(status.toUpperCase());
      }
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
