import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

// Paperless-ngx is a closed system, so openWorldHint is always false. These three
// constants cover every tool; pass a custom object for a per-tool exception.

/** Read-only tool: no side effects. */
export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  openWorldHint: false,
};

/** Write tool that creates or updates but never deletes. */
export const WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};

/** Write tool that can permanently delete data from the system. */
export const DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
};
