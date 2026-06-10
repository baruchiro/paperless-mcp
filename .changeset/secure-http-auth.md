---
"@baruchiro/paperless-mcp": major
---

Secure HTTP mode by default and stop leaking the API token in logs.

**BREAKING CHANGE:** In HTTP mode, requests without an `Authorization: Bearer <token>` header are now rejected with `401 Unauthorized`. Previously they silently fell back to the server-configured `PAPERLESS_API_KEY`, which left the endpoint unauthenticated for anyone able to reach the port. To restore the old fallback behaviour (trusted/local networks only), start the server with the new `--no-auth` flag; it requires a server token to be configured. Client-supplied Bearer tokens and stdio mode are unchanged.

Also stops logging the raw request `options` (which included the request body) on API errors; only `url`, `method`, and `status` are logged now.
