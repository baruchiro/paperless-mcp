const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 200;
const MAX_CHUNKS = 1000;
const SKIPPED_TAG_PREFIXES = ["ai-", "via-"];

export interface ChunkResult {
  chunks: string[];
  truncated: boolean;
}

// Chunk size follows the bake-off: ~512 tokens, 200-character overlap, obsidian-mcp's MAX_CHUNKS_PER_NOTE cap.
export function chunkText(text: string): ChunkResult {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized === "") {
    return { chunks: [], truncated: false };
  }

  const chunks: string[] = [];
  let start = 0;
  let reachedEnd = false;
  while (start < normalized.length && chunks.length < MAX_CHUNKS) {
    chunks.push(normalized.slice(start, start + CHUNK_SIZE));
    if (start + CHUNK_SIZE >= normalized.length) {
      reachedEnd = true;
      break;
    }
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  const truncated = !reachedEnd && chunks.length >= MAX_CHUNKS;
  return { chunks, truncated };
}

export function metadataText(
  doc: { title: string; created: string },
  names: { correspondent?: string; documentType?: string; tags: string[] }
): string {
  const tags = names.tags.filter(
    (tag) => !SKIPPED_TAG_PREFIXES.some((prefix) => tag.startsWith(prefix))
  );

  const parts = [`Título: ${doc.title}.`];
  if (names.documentType) {
    parts.push(`Tipo: ${names.documentType}.`);
  }
  if (names.correspondent) {
    parts.push(`Remitente: ${names.correspondent}.`);
  }
  parts.push(`Etiquetas: ${tags.join(", ")}.`);
  parts.push(`Fecha: ${doc.created}.`);

  return parts.join(" ");
}
