---
"@baruchiro/paperless-mcp": patch
---

Upgrade GitHub Actions to versions running on Node.js 24, resolving the Node.js 20 deprecation warnings on the runners. Bumped actions/checkout v4→v5, actions/stale v9→v10, docker/setup-qemu-action v3→v4, docker/setup-buildx-action v3→v4, docker/login-action v3→v4, docker/metadata-action v5→v6, and docker/build-push-action v6→v7. Also set `persist-credentials: false` on checkout in the ci, e2e, and docker-publish workflows, which don't run authenticated git operations (the release workflow keeps credentials for its Changesets push).
