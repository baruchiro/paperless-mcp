const NAMES = [
  "DATABASE_URL",
  "OLLAMA_URL",
  "EMBEDDING_MODEL",
  "PAPERLESS_SYNC_API_KEY",
] as const;

export type EmbeddingProvider = "ollama" | "openai";

/**
 * The index needs a database, an embedding model and a Paperless token that
 * can read every document. A half-set index would fail late, so all four
 * values must be set, or none. Only HTTP mode has an index.
 *
 * EMBEDDING_PROVIDER picks the embedding server: `ollama` (the default) or
 * `openai` for a server with the OpenAI embeddings API. An OpenAI provider
 * reads its address from EMBEDDING_URL, and falls back to OLLAMA_URL.
 */
export function searchConfig(
  env: Record<string, string | undefined>,
  useHttp: boolean
):
  | {
      databaseUrl: string;
      embeddingUrl: string;
      model: string;
      syncToken: string;
      provider: EmbeddingProvider;
    }
  | undefined {
  const providerName = env.EMBEDDING_PROVIDER ?? "ollama";
  if (providerName !== "ollama" && providerName !== "openai") {
    throw new Error(
      `EMBEDDING_PROVIDER must be ollama or openai, not "${providerName}".`
    );
  }
  const provider: EmbeddingProvider = providerName;
  const databaseUrl = env.DATABASE_URL;
  const embeddingUrl =
    provider === "openai"
      ? env.EMBEDDING_URL || env.OLLAMA_URL
      : env.OLLAMA_URL;
  const model = env.EMBEDDING_MODEL;
  const syncToken = env.PAPERLESS_SYNC_API_KEY;
  const count = [databaseUrl, embeddingUrl, model, syncToken].filter(
    Boolean
  ).length;
  if (count === 0) return undefined;
  if (!databaseUrl || !embeddingUrl || !model || !syncToken) {
    throw new Error(
      `Set all four of ${NAMES.join(", ")} to enable semantic search, or none.`
    );
  }
  if (!useHttp) {
    console.warn(
      "[paperless-mcp] Semantic search works only in HTTP mode (--http)."
    );
    return undefined;
  }
  return { databaseUrl, embeddingUrl, model, syncToken, provider };
}
