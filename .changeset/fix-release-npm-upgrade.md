---
"@baruchiro/paperless-mcp": patch
---

Harden the release workflow:

- Install npm into a separate prefix instead of overwriting the running npm (which could fail mid-reify with "Cannot find module 'promise-retry'"), and pin to a trusted-publishing-compatible version (`npm@^11.5.1`) instead of `@latest`.
- Publish with `changeset publish` instead of raw `npm publish`, so a push to `main` with no pending changeset is a no-op instead of failing with "cannot publish over the previously published versions". Provenance is preserved via `NPM_CONFIG_PROVENANCE`, and `access` is set to `public` in the changesets config.
