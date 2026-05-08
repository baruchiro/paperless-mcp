/**
 * Resource URI builders for document/thumbnail downloads.
 *
 * MCP resource URIs are validated by Python MCP clients (pydantic) as
 * `AnyUrl` — they must be a valid URL or relative URL without a base.
 * Plain filenames or strings without a scheme fail this validation, so
 * we wrap them in a custom `paperless://` scheme that is always
 * well-formed regardless of filename content.
 */

/**
 * Builds a resource URI for a downloaded document.
 *
 * The original filename is preserved (URL-encoded) inside the URI path,
 * so clients that need the original name can still recover it.
 */
export function buildDocumentResourceUri(
  id: number,
  filename: string
): string {
  return `paperless://document/${id}/${encodeURIComponent(filename)}`;
}

/**
 * Builds a resource URI for a document thumbnail.
 *
 * Thumbnails have no meaningful filename, so we use a stable shape
 * derived from the document id alone.
 */
export function buildThumbnailResourceUri(id: number): string {
  return `paperless://thumbnail/${id}.webp`;
}
