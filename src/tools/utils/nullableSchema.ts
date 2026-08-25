import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

/**
 * Recursively collapse JSON-Schema nullable unions (`"type": ["T", "null"]`)
 * back into a scalar `"type": "T"`.
 *
 * `zod-to-json-schema` renders `z.T().nullable()` as `{ "type": ["T", "null"] }`.
 * That is valid JSON Schema, but the MCP tool `inputSchema` convention — and
 * several strict MCP clients / gateways (e.g. the Kuadrant mcp-gateway broker,
 * which drops any tool whose schema uses the array form) — expect a scalar
 * `type`. See issue #138.
 *
 * Only the *advertised* schema is relaxed: the underlying zod schema is
 * untouched, so the server still accepts `null` at call time (used to clear
 * fields on PATCH). `"null"` is stripped from every `type` array; if a single
 * type remains it is collapsed to a scalar, otherwise the remaining (genuine)
 * union is preserved.
 */
export function collapseNullableTypes<T>(schema: T): T {
  if (Array.isArray(schema)) {
    return schema.map((item) => collapseNullableTypes(item)) as unknown as T;
  }
  if (schema === null || typeof schema !== "object") {
    return schema;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === "type" && Array.isArray(value) && value.includes("null")) {
      const nonNull = value.filter((entry) => entry !== "null");
      result[key] =
        nonNull.length === 1
          ? nonNull[0]
          : nonNull.length > 0
            ? nonNull
            : value;
    } else {
      result[key] = collapseNullableTypes(value);
    }
  }
  return result as T;
}

/**
 * Post-process an `McpServer`'s `tools/list` output so every tool's
 * `inputSchema` uses scalar types instead of `["T", "null"]` unions.
 *
 * The high-level `McpServer` computes each schema via
 * `zodToJsonSchema(shape, { strictUnions: true })` and exposes no hook to change
 * those options or transform the result, so we wrap the already-registered
 * low-level `tools/list` handler. `server.server` is public API; the handler map
 * is internal and accessed narrowly here. Call once, after all tools are
 * registered. See issue #138.
 */
export function sanitizeToolSchemas(server: McpServer): void {
  const method = ListToolsRequestSchema.shape.method.value;
  const requestHandlers = (
    server.server as unknown as {
      _requestHandlers: Map<
        string,
        (
          request: unknown,
          extra: unknown
        ) => Promise<{ tools?: Array<{ inputSchema?: unknown }> }>
      >;
    }
  )._requestHandlers;

  const original = requestHandlers.get(method);
  if (!original) {
    return;
  }

  requestHandlers.set(method, async (request, extra) => {
    const result = await original(request, extra);
    if (result && Array.isArray(result.tools)) {
      for (const tool of result.tools) {
        if (tool.inputSchema) {
          tool.inputSchema = collapseNullableTypes(tool.inputSchema);
        }
      }
    }
    return result;
  });
}
