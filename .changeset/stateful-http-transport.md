---
"@baruchiro/paperless-mcp": minor
---

Add an opt-in `--stateful` Streamable HTTP transport

The default HTTP mode stays stateless (a fresh transport + server per POST). `--stateful` keeps one transport and `McpServer` per `Mcp-Session-Id`, which is what clients that negotiate the 2025-11-25 protocol — notably MCP gateways — require: a persistent session plus a server→client notification stream, rather than a server that answers `GET /mcp` with 405.

Sessions are bounded so an abandoned one (a client that never sends `DELETE /mcp`) can't leak its transport for the process lifetime — an unauthenticated memory-exhaustion vector under `--no-auth`. `HttpSessionStore` caps concurrent sessions (`--max-sessions`, default 256; new sessions get a 503 at the cap) and reaps sessions idle beyond `--session-timeout` (default 30m) on an interval.
