---
"@baruchiro/paperless-mcp": patch
---

Add `PAPERLESS_API_VERSION` environment variable to configure the Paperless-ngx REST API version (default: `5`). Set to `10` for Paperless-ngx v3+. On HTTP 406, a clear error message is shown directing users to set this variable.
