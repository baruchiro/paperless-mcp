---
"@baruchiro/paperless-mcp": patch
---

fix(schema): advertise scalar `type`s for `.nullable()` fields so strict MCP clients keep the tools. `zod-to-json-schema` renders `.nullable()` params as `"type": ["T", "null"]`, which is valid JSON Schema but is rejected by strict MCP clients and gateways (e.g. the Kuadrant mcp-gateway broker), silently dropping `update_document`, `create_mail_rule`, and `update_mail_rule`. The `tools/list` output now collapses `["T", "null"]` unions to a scalar `"T"`; the underlying zod schemas are unchanged, so the server still accepts `null` at call time to clear fields. Fixes #138.
