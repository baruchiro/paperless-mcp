import { PaperlessAPI } from "../api/PaperlessAPI";

/**
 * Captures tool registrations from server.tool() calls.
 * Instead of a real McpServer, we intercept registrations to test tool logic directly.
 */
export interface RegisteredTool {
  name: string;
  description: string;
  schema: any;
  callback: (args: any, extra?: any) => Promise<any>;
}

export function createMockServer(): {
  server: any;
  tools: Map<string, RegisteredTool>;
} {
  const tools = new Map<string, RegisteredTool>();

  const server = {
    tool(
      name: string,
      description: string,
      schema: any,
      annotationsOrCallback: any,
      maybeCallback?: any
    ) {
      const callback = maybeCallback ?? annotationsOrCallback;
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
  overrides: Partial<Record<string, (...args: any[]) => any>> = {}
): PaperlessAPI {
  const handler: ProxyHandler<any> = {
    get(_target, prop: string) {
      if (prop in overrides) {
        return overrides[prop];
      }
      // Return a function that throws for any un-mocked method
      return (...args: any[]) => {
        throw new Error(`API method '${prop}' was not mocked`);
      };
    },
  };
  return new Proxy({} as PaperlessAPI, handler);
}

/**
 * Helper to extract text content from a tool result.
 */
export function getTextContent(result: any): any {
  const textItem = result.content.find((c: any) => c.type === "text");
  return textItem ? JSON.parse(textItem.text) : null;
}

/**
 * Helper to extract resource content from a tool result.
 */
export function getResourceContent(result: any): any {
  return result.content.find((c: any) => c.type === "resource")?.resource;
}
