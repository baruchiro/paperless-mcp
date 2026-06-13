---
"@baruchiro/paperless-mcp": patch
---

Stop pre-enumerating Paperless documents in MCP `resources/list`. Documents remain available on demand via tools and `resources/read` on `paperless://documents/{id}/{resource}`.

Fixes #112.
