import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type ToolResult = {
  content: Array<{ type: string; text?: string; resource?: unknown }>;
  isError?: boolean;
};

export async function connectMcpClient(
  mcpUrl: string,
  token: string
): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });
  const client = new Client({ name: "e2e-test", version: "1.0.0" }, {});
  await client.connect(transport);
  return client;
}

export function parseToolText(result: ToolResult): unknown {
  if (result.isError) {
    const errContent = result.content.find((c) => c.type === "text");
    throw new Error(`Tool call returned isError=true: ${errContent?.text ?? "(no message)"}`);
  }
  const textContent = result.content.find((c) => c.type === "text");
  if (!textContent || !textContent.text) {
    throw new Error("No text content in tool result");
  }
  return JSON.parse(textContent.text);
}
