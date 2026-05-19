---
"@baruchiro/paperless-mcp": patch
---

Fix MCP resource URI validation for `download_document` and `get_document_thumbnail`.

The two tools previously returned MCP resources whose `uri` was a raw
filename (e.g. `"2026-02-15 Vendor Co._Mobile.pdf"`) or an unscoped
string. Python MCP clients (the `mcp` package, pydantic-validated)
rejected these with `ValidationError: Input should be a valid URL,
relative URL without a base`, making downloads and thumbnails
unusable from any Python MCP client.

Tools now return URIs under a custom `paperless://` scheme that mirrors
the Paperless REST API paths, so the same identifiers can later back
proper MCP resources (`resources/list` / `resources/read`):

- `download_document` → `paperless://documents/{id}/download?filename=<encoded>`
- `get_document_thumbnail` → `paperless://documents/{id}/thumb`

The original filename is preserved (URL-encoded) as a `filename` query
parameter on the download URI, so clients that need the human-readable
name can still recover it via standard URL parsing.
