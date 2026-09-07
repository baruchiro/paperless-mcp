---
"@baruchiro/paperless-mcp": minor
---

fix(schema): finish #138 by moving to Zod v4, so no tool advertises an array-valued `type`

Strict MCP clients and gateways reject an array-valued `type` (`"type": ["string", "null"]`) and silently drop the whole tool. The remaining occurrences after the previous fix were the mail-rule fields the API declares with no constraint to carry — `filter_attachment_filename_include`, `filter_attachment_filename_exclude`, `action_parameter` — and `query_documents`' `paperless_filters`, none of which could be fixed by declaring constraints.

They came from `zod-to-json-schema`, which the MCP SDK uses for Zod v3 shapes and which collapses any union of unchecked primitives into that form. No SDK release changes this: 1.11.1 through 1.30.0 emit byte-identical schemas for a v3 shape. The SDK does convert `zod/v4` shapes with Zod's own `toJSONSchema`, which emits `anyOf` instead, so the server now uses Zod v4 with `@modelcontextprotocol/sdk` at ^1.30.0 (1.23.0 is the first release that reads v4 shapes; earlier ones drop them from the advertised schema). `zod` is pinned to `~4.4.3` because 4.5.0 reintroduced the collapse.

Alongside the bump:

- `matching_algorithm` on tags, correspondents and document types is declared once and narrows to `MatchingAlgorithm` after its range check, so the API request types take it without a cast. The advertised schema is unchanged.
- `Document.storage_path` and `Document.archive_serial_number` are typed `number | null`, matching the spec, which declares both as nullable integers. They were typed `string | null`.
- Tool schemas no longer carry `additionalProperties: false` at the top level. It was never enforced — unknown properties were stripped, not rejected — so the schemas now describe what the server actually does. Nested objects declared `.strict()`, such as `bulk_edit_documents`' `set_permissions`, still advertise and enforce it.

This also fixes a `tsc` out-of-memory crash: SDK 1.23.0 and later paired with Zod 3.25.x hits an unbounded type instantiation (modelcontextprotocol/typescript-sdk#1180) that exhausts the heap even at 8GB, which is why the SDK could not be upgraded on its own.
