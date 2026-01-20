---
"@baruchiro/paperless-mcp": patch
---

Fix documentlink custom field validation to accept arrays of document IDs. The Zod validation schema now properly supports arrays for documentlink type custom fields, allowing users to set single document IDs or arrays of document IDs.
