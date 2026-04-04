import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp";
import { ZodRawShape } from "zod";

export const withErrorHandling = <Args extends ZodRawShape>(
  cb: ToolCallback<Args>
): ToolCallback<Args> => {
  return (async (args, extra) => {
    try {
      return await cb(args, extra);
    } catch (err: unknown) {
      if (err instanceof Error) {
        throw err;
      }
      throw new Error(String(err));
    }
  }) as ToolCallback<Args>;
};
