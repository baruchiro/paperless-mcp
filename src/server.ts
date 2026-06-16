import { McpServer, type RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type express from "express";
import { PaperlessAPI } from "./api/PaperlessAPI";
import { registerDocumentResources } from "./resources/documents";
import { registerCorrespondentTools } from "./tools/correspondents";
import { registerCustomFieldTools } from "./tools/customFields";
import { registerDocumentTools } from "./tools/documents";
import { registerDocumentTypeTools } from "./tools/documentTypes";
import { registerMailTools } from "./tools/mail";
import { registerTagTools } from "./tools/tags";

export interface CreateMcpServerOptions {
  baseUrl: string;
  token: string;
  version: string;
  publicUrl: string;
}

/**
 * Derive MCP tool annotations from the tool-name verb prefix so clients can
 * distinguish reads from writes and flag destructive calls: list_/get_/search_/
 * download_ are read-only, delete_/bulk_edit_ are destructive, everything else
 * is a non-destructive write. Paperless-ngx is a closed system, so
 * openWorldHint is false.
 */
function toolAnnotations(name: string): ToolAnnotations {
  const n = name.toLowerCase();
  if (/^(list_|get_|search_|download_)/.test(n)) {
    return { readOnlyHint: true, openWorldHint: false };
  }
  const destructive = /^(delete_|bulk_edit_)/.test(n);
  return { readOnlyHint: false, destructiveHint: destructive, openWorldHint: false };
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

  // The SDK leaves tool annotations unset unless passed explicitly. Wrap
  // server.tool so every tool the register*Tools helpers register gets its
  // annotations stamped by verb prefix — no change needed at each call site.
  const registerBaseTool = server.tool.bind(server) as (...args: unknown[]) => RegisteredTool;
  server.tool = ((name: string, ...rest: unknown[]): RegisteredTool => {
    const registered = registerBaseTool(name, ...rest);
    if (!registered.annotations) {
      registered.update({ annotations: toolAnnotations(name) });
    }
    return registered;
  }) as typeof server.tool;

  registerDocumentTools(server, api);
  registerDocumentResources(server, api);
  registerTagTools(server, api);
  registerCorrespondentTools(server, api);
  registerDocumentTypeTools(server, api);
  registerCustomFieldTools(server, api);
  registerMailTools(server, api);
  return server;
}

export interface ResolveTokenOptions {
  /**
   * Server-configured token used as a fallback for unauthenticated requests.
   * Only consulted when `allowAnonymous` is true.
   */
  fallbackToken?: string;
  /**
   * When true, requests without a `Bearer` header fall back to `fallbackToken`
   * (the legacy behaviour). When false (the default in HTTP mode), a request
   * without a `Bearer` header is rejected and never uses the server token.
   */
  allowAnonymous: boolean;
}

export function getBearerToken(
  req: express.Request,
  options: ResolveTokenOptions
): string | undefined {
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  if (options.allowAnonymous) {
    return options.fallbackToken || undefined;
  }
  return undefined;
}

export function sendUnauthorized(res: express.Response): void {
  // Log operator-facing guidance server-side; keep the wire response minimal so
  // we don't echo configuration hints back to unauthenticated callers.
  console.error(
    "[paperless-mcp] Rejected request with no 'Authorization: Bearer <paperless-ngx-api-token>' header. " +
      "As of v2.0.0, HTTP mode requires a per-request Bearer token and no longer falls back to the " +
      "server-configured token for unauthenticated requests. Have clients send their Paperless-NGX API " +
      "token as a Bearer token, or restart the server with --no-auth to use the server token for " +
      "unauthenticated requests (trusted/local networks only)."
  );
  res
    .status(401)
    .set("WWW-Authenticate", 'Bearer realm="paperless-mcp"')
    .json({ error: "unauthorized" });
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
