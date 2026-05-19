/**
 * Resource URI builders for document/thumbnail downloads.
 *
 * URIs mirror the Paperless REST API paths under a custom `paperless://`
 * scheme, so the same identifiers can later back proper MCP resources
 * (`resources/list` / `resources/read`) without a second naming scheme.
 *
 * The scheme also keeps the URI well-formed regardless of filename
 * content, which Python MCP clients (pydantic-validated) require.
 */

/**
 * Builds a resource URI for a downloaded document.
 *
 * Mirrors `GET /api/documents/{id}/download/`. The original filename is
 * preserved as a `filename` query parameter (URL-encoded) so clients
 * that need the human-readable name can still recover it.
 */
export function buildDocumentResourceUri(
  id: number,
  filename: string
): string {
  return `paperless://documents/${id}/download?filename=${encodeURIComponent(filename)}`;
}

/**
 * Builds a resource URI for a document thumbnail.
 *
 * Mirrors `GET /api/documents/{id}/thumb/`.
 */
export function buildThumbnailResourceUri(id: number): string {
  return `paperless://documents/${id}/thumb`;
}
