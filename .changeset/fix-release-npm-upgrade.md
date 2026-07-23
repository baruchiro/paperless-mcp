---
"@baruchiro/paperless-mcp": patch
---

Fix the release workflow's npm upgrade step: install npm into a separate prefix instead of overwriting the running npm (which could fail mid-reify with "Cannot find module 'promise-retry'"), and pin to a trusted-publishing-compatible version (`npm@^11.5.1`) instead of `@latest`.
