# @baruchiro/paperless-mcp

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
