# @baruchiro/paperless-mcp

## 2.2.1

### Patch Changes

- 9f0adcf: Ship only production dependencies in the container image and bump axios

  The production stage inherited `node_modules` from the builder, which ran `npm ci` and therefore installed devDependencies too — 261 installed packages instead of the 95 the compiled entrypoint needs. `npm prune --omit=dev` drops them before the copy. axios was separately held at 1.9.0 by the lockfile although the declared range already allowed the fixed releases.

  Together these take the image from 81 advisories with a fix available (2 critical) down to 20 (0 critical).

## 2.2.0

### Minor Changes

- a199f80: fix(schema): finish #138 by moving to Zod v4, so no tool advertises an array-valued `type`

  Strict MCP clients and gateways reject an array-valued `type` (`"type": ["string", "null"]`) and silently drop the whole tool. The remaining occurrences after the previous fix were the mail-rule fields the API declares with no constraint to carry — `filter_attachment_filename_include`, `filter_attachment_filename_exclude`, `action_parameter` — and `query_documents`' `paperless_filters`, none of which could be fixed by declaring constraints.

  They came from `zod-to-json-schema`, which the MCP SDK uses for Zod v3 shapes and which collapses any union of unchecked primitives into that form. No SDK release changes this: 1.11.1 through 1.30.0 emit byte-identical schemas for a v3 shape. The SDK does convert `zod/v4` shapes with Zod's own `toJSONSchema`, which emits `anyOf` instead, so the server now uses Zod v4 with `@modelcontextprotocol/sdk` at ^1.30.0 (1.23.0 is the first release that reads v4 shapes; earlier ones drop them from the advertised schema). `zod` is pinned to `~4.4.3` because 4.5.0 reintroduced the collapse.

  Alongside the bump:

  - `matching_algorithm` on tags, correspondents and document types is declared once and narrows to `MatchingAlgorithm` after its range check, so the API request types take it without a cast. The advertised schema is unchanged.
  - `Document.storage_path` and `Document.archive_serial_number` are typed `number | null`, matching the spec, which declares both as nullable integers. They were typed `string | null`.
  - Tool schemas no longer carry `additionalProperties: false` at the top level. It was never enforced — unknown properties were stripped, not rejected — so the schemas now describe what the server actually does. Nested objects declared `.strict()`, such as `bulk_edit_documents`' `set_permissions`, still advertise and enforce it.

  This also fixes a `tsc` out-of-memory crash: SDK 1.23.0 and later paired with Zod 3.25.x hits an unbounded type instantiation (modelcontextprotocol/typescript-sdk#1180) that exhausts the heap even at 8GB, which is why the SDK could not be upgraded on its own.

### Patch Changes

- ccd454d: fix(schema): declare the OpenAPI constraints on nullable document and mail-rule fields, which also stops `update_document` and `bulk_edit_documents` from being dropped by strict MCP clients

  `Paperless_ngx_REST_API.yaml` declares the document foreign keys as `type: integer` and the mail-rule text filters as `maxLength: 256`, but the tool schemas declared them as unconstrained `z.number()` / `z.string()`. They now carry `.int()` and `.max(256)`.

  This also fixes part of #138. `zod-to-json-schema` collapses a nullable primitive that carries no checks into `"type": ["number","null"]`; strict MCP clients and gateways reject an array-valued `type` and silently drop the whole tool. Because the collapse only applies to check-less primitives, declaring the constraints the API already mandates makes the emitted schema `{"anyOf":[{"type":"integer"},{"type":"null"}]}` instead. `null` is still accepted at call time, so clearing a correspondent, document type, storage path or owner keeps working.

  `update_document` and `bulk_edit_documents` no longer advertise any array-form `type`. `create_mail_rule` and `update_mail_rule` are fixed for the four spec-bounded filters; their `filter_attachment_filename_include`, `filter_attachment_filename_exclude` and `action_parameter` fields, and `query_documents`' `paperless_filters`, are unchanged because the spec declares no constraint to carry there.

## 2.1.0

### Minor Changes

- f5953cc: Surface the resource URI as text in `download_document` and `get_document_thumbnail` (#134).

  Both tools returned a single `resource` content block, so MCP clients that read
  only `content[].text` and drop resource blocks (Hermes Agent, older Claude
  Desktop) saw an empty result and never learned the URI. Each tool now also
  returns the bare `paperless://` URI in a leading `text` block. The resource block
  is unchanged, so clients that already follow it keep working.

  Thanks to @zbingos for the report and diagnosis.

### Patch Changes

- 031bde9: fix(documents): `bulk_edit_documents` with `method: "set_permissions"` always failed with HTTP 500. The tool nested `set_permissions`/`owner`/`merge` under an extra `permissions` key, but Paperless reads them directly from `parameters`. The tool now takes `set_permissions`, `owner` and `merge` as top-level arguments matching the Paperless API, supports owner-only changes (sends the empty `set_permissions` object Paperless requires), and rejects a call with neither `set_permissions` nor `owner` instead of forwarding a request that would crash the server or silently clear ownership.

## 2.0.1

### Patch Changes

- 700c055: Clarify update_document's custom_fields behavior: the array replaces the document's entire custom-field set (omitted fields are cleared). Updated the tool and parameter descriptions to warn about this and describe how to do a partial update.
- c3e0a49: Bump the default Paperless-ngx REST API version from `5` to `9`. Paperless-ngx v3.0.0 dropped support for API versions below `9` and returns HTTP 406 for them, which broke every request under the previous default. Version `9` is supported on both recent Paperless-ngx v2.x and v3.x, giving the widest compatibility; it remains overridable via `PAPERLESS_API_VERSION`.

  `update_document` now sends select custom-field values in Paperless's stored form (the option id for 2.17+ fields, the index for legacy string-option fields) to match the v9+ document endpoint, which rejects the bare option index — bringing it in line with `bulk_edit_documents`.

  The e2e workflow now runs against both a 2.x and the latest 3.x Paperless image to guard against version-compatibility regressions.

## 2.0.0

### Major Changes

- 18d49ce: Secure HTTP mode by default and stop leaking the API token in logs.

  **BREAKING CHANGE:** In HTTP mode, requests without an `Authorization: Bearer <token>` header are now rejected with `401 Unauthorized`. Previously they silently fell back to the server-configured `PAPERLESS_API_KEY`, which left the endpoint unauthenticated for anyone able to reach the port. To restore the old fallback behaviour (trusted/local networks only), start the server with the new `--no-auth` flag; it requires a server token to be configured. Client-supplied Bearer tokens and stdio mode are unchanged.

  Also stops logging the raw request `options` (which included the request body) on API errors; only `url`, `method`, and `status` are logged now.

### Minor Changes

- 5032cec: Add MCP tools for document notes: `create_document_note`, `list_document_notes`, and `delete_document_note` (backed by the Paperless `/api/documents/{id}/notes/` endpoint). Notes are the natural place for an audit trail or progress notes on a document.
- 36e0255: Add `archive_serial_number`, `archive_serial_number__isnull`, `custom_field_query`, and `custom_fields__icontains` filters to the `list_documents` tool.
- c55da21: Add MCP tools for Paperless mail accounts and mail rules.
- 9871612: Add `query_documents` for advanced document querying with full-text search, custom field filters, and validated Paperless document query parameters. `search_documents` remains available as a compatibility wrapper.

### Patch Changes

- 0d236aa: Stop pre-enumerating Paperless documents in MCP `resources/list`. Documents remain available on demand via tools and `resources/read` on `paperless://documents/{id}/{resource}`.

  Fixes #112.

- 62e5b06: Fix setting `select` custom field values failing against Paperless (#119). The MCP forwarded the option label, which Paperless rejects. The server now fetches the field definition and translates the label to the encoding each write path expects: `update_document` (the document endpoint) takes the option's zero-based index, while `bulk_edit_documents` → `modify_custom_fields` writes the stored form directly and takes the option id on 2.17+ (or the index on pre-2.17 string options). A label, an already-encoded value, or an option id read back from a document all resolve correctly, and unknown options are rejected with an actionable error listing the valid choices.
- 6f8aada: Allow `post_document` to upload from an absolute server-side `file_path` instead of base64 `file`, avoiding base64 overhead for large files. Reads are validated (absolute path, regular file, 100MB limit, non-empty) and can be confined to allowed directories via the `PAPERLESS_MCP_UPLOAD_PATHS` environment variable.

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
