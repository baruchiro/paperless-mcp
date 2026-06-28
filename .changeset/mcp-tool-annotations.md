---
"@baruchiro/paperless-mcp": minor
---

Add MCP tool annotations (readOnlyHint/destructiveHint/openWorldHint) to every tool. Each tool declares its annotations explicitly at its registration call site (read-only, write, or destructive), and a test enforces that every registered tool has annotations. This lets MCP clients distinguish read-only tools from writes and flag destructive operations.
