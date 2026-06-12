---
"@baruchiro/paperless-mcp": patch
---

Fix setting `select` custom field values failing against Paperless (#119). The MCP forwarded the option label, which Paperless rejects. The server now fetches the field definition and translates the label to the encoding each write path expects: `update_document` (the document endpoint) takes the option's zero-based index, while `bulk_edit_documents` → `modify_custom_fields` writes the stored form directly and takes the option id on 2.17+ (or the index on pre-2.17 string options). A label, an already-encoded value, or an option id read back from a document all resolve correctly, and unknown options are rejected with an actionable error listing the valid choices.
