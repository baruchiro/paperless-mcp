const BATCH_SIZE = 16;
const DOCUMENT_TIMEOUT_MS = 300_000;
const QUERY_TIMEOUT_MS = 30_000;

export const QUERY_PREFIX =
  "Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery: ";

export class EmbeddingUnavailable extends Error {}

interface EmbedResponse {
  embeddings: number[][];
}

export class OllamaEmbedder {
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

  private async embed(input: string[], timeoutMs: number): Promise<number[][]> {
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
  }
}
