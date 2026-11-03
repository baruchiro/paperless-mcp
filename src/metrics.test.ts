import assert from "node:assert";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import express from "express";
import { register } from "./metrics";

describe("metrics module", () => {
  it("produces valid Prometheus text format", async () => {
    const output = await register.metrics();
    assert.match(output, /^# HELP/);
    assert.match(output, /paperless_sync_runs_total/);
    assert.match(output, /paperless_documents_indexed/);
    assert.match(output, /paperless_chunks_indexed/);
    assert.match(output, /paperless_sync_duration_seconds/);
    assert.match(output, /paperless_embed_errors_total/);
    assert.match(output, /paperless_search_requests_total/);
  });
});

describe("/metrics Express route", () => {
  it("returns 200 with Prometheus text", async () => {
    const app = express();
    app.get("/metrics", async (_req, res) => {
      res.setHeader("Content-Type", register.contentType);
      res.end(await register.metrics());
    });
    const server = createServer(app).listen(0);
    const addr = server.address() as { port: number };

    const { statusCode, headers, body } = await new Promise<{
      statusCode: number;
      headers: Record<string, string>;
      body: string;
    }>((resolve, reject) => {
      const { get } = require("node:http");
      get(`http://127.0.0.1:${addr.port}/metrics`, (res: any) => {
        let b = "";
        res.setEncoding("utf-8");
        res.on("data", (chunk: string) => (b += chunk));
        res.on("end", () =>
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: {
              "content-type": String(res.headers["content-type"] ?? ""),
            },
            body: b,
          })
        );
      }).on("error", reject);
    });
    server.close();

    assert.equal(statusCode, 200);
    assert.match(headers["content-type"] ?? "", /text\/plain/);
    assert.match(body, /^# HELP/);
    assert.match(body, /paperless_sync_runs_total/);
  });
});
