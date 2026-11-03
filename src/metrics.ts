import type { NextFunction, Request, Response } from "express";
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

export const register = new Registry();
collectDefaultMetrics({ register });

export const syncRuns = new Counter({
  name: "paperless_sync_runs_total",
  help: "Total sync runs, by outcome.",
  labelNames: ["outcome"],
  registers: [register],
});

export const syncDuration = new Histogram({
  name: "paperless_sync_duration_seconds",
  help: "Sync duration in seconds.",
  registers: [register],
});

export const documentsIndexed = new Gauge({
  name: "paperless_documents_indexed",
  help: "Documents in the search index.",
  registers: [register],
});

export const chunksIndexed = new Gauge({
  name: "paperless_chunks_indexed",
  help: "Chunks in the search index.",
  registers: [register],
});

export const embedErrors = new Counter({
  name: "paperless_embed_errors_total",
  help: "Failed embedding calls.",
  registers: [register],
});

export const searchRequests = new Counter({
  name: "paperless_search_requests_total",
  help: "Search requests by semantic arm outcome.",
  labelNames: ["semantic"],
  registers: [register],
});

// Buckets for calls to an API: a fast read is some milliseconds, a slow one 30 s.
const CALL_BUCKETS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30];

export const toolDuration = new Histogram({
  name: "paperless_tool_duration_seconds",
  help: "Duration of one MCP tool call, by tool and outcome (ok or error).",
  labelNames: ["tool", "outcome"],
  buckets: CALL_BUCKETS,
  registers: [register],
});

export const httpDuration = new Histogram({
  name: "paperless_http_request_duration_seconds",
  help: "Duration of one HTTP request, by route template, method and status.",
  labelNames: ["route", "method", "status"],
  buckets: CALL_BUCKETS,
  registers: [register],
});

export const apiDuration = new Histogram({
  name: "paperless_api_duration_seconds",
  help: "Duration of one call to the Paperless API, by method and status (error for a network failure).",
  labelNames: ["method", "status"],
  buckets: CALL_BUCKETS,
  registers: [register],
});

export const searchDuration = new Histogram({
  name: "paperless_search_duration_seconds",
  help: "Duration of one semantic_search call, by the outcome of the search by meaning.",
  labelNames: ["semantic"],
  buckets: CALL_BUCKETS,
  registers: [register],
});

// The label is a template, never the path: the tokens in /upload/ and
// /download/ are secrets, and a path with an id has no limit on its values.
export function routeLabel(path: string): string {
  if (/^\/upload\/[^/]+$/.test(path)) return "/upload/:token";
  if (/^\/download\/[^/]+$/.test(path)) return "/download/:token";
  if (["/mcp", "/sse", "/messages", "/metrics"].includes(path)) return path;
  return "other";
}

export function httpTiming(req: Request, res: Response, next: NextFunction) {
  const end = httpDuration.startTimer({
    route: routeLabel(req.path),
    method: req.method,
  });
  res.on("finish", () => end({ status: String(res.statusCode) }));
  next();
}
