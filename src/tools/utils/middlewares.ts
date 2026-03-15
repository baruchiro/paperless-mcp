import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp";
import { ZodRawShape } from "zod";

export const withErrorHandling = <Args extends ZodRawShape>(
  cb: ToolCallback<Args>
): ToolCallback<Args> => {
  return (async (args, extra) => {
    try {
      return await cb(args, extra);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(errorMessage);
    }
  }) as ToolCallback<Args>;
};
