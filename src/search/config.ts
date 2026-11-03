const NAMES = [
  "DATABASE_URL",
  "OLLAMA_URL",
  "EMBEDDING_MODEL",
  "PAPERLESS_SYNC_API_KEY",
] as const;

/**
 * The index needs a database, an embedding model and a Paperless token that
 * can read every document. A half-set index would fail late, so all four
 * values must be set, or none. Only HTTP mode has an index.
 */
export function searchConfig(
  env: Record<string, string | undefined>,
  useHttp: boolean
):
  | { databaseUrl: string; ollamaUrl: string; model: string; syncToken: string }
  | undefined {
  const [databaseUrl, ollamaUrl, model, syncToken] = NAMES.map((name) => env[name]);
  const count = [databaseUrl, ollamaUrl, model, syncToken].filter(Boolean).length;
  if (count === 0) return undefined;
  if (!databaseUrl || !ollamaUrl || !model || !syncToken) {
    throw new Error(`Set all four of ${NAMES.join(", ")} to enable semantic search, or none.`);
  }
  if (!useHttp) {
    console.warn("[paperless-mcp] Semantic search works only in HTTP mode (--http).");
    return undefined;
  }
  return { databaseUrl, ollamaUrl, model, syncToken };
}
