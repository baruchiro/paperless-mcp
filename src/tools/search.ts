import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { PaperlessAPI } from "../api/PaperlessAPI";
import { EmbeddingUnavailable, OllamaEmbedder } from "../search/embedder";
import { fuse } from "../search/rank";
import { SearchStore } from "../search/store";
import { withErrorHandling } from "./utils/middlewares";

const CANDIDATES_PER_LIST = 50;
const STRONG_MATCH = 0.45;
const PASSAGE_MAX_LENGTH = 600;
const DOCUMENT_FIELDS = "id,title,created,correspondent,document_type,tags";

function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

interface CallerDocument {
  id: number;
  title: string;
  created: string;
  correspondent: number | null;
  document_type: number | null;
  tags: number[];
}

export interface SearchDependencies {
  store: SearchStore;
  embedder: OllamaEmbedder;
  publicUrl: string;
}

export function registerSearchTools(
  server: McpServer,
  api: PaperlessAPI,
  search: SearchDependencies
) {
  server.tool(
    "semantic_search",
    "Search documents by meaning and by words together, with the strongest matches first. " +
      "When strong_match is false, try search_documents and list_documents with tag, correspondent or document type filters before you say that a document does not exist.",
    {
      query: z.string().describe("What to search for"),
      limit: z
        .number()
        .int()
        .optional()
        .default(10)
        .transform((value) => Math.max(1, Math.min(50, value)))
        .describe("Maximum number of results; clamped to 1 to 50"),
    },
    withErrorHandling(async (args) => {
      const { query, limit } = args;
      let vectorHits: Awaited<ReturnType<SearchStore["vectorHits"]>> = [];
      let semantic: "ok" | "unavailable" = "ok";

      try {
        const embedding = await search.embedder.embedQuery(query);
        vectorHits = await search.store.vectorHits(
          embedding,
          CANDIDATES_PER_LIST
        );
      } catch (err) {
        if (!(err instanceof EmbeddingUnavailable)) throw err;
        semantic = "unavailable";
      }

      const textHits = await search.store.textHits(query, CANDIDATES_PER_LIST);
      const fused = fuse(vectorHits, textHits);

      if (fused.length === 0) {
        return jsonResult({ results: [], strong_match: false, semantic });
      }

      const ids = fused.map((f) => f.documentId);
      const page = await api.request(
        `/documents/?id__in=${ids.join(
          ","
        )}&fields=${DOCUMENT_FIELDS}&page_size=${ids.length}`
      );
      const byId = new Map<number, CallerDocument>(
        (page.results as CallerDocument[]).map((doc) => [doc.id, doc])
      );

      const results = fused
        .filter((f) => byId.has(f.documentId))
        .slice(0, limit)
        .map((f) => {
          const doc = byId.get(f.documentId)!;
          return {
            id: doc.id,
            title: doc.title,
            created: doc.created,
            correspondent: doc.correspondent,
            document_type: doc.document_type,
            tags: doc.tags,
            passage: f.passage.slice(0, PASSAGE_MAX_LENGTH),
            matched: f.matched,
            link: `${search.publicUrl}/documents/${doc.id}/details`,
          };
        });

      const top = fused.find((f) => byId.has(f.documentId));
      const strongMatch = top
        ? (top.bestSimilarity !== null && top.bestSimilarity >= STRONG_MATCH) ||
          top.matched === "words" ||
          top.matched === "both"
        : false;

      return jsonResult({ results, strong_match: strongMatch, semantic });
    })
  );
}
