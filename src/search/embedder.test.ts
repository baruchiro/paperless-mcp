import assert from "node:assert/strict";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, test } from "node:test";
import { register } from "../metrics";
import {
  EmbeddingUnavailable,
  OllamaEmbedder,
  OpenAIEmbedder,
  QUERY_PREFIX,
} from "./embedder";

async function embedErrorCount(): Promise<number> {
  const line = (await register.metrics())
    .split("\n")
    .find((l) => l.startsWith("paperless_embed_errors_total "));
  return Number(line?.split(" ")[1] ?? 0);
}

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
      const codes = (text: string) =>
        Array.from(text).map((c) => c.charCodeAt(0));
      assert.deepEqual(embeddings[0], codes("doc-0"));
      assert.deepEqual(embeddings[19], codes("doc-19"));
    } finally {
      server.close();
    }
  });

  test("a connection that Ollama refuses throws EmbeddingUnavailable", async () => {
    const { server } = fakeOllama();
    const url = await listen(server);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const embedder = new OllamaEmbedder({
      url,
      model: "qwen3-embedding:0.6b",
    });
    await assert.rejects(
      () => embedder.embedQuery("hipoteca"),
      EmbeddingUnavailable
    );
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

interface FakeOpenAIOptions {
  fail?: boolean;
  malformed?: "missing" | "short";
  /** Refuse a request with more inputs than this, with 413, like TEI. */
  maxBatch?: number;
}

function fakeOpenAI({
  fail = false,
  malformed,
  maxBatch,
}: FakeOpenAIOptions = {}) {
  const requests: { path: string; model: string; input: string | string[] }[] =
    [];
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
      requests.push({ path: req.url ?? "", ...parsed });
      if (
        maxBatch !== undefined &&
        Array.isArray(parsed.input) &&
        parsed.input.length > maxBatch
      ) {
        res.writeHead(413);
        res.end(
          `batch size ${parsed.input.length} > maximum allowed batch size ${maxBatch}`
        );
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      if (malformed === "missing") {
        res.end(JSON.stringify({}));
        return;
      }
      const inputs = Array.isArray(parsed.input)
        ? parsed.input
        : [parsed.input];
      let data = inputs.map((text: string, index: number) => ({
        index,
        embedding: Array.from(text).map((c) => c.charCodeAt(0)),
      }));
      if (malformed === "short") {
        data = data.slice(1);
      }
      res.end(JSON.stringify({ data }));
    });
  });
  return { server, requests };
}

