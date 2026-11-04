import { embedErrors } from "../metrics";
import { tracer } from "../tracing";

const BATCH_SIZE = 16;
const DOCUMENT_TIMEOUT_MS = 300_000;
const QUERY_TIMEOUT_MS = 30_000;

export const QUERY_PREFIX =
  "Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery: ";

export class EmbeddingUnavailable extends Error {}

export interface Embedder {
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(query: string): Promise<number[]>;
}

interface EmbedResponse {
  embeddings: number[][];
}

interface OpenAIEmbedResponse {
  data: { index: number; embedding: number[] }[];
}

// One span and one error count for each call to an embedding server, whichever
// provider answers it.
function traced<T>(fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan("embed", async (span) => {
    try {
      return await fn();
    } catch (err) {
      embedErrors.inc();
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

export class OllamaEmbedder implements Embedder {
  private readonly url: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts: { url: string; model: string; timeoutMs?: number }) {
    this.url = opts.url;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? DOCUMENT_TIMEOUT_MS;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      embeddings.push(...(await this.embed(batch, this.timeoutMs)));
    }
    return embeddings;
  }

  async embedQuery(query: string): Promise<number[]> {
    const [embedding] = await this.embed(
      [QUERY_PREFIX + query],
      QUERY_TIMEOUT_MS
    );
    return embedding;
  }

  private embed(input: string[], timeoutMs: number): Promise<number[][]> {
    return traced(async () => {
      let response: Response;
      try {
        response = await fetch(`${this.url}/api/embed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: this.model, input }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        throw new EmbeddingUnavailable(`Ollama did not answer: ${err}`);
      }
      if (!response.ok) {
        throw new EmbeddingUnavailable(
          `Ollama answered with status ${response.status}`
        );
      }
      const body = (await response.json()) as EmbedResponse;
      if (
        !Array.isArray(body.embeddings) ||
        body.embeddings.length !== input.length
      ) {
        throw new EmbeddingUnavailable(
          "Ollama answered with a missing or mismatched embeddings array"
        );
      }
      return body.embeddings;
    });
  }
}

/**
 * The OpenAI embeddings API: a request with a list of texts, and answers in
 * `data`, each item with its `index`. A server such as TEI refuses a request
 * with too many inputs (413), and a document can have more chunks than that
 * limit, so the texts go in batches of BATCH_SIZE, as for Ollama.
 */
export class OpenAIEmbedder implements Embedder {
  private readonly url: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts: { url: string; model: string; timeoutMs?: number }) {
    this.url = opts.url;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? DOCUMENT_TIMEOUT_MS;
  }

  // One span, and one error count, for the whole call: traced() wraps the loop,
  // not each request.
  embedDocuments(texts: string[]): Promise<number[][]> {
    return traced(async () => {
      const embeddings: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        embeddings.push(...(await this.request(batch, this.timeoutMs)));
      }
      return embeddings;
    });
  }

  async embedQuery(query: string): Promise<number[]> {
    const [embedding] = await traced(() =>
      this.request([QUERY_PREFIX + query], QUERY_TIMEOUT_MS)
    );
    return embedding;
  }

  private async request(
    input: string[],
    timeoutMs: number
  ): Promise<number[][]> {
    let response: Response;
    try {
      response = await fetch(`${this.url}/v1/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, input }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new EmbeddingUnavailable(
        `The embedding server did not answer: ${err}`
      );
    }
    if (!response.ok) {
      throw new EmbeddingUnavailable(
        `The embedding server answered with status ${response.status}`
      );
    }
    const body = (await response.json()) as OpenAIEmbedResponse;
    if (!Array.isArray(body.data) || body.data.length !== input.length) {
      throw new EmbeddingUnavailable(
        "The embedding server answered with a missing or mismatched data array"
      );
    }
    return body.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  }
}
