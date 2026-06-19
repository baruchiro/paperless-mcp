# @baruchiro/paperless-mcp

## 1.0.0

### Major Changes

- 22a55f0: Add MCP `resources/list` and `resources/read` support for documents (issue #90).

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

### Minor Changes

- 9d677b2: Add E2E test suite that runs the compiled MCP server against a real Paperless-ngx instance in CI. Covers list/create for tags, correspondents, document types, list/get/search/download/thumbnail for documents, bulk_edit_documents, and post_document — all with deterministic tool calls and no LLM in the loop.

## 0.5.1

### Patch Changes

- ad17c18: Fix MCP resource URI validation for `download_document` and `get_document_thumbnail`.

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

## 0.5.0

### Minor Changes

- fef4c62: In HTTP mode, clients can now supply their own Paperless-NGX API token per-request via `Authorization: Bearer <token>`. The client-supplied token takes precedence over the server-configured `PAPERLESS_API_KEY`. If neither is available, the server responds with `401 Unauthorized`. This applies to both `/mcp` and `/sse` endpoints. stdio mode is unchanged.

### Patch Changes

- de661ae: Add `PAPERLESS_API_VERSION` environment variable to configure the Paperless-ngx REST API version (default: `5`). Set to `10` for Paperless-ngx v3+. On HTTP 406, a clear error message is shown directing users to set this variable.
- 5927777: Fix bulk document custom field edits to send Paperless-NGX compatible `add_custom_fields` parameters and preserve intentionally empty custom field values.
- 1c1ec60: Fix `bulk_edit_documents` with `method: "delete"` failing with HTTP 400 — MCP-only parameters (`confirm`, `delete_originals`) are no longer forwarded to the Paperless bulk-edit endpoint, which doesn't accept extra kwargs for the `delete` action.
- 7b483a4: Switch update endpoints for tags, correspondents, document types, and custom fields from PUT to PATCH to support partial updates.

## 0.4.5

### Patch Changes

- 47de91d: Omit the `all` pagination ID array from multi-document responses returned by document enhancement, reducing payload size for `list_documents` and `search_documents`.

## 0.4.4

### Patch Changes

- 76c7d8b: Preserve the `build/` directory in the production Docker image and run `node build/index.js` so the compiled entrypoint can resolve `../package.json` at runtime.
- 7981f6b: Run Docker image smoke tests in the Docker publish workflow before push, reuse build cache between amd64 smoke and multi-arch publish, and remove the duplicate Docker build from CI. Add `workflow_dispatch` to the Docker publish workflow.

## 0.4.3

### Patch Changes

- 47fdf28: Fix CLI binary regression by restoring build/index.js as the executable entrypoint for the published package.

## 0.4.2

### Patch Changes

- 606fc45: Fix bulk_edit_documents delete method failing with unexpected 'confirm' argument. The `confirm` parameter is now consumed client-side as a safety gate and stripped before sending the request to the Paperless-NGX API.
- b950817: Read server version dynamically from package.json instead of hardcoding it

## 0.4.1

### Patch Changes

- 9783e4c: Fix post_document action: use Buffer instead of browser File API, correct archive_serial_number type to number per API spec, add base64 input validation, and explicitly build metadata to exclude undefined values
- 77d77e9: Improve UX for monetary custom fields: clarify currency format in tool descriptions, and add client-side validation that catches common mistakes (e.g., trailing `# @baruchiro/paperless-mcp like `10.00# @baruchiro/paperless-mcp) with actionable error messages suggesting the correct format (e.g., `USD10.00`).

## 0.4.0

### Minor Changes

- 9972ac7: Add get_document_thumbnail tool for retrieving document preview images

### Patch Changes

- e2ac0f6: Add Docker Compose and Continue VS Code extension configuration documentation
- 8953487: Remove Smithery documentation and badge as the service no longer supports this MCP server

## 0.3.0

### Minor Changes

- f9291df: Optimize document queries by excluding content field by default. The `content` field is now excluded from `list_documents`, `get_document`, `search_documents`, and `update_document` tool responses to improve performance and reduce context window usage. Added new `get_document_content` tool to retrieve document text content when needed.

### Patch Changes

- 61d5609: Fix documentlink custom field validation to accept arrays of document IDs. The Zod validation schema now properly supports arrays for documentlink type custom fields, allowing users to set single document IDs or arrays of document IDs.
- f1f62e1: Update Node.js version requirement to 24 for improved performance and security. Updated Dockerfile, package.json engines field, and added .node-version file.

## 0.2.3

### Patch Changes

- 5a5d6d2: Docker: Add arm64 architecture

## 0.2.2

### Patch Changes

- ff27606: add descriptions to tools

## 0.2.1

### Patch Changes

- 270a695: bump to fix the release pipeline

## 0.2.0

### Minor Changes

- 63b31c1: Use correct format and number range for matching_algoritm parameter

### Patch Changes

- 7c89701: improve types

## 0.1.0

### Minor Changes

- 27583ae: custom fields support

### Patch Changes

- 42c94bd: fix(filter): correct date filtering logic to ensure accurate results
- 17990fb: Add packaged Desktop Extension file, manifest

## 0.0.2

### Patch Changes

- 74b9cc1: change API_KEY to PAPERLESS_API_KEY

## 0.0.1

### Patch Changes

- b3ad43d: adjust entry point, and arguments or envs
