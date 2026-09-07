---
"@baruchiro/paperless-mcp": patch
---

fix(schema): declare the OpenAPI constraints on nullable document and mail-rule fields, which also stops `update_document` and `bulk_edit_documents` from being dropped by strict MCP clients

`Paperless_ngx_REST_API.yaml` declares the document foreign keys as `type: integer` and the mail-rule text filters as `maxLength: 256`, but the tool schemas declared them as unconstrained `z.number()` / `z.string()`. They now carry `.int()` and `.max(256)`.

This also fixes part of #138. `zod-to-json-schema` collapses a nullable primitive that carries no checks into `"type": ["number","null"]`; strict MCP clients and gateways reject an array-valued `type` and silently drop the whole tool. Because the collapse only applies to check-less primitives, declaring the constraints the API already mandates makes the emitted schema `{"anyOf":[{"type":"integer"},{"type":"null"}]}` instead. `null` is still accepted at call time, so clearing a correspondent, document type, storage path or owner keeps working.

`update_document` and `bulk_edit_documents` no longer advertise any array-form `type`. `create_mail_rule` and `update_mail_rule` are fixed for the four spec-bounded filters; their `filter_attachment_filename_include`, `filter_attachment_filename_exclude` and `action_parameter` fields, and `query_documents`' `paperless_filters`, are unchanged because the spec declares no constraint to carry there.
