---
"@baruchiro/paperless-mcp": patch
---

Allow `post_document` to upload from an absolute server-side `file_path` instead of base64 `file`, avoiding base64 overhead for large files. Reads are validated (absolute path, regular file, 100MB limit, non-empty) and can be confined to allowed directories via the `PAPERLESS_MCP_UPLOAD_PATHS` environment variable.
