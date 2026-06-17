import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

// Paperless-ngx is a closed system, so openWorldHint is always false. These three
// constants cover every tool; pass a custom object for a per-tool exception.

export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  openWorldHint: false,
};

export const WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};

export const DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
};
