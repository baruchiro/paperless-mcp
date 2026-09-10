---
"@baruchiro/paperless-mcp": patch
---

Move `typescript` from `dependencies` to `devDependencies`

The compiled entrypoint (`build/index.js`) doesn't need the TypeScript compiler at runtime, but it was declared as a production dependency, so it shipped in the production container image even after pruning devDependencies. It now stays out of a `--omit=dev` install.