describe("OpenAIEmbedder", () => {
  test("embedQuery posts the query prefix and the model to /v1/embeddings", async () => {
    const { server, requests } = fakeOpenAI();
    const url = await listen(server);
    try {
      const embedder = new OpenAIEmbedder({
        url,
        model: "text-embedding-3-small",
      });
      const embedding = await embedder.embedQuery("hipoteca");
      assert.equal(requests.length, 1);
      assert.equal(requests[0].path, "/v1/embeddings");
      assert.equal(requests[0].model, "text-embedding-3-small");
      assert.deepEqual(requests[0].input, [QUERY_PREFIX + "hipoteca"]);
      const codes = (text: string) =>
        Array.from(text).map((c) => c.charCodeAt(0));
      assert.deepEqual(embedding, codes(QUERY_PREFIX + "hipoteca"));
    } finally {
      server.close();
    }
  });

  // TEI refuses a request with more inputs than its limit: "413 batch size 35 >
  // maximum allowed batch size 32". The fake server does the same, with a limit
  // of 32, so a request of more inputs than that fails like in production.
  test("embedDocuments splits 70 texts into 5 requests of 16, 16, 16, 16 and 6, with no prefix", async () => {
    const { server, requests } = fakeOpenAI({ maxBatch: 32 });
    const url = await listen(server);
    try {
      const embedder = new OpenAIEmbedder({
        url,
        model: "text-embedding-3-small",
      });
      const texts = Array.from({ length: 70 }, (_, i) => `doc-${i}`);
      await embedder.embedDocuments(texts);
      assert.deepEqual(
        requests.map((request) => (request.input as string[]).length),
        [16, 16, 16, 16, 6]
      );
      assert.ok(requests.every((request) => request.input.length <= 16));
      assert.deepEqual(
        requests.flatMap((request) => request.input as string[]),
        texts
      );
    } finally {
      server.close();
    }
  });

  test("embedDocuments gives the embeddings in the order of the texts", async () => {
    const { server } = fakeOpenAI({ maxBatch: 32 });
    const url = await listen(server);
    try {
      const embedder = new OpenAIEmbedder({
        url,
        model: "text-embedding-3-small",
      });
      const texts = Array.from({ length: 70 }, (_, i) => `doc-${i}`);
      const embeddings = await embedder.embedDocuments(texts);
      const codes = (text: string) =>
        Array.from(text).map((c) => c.charCodeAt(0));
      assert.equal(embeddings.length, 70);
      assert.deepEqual(embeddings, texts.map(codes));
    } finally {
      server.close();
    }
  });

  test("embedDocuments sends one text in one request", async () => {
    const { server, requests } = fakeOpenAI({ maxBatch: 32 });
    const url = await listen(server);
    try {
      const embedder = new OpenAIEmbedder({
        url,
        model: "text-embedding-3-small",
      });
      const embeddings = await embedder.embedDocuments(["only"]);
      assert.equal(requests.length, 1);
      assert.deepEqual(requests[0].input, ["only"]);
      assert.equal(embeddings.length, 1);
    } finally {
      server.close();
    }
  });

  test("a failure in the third batch counts one embed error, not one for each request", async () => {
    // Batches 1 and 2 pass; the server then refuses everything.
    let answered = 0;
    const requests: number[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const input: string[] = JSON.parse(body).input;
        requests.push(input.length);
        if (answered++ >= 2) {
          res.writeHead(413);
          res.end("batch size too large");
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            data: input.map((_, index) => ({ index, embedding: [index] })),
          })
        );
      });
    });
    const url = await listen(server);
    try {
      const embedder = new OpenAIEmbedder({
        url,
        model: "text-embedding-3-small",
      });
      const before = await embedErrorCount();
      const texts = Array.from({ length: 70 }, (_, i) => `doc-${i}`);
      await assert.rejects(
        () => embedder.embedDocuments(texts),
        EmbeddingUnavailable
      );
      assert.equal((await embedErrorCount()) - before, 1);
      // The call stops at the failed request.
      assert.deepEqual(requests, [16, 16, 16]);
    } finally {
      server.close();
    }
  });

  test("a 413 answer from the server throws EmbeddingUnavailable", async () => {
    // A limit of 8 is below the batch size, so the first request gets a 413.
    const { server } = fakeOpenAI({ maxBatch: 8 });
    const url = await listen(server);
    try {
      const embedder = new OpenAIEmbedder({
        url,
        model: "text-embedding-3-small",
      });
      const texts = Array.from({ length: 20 }, (_, i) => `doc-${i}`);
      await assert.rejects(
        () => embedder.embedDocuments(texts),
        EmbeddingUnavailable
      );
    } finally {
      server.close();
    }
  });

  test("a non-200 answer throws EmbeddingUnavailable", async () => {
    const { server } = fakeOpenAI({ fail: true });
    const url = await listen(server);
    try {
      const embedder = new OpenAIEmbedder({
        url,
        model: "text-embedding-3-small",
      });
      await assert.rejects(
        () => embedder.embedQuery("hipoteca"),
        EmbeddingUnavailable
      );
    } finally {
      server.close();
    }
  });

  test("a 200 answer without data throws EmbeddingUnavailable", async () => {
    const { server } = fakeOpenAI({ malformed: "missing" });
    const url = await listen(server);
    try {
      const embedder = new OpenAIEmbedder({
        url,
        model: "text-embedding-3-small",
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
    const { server } = fakeOpenAI({ malformed: "short" });
    const url = await listen(server);
    try {
      const embedder = new OpenAIEmbedder({
        url,
        model: "text-embedding-3-small",
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

  test("a connection that the server refuses throws EmbeddingUnavailable", async () => {
    const { server } = fakeOpenAI();
    const url = await listen(server);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const embedder = new OpenAIEmbedder({
      url,
      model: "text-embedding-3-small",
    });
    await assert.rejects(
      () => embedder.embedQuery("hipoteca"),
      EmbeddingUnavailable
    );
  });
});
