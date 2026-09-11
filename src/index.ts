#!/usr/bin/env node
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import {
  createMcpServer,
  getBearerToken,
  sendUnauthorized,
} from "./server";
import { HttpSessionStore } from "./http/httpSessionStore";
const { version } = require("../package.json") as { version: string };

/** Parse a positive integer from a CLI/env string, falling back on anything invalid. */
function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const {
  values: {
    baseUrl,
    token,
    http: useHttp,
    port,
    publicUrl,
    "no-auth": noAuth,
    stateful,
    "max-sessions": maxSessionsArg,
    "session-timeout": sessionTimeoutArg,
  },
} = parseArgs({
  options: {
    baseUrl: { type: "string" },
    token: { type: "string" },
    http: { type: "boolean", default: false },
    port: { type: "string" },
    publicUrl: { type: "string", default: "" },
    "no-auth": { type: "boolean", default: false },
    stateful: { type: "boolean", default: false },
    "max-sessions": { type: "string" },
    "session-timeout": { type: "string" },
  },
  allowPositionals: true,
});

const resolvedBaseUrl = baseUrl || process.env.PAPERLESS_URL;
const resolvedToken = token || process.env.PAPERLESS_API_KEY;
const resolvedPublicUrl =
  publicUrl || process.env.PAPERLESS_PUBLIC_URL || resolvedBaseUrl;
const resolvedPort = port ? parseInt(port, 10) : 3000;
// Bounds for --stateful session tracking (CLI flag > env > default).
const resolvedMaxSessions = parsePositiveInt(
  maxSessionsArg ?? process.env.PAPERLESS_MCP_MAX_SESSIONS,
  256
);
const resolvedSessionTimeoutMs =
  parsePositiveInt(
    sessionTimeoutArg ?? process.env.PAPERLESS_MCP_SESSION_TIMEOUT,
    30 * 60
  ) * 1000;

if (!resolvedBaseUrl) {
  console.error(
    "Usage: paperless-mcp --baseUrl <url> --token <token> [--http] [--port <port>] [--publicUrl <url>] [--no-auth] [--stateful] [--max-sessions <n>] [--session-timeout <seconds>]"
  );
  console.error(
    "Or set PAPERLESS_URL and PAPERLESS_API_KEY environment variables."
  );
  process.exit(1);
}

if (!useHttp && !resolvedToken) {
  console.error(
    "Usage: paperless-mcp --baseUrl <url> --token <token> [--http] [--port <port>] [--publicUrl <url>] [--no-auth] [--stateful] [--max-sessions <n>] [--session-timeout <seconds>]"
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
    app.use(express.json());

    // Store transports for each session
    const sseTransports: Record<string, SSEServerTransport> = {};

    if (stateful) {
      // Stateful Streamable HTTP: one transport + server per session, keyed by
      // Mcp-Session-Id. Some clients — notably MCP gateways that negotiate the
      // 2025-11-25 protocol — require a real session plus a server->client
      // notification stream, and drop a server that answers GET /mcp with 405.
      // Opt in with --stateful; the default remains the stateless handler below.
      // The store caps concurrent sessions and reaps idle ones so an abandoned
      // session (no DELETE /mcp) can't leak its transport for the process life.
      const sessions = new HttpSessionStore({
        maxSessions: resolvedMaxSessions,
        idleTimeoutMs: resolvedSessionTimeoutMs,
      });
      sessions.startSweeper();

      app.post("/mcp", async (req, res) => {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        let transport = sessionId ? sessions.get(sessionId) : undefined;

        if (!transport) {
          if (sessionId || !isInitializeRequest(req.body)) {
            res.status(400).json({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Bad Request: No valid session ID provided",
              },
              id: null,
            });
            return;
          }

          const requestToken = getBearerToken(req, {
            fallbackToken: resolvedToken,
            allowAnonymous: noAuth,
          });
          if (!requestToken) {
            sendUnauthorized(res);
            return;
          }

          if (!sessions.canCreate()) {
            // At the concurrent-session cap: refuse rather than grow unbounded.
            res.status(503).json({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Server busy: too many active sessions",
              },
              id: null,
            });
            return;
          }

          const newTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              // register() is the authoritative cap gate; the canCreate() check
              // above is only a fast reject. If a concurrent initialize claimed
              // the last slot in between, tear this excess session back down.
              if (!sessions.register(sid, newTransport)) {
                void newTransport.close();
              }
            },
          });
          newTransport.onclose = () => {
            if (newTransport.sessionId) {
              sessions.delete(newTransport.sessionId);
            }
          };
          const server = buildServer(requestToken);
          await server.connect(newTransport);
          transport = newTransport;
        }

        try {
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

      // GET (server->client notification stream) and DELETE (session teardown)
      // are served from the existing session's transport.
      const handleSessionRequest = async (
        req: express.Request,
        res: express.Response
      ) => {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        const transport = sessionId ? sessions.get(sessionId) : undefined;
        if (!transport) {
          res.status(400).send("Invalid or missing session ID");
          return;
        }
        await transport.handleRequest(req, res);
      };

      app.get("/mcp", handleSessionRequest);
      app.delete("/mcp", handleSessionRequest);
    } else {
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
    }

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
        `MCP ${
          stateful ? "Stateful" : "Stateless"
        } Streamable HTTP Server listening on port ${resolvedPort}`
      );
      if (stateful) {
        console.log(
          `[paperless-mcp] session bounds: max ${resolvedMaxSessions}, ` +
            `idle timeout ${resolvedSessionTimeoutMs / 1000}s`
        );
      }
    });
    // await new Promise((resolve) => setTimeout(resolve, 1000000));
  } else {
    const server = buildServer(resolvedToken!);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((e) => console.error(e.message));
