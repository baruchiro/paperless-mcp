---
"@baruchiro/paperless-mcp": patch
---

Fix `bulk_edit_documents` delete: strip `delete_originals` from API parameters (it is an MCP-side guardrail and caused a 400 error when forwarded to Paperless).

Fix HTTP 406 errors against Paperless-ngx v3.0.0+: the API version in the `Accept` header is now configurable via the `PAPERLESS_API_VERSION` environment variable (defaults to `"5"` for backwards compatibility with v2.x; set to `"10"` for v3.x).
