---
"@baruchiro/paperless-mcp": patch
---

fix(documents): `bulk_edit_documents` with `method: "set_permissions"` always failed with HTTP 500. The tool nested `set_permissions`/`owner`/`merge` under an extra `permissions` key, but Paperless reads them directly from `parameters`. The tool now takes `set_permissions`, `owner` and `merge` as top-level arguments matching the Paperless API, supports owner-only changes (sends the empty `set_permissions` object Paperless requires), and rejects a call with neither `set_permissions` nor `owner` instead of forwarding a request that would crash the server or silently clear ownership.
