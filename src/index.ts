#!/usr/bin/env node
import "./tracing";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { parseArgs } from "node:util";
import { PaperlessAPI } from "./api/PaperlessAPI";
import { createMcpServer, getBearerToken, sendUnauthorized } from "./server";
import { Downloads } from "./downloads";
import { searchConfig } from "./search/config";
import { OllamaEmbedder } from "./search/embedder";
import { createSearchPool } from "./search/pool";
import { SearchStore } from "./search/store";
import { IndexSync } from "./search/sync";
import type { SearchDependencies } from "./tools/search";
import { Uploads, uploadConfig } from "./uploads";
import { register } from "./metrics";
const { version } = require("../package.json") as { version: string };

const {
  values: { baseUrl, token, http: useHttp, port, publicUrl, "no-auth": noAuth },
} = parseArgs({
  options: {
    baseUrl: { type: "string" },
    token: { type: "string" },
    http: { type: "boolean", default: false },
    port: { type: "string" },
    publicUrl: { type: "string", default: "" },
    "no-auth": { type: "boolean", default: false },
  },
  allowPositionals: true,
});

const resolvedBaseUrl = baseUrl || process.env.PAPERLESS_URL;
const resolvedToken = token || process.env.PAPERLESS_API_KEY;
const resolvedPublicUrl =
  publicUrl || process.env.PAPERLESS_PUBLIC_URL || resolvedBaseUrl;
const resolvedPort = port ? parseInt(port, 10) : 3000;

if (!resolvedBaseUrl) {
  console.error(
    "Usage: paperless-mcp --baseUrl <url> --token <token> [--http] [--port <port>] [--publicUrl <url>] [--no-auth]"
  );
  console.error(
    "Or set PAPERLESS_URL and PAPERLESS_API_KEY environment variables."
  );
  process.exit(1);
}

if (!useHttp && !resolvedToken) {
  console.error(
    "Usage: paperless-mcp --baseUrl <url> --token <token> [--http] [--port <port>] [--publicUrl <url>] [--no-auth]"
  );
  console.error(
    "Or set PAPERLESS_URL and PAPERLESS_API_KEY environment variables."
  );
  process.exit(1);
}

if (noAuth && !resolvedToken) {
  console.error(
    "--no-auth allows unauthenticated requests to use the server's Paperless token, " +
      "but no server token is configured. Provide --token <token> or set PAPERLESS_API_KEY, " +
      "or drop --no-auth and have clients authenticate with 'Authorization: Bearer <token>'."
  );
  process.exit(1);
}

let uploads: Uploads | undefined;
let downloads: Downloads | undefined;
let search: SearchDependencies | undefined;
let searchSettings: ReturnType<typeof searchConfig>;
try {
  const upload = uploadConfig(process.env, useHttp!);
  if (upload) {
    uploads = new Uploads({
      api: new PaperlessAPI(resolvedBaseUrl, upload.token),
      publicUrl: upload.publicUrl,
    });
    // Download links share the public URL of the upload links.
    downloads = new Downloads({
      paperlessUrl: resolvedBaseUrl,
      publicUrl: upload.publicUrl,
    });
  }
  searchSettings = searchConfig(process.env, useHttp!);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

async function startSearch(settings: NonNullable<typeof searchSettings>) {
  const store = new SearchStore(createSearchPool(settings.databaseUrl));
  const embedder = new OllamaEmbedder({
    url: settings.ollamaUrl,
    model: settings.model,
  });
  await store.migrate();
  new IndexSync({
    api: new PaperlessAPI(resolvedBaseUrl!, settings.syncToken),
    store,
    embedder,
  }).start();
  search = { store, embedder, publicUrl: resolvedPublicUrl! };
  console.log("[paperless-mcp] Semantic search is enabled.");
}

function buildServer(requestToken: string) {
  return createMcpServer({
    baseUrl: resolvedBaseUrl!,
    token: requestToken,
    version,
    publicUrl: resolvedPublicUrl!,
    uploads,
    search,
    downloads,
  });
}

async function main() {
  // A server without its index would answer wrong, so a failed start stops it.
  if (searchSettings) {
    await startSearch(searchSettings).catch((error) => {
      console.error(
        `[paperless-mcp] Semantic search failed to start: ${error.message}`
      );
      process.exit(1);
    });
  }
  if (useHttp) {
    if (noAuth) {
      console.log(
        "[paperless-mcp] --no-auth is enabled: requests without an 'Authorization: Bearer' header " +
          "will use the server's Paperless token. Only use this on a trusted/local network."
      );
    } else if (resolvedToken) {
      console.log(
        "[paperless-mcp] A server token is configured, but unauthenticated requests are rejected. " +
          "Clients must send 'Authorization: Bearer <paperless-token>'. " +
          "To use the server token for unauthenticated requests instead, restart with the --no-auth flag " +
          "(trusted/local networks only)."
      );
    }

    const app = express();
    // The upload route reads its body as a stream, so it comes before the JSON parser.
    if (uploads) {
      app.use(uploads.router());
      console.log("[paperless-mcp] Upload links are enabled at /upload/.");
    }
    if (downloads) {
      app.use(downloads.router());
      console.log("[paperless-mcp] Download links are enabled at /download/.");
    }
    app.get("/metrics", async (_req, res) => {
      res.setHeader("Content-Type", register.contentType);
      res.end(await register.metrics());
    });
    app.use(express.json());

    // Store transports for each session
    const sseTransports: Record<string, SSEServerTransport> = {};

    app.post("/mcp", async (req, res) => {
      const requestToken = getBearerToken(req, {
        fallbackToken: resolvedToken,
        allowAnonymous: noAuth,
      });
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
      const requestToken = getBearerToken(req, {
        fallbackToken: resolvedToken,
        allowAnonymous: noAuth,
      });
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

    app.listen(resolvedPort, () => {
      console.log(
        `MCP Stateless Streamable HTTP Server listening on port ${resolvedPort}`
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
