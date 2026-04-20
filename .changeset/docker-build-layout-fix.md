---
"@baruchiro/paperless-mcp": patch
---

Preserve the `build/` directory in the production Docker image and run `node build/index.js` so the compiled entrypoint can resolve `../package.json` at runtime.
