/**
 * Resource URI builders for document/thumbnail downloads.
 *
 * URIs mirror document resources under a custom `paperless://` scheme, so the
 * same identifiers can back MCP resources (`resources/list` / `resources/read`)
 * without a second naming scheme.
 *
 * The scheme also keeps the URI well-formed regardless of filename
 * content, which Python MCP clients (pydantic-validated) require.
 */

/**
 * Optional flags for document download resource URIs.
 */
export interface DocumentResourceUriOptions {
  original?: boolean;
}

/**
 * Builds a resource URI for a downloaded document.
 *
 * The MCP resource URI is intentionally canonical and filename-free; filenames
 * belong in resource metadata, while the URI identifies the fetchable content.
 */
export function buildDocumentResourceUri(
  id: number,
  optionsOrFilename?: DocumentResourceUriOptions | string
): string {
  const options =
    typeof optionsOrFilename === "string" ? {} : optionsOrFilename || {};
  const params = new URLSearchParams();
  if (options.original) {
    params.set("original", "true");
  }
  const query = params.toString();
  return `paperless://documents/${id}/download${query ? `?${query}` : ""}`;
}

/**
 * Builds a resource URI for a document thumbnail.
 *
 * Mirrors `GET /api/documents/{id}/thumb/`.
 */
export function buildThumbnailResourceUri(id: number): string {
  return `paperless://documents/${id}/thumb`;
}
