---
"@baruchiro/paperless-mcp": patch
---

Ship only production dependencies in the container image and bump axios

The production stage inherited `node_modules` from the builder, which ran `npm ci` and therefore installed devDependencies too — 196 packages where the compiled entrypoint needs 103. `npm prune --omit=dev` drops them before the copy. axios was separately held at 1.9.0 by the lockfile although the declared range already allowed the fixed releases.

Together these take the image from 81 advisories with a fix available (2 critical) down to 20 (0 critical).
