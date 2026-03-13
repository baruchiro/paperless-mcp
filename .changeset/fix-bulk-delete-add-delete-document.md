---
"@baruchiro/paperless-mcp": minor
---

Fix bulk_edit_documents delete method and add delete_document tool

- Fix: Strip `confirm` parameter from bulk_edit_documents before sending to API. Previously, the `confirm` safety-gate parameter leaked into the API request body, causing Paperless-NGX to reject delete operations with a 400 error.
- New: Add `delete_document` tool for deleting a single document via `DELETE /api/documents/{id}/`, with a client-side `confirm` safety gate.
