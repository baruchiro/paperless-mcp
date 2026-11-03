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
