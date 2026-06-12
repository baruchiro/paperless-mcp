---
"@baruchiro/paperless-mcp": patch
---

Fix setting `select` custom field values failing with a Paperless HTTP 500 (#119). `update_document` and `bulk_edit_documents` forwarded the option label string, but Paperless indexes `select_options` by the submitted value and expects the option's zero-based index (it resolves that to the stored option id itself). The server now fetches the field definition and translates the supplied label to its index (an option id read back from a document, or an existing valid index, also resolves correctly), rejecting unknown options with an actionable error that lists the valid choices.
