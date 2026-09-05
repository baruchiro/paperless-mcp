---
"@baruchiro/paperless-mcp": patch
---

fix(documents): correspondent, tag, document type and custom field names in `list_documents`, `query_documents`, `search_documents`, `get_document` and `update_document` responses were silently replaced by their raw numeric IDs whenever the instance had more than one page of that resource. The enrichment step built its ID→name lookup from a bare list call, which Paperless serves 25 rows at a time (ordered by name), so any correspondent/tag/type/field not on the first page fell through to `String(id)` with no error. The lookup now reads the `count` reported on the first page and, only when it exceeds one page, refetches the full set in a single widened request (bounded by Paperless's `max_page_size` of 100000) before building the maps.
