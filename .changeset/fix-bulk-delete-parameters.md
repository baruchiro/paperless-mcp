---
"@baruchiro/paperless-mcp": patch
---

Fix `bulk_edit_documents` with `method: "delete"` failing with HTTP 400 — MCP-only parameters (`confirm`, `delete_originals`) are no longer forwarded to the Paperless bulk-edit endpoint, which doesn't accept extra kwargs for the `delete` action.
