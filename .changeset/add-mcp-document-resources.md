---
"@baruchiro/paperless-mcp": major
---

Add MCP `resources/list` and `resources/read` support for documents (issue #90).

**Breaking change**: `download_document` and `get_document_thumbnail` no
longer return the file/image bytes inline. They now return only a
resource reference (URI + mime type); clients fetch the actual content
via `resources/read`. Existing clients that consumed the inline base64
blob need to be updated to follow the resource URI.

Each Paperless document is now exposed as two MCP resources under the
`paperless://` scheme established by the resource-URI fix:

- `paperless://documents/{id}/download` — the document file
- `paperless://documents/{id}/thumb` — the document thumbnail

Clients that understand MCP resources can list them via `resources/list`
and lazy-fetch content via `resources/read`. This keeps large binary
payloads out of tool results — important for clients (e.g. n8n LangChain
agents) that accumulate full tool results in the conversation context.

The `download_document` and `get_document_thumbnail` tools now return a
resource reference (URI + mime type) instead of an inline base64 blob.
To fetch the actual bytes, call `resources/read` with the URI. The
`download_document` URI also supports an `?original=true` flag.

The resource `name` field carries the human-readable filename, so
filename info that previously had to be encoded in the URI is now
available via resource metadata.
