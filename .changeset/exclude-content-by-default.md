---
"@baruchiro/paperless-mcp": minor
---

Optimize document queries by excluding content field by default. The `content` field is now excluded from `list_documents`, `get_document`, `search_documents`, and `update_document` tool responses to improve performance and reduce context window usage. Added new `get_document_content` tool to retrieve document text content when needed.
