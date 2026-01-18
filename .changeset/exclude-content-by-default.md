---
"@baruchiro/paperless-mcp": minor
---

Optimize document queries by excluding content field by default. Added optional `fields` parameter to `list_documents`, `get_document`, `search_documents`, and `update_document` tools. By default, the `content` field is now excluded from responses to improve performance and reduce context window usage. To include content, explicitly add 'content' to the `fields` array parameter.
