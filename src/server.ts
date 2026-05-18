import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type express from "express";
import { PaperlessAPI } from "./api/PaperlessAPI";
import { registerCorrespondentTools } from "./tools/correspondents";
import { registerCustomFieldTools } from "./tools/customFields";
import { registerDocumentTools } from "./tools/documents";
import { registerDocumentTypeTools } from "./tools/documentTypes";
import { registerTagTools } from "./tools/tags";

export interface CreateMcpServerOptions {
  baseUrl: string;
  token: string;
  version: string;
  publicUrl: string;
}

export function createMcpServer({
  baseUrl,
  token,
  version,
  publicUrl,
}: CreateMcpServerOptions): McpServer {
  const api = new PaperlessAPI(baseUrl, token);
  const server = new McpServer(
    { name: "paperless-ngx", version },
    { instructions: buildInstructions(publicUrl) }
  );
  registerDocumentTools(server, api);
  registerTagTools(server, api);
  registerCorrespondentTools(server, api);
  registerDocumentTypeTools(server, api);
  registerCustomFieldTools(server, api);
  return server;
}

export function getBearerToken(
  req: express.Request,
  fallbackToken?: string
): string | undefined {
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return fallbackToken || undefined;
}

export function sendUnauthorized(res: express.Response): void {
  res
    .status(401)
    .set("WWW-Authenticate", 'Bearer realm="paperless-mcp"')
    .end();
}

function buildInstructions(publicUrl: string): string {
  return `
Paperless-NGX MCP Server Instructions

⚠️ CRITICAL: Always differentiate between operations on specific documents vs operations on the entire system:

- REMOVE operations (e.g., remove_tag in bulk_edit_documents): Affect only the specified documents, items remain in the system
- DELETE operations (e.g., delete_tag, delete_correspondent): Permanently delete items from the entire system, affecting ALL documents that use them

When a user asks to "remove" something, prefer operations that affect specific documents. Only use DELETE operations when explicitly asked to delete from the system.

To view documents in your Paperless-NGX web interface, construct URLs using this pattern:
${publicUrl}/documents/{document_id}/

Example: If your base URL is "http://localhost:8000", the web interface URL would be "http://localhost:8000/documents/123/" for document ID 123.

The document tools return JSON data with document IDs that you can use to construct these URLs.
        `;
}
