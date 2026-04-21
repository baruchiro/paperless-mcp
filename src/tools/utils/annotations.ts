import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

export const Annotations = {
  READ: { readOnlyHint: true },
  CREATE: { readOnlyHint: false, destructiveHint: false },
  UPDATE: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  DELETE: { readOnlyHint: false, destructiveHint: true },
  BULK_EDIT: { readOnlyHint: false, destructiveHint: true },
} as const satisfies Record<string, ToolAnnotations>;
