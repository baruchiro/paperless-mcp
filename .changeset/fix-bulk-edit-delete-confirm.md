---
"@baruchiro/paperless-mcp": patch
---

Fix bulk_edit_documents delete method failing with unexpected 'confirm' argument. The `confirm` parameter is now consumed client-side as a safety gate and stripped before sending the request to the Paperless-NGX API.
