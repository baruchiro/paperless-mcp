---
"@baruchiro/paperless-mcp": patch
---

Fix setting `select` custom field values failing with a Paperless HTTP 500 (#119). `update_document` and `bulk_edit_documents` forwarded the option label string, but Paperless expects the option id (2.17+) or zero-based index (pre-2.17). The server now fetches the field definition and translates the supplied label to the correct encoding (already-encoded ids/indices pass through), rejecting unknown options with an actionable error that lists the valid choices.
