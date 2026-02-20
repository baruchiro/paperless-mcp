---
"@baruchiro/paperless-mcp": patch
---

Fix post_document action: use Buffer instead of browser File API, correct archive_serial_number type to number per API spec, add base64 input validation, and explicitly build metadata to exclude undefined values
