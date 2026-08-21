---
"@baruchiro/paperless-mcp": minor
---

Surface the resource URI as text in `download_document` and `get_document_thumbnail` (#134).

Both tools returned a single `resource` content block, so MCP clients that read
only `content[].text` and drop resource blocks (Hermes Agent, older Claude
Desktop) saw an empty result and never learned the URI. Each tool now also
returns the bare `paperless://` URI in a leading `text` block. The resource block
is unchanged, so clients that already follow it keep working.

Thanks to @zbingos for the report and diagnosis.
