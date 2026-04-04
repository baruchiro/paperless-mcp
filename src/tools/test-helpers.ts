import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { PaperlessAPI } from "../api/PaperlessAPI";

/**
 * Captures tool registrations from server.tool() calls.
 * Instead of a real McpServer, we intercept registrations to test tool logic directly.
 */
export interface RegisteredTool {
  name: string;
  description: string;
  schema: unknown;
  callback: (args: Record<string, unknown>, extra?: unknown) => Promise<CallToolResult>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMockServer(): {
  server: any;
  tools: Map<string, RegisteredTool>;
} {
  const tools = new Map<string, RegisteredTool>();

  const server = {
    tool(
      name: string,
      description: string,
      schema: unknown,
      annotationsOrCallback: unknown,
      maybeCallback?: unknown
    ) {
      const callback = (maybeCallback ?? annotationsOrCallback) as RegisteredTool["callback"];
      tools.set(name, { name, description, schema, callback });
    },
  };

  return { server, tools };
}

/**
 * Creates a mock PaperlessAPI where every method can be overridden.
 * By default all methods throw "not mocked".
 */
export function createMockApi(
  overrides: Partial<Record<keyof PaperlessAPI, Function>> = {}
): PaperlessAPI {
  const handler: ProxyHandler<PaperlessAPI> = {
    get(_target, prop: string) {
      if (prop in overrides) {
        return overrides[prop as keyof typeof overrides];
      }
      return () => {
        throw new Error(`API method '${prop}' was not mocked`);
      };
    },
  };
  return new Proxy({} as PaperlessAPI, handler);
}

/**
 * Helper to extract text content from a tool result.
 */
export function getTextContent(result: CallToolResult): unknown {
  const textItem = result.content.find((c) => c.type === "text");
  return textItem && "text" in textItem ? JSON.parse(textItem.text) : null;
}

/**
 * Helper to extract resource content from a tool result.
 */
export function getResourceContent(result: CallToolResult): unknown {
  const item = result.content.find((c) => c.type === "resource");
  return item && "resource" in item ? item.resource : null;
}
