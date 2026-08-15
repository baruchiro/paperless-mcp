#!/usr/bin/env node
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { parseArgs } from "node:util";
import {
  createMcpServer,
  getBearerToken,
  sendUnauthorized,
} from "./server";
const { version } = require("../package.json") as { version: string };

const {
  values: { baseUrl, token, http: useHttp, port, publicUrl },
} = parseArgs({
  options: {
    baseUrl: { type: "string" },
    token: { type: "string" },
    http: { type: "boolean", default: false },
    port: { type: "string" },
    publicUrl: { type: "string", default: "" },
  },
  allowPositionals: true,
});

const resolvedBaseUrl = baseUrl || process.env.PAPERLESS_URL;
const resolvedToken = token || process.env.PAPERLESS_API_KEY;
const resolvedPublicUrl =
  publicUrl || process.env.PAPERLESS_PUBLIC_URL || resolvedBaseUrl;
const resolvedPort = port ? parseInt(port, 10) : 3000;
// HTTP-Bind-Adresse: Default loopback-only (lokaler Shared-Dienst, keine
// Netz-Exposition). Fuer Container/Remote-Setups via Env uebersteuerbar.
const resolvedHost = process.env.PAPERLESS_MCP_HTTP_HOST || "127.0.0.1";

if (!resolvedBaseUrl) {
  console.error(
    "Usage: paperless-mcp --baseUrl <url> --token <token> [--http] [--port <port>] [--publicUrl <url>]"
  );
  console.error(
    "Or set PAPERLESS_URL and PAPERLESS_API_KEY environment variables."
  );
  process.exit(1);
}

if (!useHttp && !resolvedToken) {
  console.error(
    "Usage: paperless-mcp --baseUrl <url> --token <token> [--http] [--port <port>] [--publicUrl <url>]"
  );
  console.error(
    "Or set PAPERLESS_URL and PAPERLESS_API_KEY environment variables."
  );
  process.exit(1);
}

function buildServer(requestToken: string) {
  return createMcpServer({
    baseUrl: resolvedBaseUrl!,
    token: requestToken,
    version,
    publicUrl: resolvedPublicUrl!,
  });
}

async function main() {
  if (useHttp) {
    const app = express();
    app.use(express.json());

    // Monitoring-Endpunkt (systemd/Kuma) — bewusst ohne Token-Pflicht und vor
    // dem Host-Guard, damit Health-Checks ohne Header-Kosmetik funktionieren.
    app.get("/healthz", (_req, res) => {
      res.status(200).type("text/plain").send("ok\n");
    });

    // Host-Header-Guard gegen DNS-Rebinding (Muster: imap-mini-mcp/src/http.ts).
    // Erlaubt nur die Bind-Adresse selbst sowie localhost/127.0.0.1.
    app.use((req, res, next) => {
      const host = (req.headers.host ?? "").split(":")[0];
      if (
        host === resolvedHost ||
        host === "localhost" ||
        host === "127.0.0.1"
      ) {
        next();
        return;
      }
      res.status(403).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Forbidden: invalid Host header" },
        id: null,
      });
    });

    // Store transports for each session
    const sseTransports: Record<string, SSEServerTransport> = {};

    app.post("/mcp", async (req, res) => {
      // Auth: Bearer-Header des Clients gewinnt; ohne Header faellt
      // getBearerToken auf das Env-Token (PAPERLESS_API_KEY) zurueck —
      // so bleibt die Client-Config im localhost-Betrieb token-frei.
      const requestToken = getBearerToken(req, resolvedToken);
      if (!requestToken) {
        sendUnauthorized(res);
        return;
      }
      try {
        const server = buildServer(requestToken);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        res.on("close", () => {
          transport.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: null,
          });
        }
      }
    });

    app.get("/mcp", async (req, res) => {
      res.writeHead(405).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Method not allowed.",
          },
          id: null,
        })
      );
    });

    app.delete("/mcp", async (req, res) => {
      res.writeHead(405).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Method not allowed.",
          },
          id: null,
        })
      );
    });

    app.get("/sse", async (req, res) => {
      console.log("SSE request received");
      const requestToken = getBearerToken(req, resolvedToken);
      if (!requestToken) {
        sendUnauthorized(res);
        return;
      }
      try {
        const server = buildServer(requestToken);
        const transport = new SSEServerTransport("/messages", res);
        sseTransports[transport.sessionId] = transport;
        res.on("close", () => {
          delete sseTransports[transport.sessionId];
          transport.close();
        });
        await server.connect(transport);
      } catch (error) {
        console.error("Error handling SSE request:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: null,
          });
        }
      }
    });

    app.post("/messages", async (req, res) => {
      const sessionId = req.query.sessionId as string;
      const transport = sseTransports[sessionId];
      if (transport) {
        await transport.handlePostMessage(req, res, req.body);
      } else {
        res.status(400).send("No transport found for sessionId");
      }
    });

    app.listen(resolvedPort, resolvedHost, () => {
      console.log(
        `MCP Stateless Streamable HTTP Server listening on http://${resolvedHost}:${resolvedPort}`
      );
    });
    // await new Promise((resolve) => setTimeout(resolve, 1000000));
  } else {
    const server = buildServer(resolvedToken!);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((e) => console.error(e.message));
