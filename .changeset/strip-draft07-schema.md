---
"@baruchiro/paperless-mcp": patch
---

Strip the draft-07 `$schema` dialect label from the tools/list response so MCP clients that validate tool schemas against JSON Schema 2020-12 only (Claude Code / Claude Desktop) stop silently dropping every tool (#170).
