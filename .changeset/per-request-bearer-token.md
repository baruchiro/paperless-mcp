---
"@baruchiro/paperless-mcp": minor
---

In HTTP mode, clients can now supply their own Paperless-NGX API token per-request via `Authorization: Bearer <token>`. The client-supplied token takes precedence over the server-configured `PAPERLESS_API_KEY`. If neither is available, the server responds with `401 Unauthorized`. This applies to both `/mcp` and `/sse` endpoints. stdio mode is unchanged.
