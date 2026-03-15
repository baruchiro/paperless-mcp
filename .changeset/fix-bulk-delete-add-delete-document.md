---
"@baruchiro/paperless-mcp": patch
---

Fix bulk_edit_documents confirm parameter leak

- Fix: Strip `confirm` parameter from bulk_edit_documents before sending to API. Previously, the `confirm` safety-gate parameter leaked into the API request body, causing Paperless-NGX to reject delete operations with a 400 error.
