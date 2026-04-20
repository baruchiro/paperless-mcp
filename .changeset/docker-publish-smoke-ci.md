---
"@baruchiro/paperless-mcp": patch
---

Run Docker image smoke tests in the Docker publish workflow before push, reuse build cache between amd64 smoke and multi-arch publish, and remove the duplicate Docker build from CI. Add `workflow_dispatch` to the Docker publish workflow.
