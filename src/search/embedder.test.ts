import assert from "node:assert/strict";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, test } from "node:test";
import { EmbeddingUnavailable, OllamaEmbedder, QUERY_PREFIX } from "./embedder";

interface FakeOptions {
  fail?: boolean;
  malformed?: "missing" | "short";
}

function fakeOllama({ fail = false, malformed }: FakeOptions = {}) {
  const requests: { model: string; input: string[] }[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (fail) {
        res.writeHead(500);
        res.end("boom");
        return;
      }
      const parsed = JSON.parse(body);
      requests.push(parsed);
      res.writeHead(200, { "Content-Type": "application/json" });
      if (malformed === "missing") {
        res.end(JSON.stringify({}));
        return;
      }
      let embeddings = parsed.input.map((text: string) =>
        Array.from(text).map((c) => c.charCodeAt(0))
      );
      if (malformed === "short") {
        embeddings = embeddings.slice(1);
      }
      res.end(JSON.stringify({ embeddings }));
    });
  });
  return { server, requests };
}

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("OllamaEmbedder", () => {
  test("embedQuery sends the query prefix and the model name", async () => {
    const { server, requests } = fakeOllama();
    const url = await listen(server);
    try {
      const embedder = new OllamaEmbedder({
        url,
        model: "qwen3-embedding:0.6b",
      });
      await embedder.embedQuery("hipoteca");
      assert.equal(requests.length, 1);
      assert.deepEqual(requests[0].input, [QUERY_PREFIX + "hipoteca"]);
      assert.equal(requests[0].model, "qwen3-embedding:0.6b");
    } finally {
      server.close();
    }
  });

  test("embedDocuments batches 20 texts into 2 requests of 16 and 4, in order, with no prefix", async () => {
    const { server, requests } = fakeOllama();
    const url = await listen(server);
    try {
      const embedder = new OllamaEmbedder({
        url,
        model: "qwen3-embedding:0.6b",
      });
      const texts = Array.from({ length: 20 }, (_, i) => `doc-${i}`);
      const embeddings = await embedder.embedDocuments(texts);
      assert.equal(requests.length, 2);
      assert.equal(requests[0].input.length, 16);
      assert.equal(requests[1].input.length, 4);
      assert.deepEqual(requests[0].input.concat(requests[1].input), texts);
      assert.equal(embeddings.length, 20);
    } finally {
      server.close();
    }
  });

  test("a non-200 answer throws EmbeddingUnavailable", async () => {
    const { server } = fakeOllama({ fail: true });
    const url = await listen(server);
    try {
      const embedder = new OllamaEmbedder({
        url,
        model: "qwen3-embedding:0.6b",
      });
      await assert.rejects(
        () => embedder.embedQuery("hipoteca"),
        EmbeddingUnavailable
      );
    } finally {
      server.close();
    }
  });

  test("a 200 answer without embeddings throws EmbeddingUnavailable", async () => {
    const { server } = fakeOllama({ malformed: "missing" });
    const url = await listen(server);
    try {
      const embedder = new OllamaEmbedder({
        url,
        model: "qwen3-embedding:0.6b",
      });
      await assert.rejects(
        () => embedder.embedQuery("hipoteca"),
        EmbeddingUnavailable
      );
    } finally {
      server.close();
    }
  });

  test("a 200 answer with fewer embeddings than inputs throws EmbeddingUnavailable", async () => {
    const { server } = fakeOllama({ malformed: "short" });
    const url = await listen(server);
    try {
      const embedder = new OllamaEmbedder({
        url,
        model: "qwen3-embedding:0.6b",
      });
      const texts = Array.from({ length: 16 }, (_, i) => `doc-${i}`);
      await assert.rejects(
        () => embedder.embedDocuments(texts),
        EmbeddingUnavailable
      );
    } finally {
      server.close();
    }
  });
});
