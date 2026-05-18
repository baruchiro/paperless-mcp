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

Tools now return URIs under a custom `paperless://` scheme that is
always well-formed regardless of filename content:

- `download_document` → `paperless://document/{id}/{encodeURIComponent(filename)}`
- `get_document_thumbnail` → `paperless://thumbnail/{id}.webp`

The original filename is preserved (URL-encoded) inside the URI path,
so clients that need the original name can still recover it.
