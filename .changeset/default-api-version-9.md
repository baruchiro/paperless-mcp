---
"@baruchiro/paperless-mcp": patch
---

Bump the default Paperless-ngx REST API version from `5` to `9`. Paperless-ngx v3.0.0 dropped support for API versions below `9` and returns HTTP 406 for them, which broke every request under the previous default. Version `9` is supported on both recent Paperless-ngx v2.x and v3.x, giving the widest compatibility; it remains overridable via `PAPERLESS_API_VERSION`. The e2e workflow now runs against both a 2.x and the latest 3.x Paperless image to guard against version-compatibility regressions.
