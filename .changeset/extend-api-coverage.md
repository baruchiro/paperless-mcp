---
"@baruchiro/paperless-mcp": minor
---

Extend API coverage: add storage paths, saved views, document notes, trash management, tasks, statistics, suggestions, metadata, search autocomplete, next ASN, bulk download, and delete_document tools.

Improvements:
- Fix PUT→PATCH for update operations (tags, correspondents, document types, custom fields)
- Add missing parameters (is_insensitive, parent, custom_field_query, more_like_id)
- Use axios.isAxiosError() for type-safe error handling with preserved stack traces
- Centralize saved view and storage path CRUD into typed PaperlessAPI methods
- Fix note deletion URL to use path segment instead of query parameter
- Fix trash API to use correct `empty` action enum value
- Make empty_trash documents array optional
- Replace unsupported task_id filter with supported filters (status, task_name, ordering)
- Fix requestRaw to honor responseType parameter and allow header overrides
- Add get_tag tool for retrieving individual tags
