---
"@baruchiro/paperless-mcp": patch
---

Omit the `all` pagination ID array from multi-document responses returned by document enhancement, reducing payload size for `list_documents` and `search_documents`.
