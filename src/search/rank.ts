import { Hit } from "./store";

export interface Fused {
  documentId: number;
  score: number;
  passage: string;
  matched: "meaning" | "words" | "both";
  bestSimilarity: number | null;
}

// Reciprocal rank fusion: a document's score is 1/(k + best rank) per list it
// is in (obsidian-mcp src/services/hybrid.py). A hit found only by meaning
// (the vector list) must stay in the results.
export function fuse(vector: Hit[], text: Hit[], k = 60): Fused[] {
  const byDocument = new Map<
    number,
    { score: number; vector?: Hit; text?: Hit }
  >();

  function addRanks(hits: Hit[], side: "vector" | "text") {
    const bestRank = new Map<number, number>();
    hits.forEach((hit, index) => {
      const rank = index + 1;
      if (!bestRank.has(hit.documentId)) bestRank.set(hit.documentId, rank);
    });
    for (const hit of hits) {
      const entry = byDocument.get(hit.documentId) ?? { score: 0 };
      byDocument.set(hit.documentId, entry);
      if (side === "vector" && !entry.vector) entry.vector = hit;
      if (side === "text" && !entry.text) entry.text = hit;
    }
    for (const [documentId, rank] of bestRank) {
      const entry = byDocument.get(documentId)!;
      entry.score += 1 / (k + rank);
    }
  }

  addRanks(vector, "vector");
  addRanks(text, "text");

  return [...byDocument.entries()]
    .map(([documentId, entry]) => {
      const matched: Fused["matched"] =
        entry.vector && entry.text
          ? "both"
          : entry.vector
          ? "meaning"
          : "words";
      const best = entry.vector ?? entry.text!;
      return {
        documentId,
        score: entry.score,
        passage: best.text,
        matched,
        bestSimilarity: entry.vector ? entry.vector.score : null,
      };
    })
    .sort((a, b) => b.score - a.score);
}
