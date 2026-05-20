---
"@baruchiro/paperless-mcp": minor
---

Add E2E test suite that runs the compiled MCP server against a real Paperless-ngx instance in CI. Covers list/create for tags, correspondents, document types, list/get/search/download/thumbnail for documents, bulk_edit_documents, and post_document — all with deterministic tool calls and no LLM in the loop.
